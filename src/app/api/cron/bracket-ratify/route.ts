// Separate safety net: ratifies PREVIOUSLY verified, persisted game results
// at/after Monday 04:00 America/Phoenix, even when live ingestion is down.
// It never downloads statistics, guesses winners, or changes locked scores.
import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';
import { bracketDay } from '../../../../../scripts/master-bracket-results';
import { ratifyVerifiedStored } from '@/lib/bracket/ratifyStored';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

function authorized(req: NextRequest) {
  const cron = process.env.CRON_SECRET;
  const key = process.env.BRACKET_RESULTS_KEY;
  const bearer = req.headers.get('authorization') || '';
  return Boolean((cron && bearer === `Bearer ${cron}`) ||
    (key && req.nextUrl.searchParams.get('key') === key));
}
export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  // Never let an unrelated preview deployment touch shared customer data.
  if (process.env.VERCEL_ENV !== 'production' && !process.env.BRACKET_TEST_REGION)
    return NextResponse.json({ error: 'isolated test database required' }, { status: 403 });
  const asof = bracketDay();
  const region = process.env.BRACKET_TEST_REGION ? Number(process.env.BRACKET_TEST_REGION) : null;
  const seasonKey = req.nextUrl.searchParams.get('season') || '2027';
  const dryRun = req.nextUrl.searchParams.get('dry') === '1';
  if (!/^2027$|^test_[A-Za-z0-9_]+$/.test(seasonKey))
    return NextResponse.json({ error: 'invalid season' }, { status: 400 });
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 1 });
  try {
    const client = await pool.connect();
    try {
      const outcome = await ratifyVerifiedStored(client, seasonKey, region, asof, dryRun);
      if (!outcome.ready) console.error('[bracket-ratify] unresolved deadline games', outcome.pending);
      return NextResponse.json({ season: seasonKey, asof, region, dryRun, ...outcome }, {
        status: outcome.ready ? 200 : 207,
        headers: { 'Cache-Control': 'no-store' },
      });
    } finally { client.release(); }
  } catch (error) {
    console.error('[bracket-ratify] failed', error);
    return NextResponse.json({ error: 'backup ratification failed' }, { status: 500 });
  } finally { await pool.end(); }
}
