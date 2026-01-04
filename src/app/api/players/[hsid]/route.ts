// src/app/api/players/[hsid]/route.ts
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import {
  getSchoolByHsid,
  getRosterByHsid,
  getStatsForPlayers,
} from '../../../../lib/db';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ hsid: string }> }
) {
  // params can be a Promise in this typing; await is safe either way
  const { hsid } = await params;

  if (!hsid) {
    return NextResponse.json({ error: 'Missing hsid' }, { status: 400 });
  }

  try {
    // 1) Authoritative school row
    const school = await getSchoolByHsid(hsid);
    if (!school) {
      // user wants redirect when no school found (not a 404)
      return NextResponse.redirect('https://yatstats.com');
    }

    // 2) Authoritative roster
    const roster = await getRosterByHsid(hsid);

    // 3) Batch-fetch stats for players (no N+1)
    const playerIds = roster.map((p: any) => p.playerid).filter(Boolean);
    const statsMap = await getStatsForPlayers(playerIds);

    // 4) Attach stats to each player object
    const players = roster.map((p: any) => {
      const stats = statsMap[p.playerid] ?? { batting: [], pitching: [] };
      return {
        ...p,
        batting: stats.batting ?? [],
        pitching: stats.pitching ?? [],
      };
    });

    // 5) Return JSON with caching headers (preview/prod-friendly)
    return NextResponse.json(
      { school, players },
      {
        status: 200,
        headers: {
          // short edge cache, stale-while-revalidate
          'Cache-Control': 's-maxage=60, stale-while-revalidate=300',
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (err) {
    console.error('players/[hsid] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
