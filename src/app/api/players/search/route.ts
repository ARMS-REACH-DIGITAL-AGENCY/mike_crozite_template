import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { toPlayerSlug } from "@/lib/slug";
import { getSchoolCrestUrl } from "@/lib/schoolAssets";

export const runtime = "nodejs";

function buildCorsHeaders(req: NextRequest) {
  const origin = req.headers.get("origin") || "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: buildCorsHeaders(req) });
}

export async function GET(req: NextRequest) {
  const cors = buildCorsHeaders(req);
  try {
    const { searchParams } = new URL(req.url);
    const qRaw = (searchParams.get("q") || "").trim();
    const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "10", 10), 1), 10);

    if (!qRaw) {
      return NextResponse.json({ players: [] }, { status: 200, headers: { ...cors, "Cache-Control": "no-store" } });
    }

    const pattern = `%${qRaw}%`;
    const sql = `
      SELECT DISTINCT ON (tp.playerid)
        tp.playerid::text AS playerid,
        tp.firstname,
        tp.lastname,
        ph.hsid::text AS hsid,
        ss.hsname,
        ss.hslocation
      FROM player_hsids ph
      JOIN tbc_players_raw tp ON tp.playerid::text = ph.playerid::text
      JOIN school_success ss ON ss.hsid::text = ph.hsid::text
      WHERE
        tp.firstname ILIKE $1
        OR tp.lastname ILIKE $1
        OR (tp.firstname || ' ' || tp.lastname) ILIKE $1
      ORDER BY tp.playerid, tp.lastname, tp.firstname
      LIMIT $2
    `;
    const { rows } = await query(sql, [pattern, limit]);
    const players = rows.map((r: any) => {
      const locParts = String(r.hslocation || "").split(",");
      const city = (locParts[0] || "").trim();
      const state = (locParts.slice(1).join(",") || "").trim();
      return {
        playerId: r.playerid ?? "",
        firstName: r.firstname ?? "",
        lastName: r.lastname ?? "",
        schoolId: r.hsid ?? "",
        schoolName: r.hsname ?? "",
        city,
        state,
        slug: toPlayerSlug(r.firstname, r.lastname),
        crestUrl: getSchoolCrestUrl(r.hsid),
      };
    });

    return NextResponse.json(
      { players },
      { status: 200, headers: { ...cors, "Cache-Control": "no-store" } }
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: "Server error", message: err?.message },
      { status: 500, headers: buildCorsHeaders(req) }
    );
  }
}
