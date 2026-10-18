// src/app/api/schools/search/route.ts
import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { ACTIVE_GALLERY_STATUSES } from "@/lib/galleryStatuses";
import { canonicalSchoolUrls } from "@/lib/schoolDirectoryRouting";
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

// Typing a state's name (or its two-letter code) lists every high school in
// that state: schools whose own name starts with what was typed first
// (Arizona College Prep, Arizona Lutheran Academy for "Arizona"), then the
// rest by active alumni, all-time next-level alumni, drafted out of high
// school, drafted overall, then A-Z.
const STATES: Record<string, string> = {
  alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA', colorado: 'CO', connecticut: 'CT',
  delaware: 'DE', 'district of columbia': 'DC', florida: 'FL', georgia: 'GA', hawaii: 'HI', idaho: 'ID', illinois: 'IL',
  indiana: 'IN', iowa: 'IA', kansas: 'KS', kentucky: 'KY', louisiana: 'LA', maine: 'ME', maryland: 'MD',
  massachusetts: 'MA', michigan: 'MI', minnesota: 'MN', mississippi: 'MS', missouri: 'MO', montana: 'MT',
  nebraska: 'NE', nevada: 'NV', 'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY',
  'north carolina': 'NC', 'north dakota': 'ND', ohio: 'OH', oklahoma: 'OK', oregon: 'OR', pennsylvania: 'PA',
  'rhode island': 'RI', 'south carolina': 'SC', 'south dakota': 'SD', tennessee: 'TN', texas: 'TX', utah: 'UT',
  vermont: 'VT', virginia: 'VA', washington: 'WA', 'west virginia': 'WV', wisconsin: 'WI', wyoming: 'WY',
};
const STATE_CODES = new Set(Object.values(STATES));

function stateFromQuery(q: string): string | null {
  const v = q.toLowerCase().replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();
  if (STATES[v]) return STATES[v];
  const code = v.toUpperCase();
  return code.length === 2 && STATE_CODES.has(code) ? code : null;
}

// Select bounded schools first. Never aggregate a full state's player history
// before responding to a search request.
async function schoolsInState(state: string, qRaw: string, limit: number) {
  const { rows } = await query(
    `SELECT s.hsid, s.hsname, s.cityname, s.hslocation, s.regionid,
            s.yatstats_national_rank, s.yatstats_state_rank,
            s.mlb, s.atnla, s.drafted_hs, s.drafted,
            s.microsite_url, s.bracket_seeding
       FROM school_success s
      WHERE s.regionid = $1 OR s.hsname ILIKE $2 OR s.high_school ILIKE $2
      ORDER BY (s.hsname ILIKE $2 OR s.high_school ILIKE $2) DESC,
               s.yatstats_national_rank ASC NULLS LAST,
               s.atnla DESC NULLS LAST,
               s.hsname ASC NULLS LAST
      LIMIT $3`,
    [state, `${qRaw}%`, limit],
  );
  return rows;
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: buildCorsHeaders(req) });
}

