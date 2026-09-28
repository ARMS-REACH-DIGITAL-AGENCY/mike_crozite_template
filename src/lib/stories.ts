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

export const STORY_MAX_PHOTOS = 4;
export const STORY_MAX_PHOTO_BYTES = 4 * 1024 * 1024;
export const STORY_MAX_TEXT = 10000;
export const STORY_MAX_TAGS = 20;
export const STORY_DAILY_LIMIT = 20;

// Vercel doesn't pass the standard AWS_* keys through to functions (and sets
// AWS_REGION to its own region), so the site reads its own names. The
// bucket lives in us-west-2.
const S3_REGION = process.env.YATSTATS_AWS_REGION || 'us-west-2';
const S3_BUCKET = process.env.YATSTATS_S3_BUCKET || process.env.S3_BUCKET || 'yatstats-assets';

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

export function storyAssetUrl(key: string | null | undefined): string | null {
  if (!key) return null;
  return `https://${S3_BUCKET}.s3.${S3_REGION}.amazonaws.com/${key.split('/').map(encodeURIComponent).join('/')}`;
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
