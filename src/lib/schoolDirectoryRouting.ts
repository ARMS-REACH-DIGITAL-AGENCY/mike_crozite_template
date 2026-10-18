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

/** Candidate schools must have linked players. Name collisions are checked
 * against the full master reference, including currently inactive schools.
 */
export async function canonicalSchoolUrls(
  ids: Array<string | number>,
  run: SchoolQuery,
): Promise<Map<string, string>> {
  const numericIds = [...new Set(ids.map(String).filter((x) => /^[1-9]\d*$/.test(x)))];
  if (!numericIds.length) return new Map();
  const slug = PG_NAME_SLUG('t');
  const otherSlug = PG_NAME_SLUG('other');
  // Resolve name collisions once for the batch, not one master-table scan
  // per result. This keeps the full production statewide result list intact.
  const sql = `
    WITH name_counts AS MATERIALIZED (
      SELECT UPPER(other.regionid) AS region_key, ${otherSlug} AS name_slug,
             COUNT(*)::int AS same_state_name_count
        FROM public.tbc_schools_raw other
       GROUP BY 1, 2
    )
    SELECT t.hsid::text AS hsid, NULLIF(BTRIM(s.microsite_url), '') AS existing,
           t.regionid, ${slug} AS name_slug,
           COALESCE(n.same_state_name_count, 0) AS same_state_name_count
    FROM public.tbc_schools_raw t
    LEFT JOIN public.school_success s ON s.hsid = t.hsid
    LEFT JOIN name_counts n ON n.region_key = UPPER(t.regionid)
                          AND n.name_slug = ${slug}
    WHERE t.hsid::text = ANY($1::text[])
      AND EXISTS (SELECT 1 FROM public.player_hsids p WHERE p.hsid = t.hsid)
  `;
  const result = await run(sql, [numericIds]);
  const rows = result.rows;
  const unclaimed = rows.filter((row) => !row.existing);
  const baseHosts = unclaimed.map((r) =>
    `https://${r.name_slug}.${String(r.regionid).toLowerCase()}.yatstats.com`);
  const claimed = new Set<string>();
  if (baseHosts.length) {
    const taken = await run(
      `SELECT LOWER(BTRIM(microsite_url, '/')) AS url
         FROM public.school_success
        WHERE LOWER(BTRIM(microsite_url, '/')) = ANY($1::text[])`,
      [baseHosts],
    );
    for (const row of taken.rows) claimed.add(String(row.url));
  }
  const mapped = new Map<string, string>();
  for (const r of rows) {
    const id = String(r.hsid);
    if (r.existing) {
      mapped.set(id, String(r.existing).replace(/\/+$/, ''));
      continue;
    }
    const state = String(r.regionid || '').toLowerCase();
    const root = String(r.name_slug);
    if (!/^[a-z]{2}$/.test(state)) continue;
    const base = `https://${root}.${state}.yatstats.com`;
    const needsId = Number(r.same_state_name_count) > 1 || claimed.has(base);
    mapped.set(id, `https://${root}${needsId ? `-${id}` : ''}.${state}.yatstats.com`);
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
         AND EXISTS (SELECT 1 FROM public.player_hsids p WHERE p.hsid = t.hsid)
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
    `SELECT t.hsid::text AS hsid
       FROM public.tbc_schools_raw t
      WHERE UPPER(t.regionid) = $1
        AND (${slug} = $2 OR ${slug} || '-' || t.hsid::text = $2)
        AND EXISTS (SELECT 1 FROM public.player_hsids p WHERE p.hsid=t.hsid)
      LIMIT 30`,
    [parsed.state, parsed.slug],
  );
  if (!rows.length) return null;
  const urls = await canonicalSchoolUrls(rows.map((r) => String(r.hsid)), run);
  const exact = [...urls.entries()].filter(([, url]) => normalizeSchoolHost(url) === hostname);
  return exact.length === 1 ? exact[0][0] : null;
}
