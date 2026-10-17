// src/app/api/contribute/bulk/route.ts
// Bulk photo upload, for reviewers (CONTRIBUTE_REVIEWER_EMAILS) only.
//
//   GET                                  - { reviewer }: whether the signed-in
//                                          fan is a reviewer (the story box
//                                          shows "Post as YAT?STATS" if so)
//   POST JSON { action: 'check', rows }  - each spreadsheet row matched to a
//                                          player; nothing is written
//   POST form { row fields, photo }      - one photo, posted now: the same
//                                          steps as an approved fan photo
//
// Photo types:
//   flip_card, headshot, back_hero, timeline_hero - staged and promoted to
//     the files the cards and timeline read (lib/contributeServer), logged
//     in media_upload as approved
//   story - a Story / Memory post on his Stories feed (and his timeline),
//     with everyone in the photo tagged, the same as a fan's story
import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import sharp from 'sharp';
import { query } from '@/lib/db';
import { checkBulkRows, type BulkRow, type BulkType } from '@/lib/bulkPhotos';
import {
  NotAnImageError,
  identifyContributor,
  isReviewer,
  existingPublishedTarget,
  logContribution,
  photoLinkPath,
  promoteUpload,
  stagePhoto,
  uploadCategory,
} from '@/lib/contributeServer';
import { NotAnImageError as NotAStoryImageError, makeStoryCutout, storeStoryPhoto } from '@/lib/stories';
import { PLAYER_ID } from '@/lib/contribute';

export const runtime = 'nodejs';
export const maxDuration = 60;

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });
const text = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max);
const MAX_BYTES = 12 * 1024 * 1024;
const MAX_ROWS = 2000;

