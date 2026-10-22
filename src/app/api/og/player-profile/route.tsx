// Real Career Path Timeline social preview.
// Screenshot the actual live timeline DOM: no second design or cloned layout.
// Generated previews are cached in S3; a failure uses the existing safe image.
import type { NextRequest } from 'next/server';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import sharp from 'sharp';
import { getPlayerById } from '@/lib/db';
import { captureCareerTimeline } from '@/lib/captureCareerTimeline';
import { fallbackPlayerProfileImage } from '@/lib/fallbackPlayerProfileImage';

export const runtime = 'nodejs';
export const maxDuration = 60;

const S3_BUCKET = process.env.YATSTATS_S3_BUCKET || process.env.S3_BUCKET || 'yatstats-assets';
const S3_REGION = process.env.YATSTATS_AWS_REGION || process.env.AWS_REGION || 'us-west-2';
const PLAYER_ID = /^[a-zA-Z0-9_-]{1,40}$/;
const HS_ID = /^\d{1,20}$/;
const CACHE_VERSION = 'timeline-v3-hero';
const S3_ORIGIN = 'https://yatstats-assets.s3.us-west-2.amazonaws.com';

function s3Client() {
  const accessKeyId = process.env.YATSTATS_AWS_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.YATSTATS_AWS_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY;
  if (!accessKeyId || !secretAccessKey) return null;
  return new S3Client({ region: S3_REGION, credentials: { accessKeyId, secretAccessKey } });
}

function response(png: Buffer, source: string) {
  return new Response(new Uint8Array(png), {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800',
      'X-YAT-Share-Preview': source,
    },
  });
}

export async function GET(req: NextRequest) {
  const playerId = (req.nextUrl.searchParams.get('playerId') || '').trim();
  const hsid = (req.nextUrl.searchParams.get('hsid') || '').trim();
  if (!PLAYER_ID.test(playerId) || !HS_ID.test(hsid)) return new Response('Invalid player or school ID', { status: 400 });
  const player = await getPlayerById(playerId).catch(() => null);
  if (!player) return new Response('Player not found', { status: 404 });
  const key = `share-previews/${CACHE_VERSION}/${hsid}/${playerId}.png`;
  const s3 = s3Client();
  if (s3) {
    try {
      const obj = await s3.send(new GetObjectCommand({ Bucket: S3_BUCKET, Key: key }));
      if (obj.Body) {
        const png = Buffer.from(await obj.Body.transformToByteArray());
        if (png.length > 10000) return response(png, 'cached-timeline');
      }
    } catch (err) {
      if ((err as { name?: string })?.name !== 'NoSuchKey') console.warn('[player-share] cache read', err);
    }
  }
  try {
    // The browser captures the player's REAL rendered slide. It is never
    // called during ordinary player-page navigation.
    const png = await captureCareerTimeline({
      origin: req.nextUrl.origin, hsid, playerId,
      slug: [player.firstname, player.lastname].filter(Boolean).join('-').toLowerCase().replace(/[^a-z0-9-]+/g, '-'),
    });
    if (s3) {
      try {
        await s3.send(new PutObjectCommand({
          Bucket: S3_BUCKET, Key: key, Body: png, ContentType: 'image/png',
          CacheControl: 'public, max-age=86400',
        }));
      } catch (err) {
        // Cache writes must not prevent sharing.
        console.warn('[player-share] cache write', err);
      }
    }
    return response(png, 'real-timeline');
  } catch (err) {
    console.error('[player-share] browser capture failed', err);
    const png = await fallbackPlayerProfileImage(hsid, playerId, player);
    return response(png, 'fallback');
  }
}
