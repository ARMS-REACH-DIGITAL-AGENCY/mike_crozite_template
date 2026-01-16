// src/app/api/schools/search/route.ts
import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

export const runtime = "nodejs";

/**
 * CORS for embedding on GHL pages or other domains.
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
 * Fallback parser for strings like:
 * "Hamilton (Chandler,AZ)"
 */
function parseLookupKey(lookupKey: string) {
  const raw = (lookupKey || "").trim();
  const nameMatch = raw.match(/^(.+?)\s*\(/);
  const locMatch = raw.match(/\((.*)\)$/);

  const hsname = (nameMatch?.[1] || raw).trim();

  let city = "";
  let state = "";

  if (locMatch?.[1]) {
    const parts = locMatch[1].split(",");
    city = (parts[0] || "").trim();
    state = (parts[1] || "").trim();
  }

  return { hsname, city, state };
}

/**
 * Discover table columns safely
 */
async function getSchoolSuccessColumns(): Promise<Set<string>> {
  const { rows } = await query(
    `
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'school_success'
    `,
    []
  );

  return new Set(rows.map((r: any) => String(r.column_name)));
}

function pick(cols: Set<string>, name: string) {
  return cols.has(name) ? name : null;
}

export async function GET(req: NextRequest) {
  const cors = buildCorsHeaders(req);

  try {
    const { searchParams } = new URL(req.url);

    const qRaw = (searchParams.get("q") || "").trim();
    const stateRaw = (searchParams.get("state") || "").trim().toUpperCase(); // "CA"
    const cityRaw = (searchParams.get("city") || "").trim();
    const limit = Math.min(
      Math.max(parseInt(searchParams.get("limit") || "25", 10), 1),
      50
    );

    const cols = await getSchoolSuccessColumns();

    // Core columns
    const COL_HSID = pick(cols, "hsid") || "hsid";
    const COL_LOOKUP = pick(cols, "hs_lookup_key");
    const COL_HIGH_SCHOOL = pick(cols, "high_school");
    const COL_HSNAME = pick(cols, "hsname");
    const COL_CITYNAME = pick(cols, "cityname");
    const COL_REGIONNAME = pick(cols, "regionname");
    const COL_REGIONID = pick(cols, "regionid");
    const COL_HSLOCATION = pick(cols, "hslocation");

    // URLs
    const COL_STAGING_URL = pick(cols, "staging_url");
    const COL_MICROSITE_URL = pick(cols, "microsite_url");

    // Metrics
    const COL_ACTIVE = pick(cols, "current_active_alumni");
    const COL_MLB = pick(cols, "mlb_players_produced");
    const COL_NAT_RANK = pick(cols, "yatstats_national_rank");
    const COL_STATE_RANK = pick(cols, "yatstats_state_rank");

    const selectCols = [
      `${COL_HSID} AS hsid`,
      COL_LOOKUP && `${COL_LOOKUP} AS hs_lookup_key`,
      COL_HIGH_SCHOOL && `${COL_HIGH_SCHOOL} AS high_school`,
      COL_HSNAME && `${COL_HSNAME} AS hsname`,
      COL_CITYNAME && `${COL_CITYNAME} AS cityname`,
      COL_REGIONNAME && `${COL_REGIONNAME} AS regionname`,
      COL_REGIONID && `${COL_REGIONID} AS regionid`,
      COL_HSLOCATION && `${COL_HSLOCATION} AS hslocation`,
      COL_STAGING_URL && `${COL_STAGING_URL} AS staging_url`,
      COL_MICROSITE_URL && `${COL_MICROSITE_URL} AS microsite_url`,
      COL_ACTIVE && `${COL_ACTIVE} AS current_active_alumni`,
      COL_MLB && `${COL_MLB} AS mlb_players_produced`,
      COL_NAT_RANK && `${COL_NAT_RANK} AS yatstats_national_rank`,
      COL_STATE_RANK && `${COL_STATE_RANK} AS yatstats_state_rank`,
    ].filter(Boolean);

    const where: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (qRaw) {
      const parts: string[] = [];
      if (COL_LOOKUP) parts.push(`hs_lookup_key ILIKE $${idx}`);
      if (COL_HSNAME) parts.push(`hsname ILIKE $${idx}`);
      if (COL_HIGH_SCHOOL) parts.push(`high_school ILIKE $${idx}`);
      where.push(`(${parts.join(" OR ")})`);
      params.push(`%${qRaw}%`);
      idx++;
    }

    if (stateRaw) {
      if (COL_REGIONID) {
        where.push(`regionid = $${idx}`);
        params.push(stateRaw);
        idx++;
      } else if (COL_LOOKUP) {
        where.push(`hs_lookup_key ILIKE $${idx}`);
        params.push(`%,${stateRaw})%`);
        idx++;
      }
    }

    if (cityRaw) {
      if (COL_CITYNAME) {
        where.push(`cityname ILIKE $${idx}`);
        params.push(`%${cityRaw}%`);
        idx++;
      } else if (COL_LOOKUP) {
        where.push(`hs_lookup_key ILIKE $${idx}`);
        params.push(`%(${cityRaw},%`);
        idx++;
      }
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const orderSql = COL_NAT_RANK
      ? `ORDER BY yatstats_national_rank ASC NULLS LAST`
      : `ORDER BY hs_lookup_key ASC NULLS LAST`;

    const sql = `
      SELECT ${selectCols.join(", ")}
      FROM school_success
      ${whereSql}
      ${orderSql}
      LIMIT ${limit}
    `;

    const { rows } = await query(sql, params);

    const programs = rows.map((r: any) => {
      const parsed = parseLookupKey(r.hs_lookup_key || "");

      return {
        hsid: r.hsid,
        hsname: r.hsname || r.high_school || parsed.hsname,
        city: r.cityname || parsed.city,
        state: r.regionid || parsed.state,
        hslocation:
          r.hslocation ||
          (parsed.city && parsed.state
            ? `${parsed.city}, ${parsed.state}`
            : null),
        staging_url: r.staging_url ?? null,
        microsite_url: r.microsite_url ?? null,
        current_active_alumni: r.current_active_alumni ?? null,
        mlb_players_produced: r.mlb_players_produced ?? null,
        yatstats_national_rank: r.yatstats_national_rank ?? null,
        yatstats_state_rank: r.yatstats_state_rank ?? null,
        players_endpoint: `/api/players/${r.hsid}`,
      };
    });

    return NextResponse.json(
      { programs },
      { status: 200, headers: { ...cors, "Cache-Control": "no-store" } }
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: "Server error", message: err?.message },
      { status: 500, headers: buildCorsHeaders(req) }
    );
  }
}
