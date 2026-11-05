import { NextRequest, NextResponse } from "next/server";
import { buildPlayerGameLog } from "@/lib/playerGameLogData";
export const runtime = "nodejs";
export async function GET(req: NextRequest) {
  const playerId = req.nextUrl.searchParams.get("playerId") || "";
  if (!/^[A-Za-z0-9_-]{1,40}$/.test(playerId)) return NextResponse.json({ error: "Invalid player ID" }, { status: 400 });
  try {
    const result = await buildPlayerGameLog(playerId);
    return NextResponse.json(result, { headers: { "Cache-Control": "private, max-age=60" } });
  } catch (error) {
    console.error("[player-game-log] read failed",error);
    return NextResponse.json({ error: "Game log unavailable" }, { status: 500 });
  }
}
