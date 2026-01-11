export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { getSchoolByHsid, getRosterByHsid, getStatsForPlayers } from '@/lib/db';

export async function GET(
  _request: Request,
  context: { params: Promise<{ hsid: string }> }
) {
  const { hsid } = await context.params;

  if (!hsid) return NextResponse.json({ error: 'Missing hsid' }, { status: 400 });

  try {
    const school = await getSchoolByHsid(hsid);
    if (!school) return NextResponse.redirect(new URL('https://yatstats.com'));

    const roster = await getRosterByHsid(hsid);
    const playerIds = roster.map((p: any) => p.playerid).filter(Boolean);
    const statsMap = await getStatsForPlayers(playerIds);

    const players = roster.map((p: any) => {
      const stats = statsMap[p.playerid] ?? { batting: [], pitching: [] };
      return { ...p, batting: stats.batting ?? [], pitching: stats.pitching ?? [] };
    });

    return NextResponse.json(
      { school, players },
      { status: 200, headers: { 'Cache-Control': 's-maxage=60, stale-while-revalidate=300' } }
    );
  } catch (error) {
    console.error('players/[hsid] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}