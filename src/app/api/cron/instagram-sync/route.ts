import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';
import { syncInstagramSource, type SourceResult } from '@/lib/instagramSync';
import { INSTAGRAM_SYNC_ACCOUNTS_PER_RUN, INSTAGRAM_SYNC_REFRESH_HOURS, isMetaInstagramRateLimit } from '@/lib/instagramSyncPolicy';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

// Every 6 hours: refresh the latest posts of each active Instagram account
// in social_sources (players and schools) - see src/lib/instagramSync.ts.
// Oldest-polled accounts go first, a capped number per run, so a growing
// list spreads across runs instead of timing out.

// Writes social_posts, so it uses the writer connection like the other crons.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 2,
});

// All instances respect the same database-backed cooldown after Meta code #4.
// Without this, a 15-minute cron can prolong the app-wide rate limit.
const BACKOFF_HOURS = 2;
const JOB_NAME = 'instagram-sync';

// Prioritize accounts not yet synchronized and refresh existing ones at most every six hours.

function isAuthorized(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  const bearer = req.headers.get('authorization') || '';
  return Boolean(expected && bearer === `Bearer ${expected}`);
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }
  if (!process.env.META_IG_ACCESS_TOKEN) {
    return NextResponse.json({ ok: true, skipped: true, reason: 'META_IG_ACCESS_TOKEN is not set' });
  }

  const { rows: coolingDown } = await pool.query<{ blocked: boolean; retry_after: string | null }>(
    `SELECT COALESCE((last_result->>'retryAfter')::timestamptz > now(), false) AS blocked,
            last_result->>'retryAfter' AS retry_after
       FROM ingest_job_health WHERE job_name = $1`,
    [JOB_NAME]
  );
  if (coolingDown[0]?.blocked) {
    return NextResponse.json({ ok: false, skipped: true, reason: 'Meta app rate limit', retryAfter: coolingDown[0].retry_after });
  }

  const { rows: sources } = await pool.query<{ id: number; handle: string }>(
    `SELECT id, handle FROM social_sources
      WHERE platform = 'instagram' AND status = 'active' AND COALESCE(handle, '') <> ''
        AND (last_polled_at IS NULL OR last_polled_at < now() - make_interval(hours => $1::int))
      ORDER BY last_polled_at NULLS FIRST, id
      LIMIT $2`,
    [INSTAGRAM_SYNC_REFRESH_HOURS, INSTAGRAM_SYNC_ACCOUNTS_PER_RUN]
  );

  const results: SourceResult[] = [];
  for (const source of sources) {
    const result = await syncInstagramSource(pool, source);
    results.push(result);
    // Stop consuming quota once Meta signals application-wide throttling.
    if (!result.ok && isMetaInstagramRateLimit(result.error)) {
      // Persist cooldown across stateless Vercel function invocations.
      const { rows } = await pool.query<{ retry_after: string }>(
        `INSERT INTO ingest_job_health (job_name, last_failure_at, consecutive_failures, last_error, last_result, updated_at)
         VALUES ($1, now(), 1, $2,
                 jsonb_build_object('retryAfter', now() + make_interval(hours => $4::int), 'failingHandle', $3), now())
         ON CONFLICT (job_name) DO UPDATE SET
           last_failure_at = now(),
           consecutive_failures = ingest_job_health.consecutive_failures + 1,
           last_error = EXCLUDED.last_error,
           last_result = EXCLUDED.last_result,
           updated_at = now()
         RETURNING last_result->>'retryAfter' AS retry_after`,
        [JOB_NAME, result.error || 'Meta rate limit', result.handle, BACKOFF_HOURS]
      );
      console.warn('instagram-sync Meta app quota exhausted; pausing until', rows[0]?.retry_after);
      break;
    }
  }
  const failed = results.filter((r) => !r.ok);
  if (failed.length) console.error('instagram-sync failures', failed);
  return NextResponse.json({ ok: failed.length === 0, accounts: results.length, failed: failed.length, rateLimited: results.some((r) => !r.ok && isMetaInstagramRateLimit(r.error)), results });
}
