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

async function getSchoolSuccessColumns(): Promise<string[]> {
  const { rows } = await query(
    `
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'school_success'
    ORDER BY ordinal_position
    `,
    []
  );

  return rows.map((r: any) => String(r.column_name));
}

function has(cols: Set<string>, name: string) {
  return cols.has(name);
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

    // 1) Discover all columns in school_success
    const allCols = await getSchoolSuccessColumns();
    const colSet = new Set(allCols);

    // 2) Exclude only staging_url (per your requirement)
    const colsToReturn = allCols.filter((c) => c !== "staging_url");

    // 3) Build SELECT list safely (simple identifier quoting)
    const selectSql = colsToReturn.map((c) => `"${c}"`).join(", ");

    // 4) Filters (only add conditions if the columns exist)
    const where: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (qRaw) {
      const parts: string[] = [];
      if (has(colSet, "hs_lookup_key")) parts.push(`hs_lookup_key ILIKE $${idx}`);
      if (has(colSet, "hsname")) parts.push(`hsname ILIKE $${idx}`);
      if (has(colSet, "high_school")) parts.push(`high_school ILIKE $${idx}`);
      if (has(colSet, "nickname")) parts.push(`nickname ILIKE $${idx}`);
      where.push(`(${parts.join(" OR ")})`);
      params.push(`%${qRaw}%`);
      idx++;
    }

    if (stateRaw) {
      if (has(colSet, "regionid")) {
        where.push(`regionid = $${idx}`);
        params.push(stateRaw);
        idx++;
      } else if (has(colSet, "hs_lookup_key")) {
        where.push(`hs_lookup_key ILIKE $${idx}`);
        params.push(`%,${stateRaw})%`);
        idx++;
      }
    }

    if (cityRaw) {
      if (has(colSet, "cityname")) {
        where.push(`cityname ILIKE $${idx}`);
        params.push(`%${cityRaw}%`);
        idx++;
      } else if (has(colSet, "hs_lookup_key")) {
        where.push(`hs_lookup_key ILIKE $${idx}`);
        params.push(`%(${cityRaw},%`);
        idx++;
      }
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    // Prefer your sort column if present, else national rank, else hsid
    const orderSql = has(colSet, "yatstats_master_sort")
      ? `ORDER BY yatstats_master_sort ASC NULLS LAST`
      : has(colSet, "yatstats_national_rank")
        ? `ORDER BY yatstats_national_rank ASC NULLS LAST`
        : has(colSet, "hsid")
          ? `ORDER BY hsid ASC`
          : "";

    // IMPORTANT: table name is school_success (not public_school_success)
    const sql = `
      SELECT ${selectSql}
      FROM school_success
      ${whereSql}
      ${orderSql}
      LIMIT ${limit}
    `;

    const { rows } = await query(sql, params);

    // Return everything (minus staging_url), exactly as table columns
    return NextResponse.json(
      { programs: rows },
      { status: 200, headers: { ...cors, "Cache-Control": "no-store" } }
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: "Server error", message: err?.message },
      { status: 500, headers: buildCorsHeaders(req) }
    );
  }
}