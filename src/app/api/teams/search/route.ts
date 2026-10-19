import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { toPlayerSlug } from "@/lib/slug";
import { getSchoolCrestUrl } from "@/lib/schoolAssets";
import { PLAYER_STAGE_IDENTITY_CTES, PLAYER_STAGE_IDENTITY_SOURCE } from "@/lib/playerStageIdentity";
import { getBatchPlayerHeadshots } from "@/lib/playerHeadshots";
import { getPlayerHeadshotSources } from "@/lib/playerImage";

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
    // Page size is bounded for predictable query latency, but the search has no
    // total-results cap: clients page until hasMore is false.
    const parsedLimit = Number.parseInt(searchParams.get("limit") || "40", 10);
    const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 75) : 40;
    const parsedOffset = Number.parseInt(searchParams.get("offset") || "0", 10);
    const offset = Number.isFinite(parsedOffset) ? Math.min(Math.max(parsedOffset, 0), 100000) : 0;

    if (!qRaw) {
      return NextResponse.json({ teams: [], hasMore: false, nextOffset: null }, { status: 200, headers: { ...cors, "Cache-Control": "no-store" } });
    }

    const pattern = `%${qRaw}%`;
    const sql = `
      with ${PLAYER_STAGE_IDENTITY_CTES}, matches as (
        select distinct on (f.playerid::text, f.hsid::text, coalesce(f.current_team_name, ''), coalesce(f.level_label, ''))
          f.playerid::text as playerid,
          coalesce(nullif(f.first_name, ''), split_part(coalesce(f.display_name, ''), ' ', 1)) as firstname,
          coalesce(nullif(f.last_name, ''), regexp_replace(coalesce(f.display_name, ''), '^\\S+\\s*', '')) as lastname,
          f.display_name,
          f.hsid::text as hsid,
          f.current_team_name,
          f.current_org_or_conference_name,
          f.level_label,
          coalesce(m.teamid::text, case when f.current_team_source = 'identity_reconciled_2026' then f.current_teamid end) as current_teamid,
          ss.hsname,
          ss.hslocation
        from ${PLAYER_STAGE_IDENTITY_SOURCE} f
        left join public.teamid_universe_mapping m
          on lower(trim(m.current_team_name)) = lower(trim(f.current_team_name))
         and (
           coalesce(f.current_org_or_conference_name, '') = ''
           or coalesce(m.current_org_or_conference_name, '') = ''
           or lower(trim(m.current_org_or_conference_name)) = lower(trim(f.current_org_or_conference_name))
         )
        left join school_success ss on ss.hsid::text = f.hsid::text
        where
          coalesce(f.current_team_name, '') ilike $1
          or coalesce(f.current_org_or_conference_name, '') ilike $1
          or coalesce(f.level_label, '') ilike $1
        order by
          f.playerid::text,
          f.hsid::text,
          coalesce(f.current_team_name, ''),
          coalesce(f.level_label, ''),
          m.teamid::text nulls last,
          f.last_name nulls last,
          f.first_name nulls last
      )
      select *
      from matches
      order by
        -- Exact MLB club first, then MLB records for the matching organization.
        -- An affiliate name sorting alphabetically must never hide the majors.
        case
          when lower(btrim(coalesce(current_team_name, ''))) = lower($3)
            and upper(btrim(coalesce(level_label, ''))) = 'MLB' then 0
          when upper(btrim(coalesce(level_label, ''))) = 'MLB' then 1
          when lower(btrim(coalesce(current_team_name, ''))) = lower($3) then 2
          else 3
        end,
        case upper(replace(btrim(coalesce(level_label, '')), ' ', ''))
          when 'MLB' then 0
          when 'TRIPLE-A' then 1 when 'AAA' then 1
          when 'DOUBLE-A' then 2 when 'AA' then 2
          when 'HIGH-A' then 3 when 'A+' then 3
          when 'SINGLE-A' then 4 when 'LOW-A' then 4 when 'A' then 4
          when 'ROOKIE' then 5
          else 6
        end,
        current_team_name asc nulls last,
        lastname asc nulls last,
        firstname asc nulls last,
        playerid asc,
        hsid asc
      limit $2 offset $4
    `;

    const { rows: pageWithLookahead } = await query(sql, [pattern, limit + 1, qRaw, offset]);
    const hasMore = pageWithLookahead.length > limit;
    const rows = pageWithLookahead.slice(0, limit);
    const headshots = await getBatchPlayerHeadshots(rows.map((row: any) => String(row.playerid)));

    const teams = rows.map((r: any) => {
      const locParts = String(r.hslocation || "").split(",");
      const firstName = r.firstname || "";
      const lastName = r.lastname || "";
      const displayName = r.display_name || `${firstName} ${lastName}`.trim();
      const currentTeamId = r.current_teamid || "";
      const schoolId = r.hsid || "";
      const schoolName = r.hsname || "";
      const micrositeUrl = buildMicrositeUrl(schoolId, schoolName, r.hslocation || "");

      return {
        playerId: r.playerid || "",
        firstName,
        lastName,
        displayName,
        schoolId,
        schoolName,
        city: (locParts[0] || "").trim(),
        state: (locParts.slice(1).join(",") || "").trim(),
        slug: toPlayerSlug(firstName, lastName || displayName),
        crestUrl: getSchoolCrestUrl(r.hsid),
        headshotUrl: headshots.get(String(r.playerid))?.image_url ?? "",
        headshotSources: getPlayerHeadshotSources(String(r.playerid), headshots.get(String(r.playerid))?.image_url),
        micrositeUrl,
        microsite_url: micrositeUrl,
        currentTeamName: r.current_team_name || "",
        currentTeamId,
        current_team_id: currentTeamId,
        teamid: currentTeamId,
        teamLogoUrl: currentTeamId ? `https://yatstats-assets.s3.us-west-2.amazonaws.com/teams/${currentTeamId}.png` : "",
        currentOrgOrConferenceName: r.current_org_or_conference_name || "",
        levelLabel: r.level_label || "",
      };
    });

    return NextResponse.json({ teams, hasMore, nextOffset: hasMore ? offset + teams.length : null }, { status: 200, headers: { ...cors, "Cache-Control": "no-store" } });
  } catch (err: any) {
    return NextResponse.json({ error: "Server error", message: err?.message }, { status: 500, headers: buildCorsHeaders(req) });
  }
}
