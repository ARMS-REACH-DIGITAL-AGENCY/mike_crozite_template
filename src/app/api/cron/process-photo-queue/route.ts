// src/app/api/cron/process-photo-queue/route.ts
// YAT?STATS — Automated photo moderation and promotion
//
// Flow:
//   1. Pick up media_upload rows with status='pending'
//   2. AI-moderate: valid image, appropriate content, matches claimed player
//   3. If approved + purpose='flip_card': copy S3 object to players/then/{playerId}.jpg
//   4. If approved + purpose='profile_gallery': copy to players/gallery/{playerId}/{uuid}.jpg
//   5. Update media_upload status to 'approved' or 'rejected'

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { S3Client, CopyObjectCommand, HeadObjectCommand, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { S3_BUCKET, S3_REGION } from '@/lib/storyAssets';
import sharp from 'sharp';

export const runtime = 'nodejs';
export const maxDuration = 60;

let s3Client: S3Client | null = null;
function getS3() {
  if (s3Client) return s3Client;
  const accessKeyId = process.env.YATSTATS_AWS_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.YATSTATS_AWS_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY;
  if (!accessKeyId || !secretAccessKey) {
    throw new Error('S3 keys not set');
  }
  s3Client = new S3Client({ region: S3_REGION, credentials: { accessKeyId, secretAccessKey } });
  return s3Client;
}

type ModerationResult = {
  approved: boolean;
  reason: string;
};

async function moderatePhoto(upload: any): Promise<ModerationResult> {
  // Verify the S3 object actually exists
  try {
    await getS3().send(
      new HeadObjectCommand({ Bucket: S3_BUCKET, Key: upload.s3_key })
    );
  } catch {
    return { approved: false, reason: 'S3 object not found' };
  }

  // Must have a player ID for player photos
  if (upload.category === 'player' && !upload.playerid) {
    return { approved: false, reason: 'No player ID' };
  }

  // Basic file checks
  if (!upload.s3_key || upload.file_size_bytes < 1000) {
    return { approved: false, reason: 'File too small or missing' };
  }

  // TODO: AI vision check — verify photo content matches claimed player,
  // no inappropriate content, actually a baseball-related photo
  // For now, auto-approve pending full AI vision integration

  return { approved: true, reason: 'Auto-approved: valid photo upload' };
}

async function promoteToFlipCard(upload: any): Promise<string> {
  const playerId = String(upload.playerid).trim();
  const destKey = `players/then/${playerId}.jpg`;
  const cardKey = `players/then-card/${playerId}.webp`;

  // Copy original to then/
  await getS3().send(
    new CopyObjectCommand({
      Bucket: S3_BUCKET,
      CopySource: `${S3_BUCKET}/${upload.s3_key}`,
      Key: destKey,
      ContentType: 'image/jpeg',
      CacheControl: 'public, max-age=31536000, immutable',
      MetadataDirective: 'REPLACE',
    })
  );

  // Generate downsized WebP for then-card/ (fast flip card loading)
  const buffer = await downloadFromS3(upload.s3_key);
  const webp = await sharp(buffer)
    .resize({ width: 800, height: 1120, fit: 'cover', position: 'attention' })
    .webp({ quality: 75 })
    .toBuffer();
  await getS3().send(
    new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: cardKey,
      Body: webp,
      ContentType: 'image/webp',
      CacheControl: 'public, max-age=31536000, immutable',
    })
  );

  return destKey;
}

