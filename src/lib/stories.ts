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
import { createVerify, randomUUID } from 'crypto';

export const STORY_MAX_PHOTOS = 4;
export const STORY_MAX_PHOTO_BYTES = 4 * 1024 * 1024;
export const STORY_MAX_TEXT = 10000;
export const STORY_MAX_TAGS = 20;
export const STORY_DAILY_LIMIT = 20;

const S3_REGION = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-west-2';
const S3_BUCKET =
  process.env.S3_BUCKET ||
  process.env.YATSTATS_UPLOADS_S3_BUCKET ||
  process.env.AWS_S3_BUCKET ||
  'yatstats-assets';

let s3Client: S3Client | null = null;
function getS3() {
  if (!s3Client) s3Client = new S3Client({ region: S3_REGION });
  return s3Client;
}

export function storyAssetUrl(key: string | null | undefined): string | null {
  if (!key) return null;
  return `https://${S3_BUCKET}.s3.${S3_REGION}.amazonaws.com/${key.split('/').map(encodeURIComponent).join('/')}`;
}

// ---------------------------------------------------------------------------
// Who is posting: the browser sends the ID token Firebase gave it at sign-in.
// It is a JWT signed by Google; we check the signature against Google's
// published public keys and that it was issued for this Firebase project and
// hasn't expired (Firebase's documented way to verify ID tokens without the
// Admin SDK). The session cookie alone is not proof - it is plain JSON the
// browser could edit.
// ---------------------------------------------------------------------------
const GOOGLE_CERTS_URL = 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';
let certCache: { certs: Record<string, string>; expires: number } | null = null;

async function googleCerts(): Promise<Record<string, string>> {
  if (certCache && certCache.expires > Date.now()) return certCache.certs;
  const res = await fetch(GOOGLE_CERTS_URL, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Google certs ${res.status}`);
  const certs = (await res.json()) as Record<string, string>;
  const maxAge = Number(/max-age=(\d+)/.exec(res.headers.get('cache-control') || '')?.[1] || 3600);
  certCache = { certs, expires: Date.now() + maxAge * 1000 };
  return certs;
}

function base64UrlJson(part: string) {
  return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
}

export async function verifyFirebaseIdToken(idToken: string): Promise<{ uid: string; email: string } | null> {
  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const parts = String(idToken || '').split('.');
  if (!projectId || parts.length !== 3) {
    console.error('[stories] id token check: missing project id or malformed token');
    return null;
  }
  try {
    const header = base64UrlJson(parts[0]);
    const claims = base64UrlJson(parts[1]);
    if (header.alg !== 'RS256' || !header.kid) throw new Error('unexpected token header');

    const cert = (await googleCerts())[header.kid];
    if (!cert) throw new Error('unknown signing key');
    const verifier = createVerify('RSA-SHA256');
    verifier.update(`${parts[0]}.${parts[1]}`);
    if (!verifier.verify(cert, Buffer.from(parts[2], 'base64url'))) throw new Error('bad signature');

    const now = Math.floor(Date.now() / 1000);
    if (claims.aud !== projectId) throw new Error('wrong project');
    if (claims.iss !== `https://securetoken.google.com/${projectId}`) throw new Error('wrong issuer');
    if (!claims.sub || typeof claims.sub !== 'string') throw new Error('no user id');
    if (typeof claims.exp !== 'number' || claims.exp < now - 60) throw new Error('expired');
    if (typeof claims.iat !== 'number' || claims.iat > now + 60) throw new Error('issued in the future');

    return { uid: claims.sub, email: String(claims.email || '') };
  } catch (error) {
    console.error('[stories] id token check failed:', error instanceof Error ? error.message : error);
    return null;
  }
}

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
