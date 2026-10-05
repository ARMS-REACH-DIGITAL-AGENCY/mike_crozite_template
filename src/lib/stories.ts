// src/lib/stories.ts
// Fan Stories: server helpers shared by /api/stories.
//
// A story is a row in player_moment_submissions (status 'live'), its photos
// are rows in player_moment_photos (files in S3), and every player it
// belongs to - the profile it was posted on plus everyone tagged - is a row
// in player_moment_players. Everything a fan does is also logged to
// fan_activity by Firebase uid and ARMS contact.
import 'server-only';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import sharp from 'sharp';
import { randomUUID } from 'crypto';
import { S3_BUCKET, S3_REGION, storyAssetUrl } from './storyAssets';

export const STORY_MAX_PHOTOS = 4;
export const STORY_MAX_PHOTO_BYTES = 4 * 1024 * 1024;
export const STORY_MAX_TEXT = 10000;
export const STORY_MAX_TAGS = 20;
export const STORY_DAILY_LIMIT = 20;

// Vercel doesn't pass the standard AWS_* keys through to functions (and sets
// AWS_REGION to its own region), so the site reads its own names. The
// bucket lives in us-west-2.
export { storyAssetUrl };

let s3Client: S3Client | null = null;
function getS3() {
  if (s3Client) return s3Client;
  const accessKeyId = process.env.YATSTATS_AWS_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.YATSTATS_AWS_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY;
  if (!accessKeyId || !secretAccessKey) {
    throw new Error('S3 keys are not set: add YATSTATS_AWS_ACCESS_KEY_ID and YATSTATS_AWS_SECRET_ACCESS_KEY in Vercel');
  }
  s3Client = new S3Client({ region: S3_REGION, credentials: { accessKeyId, secretAccessKey } });
  return s3Client;
}


// Who is posting: see firebaseIdToken.ts.
export { verifyFirebaseIdToken } from './firebaseIdToken';

// ---------------------------------------------------------------------------
// Photos: turned upright, stripped of all metadata (GPS included - many of
// these photos are of kids), and stored in S3 in three sizes:
//   full  - up to 2048px, JPEG  (the big view)
//   web   - up to 1200px, WebP  (story cards)
//   thumb - 400x400 square, WebP (timeline thumbnails)
// ---------------------------------------------------------------------------
export type StoredStoryPhoto = {
  s3_key: string;
  web_s3_key: string;
  thumb_s3_key: string;
  width: number;
  height: number;
  mime_type: string;
  file_size_bytes: number;
};

const IMMUTABLE_CACHE = 'public, max-age=31536000, immutable';

async function put(key: string, body: Buffer, contentType: string) {
  await getS3().send(
    new PutObjectCommand({ Bucket: S3_BUCKET, Key: key, Body: body, ContentType: contentType, CacheControl: IMMUTABLE_CACHE })
  );
}

// Same bucket, keys and immutable caching for other server jobs that store
// public images (the Instagram feed sync).
export const putPublicAsset = put;

export class NotAnImageError extends Error {}

export async function storeStoryPhoto(folder: string, index: number, input: Buffer): Promise<StoredStoryPhoto> {
  let base: sharp.Sharp;
  try {
    base = sharp(input, { failOn: 'error' }).rotate();
    await base.metadata();
  } catch {
    throw new NotAnImageError('That file is not a photo we can read. Please choose a JPG or PNG.');
  }

  const full = await base
    .clone()
    .resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 86, mozjpeg: true })
    .toBuffer({ resolveWithObject: true });
  const web = await base
    .clone()
    .resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer();
  const thumb = await base
    .clone()
    .resize({ width: 400, height: 400, fit: 'cover', position: 'attention' })
    .webp({ quality: 78 })
    .toBuffer();

  const stem = `stories/${folder}/${index + 1}-${randomUUID().slice(0, 8)}`;
  const keys = { full: `${stem}-full.jpg`, web: `${stem}-web.webp`, thumb: `${stem}-thumb.webp` };
  await Promise.all([
    put(keys.full, full.data, 'image/jpeg'),
    put(keys.web, web, 'image/webp'),
    put(keys.thumb, thumb, 'image/webp'),
  ]);

  return {
    s3_key: keys.full,
    web_s3_key: keys.web,
    thumb_s3_key: keys.thumb,
    width: full.info.width,
    height: full.info.height,
    mime_type: 'image/jpeg',
    file_size_bytes: full.data.length,
  };
}

