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
import type { Crop, PhotoPurpose } from './contribute';

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

// media_upload.category allows only 'highschool', 'current' and 'gallery'.
export function uploadCategory(purpose: PhotoPurpose): 'highschool' | 'current' | 'gallery' {
  if (purpose === 'flip_card' || purpose === 'school_logo') return 'highschool';
  if (purpose === 'team_logo') return 'gallery';
  if (purpose === 'headshot' || purpose === 'back_hero') return 'current';
  return 'gallery';
}

// Output size for each framed photo type (the frame the fan placed it in).
// (A timeline image placed 7x5 is turned the other way: 1400 x 1000.)
const FRAMED: Partial<Record<PhotoPurpose, { w: number; h: number }>> = {
  flip_card: { w: 1000, h: 1400 },
  headshot: { w: 1000, h: 1400 },
  timeline_hero: { w: 1000, h: 1400 },
  back_hero: { w: 2000, h: 700 },
};

function validCrop(c: Crop | null | undefined): c is Crop {
  return Boolean(c) && [c!.x, c!.y, c!.w, c!.h].every((v) => Number.isFinite(v) && v >= 0 && v <= 1) && c!.w > 0.02 && c!.h > 0.02;
}

// The photo as we keep it: upright, every bit of metadata (GPS included)
// removed. Player photos are cropped to 5x7 portrait around the most
// interesting part (the face, usually); action photos are kept whole;
// logos become PNGs with their transparency.
export async function stagePhoto(id: string, purpose: PhotoPurpose, input: Buffer, crop?: Crop | null, landscape = false): Promise<{ key: string; mime: string; bytes: number }> {
  let image: sharp.Sharp;
  let meta: sharp.Metadata;
  try {
    // Upright first, so the crop the fan saw is the crop we cut.
    const upright = await sharp(input, { failOn: 'error' }).rotate().toBuffer();
    image = sharp(upright);
    meta = await image.metadata();
  } catch {
    throw new NotAnImageError("That file isn't a photo we can read. Please choose a JPG or PNG.");
  }
  let data: Buffer;
  let mime = 'image/jpeg';
  let ext = 'jpg';
  const framed = FRAMED[purpose];
  const size = framed && landscape && purpose === 'timeline_hero' ? { w: framed.h, h: framed.w } : framed;
  if (purpose === 'school_logo' || purpose === 'team_logo') {
    // Logos are square and never cut: the whole logo, centered, on a
    // see-through square.
    data = await image
      .resize({ width: 1000, height: 1000, fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png({ compressionLevel: 9 })
      .toBuffer();
    mime = 'image/png';
    ext = 'png';
  } else if (size) {
    const W = meta.width || 0;
    const H = meta.height || 0;
    if (validCrop(crop) && W && H) {
      const left = Math.min(W - 1, Math.round(crop.x * W));
      const top = Math.min(H - 1, Math.round(crop.y * H));
      image = image.extract({
        left,
        top,
        width: Math.max(1, Math.min(W - left, Math.round(crop.w * W))),
        height: Math.max(1, Math.min(H - top, Math.round(crop.h * H))),
      });
      data = await image.resize({ width: size.w, height: size.h, fit: 'fill' }).jpeg({ quality: 86, mozjpeg: true }).toBuffer();
    } else {
      data = await image.resize({ width: size.w, height: size.h, fit: 'cover', position: sharp.strategy.attention }).jpeg({ quality: 86, mozjpeg: true }).toBuffer();
    }
  } else {
    data = await image.resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 86, mozjpeg: true }).toBuffer();
  }
  const key = `staging/contribute/${id}.${ext}`;
  await put(key, data, mime, STAGED_CACHE);
  return { key, mime, bytes: data.length };
}

