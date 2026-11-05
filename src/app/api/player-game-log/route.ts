import { NextRequest, NextResponse } from "next/server";
import { buildPlayerGameLog } from "@/lib/playerGameLogData";

export const runtime = "nodejs";

/** Schedule data is expensive. Load only when the visitor activates Game Log. */
export async function GET(request: NextRequest) {
  const playerId = request.nextUrl.searchParams.get("playerId") || "";
  const kind = request.nextUrl.searchParams.get("pitcher");
  const recentTeam = request.nextUrl.searchParams.get("teamid") || "";
  if (!/^[A-Za-z0-9_-]{1,40}$/.test(playerId) ||
      !["0","1"].includes(kind || "") ||
      (recentTeam && !/^[A-Za-z0-9_-]{1,40}$/.test(recentTeam))) {
    return NextResponse.json({ error: "Invalid player or team reference" }, { status: 400 });
  }
  try {
    const data = await buildPlayerGameLog(playerId, kind === "1", recentTeam || null);
    return NextResponse.json(data, {
      headers: { "Cache-Control": "private, max-age=60" },
    });
  } catch (error) {
    console.error("[player-game-log] request failed", error);
    return NextResponse.json({ error: "Game Log unavailable" }, { status: 500 });
  }
}
