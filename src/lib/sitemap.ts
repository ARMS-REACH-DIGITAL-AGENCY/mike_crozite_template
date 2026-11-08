// Sitemaps for search engines.
//
// One index at https://sitemaps.yatstats.com/sitemap.xml lists one child sitemap per
// school with linked players (curated or generated subdomain). Each child lists that
// school's hub and its Active Alumni player profiles on the school's own
// subdomain. The bare yatstats.com is a separate Vercel project (the
// landing page), so the index lives on sitemaps.yatstats.com, which the
// *.yatstats.com wildcard routes to this app. Every subdomain serves the same
// robots.txt, whose Sitemap line is Google's cross-site sitemap method; a Search Console Domain property for yatstats.com covers
// every subdomain as well.
//
// Crawl load: crawlers sweeping the microsites took the database down
// (Oct 11, 2026). Child sitemaps list only the Active Alumni the gallery
// already shows, not every all-time player, and both levels are cached for
// a day so a crawler reading sitemaps never touches the database twice.
import { unstable_cache } from 'next/cache';
import { query } from '@/lib/db';
import { ACTIVE_GALLERY_STATUSES } from '@/lib/galleryStatuses';
import { toPlayerSlug } from '@/lib/slug';
import { canonicalSchoolUrls } from '@/lib/schoolDirectoryRouting';

export const SITEMAP_ROOT = 'https://sitemaps.yatstats.com';
const SITEMAP_TTL_SECONDS = 60 * 60 * 24;

export type LiveSchool = { hsid: string; url: string; retiredInto?: string };

// Duplicate schools (Pete, Nov 2026): 72 schools appear twice in
// tbc_schools_raw with the same name and location under two hsids (TBC's own
// duplicate, e.g. Alleman, Rock Island IL = 3004 and 18030). One hsid per pair
// is kept: the one with more Active Alumni cards, then more cards overall, then
// the lower hsid. The other is retired: left out of the sitemap index, its
// active profiles listed in the kept school's sitemap, and its hub's canonical
// pointing to the kept school. The data itself is not changed.
// docs/duplicate-schools-2026-11.csv is the list sent to TBC.
export const getRetiredSchoolTwins = unstable_cache(async (): Promise<Record<string, string>> => {
  const { rows } = await query<{ retire: string; keep: string }>(`
    WITH d AS (
      SELECT t.hsid, t.hsname, t.hslocation,
        (SELECT COUNT(DISTINCT f.playerid) FROM public.flip_card_front_stage f
          WHERE f.hsid = t.hsid::text AND UPPER(TRIM(COALESCE(f.status_label, ''))) = 'ACTIVE') AS active,
        (SELECT COUNT(DISTINCT f.playerid) FROM public.flip_card_front_stage f WHERE f.hsid = t.hsid::text) AS cards
      FROM public.tbc_schools_raw t
      WHERE (t.hsname, t.hslocation) IN (
        SELECT hsname, hslocation FROM public.tbc_schools_raw GROUP BY 1, 2 HAVING COUNT(*) > 1)
    ), r AS (
      SELECT d.*, ROW_NUMBER() OVER (PARTITION BY hsname, hslocation ORDER BY active DESC, cards DESC, hsid) AS rk FROM d
    )
    SELECT a.hsid::text AS retire, k.hsid::text AS keep
      FROM r a JOIN r k ON k.hsname = a.hsname AND k.hslocation = a.hslocation AND k.rk = 1
     WHERE a.rk > 1
  `);
  return Object.fromEntries(rows.map((r) => [r.retire, r.keep]));
}, ['sitemap', 'retired-school-twins-v1'], { revalidate: SITEMAP_TTL_SECONDS, tags: ['sitemap'] });

/** A curated https://<school>.yatstats.com microsite URL, without a trailing slash; '' otherwise. */
export function normalizeMicrositeUrl(raw: unknown): string {
  const value = String(raw || '').trim();
  if (!value) return '';
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return '';
    const host = url.hostname.toLowerCase();
    if (!host.endsWith('.yatstats.com') || host === 'www.yatstats.com') return '';
    return `https://${host}`;
  } catch {
    return '';
  }
}

