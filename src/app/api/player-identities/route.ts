// src/app/api/player-identities/route.ts
// Batch current identity for UI surfaces outside the player-profile subtree.
// The bracket uses this so Alumni-of-the-Week performance can come from the
// historical/simulated game data while the player's displayed team/level/photo
// comes from the same current truth as the flip card and player profile.

import { NextRequest, NextResponse } from 'next/server';
import { getBatchDesignatedPlayerImages, getPlayerIdentityMeta } from '@/lib/db';

const MAX_IDS = 100;

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get('playerIds') || '';
  const ids = [...new Set(raw.split(',').map((v) => v.trim()).filter(Boolean))].slice(0, MAX_IDS);
  if (!ids.length) return NextResponse.json({});

  try {
    const [metas, headshots] = await Promise.all([
      Promise.all(ids.map(async (playerId) => [playerId, await getPlayerIdentityMeta(playerId)] as const)),
      getBatchDesignatedPlayerImages(ids, 'HEADSHOT'),
    ]);

    return NextResponse.json(Object.fromEntries(metas.map(([playerId, meta]) => [
      playerId,
      {
        currentTeamName: meta.currentTeamName,
        orgConferenceName: meta.orgConferenceName,
        levelLabel: meta.levelLabel,
        statusLabel: meta.statusLabel,
        headshotUrl: headshots.get(playerId)?.image_url ?? null,
      },
    ])));
  } catch (error: any) {
    console.error('player-identities failed:', error);
    return NextResponse.json({ error: error?.message || 'Internal server error' }, { status: 500 });
  }
}
