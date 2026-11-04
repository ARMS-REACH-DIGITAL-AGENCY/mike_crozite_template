// Real profile snapshot only: never fabricate a substitute card.
// Captures happen on the bounded, scheduled worker, not in preview requests.
import type { NextRequest } from 'next/server';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import {
  enqueueRealTimelineSnapshot, snapshotS3, snapshotCacheKey,
  REAL_TIMELINE_S3_BUCKET, validSnapshotIds,
} from '@/lib/realTimelineSnapshotQueue';

export const runtime = 'nodejs';
export const maxDuration = 12;

function response(png: Buffer) {
  return new Response(new Uint8Array(png), {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800',
      'X-YAT-Share-Preview': 'real-career-timeline',
    },
  });
}

export async function GET(req: NextRequest) {
  const playerId = (req.nextUrl.searchParams.get('playerId') || '').trim();
  const hsid = (req.nextUrl.searchParams.get('hsid') || '').trim();
  if (!validSnapshotIds(hsid, playerId)) return new Response('Invalid player or school ID', { status: 400 });
  const s3 = snapshotS3();
  if (!s3) return new Response('Preview storage unavailable', { status: 503, headers: { 'Cache-Control': 'no-store' } });
  try {
    const obj = await s3.send(new GetObjectCommand({
      Bucket: REAL_TIMELINE_S3_BUCKET, Key: snapshotCacheKey(hsid, playerId),
    }), { abortSignal: AbortSignal.timeout(2500) });
    if (obj.Body) {
      const png = Buffer.from(await obj.Body.transformToByteArray());
      if (png.length > 10000) return response(png);
    }
  } catch (error) {
    if ((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode !== 404) {
      console.warn('[player-share] real-timeline image unavailable', { hsid, playerId, error });
    }
  }

  // Missing images enter an idempotent queue. Never return a made-up graphic.
  // Avoid caching the temporary unavailable response, so a later preview can
  // fetch the actual player's newly generated timeline screenshot.
  await enqueueRealTimelineSnapshot(hsid, playerId, s3);
  return new Response('Real player profile screenshot is being prepared', {
    status: 503,
    headers: { 'Cache-Control': 'private, no-store, max-age=0', 'Retry-After': '300' },
  });
}