// The player cut out of the background (remove.bg), for his Career Path
// Timeline's hero spot. null when remove.bg isn't set up or finds no one.
async function cutout(stagedKey: string): Promise<Buffer | null> {
  const apiKey = process.env.REMOVE_BG_API_KEY;
  const url = storyAssetUrl(stagedKey);
  if (!apiKey || !url) return null;
  const form = new FormData();
  form.set('image_url', url);
  form.set('size', 'auto');
  form.set('type', 'auto');
  form.set('crop', 'true');
  form.set('format', 'png');
  const res = await fetch('https://api.remove.bg/v1.0/removebg', {
    method: 'POST',
    headers: { 'X-Api-Key': apiKey },
    body: form,
    signal: AbortSignal.timeout(25000),
  }).catch(() => null);
  if (!res?.ok) return null;
  const png = Buffer.from(await res.arrayBuffer());
  return sharp(png).trim({ threshold: 1 }).resize({ width: 1400, height: 1400, fit: 'inside', withoutEnlargement: true }).png().toBuffer();
}

// ---------------------------------------------------------------------------
// Approval: copy the photo to the files the site reads.
//   flip_card     -> players/then/{id}.jpg + then-card/{id}.webp (card front)
//   headshot      -> players/now/{id}.jpg + now-web, now-thumb (row 3, back)
//   timeline_hero -> players/season-cutouts/{id}_{year}.png (that season's
//                    hero on his Career Path Timeline, cut out of the
//                    background), the photo itself kept in
//                    players/season-photos/{id}_{year}.jpg
//   other_photo   -> kept in fan-photos/ for us to place
//   back_hero     -> players/back/{id}.jpg + back-card, back-web (card back)
//   school_logo   -> schools/{hsid}.png
//   team_logo     -> teams/{teamid}.png + teams-web/{teamid}.webp
// ---------------------------------------------------------------------------
export type UploadRow = {
  id: string;
  playerid: string;
  hsid: string;
  purpose: string;
  s3_key: string;
  date_taken: string | Date | null;
  // A team logo's team (our Baseball Cube team id).
  team_at_time?: string | null;
};

export async function promoteUpload(u: UploadRow): Promise<string[]> {
  const pid = String(u.playerid || '').trim();
  const purpose = u.purpose as PhotoPurpose;
  const needsPlayer = purpose !== 'school_logo' && purpose !== 'team_logo' && purpose !== 'other_photo';
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
  } else if (purpose === 'timeline_hero') {
    const year = u.date_taken ? new Date(u.date_taken).getUTCFullYear() : null;
    if (!year) throw new Error('This photo has no season.');
    await copy(u.s3_key, `players/season-photos/${pid}_${year}.jpg`, 'image/jpeg');
    written.push(`players/season-photos/${pid}_${year}.jpg`);
    const png = await cutout(u.s3_key);
    if (png) {
      await put(`players/season-cutouts/${pid}_${year}.png`, png, 'image/png');
      written.push(`players/season-cutouts/${pid}_${year}.png`);
    }
  } else if (purpose === 'team_logo') {
    const teamId = String(u.team_at_time || '').trim();
    if (!/^\d+$/.test(teamId)) throw new Error('This logo has no team.');
    await copy(u.s3_key, `teams/${teamId}.png`, 'image/png');
    await put(`teams-web/${teamId}.webp`, await webp(400, 400, 'inside'), 'image/webp');
    written.push(`teams/${teamId}.png`, `teams-web/${teamId}.webp`);
  } else if (purpose === 'other_photo') {
    const key = `fan-photos/${/^\d+$/.test(pid) ? `players/${pid}` : 'unplaced'}/${u.id}.jpg`;
    await copy(u.s3_key, key, 'image/jpeg');
    written.push(key);
  } else if (purpose === 'back_hero') {
    await copy(u.s3_key, `players/back/${pid}.jpg`, 'image/jpeg');
    // The back of the card shows it as a wide 20:7 strip.
    await put(`players/back-card/${pid}.webp`, await webp(1200, 420, 'cover'), 'image/webp');
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
