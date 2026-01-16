// src/app/api/schools/search/route.ts
import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

export const runtime = "nodejs";

/**
 * CORS for embedding on GHL pages or other domains.
 * If you want to lock down: replace reflection with an allowlist.
 */
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

/**
 * Many of your rows include a lookup string like: "Hamilton (Chandler,AZ)".
 * We use it as a fallback when explicit city/state columns aren't present.
 */
function parseLookupKey(lookupKey: string) {
  const raw = (lookupKey || "").trim();
  const nameMatch = raw.match(/^(.+?)\s*\(/);
  const locMatch = raw.match(/\((.*)\)$/);

  const hsname = (nameMatch?.[1] || raw).trim();

  let city = "";
  let state = "";

  if (locMatch?.[1]) {
    const inside = locMatch[1]; // e.g. "Chandler,AZ"
    const parts = inside.split(",");
    city = (parts[0] || "").trim();
    state = (parts[1] || "").trim();
  }

  return { hsname, city, state };
}

/**
 * Safely discover which columns exist in school_success so this route doesn't
 * crash if a column name differs across DBs/branches.
 */
async function getSchoolSuccessColumns(): Promise<Set<string>> {
  const sql = `
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'school_success'
  `;
  const { rows } = await query(sql, []);
  return new Set(rows.map((r: any) => String(r.column_name)));
}

function pick(colSet: Set<string>, name: string) {
  return colSet.has(name) ? name : null;
}

export async function GET(req: NextRequest) {
  const cors = buildCorsHeaders(req);

  try {
    const { searchParams } = new URL(req.url);

    const qRaw = (searchParams.get("q") || "").trim();
    const stateRaw = (searchParams.get("state") || "").trim().toUpperCase(); // "AZ"
    const cityRaw = (searchParams.get("city") || "").trim(); // optional

    const limit = Math.min(
      Math.max(parseInt(searchParams.get("limit") || "25", 10), 1),
      50
    );

    const cols = await getSchoolSuccessColumns();

    // Core identity fields (seen in your table screenshot)
    const COL_HSID = pick(cols, "hsid") || "hsid";
    const COL_LOOKUP = pick(cols, "hs_lookup_key");
    const COL_HIGH_SCHOOL = pick(cols, "high_school");

    // URLs (seen in screenshot)
    const COL_STAGING_URL = pick(cols, "staging_url");
    const COL_MICROSITE_URL = pick(cols, "microsite_url");

    // Fields commonly present in your screenshot (names may vary)
    const COL_HSNAME = pick(cols, "hsname");
    const COL_NICKNAME = pick(cols, "nickname");
    const COL_HSLOCATION = pick(cols, "hslocation");
    const COL_CITYNAME = pick(cols, "cityname");
    const COL_REGIONNAME = pick(cols, "regionname");
    const COL_REGIONABBR = pick(cols, "regionabbr"); // if exists
    const COL_REGION = pick(cols, "region"); // if exists
    const COL_STATE = pick(cols, "state"); // if exists

    // Metrics / ranks (seen in screenshot)
    const COL_ACTIVE = pick(cols, "current_active_alumni");
    const COL_MLB = pick(cols, "mlb_players_produced");
    const COL_NAT_RANK = pick(cols, "yatstats_national_rank");
    const COL_STATE_RANK = pick(cols, "yatstats_state_rank");
    const COL_ALLTIME = pick(cols, "all_time_next_level_alumni");
    const COL_DRAFTED_HS = pick(cols, "drafted_hs");
    const COL_DRAFTED_TOTAL = pick(cols, "drafted_total");

    // Build SELECT list only from existing columns
    const selectCols = [
      `${COL_HSID} AS hsid`,
      COL_LOOKUP ? `${COL_LOOKUP} AS hs_lookup_key` : null,
      COL_HIGH_SCHOOL ? `${COL_HIGH_SCHOOL} AS high_school` : null,
      COL_HSNAME ? `${COL_HSNAME} AS hsname` : null,
      COL_NICKNAME ? `${COL_NICKNAME} AS nickname` : null,
      COL_HSLOCATION ? `${COL_HSLOCATION} AS hslocation` : null,
      COL_CITYNAME ? `${COL_CITYNAME} AS cityname` : null,
      COL_REGIONNAME ? `${COL_REGIONNAME} AS regionname` : null,
      COL_REGIONABBR ? `${COL_REGIONABBR} AS regionabbr` : null,
      COL_REGION ? `${COL_REGION} AS region` : null,
      COL_STATE ? `${COL_STATE} AS state` : null,
      COL_STAGING_URL ? `${COL_STAGING_URL} AS staging_url` : null,
      COL_MICROSITE_URL ? `${COL_MICROSITE_URL} AS microsite_url` : null,
      COL_ACTIVE ? `${COL_ACTIVE} AS current_active_alumni` : null,
      COL_MLB ? `${COL_MLB} AS mlb_players_produced` : null,
      COL_NAT_RANK ? `${COL_NAT_RANK} AS yatstats_national_rank` : null,
      COL_STATE_RANK ? `${COL_STATE_RANK} AS yatstats_state_rank` : null,
      COL_ALLTIME ? `${COL_ALLTIME} AS all_time_next_level_alumni` : null,
      COL_DRAFTED_HS ? `${COL_DRAFTED_HS} AS drafted_hs` : null,
      COL_DRAFTED_TOTAL ? `${COL_DRAFTED_TOTAL} AS drafted_total` : null,
    ].filter(Boolean);

    // WHERE dynamically (parameterized)
    const where: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (qRaw) {
      // Match on lookup key, hsname, or high_school (whatever exists)
      const likeParts: string[] = [];
      if (COL_LOOKUP) likeParts.push(`hs_lookup_key ILIKE $${idx}`);
      if (COL_HSNAME) likeParts.push(`hsname ILIKE $${idx}`);
      if (COL_HIGH_SCHOOL) likeParts.push(`high_school ILIKE $${idx}`);
      // Fallback: always include lookup-like parsing by using COALESCE if needed
      if (likeParts.length === 0) {
        likeParts.push(`${COL_HSID}::text ILIKE $${idx}`); // last resort
      }
      where.push(`(${likeParts.join(" OR ")})`);
      params.push(`%${qRaw}%`);
      idx += 1;
    }

    if (stateRaw) {
      // Prefer explicit state/regionabbr columns; otherwise fallback to lookup string contains ",AZ)"
      const stateParts: string[] = [];
      if (COL_REGIONABBR) stateParts.push(`regionabbr = $${idx}`);
      if (COL_STATE) stateParts.push(`state = $${idx}`);
      if (COL_REGIONNAME) stateParts.push(`regionname ILIKE $${idx}`); // if regionname is "Arizona", allow "AZ" won't match though
      if (COL_LOOKUP) stateParts.push(`hs_lookup_key ILIKE $${idx + 1}`); // add a second param for lookup fallback

      if (stateParts.length > 0) {
        // If we included lookup fallback, we need 2 params; otherwise 1
        if (stateParts.some((p) => p.includes(`$${idx + 1}`))) {
          where.push(`((${stateParts
            .filter((p) => !p.includes(`$${idx + 1}`))
            .join(" OR ")}) OR (hs_lookup_key ILIKE $${idx + 1}))`);
          params.push(stateRaw);
          params.push(`%,${stateRaw})%`);
          idx += 2;
        } else {
          where.push(`(${stateParts.join(" OR ")})`);
          params.push(stateRaw);
          idx += 1;
        }
      } else {
        // Only lookup parsing available
        where.push(`hs_lookup_key ILIKE $${idx}`);
        params.push(`%,${stateRaw})%`);
        idx += 1;
      }
    }

    if (cityRaw) {
      // Prefer explicit cityname; else fallback to lookup parsing "(City,ST)"
      if (COL_CITYNAME) {
        where.push(`cityname ILIKE $${idx}`);
        params.push(`%${cityRaw}%`);
        idx += 1;
      } else if (COL_LOOKUP) {
        where.push(`hs_lookup_key ILIKE $${idx}`);
        params.push(`%(${cityRaw},%`);
        idx += 1;
      }
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    // Sorting: show best/most relevant first if rank exists; else alphabetical
    const orderSql = COL_NAT_RANK
      ? `ORDER BY yatstats_national_rank ASC NULLS LAST, hs_lookup_key ASC NULLS LAST`
      : `ORDER BY hs_lookup_key ASC NULLS LAST`;

    const sql = `
      SELECT ${selectCols.join(",\n        ")}
      FROM school_success
      ${whereSql}
      ${orderSql}
      LIMIT ${limit}
    `;

    const { rows } = await query(sql, params);

    const programs = rows.map((r: any) => {
      // Build a reliable display name + location
      const lookupKey = String(r.hs_lookup_key || r.high_school || "");
      const parsed = parseLookupKey(lookupKey);

      const hsname =
        (r.hsname && String(r.hsname)) ||
        (r.high_school && String(r.high_school)) ||
        parsed.hsname ||
        "";

      const state =
        (r.regionabbr && String(r.regionabbr)) ||
        (r.state && String(r.state)) ||
        parsed.state ||
        "";

      const city =
        (r.cityname && String(r.cityname)) ||
        parsed.city ||
        "";

      const hslocation =
        (r.hslocation && String(r.hslocation)) ||
        (city && state ? `${city}, ${state}` : "");

      return {
        // identity
        hsid: r.hsid ?? null,
        hsname,
        nickname: r.nickname ?? null,
        city,
        state,
        hslocation,

        // URLs
        staging_url: r.staging_url ?? null,
        microsite_url: r.microsite_url ?? null,

        // metrics (for your “stat cards”)
        current_active_alumni: r.current_active_alumni ?? null,
        mlb_players_produced: r.mlb_players_produced ?? null,
        yatstats_national_rank: r.yatstats_national_rank ?? null,
        yatstats_state_rank: r.yatstats_state_rank ?? null,
        all_time_next_level_alumni: r.all_time_next_level_alumni ?? null,
        drafted_hs: r.drafted_hs ?? null,
        drafted_total: r.drafted_total ?? null,

        // enables “click result → open modal → fetch players”
        players_endpoint: r.hsid ? `/api/players/${r.hsid}` : null,
      };
    });

    return NextResponse.json(
      { programs },
      {
        status: 200,
        headers: {
          ...cors,
          "Content-Type": "application/json",
          // Helps debugging + avoids weird caching when embedded
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (err: any) {
    return NextResponse.json(
      {
        error: "Server error while loading schools.",
        message: err?.message || "Unknown error",
      },
      {
        status: 500,
        headers: { ...buildCorsHeaders(req), "Content-Type": "application/json" },
      }
    );
  }
}

