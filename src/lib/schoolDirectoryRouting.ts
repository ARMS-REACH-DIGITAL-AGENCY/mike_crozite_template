// Canonical school-domain routing. This module has no React or server-action
// imports so middleware and the Node routes can share hostname rules.
export type SchoolQuery = (
  sql: string,
  params?: unknown[],
) => Promise<{ rows: Record<string, unknown>[] }>;

// This has the same non-null HSID membership as player_hsids, including its
// per-player exclusions. Group repeated raw school text before normalizing it:
// expanding the player_hsids view in correlated EXISTS checks can time out.
export const PLAYER_LINKED_SCHOOLS_CTE = String.raw`
  routing_school_text_counts AS MATERIALIZED (
    SELECT high_school, COUNT(*) AS player_count
      FROM public.tbc_players_raw
     GROUP BY high_school
  ),
  routing_normalized_counts AS MATERIALIZED (
    SELECT REGEXP_REPLACE(LOWER(TRIM(high_school)), '[.\s]+', ' ', 'g') AS lookup_key,
           SUM(player_count) AS player_count
      FROM routing_school_text_counts
     GROUP BY 1
  ),
  routing_excluded_counts AS MATERIALIZED (
    SELECT x.hsid, COUNT(*) AS excluded_count
      FROM public.player_hsid_exclusion x
      JOIN public.tbc_players_raw p ON p.playerid = x.playerid
      JOIN public.tbc_schools_raw t ON t.hsid::text = x.hsid
     WHERE REGEXP_REPLACE(LOWER(TRIM(p.high_school)), '[.\s]+', ' ', 'g')
         = REGEXP_REPLACE(LOWER(TRIM(t.hs_lookup_key)), '[.\s]+', ' ', 'g')
     GROUP BY x.hsid
  ),
  player_linked_schools AS MATERIALIZED (
    SELECT t.hsid
      FROM public.tbc_schools_raw t
      JOIN routing_normalized_counts n
        ON n.lookup_key = REGEXP_REPLACE(LOWER(TRIM(t.hs_lookup_key)), '[.\s]+', ' ', 'g')
      LEFT JOIN routing_excluded_counts x ON x.hsid = t.hsid::text
     WHERE n.player_count > COALESCE(x.excluded_count, 0)
  )
`;

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
  | { type: 'named'; slug: string; state: string; city?: string }
  | { type: 'numeric'; hsid: string }
  | null {
  const h = normalizeSchoolHost(host);
  const numeric = h.match(/^([1-9][0-9]*)\.yatstats\.com$/);
  if (numeric && numeric[1].length <= 63) return { type: 'numeric', hsid: numeric[1] };
  // Pete's disambiguation format is SCHOOL.STATE.CITY.yatstats.com.
  const city = h.match(/^([a-z0-9]+(?:-[a-z0-9]+)*)\.([a-z]{2})\.([a-z0-9]+(?:-[a-z0-9]+)*)\.yatstats\.com$/);
  if (city && city[1].length <= 63 && city[3].length <= 63) {
    return { type: 'named', slug: city[1], state: city[2].toUpperCase(), city: city[3] };
  }
  const named = h.match(/^([a-z0-9]+(?:-[a-z0-9]+)*)\.([a-z]{2})\.yatstats\.com$/);
  if (named && named[1].length <= 63) {
    return { type: 'named', slug: named[1], state: named[2].toUpperCase() };
  }
  return null;
}

const PG_NAME_SLUG = (alias: string) =>
  `COALESCE(NULLIF(BTRIM(REGEXP_REPLACE(LOWER(${alias}.hsname), '[^a-z0-9]+', '-', 'g'), '-'), ''), 'school')`;

const PG_CITY_SLUG = (alias: string) =>
  `BTRIM(REGEXP_REPLACE(LOWER(COALESCE(${alias}.cityname, '')), '[^a-z0-9]+', '-', 'g'), '-')`;

