// src/lib/contributeServer.ts
// Connect & Contribute: server helpers for /api/contribute.
//
// Where things go (tables that were already in the database):
//   photos          -> media_upload, with unique staged files and automatic AI
//                      review. Approved timeline photos get unique published
//                      keys per upload, so same-year images rotate together.
//                      Only exceptions (unsafe or conflicting replacements)
//                      wait for a reviewer.
//   corrections,
//   stats, tips     -> news_tip_queue (intake 'correction' / 'fan_drawer')
//   missing players -> missing_player_submission
// Who sent what is logged to fan_activity (Firebase uid, ARMS contact), the
// same as stories, and the fan's ARMS contact is tagged 'contributor'.
import 'server-only';
import type { NextRequest } from 'next/server';
import { CopyObjectCommand, DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { createHash } from 'crypto';
import sharp from 'sharp';
import { query } from './db';
import { identifyFan } from './fanIdentity';
import { getUserProfile, type UserProfile } from './userProfile';
import { addNoteToGHLContact, addTagToGHLContact, findOrCreateGhlContact, sendGHLEmail } from './gohighlevel';
import { toPlayerSlug } from './slug';
import { S3_BUCKET, S3_REGION, storyAssetUrl } from './storyAssets';
import { PLAYER_ID, photoTypeLabel, type Crop, type PhotoPurpose } from './contribute';

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
// Telling the contributor (ARMS)
// ---------------------------------------------------------------------------
// When a photo goes on the site - right away, or after a reviewer approves
// it - the fan who sent it gets an email from YAT?STATS through ARMS
// (HighLevel), with a link to the player's profile. A photo a reviewer
// turns down gets a short note too. Their ARMS contact is tagged
// contribution-posted / contribution-declined either way, with a note of
// what it was. Best effort: never holds up the request.
// Where an approved photo shows on the site, as a path on the school's own
// site: his profile (opened on the Career Path Timeline for timeline and
// additional player photos), or the school's home for its crest.
export function photoLinkPath(purpose: string, p: { playerId?: string | null; playerName?: string | null; hsid?: string | null; pageUrl?: string | null }): string | null {
  const hsid = String(p.hsid || '');
  if (!/^\d+$/.test(hsid)) return null;
  if (purpose === 'school_logo') {
    // Every TBC school appears in Global Search; only some have microsites.
    // Keep the contributor on the page where they submitted the crest.
    let path = '/';
    try { if (p.pageUrl) path = new URL(p.pageUrl).pathname; } catch {}
    return `${path}?schoolSearch=${encodeURIComponent(hsid)}`;
  }
  if (!p.playerId) return null;
  const [fn, ...ln] = String(p.playerName || '').trim().split(/\s+/);
  const profile = `/${hsid}/player/${encodeURIComponent(p.playerId)}/${toPlayerSlug(fn, ln.join(' '))}`;
  return purpose === 'timeline_hero' || purpose === 'other_photo' ? `${profile}#playerCareerImages` : profile;
}

const esc = (v: string) => v.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

export async function notifyContributor(
  by: { email?: string | null; name?: string | null } | null | undefined,
  outcome: 'posted' | 'declined',
  photo: { purpose: string; playerId?: string | null; playerName?: string | null; hsid?: string | null; year?: number | null; pageUrl?: string | null; reason?: string | null }
) {
  const email = String(by?.email || '').trim();
  if (!email) return;
  try {
    const first = String(by?.name || '').trim().split(/\s+/)[0] || '';
    const contactId = await findOrCreateGhlContact(email, first || undefined);
    if (!contactId) return;
    const what = `${photoTypeLabel(photo.purpose)}${photo.playerName ? ` of ${photo.playerName}` : ''}${photo.year ? ` (${photo.year})` : ''}`;
    let link = '';
    try {
      const origin = photo.pageUrl ? new URL(photo.pageUrl).origin : '';
      const path = photoLinkPath(photo.purpose, photo);
      if (origin) link = path ? `${origin}${path}` : origin;
    } catch {}
    const hi = first ? `Hi ${esc(first)},` : 'Hi,';
    const [subject, body] = outcome === 'posted'
      ? [
          `Your photo${photo.playerName ? ` of ${photo.playerName}` : ''} is on YAT?STATS`,
          `<p>${hi}</p><p>Thank you! Your ${esc(what)} is on the site now.</p>${link ? `<p><a href="${esc(link)}">See it on YAT?STATS</a></p>` : ''}<p>Every photo helps complete the story of where they YAT now.</p><p>YAT?STATS</p>`,
        ]
      : [
          `About your photo${photo.playerName ? ` of ${photo.playerName}` : ''}`,
          `<p>${hi}</p><p>Thank you for sending your ${esc(what)}. We weren't able to use this one${photo.reason ? `: ${esc(photo.reason)}` : '.'}</p><p>You're welcome to send another anytime.</p><p>YAT?STATS</p>`,
        ];
    await Promise.all([
      addTagToGHLContact(contactId, `contribution-${outcome}`),
      addNoteToGHLContact(contactId, `Photo ${outcome}: ${what}${link ? `\n${link}` : ''}${photo.reason ? `\nReason: ${photo.reason}` : ''}`),
      sendGHLEmail(contactId, subject, body),
    ]);
  } catch (error) {
    console.error('[contribute] notify contributor failed', error);
  }
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
export async function stagePhoto(id: string, purpose: PhotoPurpose, input: Buffer, crop?: Crop | null, landscape = false): Promise<{ key: string; mime: string; bytes: number; sha256: string }> {
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
      // The cropper's fractions can round to a one-pixel ratio mismatch.
      // Cover makes the approved frame exact without stretching the player.
      data = await image.resize({ width: size.w, height: size.h, fit: 'cover', position: sharp.strategy.attention }).jpeg({ quality: 86, mozjpeg: true }).toBuffer();
    } else {
      data = await image.resize({ width: size.w, height: size.h, fit: 'cover', position: sharp.strategy.attention }).jpeg({ quality: 86, mozjpeg: true }).toBuffer();
    }
  } else {
    data = await image.resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 86, mozjpeg: true }).toBuffer();
  }
  const key = `staging/contribute/${id}.${ext}`;
  await put(key, data, mime, STAGED_CACHE);
  return { key, mime, bytes: data.length, sha256: createHash('sha256').update(data).digest('hex') };
}