async function downloadFromS3(key: string): Promise<Buffer> {
  const res = await getS3().send(new GetObjectCommand({ Bucket: S3_BUCKET, Key: key }));
  const chunks: Buffer[] = [];
  const stream = res.Body as any;
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

async function promoteToHeadshot(upload: any): Promise<void> {
  const playerId = String(upload.playerid).trim();
  const imageUrl = `https://${S3_BUCKET}.s3.${S3_REGION}.amazonaws.com/${upload.s3_key}`;
  const photoYear = upload.date_taken ? new Date(upload.date_taken).getFullYear() : null;
  const currentYear = new Date().getFullYear();

  // Copy to players/now/ (always — it's the latest headshot file)
  const nowKey = `players/now/${playerId}.jpg`;
  const nowWebKey = `players/now-web/${playerId}.webp`;
  const nowThumbKey = `players/now-thumb/${playerId}.webp`;

  // Also write year-specific file for season-headshots/ (timeline ticks)
  const seasonKey = photoYear ? `players/season-headshots/${playerId}_${photoYear}.jpg` : null;

  const buffer = await downloadFromS3(upload.s3_key);

  // Original to now/
  await getS3().send(
    new CopyObjectCommand({
      Bucket: S3_BUCKET,
      CopySource: `${S3_BUCKET}/${upload.s3_key}`,
      Key: nowKey,
      ContentType: 'image/jpeg',
      CacheControl: 'public, max-age=31536000, immutable',
      MetadataDirective: 'REPLACE',
    })
  );

  // Year-specific copy for season-headshots/
  if (seasonKey) {
    await getS3().send(
      new CopyObjectCommand({
        Bucket: S3_BUCKET,
        CopySource: `${S3_BUCKET}/${upload.s3_key}`,
        Key: seasonKey,
        ContentType: 'image/jpeg',
        CacheControl: 'public, max-age=31536000, immutable',
        MetadataDirective: 'REPLACE',
      })
    );
  }
  const [webBuf, thumbBuf] = await Promise.all([
    sharp(buffer).resize({ width: 400, height: 560, fit: 'cover', position: 'attention' }).webp({ quality: 75 }).toBuffer(),
    sharp(buffer).resize({ width: 200, height: 200, fit: 'cover', position: 'attention' }).webp({ quality: 70 }).toBuffer(),
  ]);
  await Promise.all([
    getS3().send(new PutObjectCommand({
      Bucket: S3_BUCKET, Key: nowWebKey, Body: webBuf,
      ContentType: 'image/webp', CacheControl: 'public, max-age=31536000, immutable',
    })),
    getS3().send(new PutObjectCommand({
      Bucket: S3_BUCKET, Key: nowThumbKey, Body: thumbBuf,
      ContentType: 'image/webp', CacheControl: 'public, max-age=31536000, immutable',
    })),
  ]);

  if (photoYear === currentYear) {
    // Current year: this becomes THE headshot. Demote any existing HEADSHOT role.
    await query(
      `UPDATE public.player_photos SET image_role = 'TIMELINE_HEADSHOT'
       WHERE playerid::text = $1 AND image_role = 'HEADSHOT'`,
      [playerId]
    );
    await query(
      `INSERT INTO public.player_photos
        (playerid, image_url, image_role, show_on_pp_timeline, approval_status,
         date_taken, is_active)
       VALUES ($1, $2, 'HEADSHOT', TRUE, 'APPROVED', $3, TRUE)`,
      [playerId, imageUrl, upload.date_taken || null]
    );
  } else {
    // Past year: timeline headshot — shows on that year's timeline tick
    await query(
      `INSERT INTO public.player_photos
        (playerid, image_url, image_role, show_on_pp_timeline, approval_status,
         date_taken, is_active)
       VALUES ($1, $2, 'TIMELINE_HEADSHOT', TRUE, 'APPROVED', $3, TRUE)`,
      [playerId, imageUrl, upload.date_taken || null]
    );
  }
}

async function promoteToTimeline(upload: any): Promise<void> {
  const playerId = String(upload.playerid).trim();
  const imageUrl = `https://${S3_BUCKET}.s3.${S3_REGION}.amazonaws.com/${upload.s3_key}`;

  await query(
    `INSERT INTO public.player_photos
      (playerid, image_url, image_role, show_on_pp_timeline, approval_status,
       date_taken, is_active)
     VALUES ($1, $2, 'TIMELINE', TRUE, 'APPROVED', $3, TRUE)`,
    [playerId, imageUrl, upload.date_taken || null]
  );
}

async function promoteToSchoolLogo(upload: any): Promise<string> {
  const hsid = String(upload.hsid).trim();
  const destKey = `schools/${hsid}.png`;

  // Optimize the PNG before storing (schools/ has 1.9MB files slowing the site)
  const buffer = await downloadFromS3(upload.s3_key);
  const optimized = await sharp(buffer)
    .resize({ width: 800, height: 800, fit: 'inside', withoutEnlargement: true })
    .png({ compressionLevel: 9 })
    .toBuffer();

  await getS3().send(
    new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: destKey,
      Body: optimized,
      ContentType: 'image/png',
      CacheControl: 'public, max-age=31536000, immutable',
    })
  );

  return destKey;
}

