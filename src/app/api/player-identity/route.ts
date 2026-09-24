// src/app/api/player-identity/route.ts
// Team/org/status/position/bats-throws-height-weight for one player, exactly
// as shown on the back of his flip card - fetched here (not read off
// PlayerProfileContext) by anything that renders outside that context's
// subtree. See the comment on getPlayerIdentityMeta in @/lib/db for why
// that's a real, confirmed case (ZoomableCareerTimeline in SharedShell's
// row3), not a hypothetical one.

import { NextRequest, NextResponse } from 'next/server';
import { getPlayerIdentityMeta } from '@/lib/db';

export async function GET(req: NextRequest) {
  const playerId = req.nextUrl.searchParams.get('playerId');
  if (!playerId) {
    return NextResponse.json({ error: 'playerId is required' }, { status: 400 });
  }

  try {
    const meta = await getPlayerIdentityMeta(playerId);
    return NextResponse.json(meta);
  } catch (error: any) {
    console.error('player-identity failed:', error);
    return NextResponse.json({ error: error?.message || 'Internal server error' }, { status: 500 });
  }
}