// The player cut out of the background (remove.bg), for his Career Path
// Timeline's hero spot. Send the staged bytes directly instead of making the
// service fetch our S3 URL; this keeps processing independent of URL access.
// null when remove.bg isn't set up or finds no one; callers must provide a
// visible, aspect-preserving fallback rather than silently omitting the photo.
async function cutout(source: Buffer): Promise<Buffer | null> {
  const apiKey = process.env.REMOVE_BG_API_KEY;
  if (!apiKey) {
    console.warn('[contribute] remove.bg unavailable: REMOVE_BG_API_KEY is not configured');
    return null;
  }
  if (!source.length) {
    console.warn('[contribute] remove.bg unavailable: staged image is empty');
    return null;
  }
  const form = new FormData();
  form.set('image_file', new Blob([new Uint8Array(source)], { type: 'image/jpeg' }), 'upload.jpg');
  form.set('size', 'auto');
  form.set('type', 'auto');
  form.set('crop', 'true');
  form.set('format', 'png');
  let res: Response;
  try {
    res = await fetch('https://api.remove.bg/v1.0/removebg', {
      method: 'POST',
      headers: { 'X-Api-Key': apiKey },
      body: form,
      signal: AbortSignal.timeout(25000),
    });
  } catch (error) {
    console.warn('[contribute] remove.bg request failed', { errorType: error instanceof Error ? error.name : 'unknown' });
    return null;
  }
  if (!res.ok) {
    console.warn('[contribute] remove.bg returned a non-success response', { status: res.status });
    return null;
  }
  try {
    const png = Buffer.from(await res.arrayBuffer());
    const metadata = await sharp(png).metadata();
    const stats = await sharp(png).stats();
    const alpha = metadata.hasAlpha ? stats.channels[3] : undefined;
    if (!metadata.hasAlpha || !alpha || alpha.min >= 255 || alpha.max <= 0) {
      console.warn('[contribute] remove.bg response did not contain usable transparency', {
        format: metadata.format || 'unknown',
        hasAlpha: Boolean(metadata.hasAlpha),
      });
      return null;
    }
    return await sharp(png).trim({ threshold: 1 }).resize({ width: 1400, height: 1400, fit: 'inside', withoutEnlargement: true }).png().toBuffer();
  } catch (error) {
    console.warn('[contribute] remove.bg response was not a usable image', { errorType: error instanceof Error ? error.name : 'unknown' });
    return null;
  }
}

