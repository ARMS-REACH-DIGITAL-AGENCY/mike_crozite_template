// src/app/api/teammates/route.ts
// GET ?playerId= -> the player's teammates, grouped by team (see
// lib/teammates.ts). Shown beside the Stories feed so fans can find and tag
// the people in a moment.
import { NextRequest, NextResponse } from 'next/server';
import { getTeammates } from '@/lib/teammates';

export async function GET(req: NextRequest) {
  const playerId = (req.nextUrl.searchParams.get('playerId') || '').trim();
  if (!playerId || playerId.length > 40) {
    return NextResponse.json({ error: 'playerId is required' }, { status: 400 });
  }
  try {
    const groups = await getTeammates(playerId);
    return NextResponse.json({ groups }, { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' } });
  } catch (error) {
    console.error('[teammates] failed', playerId, error);
    return NextResponse.json({ error: 'Teammates could not load' }, { status: 500 });
  }
}
