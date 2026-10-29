// Canonical school-domain routing. This module intentionally has no React or
// server-action imports so Next.js 16 proxy and the API can use it.
// Existing curated microsite_url values always win.
export type SchoolQuery = (
  sql: string,
  params?: unknown[],
) => Promise<{ rows: Record<string, unknown>[] }>;

export function normalizeSchoolHost(input: string): string {
  try {
    const value = String(input || '').trim().toLowerCase();
    if (!value) return '';
    return new URL(value.includes('://') ? value : `https://${value}`).hostname;
  } catch {
    return '';
  }
}

export function schoolNameSlug(input: string): string {
  return String(input || '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'school';
}

export function schoolHostnamePattern(host: string):
  | { type: 'named'; slug: string; state: string }
  | { type: 'numeric'; hsid: string }
  | null {
  const h = normalizeSchoolHost(host);
  const numeric = h.match(/^([1-9][0-9]*)\.yatstats\.com$/);
  if (numeric) return { type: 'numeric', hsid: numeric[1] };
  const named = h.match(/^([a-z0-9]+(?:-[a-z0-9]+)*)\.([a-z]{2})\.yatstats\.com$/);
  if (named) return { type: 'named', slug: named[1], state: named[2].toUpperCase() };
  return null;
}

const PG_NAME_SLUG = (alias: string) =>
  `COALESCE(NULLIF(BTRIM(REGEXP_REPLACE(LOWER(${alias}.hsname), '[^a-z0-9]+', '-', 'g'), '-'), ''), 'school')`;

// City is the first human-readable disambiguator for duplicate names.
// Cityname is authoritative; hslocation supplies a fallback for legacy rows.
const PG_CITY_SLUG = (alias: string) =>
  `COALESCE(NULLIF(BTRIM(REGEXP_REPLACE(LOWER(COALESCE(NULLIF(BTRIM(${alias}.cityname), ''), NULLIF(BTRIM(SPLIT_PART(${alias}.hslocation, ',', 1)), ''), 'city')), '[^a-z0-9]+', '-', 'g'), '-'), ''), 'city')`;

/** Candidate schools must have linked players. Name collisions are checked
 * against the full master reference, including currently inactive schools.
 */
export async function canonicalSchoolUrls(
  ids: Array<string | number>,
  run: SchoolQuery,
): Promise<Map<string, string>> {
  // HSIDs are PostgreSQL integers. Oversized numeric input previously matched
  // no rows through text comparison; keep that behavior before casting the batch.
  const numericIds = [...new Set(ids.map(String).filter((x) =>
    /^[1-9]\d*$/.test(x) && Number(x) <= 2147483647))];
  if (!numericIds.length) return new Map();
  const slug = PG_NAME_SLUG('t');
  const otherSlug = PG_NAME_SLUG('other');
  const citySlug = PG_CITY_SLUG('t');
  const otherCitySlug = PG_CITY_SLUG('other');
  // player_hsids expands a normalized player/school-name join. Materialize the
  // requested linked IDs once so a correlated EXISTS cannot rescan all players
  // for every result. Keep collision checks against the full master reference.
  const sql = `
    WITH linked_schools AS MATERIALIZED (
      SELECT DISTINCT p.hsid
        FROM public.player_hsids p
       WHERE p.hsid = ANY($1::integer[])
      UNION
      -- First-party contributed players need a valid school hostname even
      -- when they have no legacy TBC/player_hsids association yet.
      SELECT DISTINCT t.hsid
        FROM public.tbc_schools_raw t
       WHERE t.hsid = ANY($1::integer[])
         AND EXISTS (
           SELECT 1 FROM public.flip_card_front_stage f
            WHERE f.hsid = t.hsid::text
         )
    ), name_counts AS MATERIALIZED (
      SELECT UPPER(other.regionid) AS region_key, ${otherSlug} AS name_slug,
             COUNT(*)::int AS same_state_name_count
        FROM public.tbc_schools_raw other
       GROUP BY 1, 2
    ), city_counts AS MATERIALIZED (
      SELECT UPPER(other.regionid) AS region_key, ${otherSlug} AS name_slug,
             ${otherCitySlug} AS city_slug,
             COUNT(*)::int AS same_name_city_count
        FROM public.tbc_schools_raw other
       GROUP BY 1, 2, 3
    )
    SELECT t.hsid::text AS hsid, NULLIF(BTRIM(s.microsite_url), '') AS existing,
           t.regionid, ${slug} AS name_slug, ${citySlug} AS city_slug,
           COALESCE(n.same_state_name_count, 0) AS same_state_name_count,
           COALESCE(c.same_name_city_count, 0) AS same_name_city_count
    FROM public.tbc_schools_raw t
    JOIN linked_schools linked ON linked.hsid = t.hsid
    LEFT JOIN public.school_success s ON s.hsid = t.hsid
    LEFT JOIN name_counts n ON n.region_key = UPPER(t.regionid)
                          AND n.name_slug = ${slug}
    LEFT JOIN city_counts c ON c.region_key = UPPER(t.regionid)
                          AND c.name_slug = ${slug}
                          AND c.city_slug = ${citySlug}
    WHERE t.hsid = ANY($1::integer[])
  `;
  const result = await run(sql, [numericIds]);
  const rows = result.rows;
  const unclaimed = rows.filter((row) => !row.existing);
  // Check both readable options against the original 1,024 and all other
  // curated URLs. Changing their established hostnames is not authorized.
  const candidates = new Set<string>();
  for (const r of unclaimed) {
    const state = String(r.regionid || '').toLowerCase();
    if (!/^[a-z]{2}$/.test(state)) continue;
    const root = String(r.name_slug);
    const city = String(r.city_slug || 'city');
    candidates.add(`https://${root}.${state}.yatstats.com`);
    candidates.add(`https://${root}-${city}.${state}.yatstats.com`);
  }
  const claimed = new Set<string>();
  if (candidates.size) {
    const taken = await run(
      `SELECT LOWER(BTRIM(microsite_url, '/')) AS url
         FROM public.school_success
        WHERE LOWER(BTRIM(microsite_url, '/')) = ANY($1::text[])`,
      [[...candidates]],
    );
    for (const row of taken.rows) claimed.add(String(row.url));
  }
  const mapped = new Map<string, string>();
  for (const r of rows) {
    const id = String(r.hsid);
    if (r.existing) {
      mapped.set(id, String(r.existing).replace(/\\/+$/, ''));
      continue;
    }
    const state = String(r.regionid || '').toLowerCase();
    const root = String(r.name_slug);
    const city = String(r.city_slug || 'city');
    if (!/^[a-z]{2}$/.test(state)) continue;
    const base = `https://${root}.${state}.yatstats.com`;
    const cityBase = `https://${root}-${city}.${state}.yatstats.com`;
    const needsCity = Number(r.same_state_name_count) > 1 || claimed.has(base);
    // Two records with identical name, city and state cannot be identified
    // uniquely by those public fields. Preserve both real HSIDs rather than
    // sending one school's fans to the other school's roster.
    const needsId = needsCity && (Number(r.same_name_city_count) > 1 || claimed.has(cityBase));
    let label = root + (needsCity ? `-${city}${needsId ? `-${id}` : ''}` : '');
    if (label.length > 63) {
      const suffix = `-${city}-${id}`;
      label = (root.slice(0, Math.max(1, 63 - suffix.length)).replace(/-+$/, '') || 'school') + suffix;
    }
    mapped.set(id, `https://${label}.${state}.yatstats.com`);
  }
  return mapped;
}

/** Resolves only one exact, existing canonical hostname. */
export async function resolveSchoolHsidFromHost(
  hostOrUrl: string,
  run: SchoolQuery,
): Promise<string | null> {
  const hostname = normalizeSchoolHost(hostOrUrl);
  const parsed = schoolHostnamePattern(hostname);
  if (!parsed) return null;
  if (parsed.type === 'numeric') {
    const result = await run(
      `SELECT t.hsid::text AS hsid FROM public.tbc_schools_raw t
       WHERE t.hsid::text = $1
         AND (
           EXISTS (SELECT 1 FROM public.player_hsids p WHERE p.hsid = t.hsid)
           OR EXISTS (SELECT 1 FROM public.flip_card_front_stage f WHERE f.hsid = t.hsid::text)
         )
       LIMIT 1`,
      [parsed.hsid],
    );
    return result.rows.length ? String(result.rows[0].hsid) : null;
  }
  const legacy = await run(
    `SELECT hsid::text AS hsid FROM public.school_success
      WHERE LOWER(BTRIM(microsite_url, '/')) = $1
      LIMIT 2`,
    [`https://${hostname}`],
  );
  if (legacy.rows.length === 1) return String(legacy.rows[0].hsid);
  if (legacy.rows.length > 1) return null;

  const slug = PG_NAME_SLUG('t');
  const { rows } = await run(
    `SELECT t.hsid::text AS hsid, ${slug} AS name_slug
       FROM public.tbc_schools_raw t
      WHERE UPPER(t.regionid) = $1
        AND (${slug} = $2 OR ${slug} || '-' || ${PG_CITY_SLUG('t')} = $2
             OR ${slug} || '-' || t.hsid::text = $2
             OR ${slug} || '-' || ${PG_CITY_SLUG('t')} || '-' || t.hsid::text = $2)
        AND (
          EXISTS (SELECT 1 FROM public.player_hsids p WHERE p.hsid = t.hsid)
          OR EXISTS (SELECT 1 FROM public.flip_card_front_stage f WHERE f.hsid = t.hsid::text)
        )
      LIMIT 30`,
    [parsed.state, parsed.slug],
  );
  if (!rows.length) return null;
  const urls = await canonicalSchoolUrls(rows.map((r) => String(r.hsid)), run);
  const exact = [...urls.entries()].filter(([, url]) => normalizeSchoolHost(url) === hostname);
  if (exact.length === 1) return exact[0][0];
  // Previously shared name-HSID links remain valid legacy aliases. The API
  // resolver can 308-redirect them to the city-based canonical hostname.
  const aliases = rows.filter((r) => `${r.name_slug}-${r.hsid}` === parsed.slug);
  return aliases.length === 1 ? String(aliases[0].hsid) : null;
}