// Every school with linked players has a live subdomain (about 17,000 in
// Nov 2026), not only the ~1,000 with a curated school_success.microsite_url.
// canonicalSchoolUrls is the same resolver the player pages use: the curated
// URL wins, otherwise the generated <school>.<state>.yatstats.com hostname.
export const getLiveSchools = unstable_cache(async (): Promise<LiveSchool[]> => {
  const { rows } = await query<{ hsid: string }>(`
    SELECT hsid::text AS hsid FROM public.player_hsids
    UNION
    SELECT hsid::text FROM public.flip_card_front_stage
  `);
  const ids = rows.map((r) => r.hsid).filter((id) => /^[1-9]\d*$/.test(id) && Number(id) <= 2147483647);
  const [urls, twins] = await Promise.all([
    canonicalSchoolUrls(ids, (sql, params = []) => query(sql, params)),
    getRetiredSchoolTwins(),
  ]);
  const seen = new Set<string>();
  const schools: LiveSchool[] = [];
  for (const id of ids.sort((a, b) => Number(a) - Number(b))) {
    const url = normalizeMicrositeUrl(urls.get(id));
    if (!url || seen.has(id)) continue;
    seen.add(id);
    schools.push(twins[id] ? { hsid: id, url, retiredInto: twins[id] } : { hsid: id, url });
  }
  return schools;
}, ['sitemap', 'live-schools-v3'], { revalidate: SITEMAP_TTL_SECONDS, tags: ['sitemap'] });

export type SitemapPlayer = { playerId: string; slug: string; lastModified: string | null };

export const getSitemapPlayers = unstable_cache(async (hsid: string): Promise<SitemapPlayer[]> => {
  if (!/^\d+$/.test(hsid) || Number(hsid) > 2147483647) return [];
  const { rows } = await query<{ playerid: string; first_name: string | null; last_name: string | null; updated_at: Date | string | null }>(`
    SELECT DISTINCT ON (f.playerid::text)
           f.playerid::text AS playerid, f.first_name, f.last_name, f.updated_at
      FROM public.flip_card_front_stage f
     WHERE f.hsid::text = $1
       AND UPPER(TRIM(COALESCE(f.status_label, ''))) = ANY($2::text[])
     ORDER BY f.playerid::text, f.updated_at DESC NULLS LAST
  `, [hsid, [...ACTIVE_GALLERY_STATUSES]]);
  return rows
    .filter((row) => row.playerid)
    .map((row) => {
      const updated = row.updated_at ? new Date(row.updated_at) : null;
      return {
        playerId: String(row.playerid),
        slug: toPlayerSlug(row.first_name, row.last_name),
        lastModified: updated && !Number.isNaN(updated.getTime()) ? updated.toISOString() : null,
      };
    });
}, ['sitemap', 'school-players-v1'], { revalidate: SITEMAP_TTL_SECONDS, tags: ['sitemap'] });

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function sitemapIndexXml(locs: string[]): string {
  const body = locs.map((loc) => `  <sitemap><loc>${xmlEscape(loc)}</loc></sitemap>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</sitemapindex>\n`;
}

export function urlSetXml(entries: Array<{ loc: string; lastModified?: string | null }>): string {
  const body = entries.map(({ loc, lastModified }) =>
    `  <url><loc>${xmlEscape(loc)}</loc>${lastModified ? `<lastmod>${xmlEscape(lastModified)}</lastmod>` : ''}</url>`,
  ).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

function playerEntries(school: LiveSchool, players: SitemapPlayer[]) {
  return players.map((p) => ({
    loc: `${school.url}/${school.hsid}/player/${encodeURIComponent(p.playerId)}/${p.slug}`,
    lastModified: p.lastModified,
  }));
}

/** The kept school's hub and profiles, plus the profiles of any retired twin (on the twin's own host). */
export function schoolSitemapEntries(
  school: LiveSchool,
  players: SitemapPlayer[],
  twins: Array<{ school: LiveSchool; players: SitemapPlayer[] }> = [],
) {
  return [
    { loc: `${school.url}/` },
    ...playerEntries(school, players),
    ...twins.flatMap((t) => playerEntries(t.school, t.players)),
  ];
}

export function xmlResponse(xml: string, status = 200): Response {
  return new Response(xml, {
    status,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      // CDN keeps the file for a day; serve stale while refreshing.
      'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400',
    },
  });
}