const PG_STORED_HOST = (alias: string) =>
  `LOWER(REGEXP_REPLACE(REGEXP_REPLACE(BTRIM(${alias}.microsite_url), '^https?://', '', 'i'), '/+$', ''))`;

const VALID_NAMED_HOST_PATTERN = String.raw`^[a-z0-9]+(-[a-z0-9]+)*\.[a-z]{2}(\.[a-z0-9]+(-[a-z0-9]+)*)?\.yatstats\.com$`;

const LEGACY_HOSTS_CTE = `
  routing_legacy_hosts AS MATERIALIZED (
    SELECT hsid::text AS hsid, ${PG_STORED_HOST('s')} AS hostname
      FROM public.school_success s
     WHERE NULLIF(BTRIM(s.microsite_url), '') IS NOT NULL
  ),
  routing_valid_legacy_hosts AS MATERIALIZED (
    SELECT hsid, hostname FROM routing_legacy_hosts
     WHERE hostname ~ '${VALID_NAMED_HOST_PATTERN}'
       AND LENGTH(SPLIT_PART(hostname, '.', 1)) <= 63
       AND LENGTH(SPLIT_PART(hostname, '.', 3)) <= 63
  )
`;

function validStoredHostname(value: unknown): string {
  try {
    const text = String(value || '').trim();
    if (!text) return '';
    const url = new URL(text.includes('://') ? text : `https://${text}`);
    if (!/^https?:$/.test(url.protocol) || url.username || url.password ||
        !/^\/+$/.test(url.pathname) || url.search || url.hash || url.port) return '';
    return schoolHostnamePattern(url.hostname)?.type === 'named'
      ? url.hostname.toLowerCase() : '';
  } catch {
    return '';
  }
}

type DerivedSchool = {
  id: string;
  root: string;
  state: string;
  city: string;
  baseHost: string;
  cityHost: string;
  needsCity: boolean;
  cityIsUnique: boolean;
};

function suffixedSchoolHost(school: DerivedSchool, attempt = 0): string {
  // A numeric HSID always ends the generated label, so two suffixed schools
  // cannot collide with one another. Reserve natural and legacy hosts below.
  const suffix = `-${attempt ? `${attempt}-` : ''}${school.id}`;
  const root = school.root.slice(0, 63 - suffix.length).replace(/-+$/g, '') || 'school';
  const city = school.city && school.city.length <= 63 ? `.${school.city}` : '';
  return `${root}${suffix}.${school.state}${city}.yatstats.com`;
}

async function reservedSchoolHosts(hosts: string[], run: SchoolQuery) {
  const requested = [...new Set(hosts)];
  if (!requested.length) return { legacy: new Set<string>(), master: new Set<string>() };
  const result = await run(
    `/* school-reserved-hosts */
     WITH ${LEGACY_HOSTS_CTE}
     SELECT hostname, 'legacy' AS source
       FROM routing_valid_legacy_hosts
      WHERE hostname = ANY($1::text[])
     UNION
     SELECT ${PG_NAME_SLUG('t')} || '.' || LOWER(BTRIM(t.regionid)) || '.yatstats.com' AS hostname,
            'master' AS source
       FROM public.tbc_schools_raw t
      WHERE ${PG_NAME_SLUG('t')} || '.' || LOWER(BTRIM(t.regionid)) || '.yatstats.com'
            = ANY($1::text[])
     UNION
     SELECT ${PG_NAME_SLUG('t')} || '.' || LOWER(BTRIM(t.regionid)) || '.' ||
            ${PG_CITY_SLUG('t')} || '.yatstats.com' AS hostname, 'master' AS source
       FROM public.tbc_schools_raw t
      WHERE ${PG_CITY_SLUG('t')} <> ''
        AND ${PG_NAME_SLUG('t')} || '.' || LOWER(BTRIM(t.regionid)) || '.' ||
            ${PG_CITY_SLUG('t')} || '.yatstats.com' = ANY($1::text[])`,
    [requested],
  );
  const legacy = new Set<string>();
  const master = new Set<string>();
  for (const row of result.rows) {
    (row.source === 'legacy' ? legacy : master).add(String(row.hostname));
  }
  return { legacy, master };
}

