// src/app/api/players/[playerId]/card/route.ts
// Returns full flip-card data (flip_card_front_stage truth + 2026 season stats
// + designated photos) for one arbitrary player, independent of whichever
// school subdomain the request came from. Lets a Super Fan's cross-school
// favorite render as a real <PlayerCard>, not a hand-built lookalike.

import { NextRequest, NextResponse } from "next/server";
import {
  getFlipCardFrontStageByPlayerId,
  getActiveRosterRowByPlayerId,
  getBatchDesignatedPlayerImages,
} from "@/lib/db";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ playerId: string }> }
) {
  const { playerId } = await params;
  const id = String(playerId || "").trim();

  if (!id) {
    return NextResponse.json({ error: "Missing playerId" }, { status: 400 });
  }

  const stageRow = await getFlipCardFrontStageByPlayerId(id);
  if (!stageRow) {
    return NextResponse.json({ error: "Player not found" }, { status: 404 });
  }

  const activeRow = await getActiveRosterRowByPlayerId(id);
  const player = activeRow
    ? { ...stageRow, ...activeRow, has_2026_stats: true }
    : { ...stageRow, has_2026_stats: false };

  const resolvedHsid = String(stageRow.hsid || "");

  const [frontImageMap, headshotMap] = await Promise.all([
    getBatchDesignatedPlayerImages([id], "YATSTATS_FRONT"),
    getBatchDesignatedPlayerImages([id], "HEADSHOT"),
  ]);

  return NextResponse.json(
    {
      player,
      resolvedHsid,
      frontImageUrl: frontImageMap.get(id)?.image_url ?? null,
      headshotUrl: headshotMap.get(id)?.image_url ?? null,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
