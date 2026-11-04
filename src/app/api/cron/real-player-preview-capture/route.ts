// Process one queued real player-timeline screenshot per scheduled run.
// Never launch headless browsers from an SMS/OG HTTP request.
import { NextRequest, NextResponse } from 'next/server';
import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, ListObjectsV2Command, PutObjectCommand } from '@aws-sdk/client-s3';
import { captureCareerTimeline } from '@/lib/captureCareerTimeline';
import {
  snapshotS3, snapshotCacheKey, REAL_TIMELINE_S3_BUCKET,
  REAL_TIMELINE_QUEUE_PREFIX, validSnapshotIds,
} from '@/lib/realTimelineSnapshotQueue';

export const runtime = 'nodejs';
export const maxDuration = 180;
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  if (!process.env.CRON_SECRET || request.headers.get('authorization') !== 'Bearer ' + process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const s3 = snapshotS3();
  if (!s3) return NextResponse.json({ error: 'S3 not configured' }, { status: 503 });
  const list = await s3.send(new ListObjectsV2Command({
    Bucket: REAL_TIMELINE_S3_BUCKET,
    Prefix: REAL_TIMELINE_QUEUE_PREFIX,
    MaxKeys: 50,
  }));
  const now = Date.now();
  for (const entry of list.Contents || []) {
    if (!entry.Key || !entry.Key.endsWith('.json')) continue;
    const key = entry.Key;
    const match = key.slice(REAL_TIMELINE_QUEUE_PREFIX.length).match(/^([0-9]{1,20})\/([A-Za-z0-9_-]{1,40})\.json$/);
    if (!match || !validSnapshotIds(match[1], match[2])) continue;
    const [ , hsid, playerId ] = match;
    let job: { attempts?: number; nextAttemptAt?: number } = {};
    try {
      const queued = await s3.send(new GetObjectCommand({ Bucket: REAL_TIMELINE_S3_BUCKET, Key: key }));
      const raw = await queued.Body?.transformToString();
      job = JSON.parse(raw || '{}');
    } catch (error) {
      console.warn('[real-timeline] unreadable queue entry', { key, error });
      continue;
    }
    if (Number(job.nextAttemptAt || 0) > now) continue;
    const destination = snapshotCacheKey(hsid, playerId);
    try {
      // Captures are immutable for this cache version. Repeated requests do
      // not rewrite valid screenshots or consume another browser session.
      try {
        const existing = await s3.send(new HeadObjectCommand({ Bucket: REAL_TIMELINE_S3_BUCKET, Key: destination }));
        if ((existing.ContentLength || 0) > 10000) {
          await s3.send(new DeleteObjectCommand({ Bucket: REAL_TIMELINE_S3_BUCKET, Key: key }));
          return NextResponse.json({ ok: true, outcome: 'already-cached', hsid, playerId });
        }
      } catch (error) {
        if ((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode !== 404) {
          console.warn('[real-timeline] cache head failed', { key: destination, error });
        }
      }

      // Server-side profile rendering can be expensive, so a single scheduled
      // worker captures just one real profile per invocation.
      const origin = 'https://www.yatstats.com';
      const slug = 'player';
      const png = await captureCareerTimeline({ origin, hsid, playerId, slug });
      await s3.send(new PutObjectCommand({
        Bucket: REAL_TIMELINE_S3_BUCKET,
        Key: destination,
        Body: png,
        ContentType: 'image/png',
        CacheControl: 'public, max-age=86400',
      }));
      await s3.send(new DeleteObjectCommand({ Bucket: REAL_TIMELINE_S3_BUCKET, Key: key }));
      console.info('[real-timeline] captured', { hsid, playerId, bytes: png.length });
      return NextResponse.json({ ok: true, outcome: 'captured', hsid, playerId, bytes: png.length });
    } catch (error) {
      const attempts = Number(job.attempts || 0) + 1;
      const nextAttemptAt = now + Math.min(attempts * 10 * 60_000, 6 * 60 * 60_000);
      await s3.send(new PutObjectCommand({
        Bucket: REAL_TIMELINE_S3_BUCKET,
        Key: key,
        Body: JSON.stringify({ hsid, playerId, attempts, nextAttemptAt }),
        ContentType: 'application/json',
      }));
      console.error('[real-timeline] screenshot failed', { hsid, playerId, attempts, error });
      return NextResponse.json({ ok: false, outcome: 'retry-scheduled', hsid, playerId, attempts });
    }
  }
  return NextResponse.json({ ok: true, outcome: 'idle' });
}