// The cutout his timeline shows for a photo that just replaced his then/,
// back/ or now/ original: players/{kind}-cutouts/{id}.png and the trimmed
// players/{kind}-web/{id}.webp made from it, the same way the Build Web
// Cutouts job makes it (a wide action photo's left side faded out). Without
// this he kept his old cutout: the hourly cutout job skips any player who
// already has one. When remove.bg isn't set up or finds no one, the old
// cutout is removed instead, so that job cuts the new photo within the hour.
async function replaceCutout(kind: 'then' | 'back' | 'now', pid: string, source: Buffer, written: string[]) {
  const png = await cutout(source);
  if (!png) {
    await getS3().send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: `players/${kind}-cutouts/${pid}.png` })).catch(() => {});
    return;
  }
  await put(`players/${kind}-cutouts/${pid}.png`, png, 'image/png');
  const { data, info } = await sharp(png)
    .resize({ width: 2000, height: 2000, fit: 'inside', withoutEnlargement: true })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (kind === 'back' && info.width / info.height >= 2) {
    for (let x = 0; x < info.width; x++) {
      const t = Math.min(1, Math.max(0, (x / info.width - 0.12) / 0.3));
      const fade = Math.pow(t * t * (3 - 2 * t), 1.5);
      for (let y = 0; y < info.height; y++) {
        const i = (y * info.width + x) * 4 + 3;
        data[i] = Math.round(data[i] * fade);
      }
    }
  }
  const web = await sharp(data, { raw: info })
    .trim({ threshold: 10 })
    .resize({ width: 1400, height: 1000, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 82, alphaQuality: 90 })
    .toBuffer();
  await put(`players/${kind}-web/${pid}.webp`, web, 'image/webp');
  written.push(`players/${kind}-cutouts/${pid}.png`, `players/${kind}-web/${pid}.webp`);
}

// ---------------------------------------------------------------------------
// Approval: copy the photo to the files the site reads.
//   flip_card     -> players/then/{id}.jpg + then-card/{id}.webp (card front)
//   headshot      -> players/season-headshots/{id}_{year}.jpg (that season,
//                    for his Career Path Timeline); from his newest season
//                    also players/now/{id}.jpg + now-thumb, now-web - his
//                    headshot everywhere (Row 3, profile, search)
//   timeline_hero -> players/season-cutouts/{id}_{year}.png (when background
//                    removal succeeds); otherwise the timeline uses the
//                    aspect-preserving original at season-photos/{id}_{year}.jpg
//   other_photo   -> player-tagged uploads publish as timeline photos; only
//                    legacy untagged uploads remain in fan-photos/
//   back_hero     -> players/back/{id}.jpg + back-card, back-web (card back)
//   school_logo   -> schools/{hsid}.png
//   team_logo     -> teams/{teamid}.png + teams-web/{teamid}.webp
// ---------------------------------------------------------------------------
// The upload's immutable staged bytes are the source of truth for duplicate
// detection, including submissions saved before we began recording sha256.
export async function sha256ForStagedPhoto(key: string): Promise<string> {
  if (!/^staging\/contribute\/[0-9a-f-]{36}\.(jpg|png)$/.test(key)) throw new Error('Not a staged contribution');
  return createHash('sha256').update(await download(key)).digest('hex');
}

export type UploadRow = {
  id: string;
  playerid: string;
  hsid: string;
  purpose: string;
  s3_key: string;
  date_taken: string | Date | null;
  // A team logo's team (our Baseball Cube team id).
  team_at_time?: string | null;
  // A headshot from his newest season (else from its JSON description).
  current_season?: boolean;
  description?: string | null;
};

// Legacy card, logo and season headshot slots contain exactly one image.
// Never silently overwrite those when automatically processing a fan upload.
// A reviewer may explicitly replace them; timeline heroes are append-only.
export async function existingPublishedTarget(u: UploadRow): Promise<string | null> {
  const pid = String(u.playerid || '').trim();
  const year = u.date_taken ? new Date(u.date_taken).getUTCFullYear() : null;
  const purpose = u.purpose as PhotoPurpose;
  let key: string | null = null;
  if (purpose === 'flip_card') key = `players/then/${pid}.jpg`;
  else if (purpose === 'back_hero') key = `players/back/${pid}.jpg`;
  else if (purpose === 'headshot' && year) key = `players/season-headshots/${pid}_${year}.jpg`;
  else if (purpose === 'school_logo') key = `schools/${u.hsid}.png`;
  else if (purpose === 'team_logo') key = `teams/${u.team_at_time}.png`;
  if (!key) return null;
  try {
    await getS3().send(new HeadObjectCommand({ Bucket: S3_BUCKET, Key: key }));
    return key;
  } catch (error) {
    const e = error as { name?: string; $metadata?: { httpStatusCode?: number } };
    if (e.$metadata?.httpStatusCode === 404 || e.name === 'NotFound' || e.name === 'NoSuchKey') return null;
    throw error; // An S3 outage or permissions error must never mean "safe to overwrite".
  }
}

