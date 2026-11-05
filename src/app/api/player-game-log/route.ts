import { NextRequest, NextResponse } from "next/server";
import { buildPlayerGameLog } from "@/lib/playerGameLogData";
import { unstable_cache } from "next/cache";

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
    // Share the same short-lived read model across visitors, rather than
    // running team-stint and game-schedule queries for each page visitor.
    // Keep the cache bounded so current games and trades update promptly.
    const load = unstable_cache(
      () => buildPlayerGameLog(playerId, kind === "1", recentTeam || null),
      ["player-game-log-v1", playerId, kind || "0", recentTeam],
      { revalidate: 120 },
    );
    const data = await load();
    return NextResponse.json(data, {
      headers: { "Cache-Control": "private, max-age=60" },
    });
  } catch (error) {
    console.error("[player-game-log] request failed", error);
    return NextResponse.json({ error: "Game Log unavailable" }, { status: 500 });
  }
}