export async function GET(req: NextRequest) {
  const who = await identifyContributor(req).catch(() => null);
  return NextResponse.json({ reviewer: isReviewer(who) }, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function POST(req: NextRequest) {
  const who = await identifyContributor(req);
  if (!isReviewer(who)) return fail('Bulk upload is for YAT?STATS reviewers.', 403);

  if ((req.headers.get('content-type') || '').includes('application/json')) {
    const body = await req.json().catch(() => null);
    if (body?.action !== 'check' || !Array.isArray(body.rows)) return fail('Nothing to check.');
    const rows: BulkRow[] = body.rows.slice(0, MAX_ROWS).map((r: Record<string, unknown>, i: number) => ({
      row: Number(r.row) || i + 2,
      file: text(r.file, 200),
      first: text(r.first, 60),
      last: text(r.last, 60),
      school: text(r.school, 120),
      city: text(r.city, 80),
      playerId: text(r.playerId, 30),
      type: text(r.type, 60),
      year: text(r.year, 10),
      month: text(r.month, 12),
      caption: text(r.caption, 2000),
      alsoIn: text(r.alsoIn, 600),
      credit: text(r.credit, 120),
    }));
    try {
      return NextResponse.json({ rows: await checkBulkRows(rows) });
    } catch (error) {
      console.error('[contribute/bulk] check failed', error);
      return fail('The check could not run. Please try again.', 500);
    }
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail('That photo was too large to send.', 413);
  }
  const file = form.get('photo');
  if (!(file instanceof File) || file.size === 0) return fail('No photo.');
  if (file.size > MAX_BYTES) return fail('That photo is too large.', 413);
  const type = text(form.get('type'), 20) as BulkType;
  const playerId = text(form.get('playerId'), 30);
  const year = Number(form.get('year')) || null;
  const month = Number(form.get('month')) || null;
  const caption = text(form.get('caption'), 2000);
  const credit = text(form.get('credit'), 120);
  const fileName = text(form.get('fileName'), 200);
  // A Story / Memory posted as YAT?STATS (the crest), not as the reviewer.
  const asYatstats = form.get('asYatstats') === '1';
  let tagged: string[] = [];
  try {
    tagged = (JSON.parse(String(form.get('tagged') || '[]')) as unknown[]).map((v) => String(v)).filter((v) => PLAYER_ID.test(v)).slice(0, 20);
  } catch {}
  if (!PLAYER_ID.test(playerId)) return fail('No player.');
  if (!['flip_card', 'headshot', 'back_hero', 'timeline_hero', 'story'].includes(type)) return fail('Unknown photo type.');

  try {
    const { rows: found } = await query<{ playerid: string; hsid: string; name: string; first: string; last: string; class_of: string | null }>(
      `SELECT playerid::text AS playerid, hsid::text AS hsid, COALESCE(first_name, '') AS first, COALESCE(last_name, '') AS last,
              TRIM(COALESCE(first_name, '') || ' ' || COALESCE(last_name, '')) AS name, class_of::text AS class_of
         FROM flip_card_front_stage WHERE upper(playerid::text) = upper($1)
        ORDER BY updated_at DESC NULLS LAST LIMIT 1`,
      [playerId]
    );
    const player = found[0];
    if (!player) return fail('That player was not found.', 404);
    const input = Buffer.from(await file.arrayBuffer());
    const thisYear = new Date().getFullYear();
    const pageUrl = req.headers.get('referer')?.slice(0, 500) || null;

    if (type === 'story') {
      if (!year) return fail('A Story / Memory needs its year.');
      if (!caption) return fail('A Story / Memory needs a caption.');
      const stored = await storeStoryPhoto(randomUUID(), 0, input);
      await Promise.race([makeStoryCutout(stored.s3_key), new Promise((resolve) => setTimeout(resolve, 20000))]);
      const takenDate = month ? `${year}-${String(month).padStart(2, '0')}-01` : null;
      const author = asYatstats ? 'YAT?STATS' : who!.name;
      const story = credit && credit.toLowerCase() !== author.toLowerCase() ? `${caption}\n\nPhoto: ${credit}` : caption;
      const ids = [player.playerid, ...tagged.filter((t) => t.toUpperCase() !== player.playerid.toUpperCase())];
      const { rows } = await query<{ id: string }>(
        `WITH story AS (
           INSERT INTO player_moment_submissions (
             playerid, hsid, stage, caption, contributor_name, status,
             contributor_email, contributor_firebase_uid, contributor_role, player_name, page_url,
             photo_taken_date, photo_taken_year, sort_date, visibility, is_private, arms_sync_status
           ) VALUES (
             $1, $2, 'Story', $3, $4, 'live',
             $5, $6, $19, $7, $8,
             $9::date, $10, COALESCE($9::date, make_date($10, 7, 1)), 'public', false, $20
           ) RETURNING id
         ), photos AS (
           INSERT INTO player_moment_photos (moment_id, sort_order, s3_key, web_s3_key, thumb_s3_key, width, height, mime_type, file_size_bytes)
           SELECT story.id, 0, $11, $12, $13, $14, $15, $16, $17 FROM story
         ), players AS (
           INSERT INTO player_moment_players (moment_id, playerid, is_primary, tagged_by_firebase_uid)
           SELECT story.id, t.playerid, t.playerid = $1, CASE WHEN t.playerid = $1 THEN NULL ELSE $6 END
             FROM story, unnest($18::text[]) AS t(playerid)
         )
         SELECT id::text AS id FROM story`,
        [
          player.playerid, player.hsid, story, author, who!.email || null, who!.uid, player.name, pageUrl,
          takenDate, year,
          stored.s3_key, stored.web_s3_key, stored.thumb_s3_key, stored.width, stored.height, stored.mime_type, stored.file_size_bytes,
          ids,
          asYatstats ? 'yatstats' : 'reviewer',
          asYatstats ? 'system' : 'not_sent',
        ]
      );
      await logContribution(who!, 'contribute_bulk_story', { playerid: player.playerid, hsid: player.hsid, pageUrl, details: { moment_id: rows[0]?.id, file: fileName } });
      const profile = photoLinkPath('headshot', { playerId: player.playerid, playerName: player.name, hsid: player.hsid });
      return NextResponse.json({ ok: true, link: profile && rows[0]?.id ? `${profile}?story=${rows[0].id}` : profile }, { status: 201 });
    }

    // A card or timeline photo: staged (cropped like the drawer, around the
    // most interesting part), then promoted to the site's files at once.
    const dateYear = year || (type === 'flip_card' ? Number(player.class_of) || thisYear : thisYear);
    const meta = await sharp(input, { failOn: 'error' }).rotate().metadata().catch(() => null);
    const landscape = type === 'timeline_hero' && !!meta?.width && !!meta?.height && meta.width > meta.height;
    // A headshot from this year is his current headshot everywhere; an
    // older one goes with that season on his timeline.
    const currentSeason = type === 'headshot' && dateYear >= thisYear;
    const id = randomUUID();
    const staged = await stagePhoto(id, type, input, null, landscape);
    const details = {
      bulk: true,
      file: fileName,
      note: caption || null,
      credit: credit || null,
      season: year ? { year } : null,
      landscape: type === 'timeline_hero' ? landscape : undefined,
      currentSeason: type === 'headshot' ? currentSeason : undefined,
      playerName: player.name,
      by: { uid: who!.uid, name: who!.name, email: who!.email || null },
      pageUrl,
    };
    await query(
      `INSERT INTO media_upload (id, playerid, hsid, category, s3_key, date_taken, status, mime_type, file_size_bytes, purpose, description, sha256)
       VALUES ($1, $2, $3, $4, $5, $6::date, 'pending', $7, $8, $9, $10, $11)`,
      [id, player.playerid, player.hsid, uploadCategory(type), staged.key, `${dateYear}-01-01`, staged.mime, staged.bytes, type, JSON.stringify(details), staged.sha256]
    );
    const upload = { id, playerid: player.playerid, hsid: player.hsid, purpose: type, s3_key: staged.key, date_taken: `${dateYear}-01-01`, current_season: currentSeason };
    const { rows: same } = await query<{ id: string }>(
      `SELECT id::text FROM media_upload
        WHERE id <> $1 AND playerid = $2 AND purpose = $3 AND date_taken = $4::date
          AND sha256 = $5 AND status IN ('pending', 'approved')
        ORDER BY uploaded_at ASC LIMIT 1`,
      [id, player.playerid, type, `${dateYear}-01-01`, staged.sha256]
    );
    const occupied = await existingPublishedTarget(upload);
    if (same.length || occupied) {
      // Never silently replace a photo or publish an identical contribution;
      // keep the durable staging record available to the reviewer.
      return NextResponse.json({ ok: true, status: 'pending', id, message: same.length ? 'Duplicate upload held for review.' : 'Existing photo held for review.' }, { status: 201 });
    }
    const written = await promoteUpload(upload);
    await query(`UPDATE media_upload SET status = 'approved', description = $2 WHERE id = $1`, [id, JSON.stringify({ ...details, published_assets: written })]);
    await logContribution(who!, 'contribute_bulk_photo', { playerid: player.playerid, hsid: player.hsid, pageUrl, details: { upload_id: id, purpose: type, file: fileName } });
    return NextResponse.json({ ok: true, link: photoLinkPath(type, { playerId: player.playerid, playerName: player.name, hsid: player.hsid }), written }, { status: 201 });
  } catch (error) {
    if (error instanceof NotAnImageError || error instanceof NotAStoryImageError) return fail(error.message);
    console.error('[contribute/bulk] post failed', error);
    return fail(error instanceof Error ? error.message : 'That photo could not be posted.', 500);
  }
}