// ---------------------------------------------------------------------------
// Hero cutouts: the background knocked out (remove.bg), cropped to the
// people in the photo and saved as WebP next to the original:
//   stories/{folder}/N-xxxx-full.jpg -> stories/{folder}/N-xxxx-cutout.webp
// The Career Path Timeline shows it in the hero spot, placed like the YaTi
// cartoon; everywhere else (Stories tab, cards, big view, share previews)
// keeps the original photo. When remove.bg can't find anyone to keep, a
// small "-cutout-none.txt" marker is saved so it isn't asked again, and the
// timeline keeps using the whole photo.
// ---------------------------------------------------------------------------
const FULL_KEY = /^stories\/[0-9a-f-]{36}\/\d+-[0-9a-f]{8}-full\.jpg$/;

export function isStoryFullKey(key: string) {
  return FULL_KEY.test(key);
}

export function cutoutKeyFor(fullKey: string) {
  return fullKey.replace(/-full\.jpg$/, '-cutout.webp');
}

function cutoutMarkerKeyFor(fullKey: string) {
  return fullKey.replace(/-full\.jpg$/, '-cutout-none.txt');
}

async function publicObjectExists(key: string) {
  const url = storyAssetUrl(key);
  if (!url) return false;
  const res = await fetch(url, { method: 'HEAD', cache: 'no-store' }).catch(() => null);
  return Boolean(res?.ok);
}

export type CutoutResult = 'made' | 'exists' | 'none' | 'skipped';

// Makes the cutout for one story photo. Never throws: a story always posts,
// and the timeline falls back to the whole photo.
export async function makeStoryCutout(fullKey: string): Promise<CutoutResult> {
  const apiKey = process.env.REMOVE_BG_API_KEY;
  if (!apiKey || !isStoryFullKey(fullKey)) return 'skipped';
  try {
    const cutoutKey = cutoutKeyFor(fullKey);
    if (await publicObjectExists(cutoutKey)) return 'exists';
    if (await publicObjectExists(cutoutMarkerKeyFor(fullKey))) return 'none';

    const form = new FormData();
    form.set('image_url', storyAssetUrl(fullKey) || '');
    form.set('size', 'auto');
    form.set('type', 'auto');
    form.set('crop', 'true');
    form.set('format', 'png');
    const res = await fetch('https://api.remove.bg/v1.0/removebg', {
      method: 'POST',
      headers: { 'X-Api-Key': apiKey },
      body: form,
      signal: AbortSignal.timeout(25000),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      console.error('[stories] cutout failed', res.status, fullKey, detail.slice(0, 300));
      // 400 = nothing to keep in this photo: remember that. Anything else
      // (credits, rate limit, outage) is worth trying again later.
      if (res.status === 400) await put(cutoutMarkerKeyFor(fullKey), Buffer.from(detail.slice(0, 500) || 'none'), 'text/plain');
      return 'none';
    }

    const png = Buffer.from(await res.arrayBuffer());
    const webp = await sharp(png)
      .trim({ threshold: 1 })
      .resize({ width: 1400, height: 1400, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82, alphaQuality: 90 })
      .toBuffer();
    await put(cutoutKey, webp, 'image/webp');
    return 'made';
  } catch (error) {
    console.error('[stories] cutout error', fullKey, error instanceof Error ? error.message : error);
    return 'skipped';
  }
}
