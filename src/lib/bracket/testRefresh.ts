// Test branches only: the bracket results job when a page asks for stale
// results. Vercel cron only runs on production, so a test branch has no
// hourly run of its own; this makes the stored results current whenever
// someone looks - at most every 30 minutes, and at once after the 4 a.m.
// rollover. Off unless BRACKET_TEST_REGION and BRACKET_RESULTS_KEY are set.
import { Pool } from 'pg';
import { query } from '@/lib/db';
import { bracketDay, LIVE_BASE, runSeason, SQL_SEASONS, type Season } from '../../../scripts/master-bracket-results';

const STALE_MS = 30 * 60 * 1000;
let running: Promise<void> | null = null;

export async function refreshIfStale(seasonKey: string) {
  const region = Number(process.env.BRACKET_TEST_REGION);
  if (!region || !process.env.BRACKET_RESULTS_KEY) return;
  const { rows: [last] } = await query<{ ms: string | null }>(
    'SELECT (extract(epoch FROM max(computed_at)) * 1000)::bigint::text AS ms FROM public.master_bracket WHERE season_key = $1 AND region = $2',
    [seasonKey, region],
  );
  const now = Date.now();
  const at = Number(last?.ms) || 0;
  if (at && now - at < STALE_MS && bracketDay(at) === bracketDay(now)) return;
  if (!running) {
    running = (async () => {
      const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 2 });
      try {
        const asof = bracketDay(now);
        const { rows: seasons } = await pool.query<Season>(SQL_SEASONS, [seasonKey, asof]);
        const base = (process.env.BRACKET_LIVE_BASE_URL || LIVE_BASE).replace(/\/$/, '');
        for (const season of seasons) await runSeason(pool, season, asof, { base, region });
      } catch (error) {
        console.error('[bracket/testRefresh]', error);
      } finally {
        await pool.end();
        running = null;
      }
    })();
  }
  await running;
}
