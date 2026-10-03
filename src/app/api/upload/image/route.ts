// src/app/api/upload/image/route.ts
// YAT?STATS — Fan/school image upload intake
//
// Purposes and their destinations:
//   flip_card   → players/then/{playerId}.jpg  (5x7, HS-era photo)
//   headshot    → players/now/{playerId}.jpg   (5x7, current year) or timeline
//   school_logo → schools/{hsid}.png           (PNG, converted if needed)
//   team_logo   → teams/{teamId}.png           (PNG, converted if needed)
//
// All uploads go to staging first. The photo-queue processor moderates
// and promotes to the final destination on approval.

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { query } from '@/lib/db';
import { randomUUID } from 'crypto';
import sharp from 'sharp';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { S3_BUCKET, S3_REGION } from '@/lib/storyAssets';

export const runtime = 'nodejs';

const PLATFORM_SESSION_COOKIE = 'yat-platform-session';
const LEGACY_SESSION_COOKIE = 'yat-session';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

async function getSession(): Promise<{ uid: string; homeHsid: string | null } | null> {
  try {
    const cookieStore = await cookies();
    const raw =
      cookieStore.get(PLATFORM_SESSION_COOKIE)?.value ||
      cookieStore.get(LEGACY_SESSION_COOKIE)?.value;
    if (!raw) return null;
    const session = JSON.parse(raw);
    if (!session?.uid) return null;
    return { uid: session.uid, homeHsid: session.homeHsid || null };
  } catch {
    return null;
  }
}

let s3Client: S3Client | null = null;
function getS3() {
  if (s3Client) return s3Client;
  const accessKeyId = process.env.YATSTATS_AWS_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.YATSTATS_AWS_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY;
  if (!accessKeyId || !secretAccessKey) throw new Error('S3 keys not set');
  s3Client = new S3Client({ region: S3_REGION, credentials: { accessKeyId, secretAccessKey } });
  return s3Client;
}

class NotAnImageError extends Error {}

async function processImage(
  buffer: Buffer,
  purpose: string
): Promise<{ data: Buffer; contentType: string; extension: string }> {
  let pipeline: sharp.Sharp;
  try {
    pipeline = sharp(buffer, { failOn: 'error' }).rotate();
    await pipeline.metadata();
  } catch {
    throw new NotAnImageError('That file is not a photo we can read. Please choose a JPG or PNG.');
  }

  // Strip all metadata (GPS, EXIF, etc.)
  pipeline = pipeline.withMetadata({});

  if (purpose === 'school_logo' || purpose === 'team_logo') {
    // Logos: convert to PNG, resize to max 800px, preserve transparency
    const data = await pipeline
      .clone()
      .resize({ width: 800, height: 800, fit: 'inside', withoutEnlargement: true })
      .png()
      .toBuffer();
    return { data, contentType: 'image/png', extension: 'png' };
  }

  if (purpose === 'flip_card' || purpose === 'headshot') {
    // 5x7 portrait proportion, smart crop on the subject
    const data = await pipeline
      .clone()
      .resize({ width: 500, height: 700, fit: 'cover', position: 'attention' })
      .jpeg({ quality: 86, mozjpeg: true })
      .toBuffer();
    return { data, contentType: 'image/jpeg', extension: 'jpg' };
  }

  // Default: standard processing
  const data = await pipeline
    .clone()
    .resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 86, mozjpeg: true })
    .toBuffer();
  return { data, contentType: 'image/jpeg', extension: 'jpg' };
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  const category = String(formData.get('category') || 'player');
  const purpose = String(formData.get('purpose') || 'flip_card');
  const description = String(formData.get('description') || '').trim() || null;
  const teamAtTime = String(formData.get('team_at_time') || '').trim() || null;
  const dateTaken = String(formData.get('date_taken') || '').trim() || null;
  const playerid = formData.get('playerid') ? String(formData.get('playerid')) : null;
  const playerName = String(formData.get('player_name') || '').trim() || null;
  const hsid = String(formData.get('hsid') || session.homeHsid || '').trim() || null;
  const schoolName = String(formData.get('school_name') || '').trim() || null;
  const teamId = formData.get('team_id') ? String(formData.get('team_id')) : null;

  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
  }
  if (!['school', 'player'].includes(category)) {
    return NextResponse.json({ error: 'Category must be school or player' }, { status: 400 });
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: 'Only JPEG, PNG, WebP, and GIF allowed' }, { status: 400 });
  }
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: 'File too large (max 10MB)' }, { status: 400 });
  }

  // Validate required fields per purpose
  const validPurposes = ['flip_card', 'headshot', 'back_hero', 'timeline_hero', 'school_logo', 'team_logo'];
  if (!validPurposes.includes(purpose)) {
    return NextResponse.json({ error: 'Invalid purpose' }, { status: 400 });
  }
  if (purpose === 'flip_card' && !dateTaken) {
    return NextResponse.json(
      { error: 'Flip card photos require the year the photo was taken' },
      { status: 400 }
    );
  }
  if (['flip_card', 'headshot', 'back_hero', 'timeline_hero'].includes(purpose) && !playerid) {
    return NextResponse.json({ error: 'Player is required for this photo type' }, { status: 400 });
  }
  if (purpose === 'school_logo' && !hsid) {
    return NextResponse.json({ error: 'School is required for logo upload' }, { status: 400 });
  }

  const uploadId = randomUUID();

  // Process the image according to its purpose
  let processed: { data: Buffer; contentType: string; extension: string };
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    processed = await processImage(buffer, purpose);
  } catch (err: any) {
    if (err instanceof NotAnImageError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error('[upload/image] image processing failed:', err);
    return NextResponse.json({ error: 'Could not process image' }, { status: 500 });
  }

  // Store in staging
  const stagingKey = `staging/fan-uploads/${uploadId}.${processed.extension}`;
  try {
    await getS3().send(
      new PutObjectCommand({
        Bucket: S3_BUCKET,
        Key: stagingKey,
        Body: processed.data,
        ContentType: processed.contentType,
        CacheControl: 'public, max-age=31536000, immutable',
      })
    );
  } catch (err: any) {
    console.error('[upload/image] S3 staging failed:', err);
    return NextResponse.json(
      { error: `Photo storage failed: ${err?.message || 'Unknown'}` },
      { status: 500 }
    );
  }

  try {
    const safePlayerid = playerid ? String(playerid).trim() || null : null;

    await query(
      `INSERT INTO public.media_upload
        (id, playerid, hsid, category, s3_key, date_taken, status, mime_type, file_size_bytes,
         purpose, description, team_at_time)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7, $8, $9, $10, $11)`,
      [
        uploadId,
        safePlayerid,
        hsid,
        category,
        stagingKey,
        dateTaken || null,
        processed.contentType,
        processed.data.length,
        purpose,
        description,
        teamAtTime,
      ]
    );

    console.log(
      `[upload/image] ${uploadId}: purpose=${purpose} player=${playerName}(${safePlayerid}) ` +
      `school=${schoolName}(${hsid}) team_id=${teamId} date=${dateTaken} by=${session.uid}`
    );

    return NextResponse.json({
      ok: true,
      message: 'Thanks! Our team will review your photo.',
      upload_id: uploadId,
    });
  } catch (err: any) {
    console.error('[upload/image] insert failed:', err);
    return NextResponse.json(
      { error: `DB error: ${err?.message || 'Unknown'} (code: ${err?.code || 'none'})` },
      { status: 500 }
    );
  }
}