/** Map player-linked schools, preserving only valid, single-owner legacy hosts.
 * Disambiguate by SCHOOL.STATE.CITY; use an HSID only when city is not enough.
 * Ambiguous old hosts stay reserved and fail closed.
 */
export async function canonicalSchoolUrls(
  ids: Array<string | number>,
  run: SchoolQuery,
): Promise<Map<string, string>> {
  const numericIds = [...new Set(ids.map(String).filter((x) => /^[1-9]\d*$/.test(x)))];
  if (!numericIds.length) return new Map();
  const slug = PG_NAME_SLUG('t');
  const result = await run(
    `/* school-canonical-candidates */
     WITH ${PLAYER_LINKED_SCHOOLS_CTE},
     ${LEGACY_HOSTS_CTE},
     name_counts AS MATERIALIZED (
       SELECT UPPER(BTRIM(other.regionid)) AS region_key,
              ${PG_NAME_SLUG('other')} AS name_slug,
              COUNT(*)::int AS same_state_name_count
         FROM public.tbc_schools_raw other
        GROUP BY 1, 2
     ),
     city_counts AS MATERIALIZED (
       SELECT UPPER(BTRIM(other.regionid)) AS region_key,
              ${PG_NAME_SLUG('other')} AS name_slug,
              ${PG_CITY_SLUG('other')} AS city_slug,
              COUNT(*)::int AS same_state_city_count
         FROM public.tbc_schools_raw other
        GROUP BY 1, 2, 3
     ),
     legacy_counts AS MATERIALIZED (
       SELECT hostname, COUNT(DISTINCT hsid)::int AS host_count
         FROM routing_valid_legacy_hosts
        GROUP BY hostname
     )
     SELECT t.hsid::text AS hsid, NULLIF(BTRIM(s.microsite_url), '') AS existing,
            t.regionid, t.cityname, ${slug} AS name_slug,
            ${PG_CITY_SLUG('t')} AS city_slug,
            COALESCE(n.same_state_name_count, 0) AS same_state_name_count,
            COALESCE(c.same_state_city_count, 0) AS same_state_city_count,
            COALESCE(l.host_count, 0) AS existing_host_count
       FROM public.tbc_schools_raw t
       JOIN player_linked_schools p ON p.hsid = t.hsid
       LEFT JOIN public.school_success s ON s.hsid = t.hsid
       LEFT JOIN name_counts n ON n.region_key = UPPER(BTRIM(t.regionid))
                             AND n.name_slug = ${slug}
       LEFT JOIN city_counts c ON c.region_key = UPPER(BTRIM(t.regionid))
                             AND c.name_slug = ${slug}
                             AND c.city_slug = ${PG_CITY_SLUG('t')}
       LEFT JOIN legacy_counts l ON l.hostname = ${PG_STORED_HOST('s')}
      WHERE t.hsid::text = ANY($1::text[])`,
    [numericIds],
  );

  const mapped = new Map<string, string>();
  const derived: DerivedSchool[] = [];
  for (const row of result.rows) {
    const id = String(row.hsid);
    const existingHost = validStoredHostname(row.existing);
    if (existingHost && Number(row.existing_host_count) === 1) {
      mapped.set(id, `https://${existingHost}`);
      continue;
    }
    const state = String(row.regionid || '').trim().toLowerCase();
    if (!/^[a-z]{2}$/.test(state)) continue;
    const root = schoolNameSlug(String(row.name_slug || 'school'));
    const city = String(row.city_slug || '');
    derived.push({
      id, root, state, city, baseHost: `${root}.${state}.yatstats.com`,
      cityHost: city ? `${root}.${state}.${city}.yatstats.com` : '',
      needsCity: Number(row.same_state_name_count) > 1 ||
        Boolean(existingHost && Number(row.existing_host_count) > 1),
      cityIsUnique: Boolean(city && city.length <= 63 && Number(row.same_state_city_count) === 1),
    });
  }
  const reserved = await reservedSchoolHosts(
    derived.flatMap((school) => [school.baseHost, school.cityHost, suffixedSchoolHost(school)]).filter(Boolean), run,
  );
  let pending: DerivedSchool[] = [];
  for (const school of derived) {
    const useCity = school.needsCity || reserved.legacy.has(school.baseHost);
    const useSuffix = school.root.length > 63 ||
      (useCity && (!school.cityIsUnique || reserved.legacy.has(school.cityHost)));
    const hostname = useSuffix ? suffixedSchoolHost(school) : useCity ? school.cityHost : school.baseHost;
    if (useSuffix && (reserved.legacy.has(hostname) || reserved.master.has(hostname))) {
      pending.push(school);
    } else {
      mapped.set(school.id, `https://${hostname}`);
    }
  }

  // A curated hostname or literal school name can itself end in another
  // school's HSID. Check the final generated candidate, not only its base.
  for (let attempt = 1; pending.length; attempt++) {
    if (attempt > 1000) throw new Error('Unable to allocate a unique school hostname');
    const candidates = pending.map((school) => suffixedSchoolHost(school, attempt));
    const taken = await reservedSchoolHosts(candidates, run);
    const next: DerivedSchool[] = [];
    pending.forEach((school, index) => {
      const hostname = candidates[index];
      if (taken.legacy.has(hostname) || taken.master.has(hostname)) next.push(school);
      else mapped.set(school.id, `https://${hostname}`);
    });
    pending = next;
  }
  return mapped;
}

