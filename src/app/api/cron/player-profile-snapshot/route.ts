// One genuine Career Path screenshot per cron invocation.
// S3 queue + atomic lock ensure that link-preview scrapers never launch Chromium.
import { NextRequest, NextResponse } from 'next/server';
import {
  DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, ListObjectsV2Command,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { getPlayerById } from '@/lib/db';
import { captureCareerTimeline } from '@/lib/captureCareerTimeline';
import {
  enqueueRealTimelineSnapshot, REAL_TIMELINE_S3_BUCKET, REAL_TIMELINE_QUEUE_PREFIX,
  snapshotCacheKey, snapshotS3, validSnapshotIds,
} from '@/lib/realTimelineSnapshotQueue';

export const runtime = 'nodejs';
export const maxDuration = 180;
export const dynamic = 'force-dynamic';

const LOCK_KEY = 'share-previews/real-timeline-worker-v1.lock';
const MAX_ATTEMPTS = 4;
const LOCK_TTL_MS = 4 * 60 * 1000;

function authorized(req: NextRequest) {
  const token = process.env.CRON_SECRET;
  return Boolean(token && req.headers.get('authorization') === 'Bearer ' + token);
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const s3 = snapshotS3();
  if (!s3) return NextResponse.json({ error: 'S3 credentials unavailable' }, { status: 503 });

  let locked = false;
  try {
    // Recover a lock from an interrupted invocation, without permitting two
    // healthy cron workers to start the same expensive Chromium process.
    try {
      const lock = await s3.send(new HeadObjectCommand({ Bucket: REAL_TIMELINE_S3_BUCKET, Key: LOCK_KEY }));
      if (lock.LastModified && Date.now() - lock.LastModified.getTime() < LOCK_TTL_MS) {
        return NextResponse.json({ ok: true, status: 'worker-busy' });
      }
      await s3.send(new DeleteObjectCommand({ Bucket: REAL_TIMELINE_S3_BUCKET, Key: LOCK_KEY }));
    } catch (error) {
      if ((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode !== 404) {
        console.warn('[player-share] lock head failed', error);
        return NextResponse.json({ ok: false, error: 'Lock check failed' }, { status: 503 });
      }
    }
    try {
      await s3.send(new PutObjectCommand({
        Bucket: REAL_TIMELINE_S3_BUCKET, Key: LOCK_KEY,
        Body: new Date().toISOString(), IfNoneMatch: '*',
      }));
      locked = true;
    } catch (error) {
      if ((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 412) {
        return NextResponse.json({ ok: true, status: 'worker-busy' });
      }
      throw error;
    }

    const queue = await s3.send(new ListObjectsV2Command({
      Bucket: REAL_TIMELINE_S3_BUCKET, Prefix: REAL_TIMELINE_QUEUE_PREFIX, MaxKeys: 20,
    }));
    for (const item of queue.Contents || []) {
      const key = item.Key || '';
      if (!key.endsWith('.json')) continue;
      const obj = await s3.send(new GetObjectCommand({ Bucket: REAL_TIMELINE_S3_BUCKET, Key: key }));
      if (!obj.Body) continue;
      let job: { hsid: string; playerId: string; attempts: number; nextAttemptAt: number };
      try {
        job = JSON.parse(await obj.Body.transformToString());
      } catch {
        await s3.send(new DeleteObjectCommand({ Bucket: REAL_TIMELINE_S3_BUCKET, Key: key }));
        continue;
      }
      if (!validSnapshotIds(job.hsid, job.playerId)) {
        await s3.send(new DeleteObjectCommand({ Bucket: REAL_TIMELINE_S3_BUCKET, Key: key }));
        continue;
      }
      if (job.nextAttemptAt && job.nextAttemptAt > Date.now()) continue;
      const cacheKey = snapshotCacheKey(job.hsid, job.playerId);
      try {
        await s3.send(new HeadObjectCommand({ Bucket: REAL_TIMELINE_S3_BUCKET, Key: cacheKey }));
        await s3.send(new DeleteObjectCommand({ Bucket: REAL_TIMELINE_S3_BUCKET, Key: key }));
        return NextResponse.json({ ok: true, status: 'already-cached', playerId: job.playerId });
      } catch (err) {
        if ((err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode !== 404) throw err;
      }
      try {
        const player = await getPlayerById(job.playerId);
        if (!player) throw new Error('Player not found');
        const slug = [player.firstname || player.first_name, player.lastname || player.last_name]
          .filter(Boolean).join('-').toLowerCase().replace(/[^a-z0-9-]+/g, '-');
        const origin = process.env.YATSTATS_PUBLIC_ORIGIN || 'https://www.yatstats.com';
        const png = await captureCareerTimeline({ origin, hsid: job.hsid, playerId: job.playerId, slug });
        await s3.send(new PutObjectCommand({
          Bucket: REAL_TIMELINE_S3_BUCKET, Key: cacheKey, Body: png,
          ContentType: 'image/png', CacheControl: 'public, max-age=86400',
        }));
        await s3.send(new DeleteObjectCommand({ Bucket: REAL_TIMELINE_S3_BUCKET, Key: key }));
        console.info('[player-share] real timeline captured', { hsid: job.hsid, playerId: job.playerId, bytes: png.length });
        return NextResponse.json({ ok: true, status: 'captured', playerId: job.playerId, bytes: png.length });
      } catch (error) {
        const attempts = (Number(job.attempts) || 0) + 1;
        const nextAttemptAt = Date.now() + Math.min(60 * 60 * 1000, 5 * 60 * 1000 * (2 ** (attempts - 1)));
        if (attempts >= MAX_ATTEMPTS) {
          // Keep the failure for inspection; no fabricated image is published.
          await s3.send(new PutObjectCommand({
            Bucket: REAL_TIMELINE_S3_BUCKET,
            Key: key.replace(REAL_TIMELINE_QUEUE_PREFIX, 'share-previews/real-timeline-failed-v1/'),
            Body: JSON.stringify({ ...job, attempts, failedAt: new Date().toISOString(), error: String(error) }),
            ContentType: 'application/json',
          }));
          await s3.send(new DeleteObjectCommand({ Bucket: REAL_TIMELINE_S3_BUCKET, Key: key }));
        } else {
          await s3.send(new PutObjectCommand({
            Bucket: REAL_TIMELINE_S3_BUCKET, Key: key,
            Body: JSON.stringify({ ...job, attempts, nextAttemptAt }),
            ContentType: 'application/json',
          }));
        }
        console.error('[player-share] real timeline capture failed', { playerId: job.playerId, attempts, error });
        return NextResponse.json({ ok: false, status: 'capture-retry', playerId: job.playerId, attempts });
      }
    }
    return NextResponse.json({ ok: true, status: 'no-ready-jobs' });
  } catch (error) {
    console.error('[player-share] worker failed', error);
    return NextResponse.json({ ok: false, error: 'Worker failed' }, { status: 500 });
  } finally {
    if (locked) {
      try {
        await s3.send(new DeleteObjectCommand({ Bucket: REAL_TIMELINE_S3_BUCKET, Key: LOCK_KEY }));
      } catch (error) {
        console.error('[player-share] lock cleanup failed', error);
      }
    }
  }
}
