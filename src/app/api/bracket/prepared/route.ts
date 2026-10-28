import { NextResponse, type NextRequest } from 'next/server';
import { preparedIndex } from '@/lib/bracket/preparedIndex';

// The bracket pages' data from the prepared results: the Index (every
// round's series and games with their stored innings and winners), the stat
// drawers' boxes, the knocked-out schools' games and where each week in
// progress stands - built on the server from master_bracket
// (lib/bracket/preparedIndex.ts). Read only; nothing is scored.
//
//   GET /api/bracket/prepared?season=test-2026&region=1

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const season = sp.get('season') || '';
  const region = Number(sp.get('region'));
  if (!/^[\w-]{1,20}$/.test(season) || !Number.isInteger(region) || region < 0 || region > 8) {
    return NextResponse.json({ error: 'season=<key> and region=<0-8> are required' }, { status: 400 });
  }
  try {
    const prepared = await preparedIndex(season, region);
    if (!prepared) return NextResponse.json({ error: `no season ${season}` }, { status: 404 });
    return NextResponse.json(prepared, { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=60' } });
  } catch (error) {
    console.error('[bracket/prepared]', error);
    return NextResponse.json({ error: 'prepared results unavailable' }, { status: 500 });
  }
}
