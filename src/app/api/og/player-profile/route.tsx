// Real Career Path Timeline image ONLY.
// A cache miss queues one background screenshot job. Never return a fabricated
// stand-in that looks unlike the player's actual profile, and never launch
// Chromium from a Google Messages/social-preview request.
import type { NextRequest } from 'next/server';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import {
  enqueueRealTimelineSnapshot, REAL_TIMELINE_S3_BUCKET,
  snapshotCacheKey, snapshotS3, validSnapshotIds,
} from '@/lib/realTimelineSnapshotQueue';

export const runtime = 'nodejs';
export const maxDuration = 12;

function imageResponse(png: Buffer): Response {
  return new Response(new Uint8Array(png), {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=120, s-maxage=120, stale-while-revalidate=3600',
      'X-YAT-Share-Preview': 'real-timeline',
    },
  });
}

export async function GET(req: NextRequest): Promise<Response> {
  const playerId = (req.nextUrl.searchParams.get('playerId') || '').trim();
  const hsid = (req.nextUrl.searchParams.get('hsid') || '').trim();
  if (!validSnapshotIds(hsid, playerId)) {
    return new Response('Invalid player or school ID', { status: 400, headers: { 'Cache-Control': 'no-store' } });
  }

  const s3 = snapshotS3();
  if (!s3) return new Response('Preview storage unavailable', { status: 503, headers: { 'Cache-Control': 'no-store' } });
  try {
    const image = await s3.send(new GetObjectCommand({
      Bucket: REAL_TIMELINE_S3_BUCKET, Key: snapshotCacheKey(hsid, playerId),
    }), { abortSignal: AbortSignal.timeout(2200) });
    if (image.Body) {
      const bytes = Buffer.from(await image.Body.transformToByteArray());
      if (bytes.length > 10000) return imageResponse(bytes);
    }
  } catch (error) {
    if ((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode !== 404) {
      console.warn('[player-share] real screenshot read unavailable', { hsid, playerId, error });
    }
  }

  // Queue idempotently; no schema changes, no full-page rendering, no browser
  // process on request. A cron worker saves the real screenshot in this key.
  await enqueueRealTimelineSnapshot(hsid, playerId, s3);
  return new Response('Real player timeline preview is being prepared', {
    status: 503,
    headers: { 'Cache-Control': 'no-store', 'Retry-After': '90', 'X-YAT-Share-Preview': 'real-timeline-pending' },
  });
}
