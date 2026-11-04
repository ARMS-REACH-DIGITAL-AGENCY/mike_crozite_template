// Open Graph image for a player profile, including links to individual tabs.
// Sharing must NEVER launch a browser or render the entire player page:
// messaging apps time out while waiting for that work, and concurrent shares
// exhaust Chromium resources. Serve existing timeline captures when cached;
// otherwise generate a lightweight player-specific card and cache it.
import type { NextRequest } from 'next/server';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getPlayerById } from '@/lib/db';
import { fallbackPlayerProfileImage } from '@/lib/fallbackPlayerProfileImage';

export const runtime = 'nodejs';
export const maxDuration = 20;

const S3_BUCKET = process.env.YATSTATS_S3_BUCKET || process.env.S3_BUCKET || 'yatstats-assets';
const S3_REGION = process.env.YATSTATS_AWS_REGION || process.env.AWS_REGION || 'us-west-2';
const PLAYER_ID = /^[a-zA-Z0-9_-]{1,40}$/;
const HS_ID = /^\d{1,20}$/;
// Preserve already-produced actual timeline images, including the previews
// people have seen in earlier text messages.
const TIMELINE_CACHE_VERSION = 'timeline-v3-hero';
const CARD_CACHE_VERSION = 'player-profile-card-v1';

function s3Client(): S3Client | null {
  const accessKeyId = process.env.YATSTATS_AWS_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.YATSTATS_AWS_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY;
  if (!accessKeyId || !secretAccessKey) return null;
  return new S3Client({ region: S3_REGION, credentials: { accessKeyId, secretAccessKey } });
}

function imageResponse(png: Buffer, source: string): Response {
  return new Response(new Uint8Array(png), {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800',
      'X-YAT-Share-Preview': source,
    },
  });
}

async function readCachedImage(s3: S3Client, key: string): Promise<Buffer | null> {
  try {
    // Bound remote reads: crawlers need an image promptly, not another timeout.
    const obj = await s3.send(
      new GetObjectCommand({ Bucket: S3_BUCKET, Key: key }),
      { abortSignal: AbortSignal.timeout(1800) },
    );
    if (!obj.Body) return null;
    const png = Buffer.from(await obj.Body.transformToByteArray());
    return png.length > 10000 ? png : null;
  } catch (err) {
    if ((err as { name?: string })?.name !== 'NoSuchKey') {
      console.warn('[player-share] cache unavailable', key, err);
    }
    return null;
  }
}

export async function GET(req: NextRequest): Promise<Response> {
  const playerId = (req.nextUrl.searchParams.get('playerId') || '').trim();
  const hsid = (req.nextUrl.searchParams.get('hsid') || '').trim();
  if (!PLAYER_ID.test(playerId) || !HS_ID.test(hsid)) {
    return new Response('Invalid player or school ID', { status: 400 });
  }

  const s3 = s3Client();
  const timelineKey = `share-previews/${TIMELINE_CACHE_VERSION}/${hsid}/${playerId}.png`;
  const cardKey = `share-previews/${CARD_CACHE_VERSION}/${hsid}/${playerId}.png`;

  if (s3) {
    const timeline = await readCachedImage(s3, timelineKey);
    if (timeline) return imageResponse(timeline, 'cached-timeline');
    const card = await readCachedImage(s3, cardKey);
    if (card) return imageResponse(card, 'cached-fallback');
  }

  const player = await getPlayerById(playerId).catch(() => null);
  if (!player) return new Response('Player not found', { status: 404 });

  try {
    // Uses the player's own cutouts and name. No Chromium, no full-page
    // request, and no dependency on the expensive career-timeline queries.
    const png = await fallbackPlayerProfileImage(hsid, playerId, player);
    if (s3) {
      try {
        await s3.send(
          new PutObjectCommand({
            Bucket: S3_BUCKET,
            Key: cardKey,
            Body: png,
            ContentType: 'image/png',
            CacheControl: 'public, max-age=86400',
          }),
          { abortSignal: AbortSignal.timeout(1800) },
        );
      } catch (err) {
        // First-time shares still get their image even when storage is down.
        console.warn('[player-share] card cache write unavailable', err);
      }
    }
    return imageResponse(png, 'generated-fallback');
  } catch (err) {
    console.error('[player-share] lightweight preview failed', err);
    return new Response('Preview temporarily unavailable', {
      status: 503,
      headers: { 'Cache-Control': 'no-store' },
    });
  }
}
