import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';
import { syncInstagramSource, type SourceResult } from '@/lib/instagramSync';

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

const ACCOUNTS_PER_RUN = 40;

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

  const { rows: sources } = await pool.query<{ id: number; handle: string }>(
    `SELECT id, handle FROM social_sources
      WHERE platform = 'instagram' AND status = 'active' AND COALESCE(handle, '') <> ''
      ORDER BY last_polled_at NULLS FIRST, id
      LIMIT $1`,
    [ACCOUNTS_PER_RUN]
  );

  const results: SourceResult[] = [];
  for (const source of sources) {
    results.push(await syncInstagramSource(pool, source));
  }
  const failed = results.filter((r) => !r.ok);
  if (failed.length) console.error('instagram-sync failures', failed);
  return NextResponse.json({ ok: true, accounts: results.length, failed: failed.length, results });
}
