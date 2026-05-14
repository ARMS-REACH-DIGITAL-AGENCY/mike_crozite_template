import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { toPlayerSlug } from "@/lib/slug";
import { getSchoolCrestUrl } from "@/lib/schoolAssets";
import { GLOBAL_SEARCH_LIMIT } from "@/lib/searchConfig";

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

function slugifySchoolName(name: string) {
  return String(name || "")
    .toLowerCase()
    .trim()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeState(state: string) {
  return String(state || "").toLowerCase().trim();
}

function buildMicrositeUrl(hsid?: string, hsname?: string, hslocation?: string) {
  if (!hsid) return "";

  const schoolSlug = slugifySchoolName(hsname || "");
  const locParts = String(hslocation || "").split(",");
  const statePart = (locParts.slice(1).join(",") || "").trim();
  const stateSlug = normalizeState(statePart);

  if (schoolSlug && stateSlug) {
    return `https://${schoolSlug}.${stateSlug}.yatstats.com/${hsid}`;
  }

  return `/${hsid}`;
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: buildCorsHeaders(req) });
}

export async function GET(req: NextRequest) {
  const cors = buildCorsHeaders(req);

  try {
    const { searchParams } = new URL(req.url);
    const qRaw = (searchParams.get("q") || "").trim();
    const limit = Math.min(
      Math.max(parseInt(searchParams.get("limit") || String(GLOBAL_SEARCH_LIMIT), 10), 1),
      GLOBAL_SEARCH_LIMIT
    );

    if (!qRaw) {
      return NextResponse.json(
        { players: [] },
        { status: 200, headers: { ...cors, "Cache-Control": "no-store" } }
      );
    }

    const pattern = `%${qRaw}%`;

    const sql = `
      with tbc_matches as (
        select distinct on (tp.playerid::text, ph.hsid::text)
          tp.playerid::text as playerid,
          tp.firstname as firstname,
          tp.lastname as lastname,
          ph.hsid::text as hsid,
          ss.hsname,
          ss.hslocation,
          'tbc'::text as source_rank
        from player_hsids ph
        join tbc_players_raw tp
          on tp.playerid::text = ph.playerid::text
        join school_success ss
          on ss.hsid::text = ph.hsid::text
        where
          tp.firstname ilike $1
          or tp.lastname ilike $1
          or (tp.firstname || ' ' || tp.lastname) ilike $1
        order by tp.playerid::text, ph.hsid::text, tp.lastname, tp.firstname
      ),
      stage_matches as (
        select distinct on (f.playerid::text, f.hsid::text)
          f.playerid::text as playerid,
          f.first_name as firstname,
          f.last_name as lastname,
          f.hsid::text as hsid,
          ss.hsname,
          ss.hslocation,
          'stage'::text as source_rank
        from flip_card_front_stage f
        join school_success ss
          on ss.hsid::text = f.hsid::text
        where
          (
            f.first_name ilike $1
            or f.last_name ilike $1
            or coalesce(f.display_name, '') ilike $1
            or (coalesce(f.first_name, '') || ' ' || coalesce(f.last_name, '')) ilike $1
          )
          and not exists (
            select 1
            from tbc_players_raw tp
            where tp.playerid::text = f.playerid::text
          )
        order by f.playerid::text, f.hsid::text, f.last_name, f.first_name
      ),
      combined as (
        select * from tbc_matches
        union all
        select * from stage_matches
      )
      select c.*, hp.image_url as headshot_url
      from combined c
      left join lateral (
        select pp.image_url
        from player_photos pp
        where pp.player_id::text = c.playerid::text
          and pp.approval_status = 'APPROVED'
          and pp.image_role in ('HEADSHOT', 'RIGHT_ANCHOR')
        order by case pp.image_role when 'HEADSHOT' then 0 when 'RIGHT_ANCHOR' then 1 else 2 end,
                 pp.id desc
        limit 1
      ) hp on true
      order by c.lastname nulls last, c.firstname nulls last, c.playerid
      limit $2
    `;

    const { rows } = await query(sql, [pattern, limit]);

    const players = rows.map((r: any) => {
      const locParts = String(r.hslocation || "").split(",");
      const city = (locParts[0] || "").trim();
      const state = (locParts.slice(1).join(",") || "").trim();
      const schoolId = r.hsid ?? "";
      const schoolName = r.hsname ?? "";
      const micrositeUrl = buildMicrositeUrl(schoolId, schoolName, r.hslocation ?? "");

      return {
        playerId: r.playerid ?? "",
        firstName: r.firstname ?? "",
        lastName: r.lastname ?? "",
        displayName: `${r.firstname ?? ""} ${r.lastname ?? ""}`.trim(),
        schoolId,
        schoolName,
        city,
        state,
        slug: toPlayerSlug(r.firstname, r.lastname),
        crestUrl: getSchoolCrestUrl(r.hsid),
        headshotUrl: r.headshot_url || "",
        micrositeUrl,
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
