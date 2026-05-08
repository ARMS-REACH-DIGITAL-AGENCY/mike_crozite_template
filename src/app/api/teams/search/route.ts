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
    const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "30", 10), 1), 50);

    if (!qRaw) {
      return NextResponse.json({ teams: [] }, { status: 200, headers: { ...cors, "Cache-Control": "no-store" } });
    }

    const pattern = `%${qRaw}%`;
    const sql = `
      select distinct on (f.playerid::text, f.hsid::text)
        f.playerid::text as playerid,
        coalesce(nullif(f.first_name, ''), split_part(coalesce(f.display_name, ''), ' ', 1)) as firstname,
        coalesce(nullif(f.last_name, ''), regexp_replace(coalesce(f.display_name, ''), '^\\S+\\s*', '')) as lastname,
        f.display_name,
        f.hsid::text as hsid,
        f.current_team_name,
        f.current_org_or_conference_name,
        f.level_label,
        ss.hsname,
        ss.hslocation
      from flip_card_front_stage f
      left join school_success ss on ss.hsid::text = f.hsid::text
      where
        coalesce(f.current_team_name, '') ilike $1
        or coalesce(f.current_org_or_conference_name, '') ilike $1
        or coalesce(f.level_label, '') ilike $1
      order by f.playerid::text, f.hsid::text, f.current_team_name nulls last, f.last_name nulls last, f.first_name nulls last
      limit $2
    `;

    const { rows } = await query(sql, [pattern, limit]);

    const teams = rows.map((r: any) => {
      const locParts = String(r.hslocation || "").split(",");
      const firstName = r.firstname || "";
      const lastName = r.lastname || "";
      const displayName = r.display_name || `${firstName} ${lastName}`.trim();
      return {
        playerId: r.playerid || "",
        firstName,
        lastName,
        displayName,
        schoolId: r.hsid || "",
        schoolName: r.hsname || "",
        city: (locParts[0] || "").trim(),
        state: (locParts.slice(1).join(",") || "").trim(),
        slug: toPlayerSlug(firstName, lastName || displayName),
        crestUrl: getSchoolCrestUrl(r.hsid),
        currentTeamName: r.current_team_name || "",
        currentOrgOrConferenceName: r.current_org_or_conference_name || "",
        levelLabel: r.level_label || "",
      };
    });

    return NextResponse.json({ teams }, { status: 200, headers: { ...cors, "Cache-Control": "no-store" } });
  } catch (err: any) {
    return NextResponse.json({ error: "Server error", message: err?.message }, { status: 500, headers: buildCorsHeaders(req) });
  }
}
