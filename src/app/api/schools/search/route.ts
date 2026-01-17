// src/app/api/schools/search/route.ts
import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

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

export async function GET(req: NextRequest) {
  const cors = buildCorsHeaders(req);

  try {
    const { searchParams } = new URL(req.url);

    const qRaw = (searchParams.get("q") || "").trim();
    const stateRaw = (searchParams.get("state") || "").trim().toUpperCase();
    const cityRaw = (searchParams.get("city") || "").trim();
    const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "25", 10), 1), 50);

    // IMPORTANT: correct table name
    const TABLE = "school_success";

    // Return everything you listed EXCEPT staging_url.
    // Note: "1024_microsites" must be quoted in SQL.
    const sql = `
      SELECT
        hs_lookup_key,
        high_school,
        hsid,
        yatstats_national_rank,
        yatstats_state_rank,
        "1024_microsites",
        microsite_url,
        yatstats_master_sort,
        hsname,
        nickname,
        current_aa,
        mlb,
        atnla,
        drafted_hs,
        drafted,
        hslocation,
        cityname,
        regionname,
        regionid,
        region,
        bracket_seeding
      FROM ${TABLE}
      WHERE
        ($1::text = '' OR (
          hs_lookup_key ILIKE $2 OR
          hsname ILIKE $2 OR
          high_school ILIKE $2
        ))
        AND ($3::text = '' OR regionid = $3)
        AND ($4::text = '' OR cityname ILIKE $5)
      ORDER BY
        yatstats_master_sort ASC NULLS LAST,
        yatstats_national_rank ASC NULLS LAST,
        hs_lookup_key ASC NULLS LAST
      LIMIT ${limit};
    `;

    const params = [
      qRaw,
      `%${qRaw}%`,
      stateRaw,
      cityRaw,
      `%${cityRaw}%`,
    ];

    const { rows } = await query(sql, params);

    const programs = rows.map((r: any) => {
      const parsed = parseLookupKey(r.hs_lookup_key || "");

      return {
        // identity / location
        hsid: r.hsid,
        hs_lookup_key: r.hs_lookup_key ?? null,
        high_school: r.high_school ?? null,
        hsname: r.hsname ?? r.high_school ?? parsed.hsname ?? null,
        nickname: r.nickname ?? null,
        cityname: r.cityname ?? parsed.city ?? null,
        regionid: r.regionid ?? parsed.state ?? null,
        regionname: r.regionname ?? null,
        region: r.region ?? null,
        hslocation:
          r.hslocation ??
          (parsed.city && parsed.state ? `${parsed.city}, ${parsed.state}` : null),

        // ranks / sorting
        yatstats_national_rank: r.yatstats_national_rank ?? null,
        yatstats_state_rank: r.yatstats_state_rank ?? null,
        yatstats_master_sort: r.yatstats_master_sort ?? null,
        bracket_seeding: r.bracket_seeding ?? null,

        // microsites
        microsite_url: r.microsite_url ?? null,
        microsites_1024: r["1024_microsites"] ?? null,

        // metrics you asked about
        current_aa: r.current_aa ?? null,
        mlb: r.mlb ?? null,
        atnla: r.atnla ?? null,
        drafted_hs: r.drafted_hs ?? null,
        drafted: r.drafted ?? null,

        // convenience
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
