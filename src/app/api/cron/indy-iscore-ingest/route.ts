import { NextRequest, NextResponse } from 'next/server';
import {
  ensureIndyIscoreTables,
  ingestIndyIscoreLeague,
  loadActiveIndyIscoreLeagues,
} from '@/lib/indyIscore';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

function safeEquals(a: string, b: string) {
  return a.length > 0 && b.length > 0 && a === b;
}

function isAuthorized(req: NextRequest): boolean {
  const allowedSecrets = [process.env.ADMIN_INGEST_SECRET, process.env.CRON_SECRET]
    .filter((value): value is string => Boolean(value && value.trim().length > 0));

  if (allowedSecrets.length === 0) return false;

  const bearer = req.headers.get('authorization') || '';
  const token = bearer.startsWith('Bearer ') ? bearer.slice(7) : '';
  const qp = req.nextUrl.searchParams.get('secret') || '';

  return allowedSecrets.some((expected) => safeEquals(token, expected) || safeEquals(qp, expected));
}

function boolParam(req: NextRequest, name: string, fallback = false) {
  const value = req.nextUrl.searchParams.get(name) || '';
  if (!value) return fallback;
  return ['1', 'true', 'yes', 'y'].includes(value.toLowerCase());
}

function intParam(req: NextRequest, name: string, fallback: number, min = 1, max = 5000) {
  const raw = req.nextUrl.searchParams.get(name);
  const value = raw ? Number(raw) : fallback;
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(value)));
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  if ((process.env.INDY_ISCORE_INGEST_ENABLED || '').toLowerCase() === 'false') {
    return NextResponse.json({ ok: false, error: 'INDY_ISCORE_INGEST_ENABLED=false' }, { status: 409 });
  }

  const dryRun = boolParam(req, 'dryRun') || boolParam(req, 'dry_run');
  const force = boolParam(req, 'force');
  const includeDetails = !boolParam(req, 'skipDetails') && !boolParam(req, 'skip_details');
  const includeGames = boolParam(req, 'includeGames') || boolParam(req, 'include_games');
  const leagueFilter = req.nextUrl.searchParams.get('league') || req.nextUrl.searchParams.get('leagueCode');
  const size = intParam(req, 'size', 500, 50, 2000);
  const playerDetailLimit = intParam(req, 'playerDetailLimit', 300, 1, 2000);
  const maxGames = intParam(req, 'maxGames', 10, 1, 200);

  await ensureIndyIscoreTables();
  const leagues = await loadActiveIndyIscoreLeagues(leagueFilter);
  const results = [];

  for (const league of leagues) {
    results.push(await ingestIndyIscoreLeague(league, {
      dryRun,
      force,
      includeDetails,
      includeGames,
      size,
      playerDetailLimit,
      maxGames,
    }));
  }

  return NextResponse.json({
    ok: results.every((result) => result.errors.length === 0),
    ranAt: new Date().toISOString(),
    dryRun,
    force,
    includeDetails,
    includeGames,
    leaguesChecked: results.length,
    totals: {
      battingRows: results.reduce((sum, result) => sum + result.battingRows, 0),
      pitchingRows: results.reduce((sum, result) => sum + result.pitchingRows, 0),
      playersSeen: results.reduce((sum, result) => sum + result.playersSeen, 0),
      playersAutoMatched: results.reduce((sum, result) => sum + result.playersAutoMatched, 0),
      playerDetailsFetched: results.reduce((sum, result) => sum + result.playerDetailsFetched, 0),
      gamesFound: results.reduce((sum, result) => sum + result.gamesFound, 0),
      boxScoresFetched: results.reduce((sum, result) => sum + result.boxScoresFetched, 0),
      playerGameRows: results.reduce((sum, result) => sum + result.playerGameRows, 0),
      errors: results.reduce((sum, result) => sum + result.errors.length, 0),
    },
    results,
  });
}
