import type { NextRequest } from "next/server";
import { captureFlipCard } from "@/lib/captureFlipCard";
import { getFlipCardFrontStageByPlayerId } from "@/lib/db";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function GET(req: NextRequest) {
  const playerId = (req.nextUrl.searchParams.get("playerId") || "").trim();
  if (!/^[a-zA-Z0-9_-]{1,40}$/.test(playerId)) return new Response("Invalid player", {status:400});
  try {
    const player = await getFlipCardFrontStageByPlayerId(playerId);
    if (!player) return new Response("Player not found", {status:404});
    const hsid = String(player.hsid || "");
    if (!/^\d+$/.test(hsid)) return new Response("School unavailable", {status:404});
    const origin = req.nextUrl.origin;
    const png = await captureFlipCard({origin,hsid,playerId});
    return new Response(new Uint8Array(png), {headers:{"Content-Type":"image/png","Cache-Control":"public, max-age=300, s-maxage=300"}});
  } catch (e) {
    console.error("[og/player-card] authentic card capture failed",e);
    return new Response("Preview capture unavailable",{status:503,headers:{"Cache-Control":"no-store"}});
  }
}