export async function promoteUpload(u: UploadRow): Promise<string[]> {
  const pid = String(u.playerid || '').trim();
  const purpose = (u.purpose === 'other_photo' && PLAYER_ID.test(pid) ? 'timeline_hero' : u.purpose) as PhotoPurpose;
  const needsPlayer = purpose !== 'school_logo' && purpose !== 'team_logo' && purpose !== 'other_photo';
  if (needsPlayer && !PLAYER_ID.test(pid)) throw new Error('This photo has no player on the site yet. Add the player first, then approve it.');
  const written: string[] = [];
  const src = await download(u.s3_key);
  const webp = (w: number, h: number, fit: 'cover' | 'inside', quality = 75) =>
    sharp(src).resize({ width: w, height: h, fit, withoutEnlargement: fit === 'inside' }).webp({ quality }).toBuffer();

  if (purpose === 'flip_card') {
    await copy(u.s3_key, `players/then/${pid}.jpg`, 'image/jpeg');
    await put(`players/then-card/${pid}.webp`, await webp(800, 1120, 'cover'), 'image/webp');
    written.push(`players/then/${pid}.jpg`, `players/then-card/${pid}.webp`);
    await replaceCutout('then', pid, src, written);
  } else if (purpose === 'headshot') {
    const year = u.date_taken ? new Date(u.date_taken).getUTCFullYear() : null;
    if (year) {
      await copy(u.s3_key, `players/season-headshots/${pid}_${year}.jpg`, 'image/jpeg');
      written.push(`players/season-headshots/${pid}_${year}.jpg`);
    }
    let current = u.current_season;
    if (current === undefined) {
      try { current = Boolean(JSON.parse(u.description || '{}').currentSeason); } catch { current = false; }
    }
    if (!current) return written;
    await copy(u.s3_key, `players/now/${pid}.jpg`, 'image/jpeg');
    await put(`players/now-thumb/${pid}.webp`, await webp(200, 200, 'cover', 70), 'image/webp');
    written.push(`players/now/${pid}.jpg`, `players/now-thumb/${pid}.webp`);
    // now-web is his headshot cut out (the timeline's Today and anchor
    // slides), never the square photo.
    await replaceCutout('now', pid, src, written);
  } else if (purpose === 'timeline_hero') {
    const year = u.date_taken ? new Date(u.date_taken).getUTCFullYear() : null;
    if (!year) throw new Error('This photo has no season.');
    // Every photo gets its own immutable destination. Multiple photos from
    // one player/season can coexist and rotate; never rewrite the legacy
    // ${pid}_${year}.jpg file or another fan's image.
    const photoKey = `players/season-photos/${pid}_${year}_${u.id}.jpg`;
    await copy(u.s3_key, photoKey, 'image/jpeg');
    written.push(photoKey);
    const cutoutKey = `players/season-cutouts/${pid}_${year}_${u.id}.png`;
    const cutoutPng = await cutout(src);
    if (cutoutPng) {
      await put(cutoutKey, cutoutPng, 'image/png');
      written.push(cutoutKey);
    } else {
      // Do not save an opaque rectangle under a cutout filename. The timeline
      // will fall through to the original JPG and render it at its true ratio.
      await getS3().send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: cutoutKey })).catch((error) => {
        console.warn('[contribute/photo] stale season cutout could not be removed', { uploadId: u.id, errorType: error instanceof Error ? error.name : 'unknown' });
      });
      console.warn('[contribute/photo] using aspect-preserving timeline photo fallback', { uploadId: u.id, playerId: pid, year });
    }
  } else if (purpose === 'team_logo') {
    const teamId = String(u.team_at_time || '').trim();
    if (!/^\d+$/.test(teamId)) throw new Error('This logo has no team.');
    await copy(u.s3_key, `teams/${teamId}.png`, 'image/png');
    await put(`teams-web/${teamId}.webp`, await webp(400, 400, 'inside'), 'image/webp');
    written.push(`teams/${teamId}.png`, `teams-web/${teamId}.webp`);
  } else if (purpose === 'other_photo') {
    const key = `fan-photos/${PLAYER_ID.test(pid) ? `players/${pid}` : 'unplaced'}/${u.id}.jpg`;
    await copy(u.s3_key, key, 'image/jpeg');
    written.push(key);
  } else if (purpose === 'back_hero') {
    await copy(u.s3_key, `players/back/${pid}.jpg`, 'image/jpeg');
    // The back of the card shows it as a wide 20:7 strip.
    await put(`players/back-card/${pid}.webp`, await webp(1200, 420, 'cover'), 'image/webp');
    written.push(`players/back/${pid}.jpg`, `players/back-card/${pid}.webp`);
    // back-web is the action photo cut out, for his timeline.
    await replaceCutout('back', pid, src, written);
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
