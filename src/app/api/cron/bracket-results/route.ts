import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';
import {
  bracketDay, checkTeams, LIVE_BASE, runSeason, SQL_SEASONS, type Season,
} from '../../../../../scripts/master-bracket-results';

// The bracket results job on the server (scripts/master-bracket-results.ts):
// scores every started game of each live fantasy season on the live data and
// writes master_bracket, so the pages and the newsletters read one stored
// answer. Hourly by cron; safe to run again (nothing is written twice).
//
//   GET /api/cron/bracket-results            Authorization: Bearer $CRON_SECRET
//   GET /api/cron/bracket-results?key=...    the same, for a scheduler that
//                                            can't send headers (BRACKET_RESULTS_KEY)
//   &dry=1  score but don't write     &asof=YYYY-MM-DD  another bracket day
//
// A test branch's database holds all six test brackets: BRACKET_TEST_REGION
// runs just its own, and BRACKET_LIVE_BASE_URL takes the live data from the
// production site (its own database's stats stop the day it was copied).

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

function authorized(req: NextRequest) {
  const cron = process.env.CRON_SECRET;
  const key = process.env.BRACKET_RESULTS_KEY;
  const bearer = req.headers.get('authorization') || '';
  return Boolean((cron && bearer === `Bearer ${cron}`) || (key && req.nextUrl.searchParams.get('key') === key));
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const sp = req.nextUrl.searchParams;
  const asof = /^\d{4}-\d{2}-\d{2}$/.test(sp.get('asof') || '') ? sp.get('asof')! : bracketDay();
  const region = process.env.BRACKET_TEST_REGION ? Number(process.env.BRACKET_TEST_REGION) : undefined;
  const base = (process.env.BRACKET_LIVE_BASE_URL || (region == null ? req.nextUrl.origin : LIVE_BASE)).replace(/\/$/, '');
  const dryRun = sp.get('dry') === '1';

  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 2 });
  try {
    // Held stat lines and the team list belong to the production database's
    // own ingest; a test branch's copy skips them.
    if (region == null && !dryRun) {
      await pool.query('SELECT public.stat_lines_reland_held()');
      await checkTeams(pool);
    }
    const { rows: seasons } = await pool.query<Season>(SQL_SEASONS, [null, asof]);
    const out = [];
    for (const season of seasons) {
      out.push({ season: season.season_key, passes: await runSeason(pool, season, asof, { base, region, dryRun }) });
    }
    return NextResponse.json({ asof, region: region ?? null, base, dryRun, seasons: out });
  } catch (error) {
    console.error('[cron/bracket-results]', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  } finally {
    await pool.end();
  }
}
