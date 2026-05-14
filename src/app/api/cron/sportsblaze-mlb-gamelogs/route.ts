import { NextRequest, NextResponse } from 'next/server';
import { ingestSportsBlazeMlbGamelogs, seedSportsBlazeMlbPlayerMap } from '@/lib/sportsblazeMlb';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

function isAuthorized(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET || process.env.ADMIN_INGEST_SECRET;
  if (!expected) return false;

  const bearer = req.headers.get('authorization') || '';
  const token = bearer.startsWith('Bearer ') ? bearer.slice(7) : '';
  const qp = req.nextUrl.searchParams.get('secret') || '';

  return token === expected || qp === expected;
}

function boolParam(req: NextRequest, name: string, fallback = false) {
  const value = req.nextUrl.searchParams.get(name);
  if (value === null) return fallback;
  return ['1', 'true', 'yes', 'y'].includes(value.toLowerCase());
}

function intParam(req: NextRequest, name: string, fallback: number) {
  const value = Number(req.nextUrl.searchParams.get(name));
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  if ((process.env.SPORTSBLAZE_MLB_INGEST_ENABLED || '').toLowerCase() === 'false') {
    return NextResponse.json({ ok: false, error: 'SPORTSBLAZE_MLB_INGEST_ENABLED=false' }, { status: 409 });
  }

  const season = intParam(req, 'season', 2026);
  const dryRun = boolParam(req, 'dryRun') || boolParam(req, 'dry_run');
  const limit = intParam(req, 'limit', 50);
  const mapOnly = boolParam(req, 'mapOnly') || boolParam(req, 'map_only');
  const seedMap = !boolParam(req, 'skipMap') && !boolParam(req, 'skip_map');

  try {
    if (mapOnly) {
      const result = await seedSportsBlazeMlbPlayerMap(season, dryRun);
      return NextResponse.json({
        ok: true,
        mode: 'live',
        dryRun,
        mapOnly: true,
        season,
        ranAt: new Date().toISOString(),
        ...result,
        mapped: result.mapped.slice(0, 25),
      });
    }

    const summary = await ingestSportsBlazeMlbGamelogs({
      season,
      dryRun,
      limit,
      seedMap,
    });

    return NextResponse.json({
      ok: summary.mode === 'live',
      ranAt: new Date().toISOString(),
      ...summary,
    }, { status: summary.mode === 'missing-key' ? 409 : 200 });
  } catch (error: any) {
    return NextResponse.json({
      ok: false,
      mode: 'api-error',
      season,
      dryRun,
      ranAt: new Date().toISOString(),
      error: error?.message || String(error),
    }, { status: 500 });
  }
}
