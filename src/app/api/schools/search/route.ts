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

// Quote identifiers safely ("columnName")
function qi(ident: string) {
  return `"${String(ident).replace(/"/g, '""')}"`;
}

/**
 * Load all column names for public.school_success.
 */
async function getSchoolSuccessColumnNames(): Promise<string[]> {
  const { rows } = await query(
    `
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'school_success'
    ORDER BY ordinal_position
    `,
    []
  );

  return rows.map((r: any) => String(r.column_name));
}

/**
 * Fallback parser for strings like: "Hamilton (Chandler,AZ)"
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

export async function GET(req: NextRequest) {
  const cors = buildCorsHeaders(req);

  try {
    const { searchParams } = new URL(req.url);

    const qRaw = (searchParams.get("q") || "").trim();
    const stateRaw = (searchParams.get("state") || "").trim().toUpperCase();
    const cityRaw = (searchParams.get("city") || "").trim();
    const limit = Math.min(
      Math.max(parseInt(searchParams.get("limit") || "25", 10), 1),
      50
    );

    const allCols = await getSchoolSuccessColumnNames();

    // Exclude ONLY staging_url (per your requirement)
    const cols = allCols.filter((c) => c !== "staging_url");

    if (cols.length === 0) {
      return NextResponse.json(
        { error: "No columns found on public.school_success" },
        { status: 500, headers: { ...cors, "Cache-Control": "no-store" } }
      );
    }

    // Build SELECT list: "col" AS "col"
    const selectCols = cols.map((c) => `${qi(c)} AS ${qi(c)}`).join(", ");

    // We rely on these columns for filtering/derived fields if present
    const has = (name: string) => allCols.includes(name);

    const where: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (qRaw) {
      const parts: string[] = [];
      if (has("hs_lookup_key")) parts.push(`${qi("hs_lookup_key")} ILIKE $${idx}`);
      if (has("hsname")) parts.push(`${qi("hsname")} ILIKE $${idx}`);
      if (has("high_school")) parts.push(`${qi("high_school")} ILIKE $${idx}`);
      if (parts.length) {
        where.push(`(${parts.join(" OR ")})`);
        params.push(`%${qRaw}%`);
        idx++;
      }
    }

    if (stateRaw) {
      if (has("regionid")) {
        where.push(`${qi("regionid")} = $${idx}`);
        params.push(stateRaw);
        idx++;
      } else if (has("hs_lookup_key")) {
        where.push(`${qi("hs_lookup_key")} ILIKE $${idx}`);
        params.push(`%,${stateRaw})%`);
        idx++;
      }
    }

    if (cityRaw) {
      if (has("cityname")) {
        where.push(`${qi("cityname")} ILIKE $${idx}`);
        params.push(`%${cityRaw}%`);
        idx++;
      } else if (has("hs_lookup_key")) {
        where.push(`${qi("hs_lookup_key")} ILIKE $${idx}`);
        params.push(`%(${cityRaw},%`);
        idx++;
      }
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    // Prefer rank ordering if present
    const orderSql = has("yatstats_national_rank")
      ? `ORDER BY ${qi("yatstats_national_rank")} ASC NULLS LAST`
      : has("hs_lookup_key")
        ? `ORDER BY ${qi("hs_lookup_key")} ASC NULLS LAST`
        : "";

    const sql = `
      SELECT ${selectCols}
      FROM public.school_success
      ${whereSql}
      ${orderSql}
      LIMIT ${limit}
    `;

    const { rows } = await query(sql, params);

    const programs = rows.map((r: any) => {
      const lookup = r.hs_lookup_key || "";
      const parsed = parseLookupKey(lookup);

      // Return EVERY column (except staging_url which we never selected),
      // plus a couple convenience fields.
      return {
        ...r,
        // keep these convenience fields stable for the UI
        hsname: r.hsname || r.high_school || parsed.hsname,
        city: r.cityname || parsed.city || null,
        state: r.regionid || parsed.state || null,
        players_endpoint: r.hsid ? `/api/players/${r.hsid}` : null,
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
