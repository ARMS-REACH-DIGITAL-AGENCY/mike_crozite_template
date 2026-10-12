// src/lib/contributeServer.ts
// Connect & Contribute: server helpers for /api/contribute.
//
// Where things go (tables that were already in the database):
//   photos          -> media_upload (status 'pending'), the file in S3 under
//                      staging/contribute/. Nothing reaches the site until a
//                      reviewer approves it (/api/contribute/review); then the
//                      photo is copied to the files the cards already read.
//   corrections,
//   stats, tips     -> news_tip_queue (intake 'correction' / 'fan_drawer')
//   missing players -> missing_player_submission
// Who sent what is logged to fan_activity (Firebase uid, ARMS contact), the
// same as stories, and the fan's ARMS contact is tagged 'contributor'.
import 'server-only';
import type { NextRequest } from 'next/server';
import { CopyObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import sharp from 'sharp';
import { query } from './db';
import { identifyFan } from './fanIdentity';
import { getUserProfile, type UserProfile } from './userProfile';
import { addTagToGHLContact } from './gohighlevel';
import { S3_BUCKET, S3_REGION, storyAssetUrl } from './storyAssets';
import type { PhotoPurpose } from './contribute';

export { storyAssetUrl as assetUrl };

export type Contributor = { uid: string; email: string; name: string; profile: UserProfile | null };

// Who is contributing: a verified Firebase token or the signed pass (never
// the plain session cookie, which the browser could edit).
export async function identifyContributor(req: NextRequest, idToken?: string | null): Promise<Contributor | null> {
  const identity = await identifyFan(req, idToken);
  if (!identity) return null;
  const profile = await getUserProfile(identity.uid).catch(() => null);
  const name =
    [profile?.first_name, profile?.last_name].map((v) => String(v || '').trim()).filter(Boolean).join(' ') ||
    'A YAT?STATS fan';
  return { uid: identity.uid, email: identity.email || profile?.email || '', name, profile };
}

// Reviewers: the emails in CONTRIBUTE_REVIEWER_EMAILS (comma-separated).
export function isReviewer(c: Contributor | null): boolean {
  if (!c?.email) return false;
  const list = String(process.env.CONTRIBUTE_REVIEWER_EMAILS || '')
    .split(',')
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);
  return list.includes(c.email.toLowerCase());
}

// A day's worth of submissions per fan, across every kind.
export const CONTRIBUTE_DAILY_LIMIT = 60;

export async function contributionsToday(uid: string): Promise<number> {
  const { rows } = await query<{ n: number }>(
    `SELECT count(*)::int AS n FROM fan_activity
      WHERE firebase_uid = $1 AND action LIKE 'contribute_%' AND created_at > now() - interval '1 day'`,
    [uid]
  ).catch(() => ({ rows: [{ n: 0 }] }));
  return rows[0]?.n || 0;
}