export async function GET(req: NextRequest) {
  const cors = buildCorsHeaders(req);
  try {
    const { searchParams } = new URL(req.url);
    // Direct selection by canonical TBC HSID for an uploaded school crest.
    const lookupHsid = (searchParams.get("hsid") || "").trim();
    if (/^\d+$/.test(lookupHsid)) {
      const { rows: schools } = await query(
        `SELECT hsid, hsname, hslocation, regionid, cityname
           FROM tbc_schools_raw WHERE hsid = $1::integer LIMIT 1`,
        [lookupHsid]
      );
      return NextResponse.json({ programs: schools }, { headers: { ...cors, "Cache-Control": "no-store" } });
    }
    const qRaw = (searchParams.get("q") || "").trim();
    const stateRaw = (searchParams.get("state") || "").trim().toUpperCase();
    const cityRaw = (searchParams.get("city") || "").trim();
    const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "25", 10), 1), 50);
    // IMPORTANT: correct table name
    const TABLE = "school_success";
    const sql = `
      SELECT
        hsid,
        hsname,
        cityname,
        hslocation,
        regionid,
        yatstats_national_rank,
        yatstats_state_rank,
        NULL::int AS current_aa,
        mlb,
        atnla,
        drafted_hs,
        drafted,
        microsite_url,
        bracket_seeding
      FROM ${TABLE}
      WHERE
        ($1::text = '' OR (
          hsname ILIKE $2 OR
          high_school ILIKE $2
        ))
        AND ($3::text = '' OR regionid = $3)
        AND ($4::text = '' OR cityname ILIKE $5)
      ORDER BY
        regionid ASC NULLS LAST,
        yatstats_national_rank ASC NULLS LAST,
        hsname ASC NULLS LAST
      LIMIT ${limit};
    `;
    const params = [
      qRaw,
      `%${qRaw}%`,
      stateRaw,
      cityRaw,
      `%${cityRaw}%`,
    ];
    const state = !stateRaw && !cityRaw ? stateFromQuery(qRaw) : null;
    const { rows } = state ? { rows: await schoolsInState(state, qRaw, limit) } : await query(sql, params);
    // Include player-linked schools absent from the ranking directory, without
    // expanding or delaying ordinary ranked results unnecessarily.
    const resultRows: any[] = [...rows];
    if (resultRows.length < limit && (qRaw || stateRaw || cityRaw)) {
      try {
        const { rows: extras } = await query(
          `SELECT t.hsid, t.hsname, t.cityname, t.hslocation, t.regionid,
                  NULL::int AS yatstats_national_rank,
                  NULL::text AS yatstats_state_rank,
                  NULL::int AS current_aa, NULL::int AS mlb,
                  NULL::int AS atnla, NULL::int AS drafted_hs,
                  NULL::int AS drafted, NULL::text AS microsite_url,
                  FALSE AS bracket_seeding
             FROM public.tbc_schools_raw t
            WHERE EXISTS (SELECT 1 FROM public.player_hsids p WHERE p.hsid = t.hsid)
              AND NOT EXISTS (SELECT 1 FROM public.school_success s WHERE s.hsid = t.hsid)
              AND ($1::text = '' OR t.regionid = $1)
              AND ($2::text = '' OR t.cityname ILIKE $2)
              AND ($3::boolean OR t.hsname ILIKE $4)
            ORDER BY t.hsname, t.hsid
            LIMIT $5`,
          [state || stateRaw, cityRaw ? `%${cityRaw}%` : '', Boolean(state), `%${qRaw}%`, limit - resultRows.length],
        );
        resultRows.push(...extras);
      } catch (error) {
        console.warn('[school-search] supplemental school lookup failed', error);
      }
    }
    // school_success is a ranking/directory source, not a complete ID registry.
    // Resolve its missing HSIDs against the canonical TBC school records.
    // Never guess an ID when name + city + state is ambiguous.
    const missingNames = Array.from(new Set(rows
      .filter((r: any) => !/^\d+$/.test(String(r.hsid ?? '').trim()))
      .map((r: any) => String(r.hsname ?? '').trim().toLowerCase())
      .filter(Boolean)));
    const schoolKey = (name: unknown, city: unknown, state: unknown) =>
      [name, city, state].map((v) => String(v ?? '').trim().toLowerCase()).join('|');
    const canonicalIds = new Map<string, Set<string>>();
    if (missingNames.length) {
      const { rows: matches } = await query(
        `SELECT hsid, hsname, cityname, regionid
           FROM tbc_schools_raw
          WHERE lower(trim(hsname)) = ANY($1::text[])
            AND hsid IS NOT NULL`,
        [missingNames]
      );
      for (const match of matches) {
        const key = schoolKey(match.hsname, match.cityname, match.regionid);
        if (!canonicalIds.has(key)) canonicalIds.set(key, new Set());
        canonicalIds.get(key)!.add(String(match.hsid));
      }
    }
    const resolvedRows = resultRows.map((row: any) => {
      if (/^\d+$/.test(String(row.hsid ?? '').trim())) return row;
      const key = schoolKey(row.hsname, row.cityname || String(row.hslocation ?? '').split(',')[0], row.regionid);
      const matches = canonicalIds.get(key);
      return { ...row, hsid: matches?.size === 1 ? Array.from(matches)[0] : null };
    });
    // Count alumni only for the small selected result set (not the state).
    const selectedIds = [...new Set(resolvedRows.map((r: any) => String(r.hsid || ''))
      .filter((id: string) => /^[1-9][0-9]*$/.test(id)))];
    const activeCounts = new Map<string, number>();
    if (selectedIds.length) {
      try {
        const { rows: countRows } = await query(
          `SELECT f.hsid::text AS hsid,
                  COUNT(DISTINCT f.playerid) FILTER (
                    WHERE COALESCE(NULLIF(UPPER(TRIM(f.status_label)), ''), 'UNKNOWN') = ANY($2::text[])
                  )::int AS current_aa
             FROM flip_card_front_stage f
            WHERE f.hsid = ANY($1::text[])
            GROUP BY f.hsid`,
          [selectedIds, [...ACTIVE_GALLERY_STATUSES]],
        );
        for (const row of countRows) activeCounts.set(String(row.hsid), Number(row.current_aa) || 0);
      } catch (error) {
        console.warn('[school-search] bounded count lookup failed; returning schools', error);
      }
    }
    // URL-ONLY ENRICHMENT START. Never filter, reorder, cap or append results here.
    // Keep the production query and alumni counts unchanged; only activate links.
    let derivedUrls = new Map<string, string>();
    try {
      // Canonical names are best-effort enrichment: never delay the fan's
      // school list indefinitely when the mapping query is slow.
      derivedUrls = await Promise.race([
        canonicalSchoolUrls(
          resolvedRows.filter((r: any) => !String(r.microsite_url || '').trim())
            .map((r: any) => String(r.hsid || '')),
          (sql, params = []) => query(sql, params),
        ),
        new Promise<Map<string, string>>((resolve) =>
          setTimeout(() => resolve(new Map()), 650),
        ),
      ]);
    } catch (error) {
      // A URL lookup failure must not erase a successful search result list.
      console.warn('[school-search] URL enrichment failed; preserving search results', error);
    }
    // URL-ONLY ENRICHMENT END.
    const programs = resolvedRows.map((r: any) => ({
      hsid: r.hsid ?? null,
      hsname: r.hsname ?? null,
      hslocation: r.hslocation ?? null,
      regionid: r.regionid ?? null,
      yatstats_national_rank: r.yatstats_national_rank ?? null,
      yatstats_state_rank: r.yatstats_state_rank ?? null,
      current_aa: activeCounts.get(String(r.hsid || '')) ?? r.current_aa ?? 0,
      mlb: r.mlb ?? null,
      atnla: r.atnla ?? null,
      drafted_hs: r.drafted_hs ?? null,
      drafted: r.drafted ?? null,
      drafted_ratio: r.drafted_hs && r.drafted ? `${r.drafted_hs}/${r.drafted}` : null,
      microsite_url: derivedUrls.get(String(r.hsid || '')) || r.microsite_url || (/^[1-9][0-9]*$/.test(String(r.hsid || '')) ? `https://${r.hsid}.yatstats.com` : null),
      bracket_eligible: Boolean(r.bracket_seeding),
    }));
    // Never direct two different HSIDs to the same named hostname.
    // A numeric school domain is always an unambiguous, working fallback.
    const owners = new Map<string, Set<string>>();
    for (const school of programs) {
      const url = String(school.microsite_url || '').trim().toLowerCase().replace(/\\/+$/, '');
      if (!url) continue;
      if (!owners.has(url)) owners.set(url, new Set());
      owners.get(url)!.add(String(school.hsid || ''));
    }
    for (const school of programs) {
      const url = String(school.microsite_url || '').trim().toLowerCase().replace(/\\/+$/, '');
      if (owners.get(url)?.size && owners.get(url)!.size > 1 && /^[1-9][0-9]*$/.test(String(school.hsid || ''))) {
        school.microsite_url = `https://${school.hsid}.yatstats.com`;
      }
    }
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