/** Resolve one exact school hostname; never select an arbitrary duplicate. */
export async function resolveSchoolHsidFromHost(
  hostOrUrl: string,
  run: SchoolQuery,
): Promise<string | null> {
  const hostname = normalizeSchoolHost(hostOrUrl);
  const parsed = schoolHostnamePattern(hostname);
  if (!parsed) return null;
  if (parsed.type === 'numeric') {
    const result = await run(
      `/* school-numeric-host */
       WITH ${PLAYER_LINKED_SCHOOLS_CTE}
       SELECT hsid::text AS hsid FROM player_linked_schools
        WHERE hsid::text = $1
        LIMIT 1`,
      [parsed.hsid],
    );
    return result.rows.length ? String(result.rows[0].hsid) : null;
  }
  const legacy = await run(
    `/* school-legacy-host */
     WITH ${LEGACY_HOSTS_CTE}
     SELECT DISTINCT hsid FROM routing_valid_legacy_hosts
      WHERE hostname = $1
      LIMIT 2`,
    [hostname],
  );
  if (legacy.rows.length === 1) return String(legacy.rows[0].hsid);
  if (legacy.rows.length > 1) return null;

  const slug = PG_NAME_SLUG('t');
  const suffixHsid = parsed.slug.match(/-([1-9]\d*)$/)?.[1] || '';
  const { rows } = await run(
    `/* school-named-host-candidates */
     SELECT t.hsid::text AS hsid
       FROM public.tbc_schools_raw t
      WHERE UPPER(BTRIM(t.regionid)) = $1
        AND (${slug} = $2 OR t.hsid::text = $3)
        AND ($4::text = '' OR ${PG_CITY_SLUG('t')} = $4)
      LIMIT 30`,
    [parsed.state, parsed.slug, suffixHsid, parsed.city || ''],
  );
  if (!rows.length) return null;
  const urls = await canonicalSchoolUrls(rows.map((r) => String(r.hsid)), run);
  const exact = [...urls.entries()].filter(([, url]) => normalizeSchoolHost(url) === hostname);
  return exact.length === 1 ? exact[0][0] : null;
}