export async function logContribution(
  c: Contributor,
  action: string,
  fields: { playerid?: string | null; hsid?: string | null; pageUrl?: string | null; details: Record<string, unknown> }
) {
  await query(
    `INSERT INTO fan_activity (firebase_uid, arms_contact_id, action, playerid, hsid, page_url, details)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
    [c.uid, c.profile?.arms_contact_id || null, action, fields.playerid || null, fields.hsid || null, fields.pageUrl || null, JSON.stringify(fields.details)]
  ).catch((error) => console.error('[contribute] activity log failed', error));
  // Best effort: never holds up the fan.
  const contactId = c.profile?.arms_contact_id;
  if (contactId) addTagToGHLContact(contactId, 'contributor').catch(() => {});
}

// ---------------------------------------------------------------------------
// S3
// ---------------------------------------------------------------------------
let s3Client: S3Client | null = null;
function getS3() {
  if (s3Client) return s3Client;
  const accessKeyId = process.env.YATSTATS_AWS_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.YATSTATS_AWS_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY;
  if (!accessKeyId || !secretAccessKey) throw new Error('S3 keys are not set');
  s3Client = new S3Client({ region: S3_REGION, credentials: { accessKeyId, secretAccessKey } });
  return s3Client;
}

// Staged uploads never change (a new upload gets a new key). Files the site
// reads by player id can be replaced on approval, so they cache for a day.
const STAGED_CACHE = 'public, max-age=31536000, immutable';
const LIVE_CACHE = 'public, max-age=86400';

async function put(key: string, body: Buffer, contentType: string, cache = LIVE_CACHE) {
  await getS3().send(new PutObjectCommand({ Bucket: S3_BUCKET, Key: key, Body: body, ContentType: contentType, CacheControl: cache }));
}

async function copy(from: string, to: string, contentType: string) {
  await getS3().send(
    new CopyObjectCommand({
      Bucket: S3_BUCKET,
      CopySource: `${S3_BUCKET}/${from}`,
      Key: to,
      ContentType: contentType,
      CacheControl: LIVE_CACHE,
      MetadataDirective: 'REPLACE',
    })
  );
}

async function download(key: string): Promise<Buffer> {
  const res = await getS3().send(new GetObjectCommand({ Bucket: S3_BUCKET, Key: key }));
  const chunks: Buffer[] = [];
  for await (const chunk of res.Body as AsyncIterable<Uint8Array>) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

export class NotAnImageError extends Error {}

// The photo as we keep it: upright, every bit of metadata (GPS included)
// removed. Player photos are cropped to 5x7 portrait around the most
// interesting part (the face, usually); action photos are kept whole;
// logos become PNGs with their transparency.
export async function stagePhoto(id: string, purpose: PhotoPurpose, input: Buffer): Promise<{ key: string; mime: string; bytes: number }> {
  let image: sharp.Sharp;
  try {
    image = sharp(input, { failOn: 'error' }).rotate();
    await image.metadata();
  } catch {
    throw new NotAnImageError("That file isn't a photo we can read. Please choose a JPG or PNG.");
  }
  let data: Buffer;
  let mime = 'image/jpeg';
  let ext = 'jpg';
  if (purpose === 'school_logo') {
    data = await image.resize({ width: 1000, height: 1000, fit: 'inside', withoutEnlargement: true }).png({ compressionLevel: 9 }).toBuffer();
    mime = 'image/png';
    ext = 'png';
  } else if (purpose === 'back_hero') {
    data = await image.resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 86, mozjpeg: true }).toBuffer();
  } else {
    data = await image
      .resize({ width: 1000, height: 1400, fit: 'cover', position: sharp.strategy.attention })
      .jpeg({ quality: 86, mozjpeg: true })
      .toBuffer();
  }
  const key = `staging/contribute/${id}.${ext}`;
  await put(key, data, mime, STAGED_CACHE);
  return { key, mime, bytes: data.length };
}

// ---------------------------------------------------------------------------
// Approval: copy the photo to the files the site reads.
//   flip_card     -> players/then/{id}.jpg + then-card/{id}.webp (card front)
//   headshot      -> players/now/{id}.jpg + now-web, now-thumb (row 3, back)
//   year_headshot -> players/season-headshots/{id}_{year}.jpg (the set kept
//                    for his Career Path timeline)
//   back_hero     -> players/back/{id}.jpg + back-card, back-web (card back)
//   school_logo   -> schools/{hsid}.png
// ---------------------------------------------------------------------------
export type UploadRow = {
  id: string;
  playerid: string;
  hsid: string;
  purpose: string;
  s3_key: string;
  date_taken: string | Date | null;
};

export async function promoteUpload(u: UploadRow): Promise<string[]> {
  const pid = String(u.playerid || '').trim();
  const purpose = u.purpose as PhotoPurpose;
  const needsPlayer = purpose !== 'school_logo';
  if (needsPlayer && !/^\d+$/.test(pid)) throw new Error('This photo has no player on the site yet. Add the player first, then approve it.');
  const written: string[] = [];
  const src = await download(u.s3_key);
  const webp = (w: number, h: number, fit: 'cover' | 'inside', quality = 75) =>
    sharp(src).resize({ width: w, height: h, fit, withoutEnlargement: fit === 'inside' }).webp({ quality }).toBuffer();

  if (purpose === 'flip_card') {
    await copy(u.s3_key, `players/then/${pid}.jpg`, 'image/jpeg');
    await put(`players/then-card/${pid}.webp`, await webp(800, 1120, 'cover'), 'image/webp');
    written.push(`players/then/${pid}.jpg`, `players/then-card/${pid}.webp`);
  } else if (purpose === 'headshot') {
    await copy(u.s3_key, `players/now/${pid}.jpg`, 'image/jpeg');
    await put(`players/now-web/${pid}.webp`, await webp(400, 560, 'cover'), 'image/webp');
    await put(`players/now-thumb/${pid}.webp`, await webp(200, 200, 'cover', 70), 'image/webp');
    written.push(`players/now/${pid}.jpg`, `players/now-web/${pid}.webp`, `players/now-thumb/${pid}.webp`);
  } else if (purpose === 'year_headshot') {
    const year = u.date_taken ? new Date(u.date_taken).getUTCFullYear() : null;
    if (!year) throw new Error('This headshot has no year.');
    await copy(u.s3_key, `players/season-headshots/${pid}_${year}.jpg`, 'image/jpeg');
    written.push(`players/season-headshots/${pid}_${year}.jpg`);
  } else if (purpose === 'back_hero') {
    await copy(u.s3_key, `players/back/${pid}.jpg`, 'image/jpeg');
    await put(`players/back-card/${pid}.webp`, await webp(800, 1000, 'cover'), 'image/webp');
    await put(`players/back-web/${pid}.webp`, await webp(1200, 800, 'inside', 78), 'image/webp');
    written.push(`players/back/${pid}.jpg`, `players/back-card/${pid}.webp`, `players/back-web/${pid}.webp`);
  } else if (purpose === 'school_logo') {
    const hsid = String(u.hsid || '').trim();
    if (!/^\d+$/.test(hsid)) throw new Error('This logo has no school.');
    await copy(u.s3_key, `schools/${hsid}.png`, 'image/png');
    written.push(`schools/${hsid}.png`);
  } else {
    throw new Error(`Unknown photo type: ${u.purpose}`);
  }
  return written;
}
