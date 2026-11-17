// S3-backed, bounded queue for genuine player-profile timeline screenshots.
// Fan-created identities may exist before their first share. Queue only those
// players (and cache misses), never crawl all 200K player records.
import 'server-only';
import { DeleteObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

export const REAL_TIMELINE_VERSION = 'timeline-v3-hero';
export const REAL_TIMELINE_QUEUE_PREFIX = 'share-previews/real-timeline-queue-v1/';
export const REAL_TIMELINE_CACHE_PREFIX = 'share-previews/' + REAL_TIMELINE_VERSION + '/';
export const REAL_TIMELINE_S3_BUCKET = process.env.YATSTATS_S3_BUCKET || process.env.S3_BUCKET || 'yatstats-assets';
const REGION = process.env.YATSTATS_AWS_REGION || process.env.AWS_REGION || 'us-west-2';
const ID = /^[A-Za-z0-9_-]{1,40}$/;
const HSID = /^[1-9][0-9]{0,19}$/;

export function snapshotS3(): S3Client | null {
  const accessKeyId = process.env.YATSTATS_AWS_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.YATSTATS_AWS_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY;
  if (!accessKeyId || !secretAccessKey) return null;
  return new S3Client({ region: REGION, credentials: { accessKeyId, secretAccessKey } });
}

export function validSnapshotIds(hsid: string, playerId: string): boolean {
  return HSID.test(hsid) && ID.test(playerId);
}

export function snapshotCacheKey(hsid: string, playerId: string): string {
  return REAL_TIMELINE_CACHE_PREFIX + hsid + '/' + playerId + '.png';
}

export function snapshotQueueKey(hsid: string, playerId: string): string {
  return REAL_TIMELINE_QUEUE_PREFIX + hsid + '/' + playerId + '.json';
}

// S3 conditional creation is atomic: repeated shares cannot enqueue duplicate
// screenshot jobs. Lack of S3 access is reported but never breaks player creation.
export async function enqueueRealTimelineSnapshot(
  hsid: string, playerId: string, existingClient?: S3Client | null,
): Promise<boolean> {
  if (!validSnapshotIds(hsid, playerId)) return false;
  const s3 = existingClient === undefined ? snapshotS3() : existingClient;
  if (!s3) return false;
  try {
    await s3.send(new PutObjectCommand({
      Bucket: REAL_TIMELINE_S3_BUCKET,
      Key: snapshotQueueKey(hsid, playerId),
      Body: JSON.stringify({ hsid, playerId, attempts: 0, nextAttemptAt: 0 }),
      ContentType: 'application/json',
      IfNoneMatch: '*',
    }), { abortSignal: AbortSignal.timeout(2500) });
    return true;
  } catch (error) {
    // 412: previously queued; this is expected for repeated messages.
    const e = error as { $metadata?: { httpStatusCode?: number }; name?: string };
    if (e.$metadata?.httpStatusCode === 412 || e.name === 'PreconditionFailed') return false;
    console.warn('[player-share] could not queue real timeline', { hsid, playerId, error });
    return false;
  }
}

// Refresh the REAL timeline after a published photo or story changes.
// The existing queue worker takes a new screenshot of the live PPP; this
// never creates a fabricated picture or requires a site-wide recapture.
export async function refreshRealTimelineSnapshot(hsid: string, playerId: string): Promise<void> {
  if (!validSnapshotIds(hsid, playerId)) return;
  const s3 = snapshotS3();
  if (!s3) return;
  try {
    await s3.send(new DeleteObjectCommand({
      Bucket: REAL_TIMELINE_S3_BUCKET, Key: snapshotCacheKey(hsid, playerId),
    }), { abortSignal: AbortSignal.timeout(2500) });
    // Idempotent: an already queued snapshot stays queued.
    await enqueueRealTimelineSnapshot(hsid, playerId, s3);
  } catch (error) {
    console.warn('[player-share] timeline refresh could not be queued', { hsid, playerId, error });
  }
}

// First share must show the picture (Pete, Nov 17 2026). A fan almost always
// opens the profile before sharing it, so a person's profile view queues the
// screenshot when it is missing; the minute worker makes it before the text
// goes out. One S3 HEAD per view, run after the response; crawlers never queue
// (that would be a 200K-page backlog). An existing picture queues nothing.
export async function ensureRealTimelineSnapshot(hsid: string, playerId: string): Promise<void> {
  if (!validSnapshotIds(hsid, playerId)) return;
  const s3 = snapshotS3();
  if (!s3) return;
  try {
    await s3.send(new HeadObjectCommand({
      Bucket: REAL_TIMELINE_S3_BUCKET, Key: snapshotCacheKey(hsid, playerId),
    }), { abortSignal: AbortSignal.timeout(2500) });
  } catch (error) {
    if ((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404) {
      await enqueueRealTimelineSnapshot(hsid, playerId, s3);
    }
  }
}
