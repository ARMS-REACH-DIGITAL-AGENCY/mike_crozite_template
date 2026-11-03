// src/lib/playerConnectVideo.ts
// The player's outgoing "personal message" video on the profile's CONNECT
// tab (think Cameo: "Hi, I'm Carson. Send me a request...").
//
// Where it lives (S3, no database table):
//   players/connect-videos/<playerid>/<uuid>.<ext>   the video itself
//   players/connect-videos/<playerid>/current.json   which video is live
// A new upload never overwrites an old file; it just moves current.json.
//
// Videos are big, so the browser sends the file straight to S3 with a
// signed POST form (the serverless function never sees the bytes). A form
// post needs no bucket CORS setting, which this bucket doesn't have.
import 'server-only';
import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { createHmac, randomUUID } from 'crypto';
import { S3_BUCKET, S3_REGION, storyAssetUrl } from './storyAssets';
import { PLAYER_ID } from './contribute';

export const CONNECT_VIDEO_MAX_BYTES = 500 * 1024 * 1024; // 500 MB
export const CONNECT_VIDEO_TYPES: Record<string, string> = {
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
  'video/x-m4v': 'm4v',
};

export type ConnectVideo = {
  key: string;
  url: string;
  contentType: string;
  uploadedAt: string;
};

const PREFIX = 'players/connect-videos';

export function validPlayerId(id: unknown): string | null {
  const v = String(id || '').trim();
  return PLAYER_ID.test(v) ? v.toUpperCase() : null;
}

function credentials() {
  const accessKeyId = process.env.YATSTATS_AWS_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.YATSTATS_AWS_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY;
  if (!accessKeyId || !secretAccessKey) throw new Error('S3 keys are not set');
  return { accessKeyId, secretAccessKey };
}

let s3: S3Client | null = null;
function client() {
  if (!s3) s3 = new S3Client({ region: S3_REGION, credentials: credentials() });
  return s3;
}

const pointerKey = (pid: string) => `${PREFIX}/${pid}/current.json`;

/** The live video for a player, or null. */
export async function getConnectVideo(pid: string): Promise<ConnectVideo | null> {
  try {
    const res = await client().send(new GetObjectCommand({ Bucket: S3_BUCKET, Key: pointerKey(pid) }));
    const data = JSON.parse(await res.Body!.transformToString());
    if (!data?.key || !String(data.key).startsWith(`${PREFIX}/${pid}/`)) return null;
    return { key: data.key, url: storyAssetUrl(data.key)!, contentType: data.contentType || 'video/mp4', uploadedAt: data.uploadedAt || '' };
  } catch (e) {
    const code = (e as { name?: string })?.name;
    if (code === 'NoSuchKey' || code === 'AccessDenied') return null;
    throw e;
  }
}

const hmac = (key: Buffer | string, data: string) => createHmac('sha256', key).update(data).digest();

/**
 * A signed S3 POST form for one new video. The browser posts these fields
 * plus the file (last) to `url`.
 */
export function signConnectVideoUpload(pid: string, contentType: string) {
  return signVideoPost(`${PREFIX}/${pid}/${randomUUID()}`, contentType);
}

/** A signed S3 POST form for a video at `keyBase` + its extension. */
export function signVideoPost(keyBase: string, contentType: string) {
  const ext = CONNECT_VIDEO_TYPES[contentType];
  if (!ext) throw new Error('unsupported type');
  const { accessKeyId, secretAccessKey } = credentials();
  const key = `${keyBase}.${ext}`;
  const now = new Date();
  const amzDate = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''); // 20261103T120000Z
  const day = amzDate.slice(0, 8);
  const credential = `${accessKeyId}/${day}/${S3_REGION}/s3/aws4_request`;
  const cacheControl = 'public, max-age=31536000, immutable';
  const policy = Buffer.from(
    JSON.stringify({
      expiration: new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
      conditions: [
        { bucket: S3_BUCKET },
        { key },
        { 'Content-Type': contentType },
        { 'Cache-Control': cacheControl },
        { success_action_status: '201' },
        ['content-length-range', 1, CONNECT_VIDEO_MAX_BYTES],
        { 'x-amz-algorithm': 'AWS4-HMAC-SHA256' },
        { 'x-amz-credential': credential },
        { 'x-amz-date': amzDate },
      ],
    })
  ).toString('base64');
  const signingKey = hmac(hmac(hmac(hmac('AWS4' + secretAccessKey, day), S3_REGION), 's3'), 'aws4_request');
  const signature = createHmac('sha256', signingKey).update(policy).digest('hex');
  return {
    url: `https://${S3_BUCKET}.s3.${S3_REGION}.amazonaws.com/`,
    key,
    fields: {
      key,
      'Content-Type': contentType,
      'Cache-Control': cacheControl,
      success_action_status: '201',
      'x-amz-algorithm': 'AWS4-HMAC-SHA256',
      'x-amz-credential': credential,
      'x-amz-date': amzDate,
      policy,
      'x-amz-signature': signature,
    },
  };
}

/** After the browser's upload: check the file is really there, then make it live. */
export async function publishConnectVideo(pid: string, key: string, uploadedBy: string): Promise<ConnectVideo | null> {
  if (!key.startsWith(`${PREFIX}/${pid}/`) || key.endsWith('.json') || key.includes('..')) return null;
  let head;
  try {
    head = await client().send(new HeadObjectCommand({ Bucket: S3_BUCKET, Key: key }));
  } catch {
    return null; // not uploaded (or the upload failed)
  }
  const contentType = head.ContentType || 'video/mp4';
  const uploadedAt = new Date().toISOString();
  await client().send(
    new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: pointerKey(pid),
      Body: JSON.stringify({ key, contentType, uploadedAt, uploadedBy, bytes: head.ContentLength || null }),
      ContentType: 'application/json',
      CacheControl: 'no-store',
    })
  );
  return { key, url: storyAssetUrl(key)!, contentType, uploadedAt };
}

/** Take the video off the profile (the file itself is kept). */
export async function removeConnectVideo(pid: string) {
  await client().send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: pointerKey(pid) }));
}