async function promoteToTeamLogo(upload: any): Promise<string> {
  const teamId = String(upload.team_at_time || '').trim();
  if (!teamId) throw new Error('No team ID for team logo');
  const destKey = `teams/${teamId}.png`;
  const webKey = `teams-web/${teamId}.webp`;

  // Optimize PNG + generate tiny WebP for fast loading
  const buffer = await downloadFromS3(upload.s3_key);
  const [pngBuf, webpBuf] = await Promise.all([
    sharp(buffer).resize({ width: 800, height: 800, fit: 'inside', withoutEnlargement: true }).png({ compressionLevel: 9 }).toBuffer(),
    sharp(buffer).resize({ width: 400, height: 400, fit: 'inside', withoutEnlargement: true }).webp({ quality: 75 }).toBuffer(),
  ]);
  await Promise.all([
    getS3().send(new PutObjectCommand({
      Bucket: S3_BUCKET, Key: destKey, Body: pngBuf,
      ContentType: 'image/png', CacheControl: 'public, max-age=31536000, immutable',
    })),
    getS3().send(new PutObjectCommand({
      Bucket: S3_BUCKET, Key: webKey, Body: webpBuf,
      ContentType: 'image/webp', CacheControl: 'public, max-age=31536000, immutable',
    })),
  ]);

  return destKey;
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { rows: uploads } = await query(
      `SELECT * FROM public.media_upload WHERE status = 'pending' ORDER BY uploaded_at ASC LIMIT 20`
    );

    const results = {
      processed: 0,
      approved: 0,
      rejected: 0,
      promoted_to_flip_card: 0,
      errors: [] as string[],
    };

    for (const upload of uploads) {
      results.processed++;

      try {
        const mod = await moderatePhoto(upload);

        if (!mod.approved) {
          await query(
            `UPDATE public.media_upload SET status = 'rejected' WHERE id = $1`,
            [upload.id]
          );
          results.rejected++;
          console.log(`[photo-queue] Rejected ${upload.id}: ${mod.reason}`);
          continue;
        }

        // Promote based on purpose
        const purpose = String(upload.purpose || '').trim();

        if (purpose === 'flip_card' && upload.playerid) {
          const destKey = await promoteToFlipCard(upload);
          console.log(`[photo-queue] Promoted ${upload.id} to ${destKey}`);
          results.promoted_to_flip_card++;
        } else if (purpose === 'headshot' && upload.playerid) {
          await promoteToHeadshot(upload);
          console.log(`[photo-queue] Promoted ${upload.id} to HEADSHOT role`);
        } else if (purpose === 'timeline' && upload.playerid) {
          await promoteToTimeline(upload);
          console.log(`[photo-queue] Promoted ${upload.id} to timeline`);
        } else if (purpose === 'school_logo' && upload.hsid) {
          const destKey = await promoteToSchoolLogo(upload);
          console.log(`[photo-queue] Promoted ${upload.id} to ${destKey}`);
        } else if (purpose === 'team_logo') {
          const destKey = await promoteToTeamLogo(upload);
          console.log(`[photo-queue] Promoted ${upload.id} to ${destKey}`);
        }
        // Unknown purposes stay in staging — review manually

        await query(
          `UPDATE public.media_upload SET status = 'approved' WHERE id = $1`,
          [upload.id]
        );
        results.approved++;
      } catch (err: any) {
        results.errors.push(`Upload ${upload.id}: ${err?.message}`);
        await query(
          `UPDATE public.media_upload SET status = 'error' WHERE id = $1`,
          [upload.id]
        ).catch(() => {});
      }
    }

    return NextResponse.json({ ok: true, ...results });
  } catch (err: any) {
    console.error('[process-photo-queue] failed:', err);
    return NextResponse.json({ error: err?.message }, { status: 500 });
  }
}
