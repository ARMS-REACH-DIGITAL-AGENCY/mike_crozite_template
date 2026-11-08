// Sitemaps for search engines.
//
// One index at https://sitemaps.yatstats.com/sitemap.xml lists one child sitemap per
// live school microsite (school_success.microsite_url). Each child lists that
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

export const SITEMAP_ROOT = 'https://sitemaps.yatstats.com';
const SITEMAP_TTL_SECONDS = 60 * 60 * 24;

export type LiveSchool = { hsid: string; url: string };

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

export const getLiveSchools = unstable_cache(async (): Promise<LiveSchool[]> => {
  const { rows } = await query<{ hsid: string; microsite_url: string }>(`
    SELECT hsid::text AS hsid, microsite_url
      FROM public.school_success
     WHERE NULLIF(BTRIM(microsite_url), '') IS NOT NULL
     ORDER BY hsid
  `);
  const seen = new Set<string>();
  const schools: LiveSchool[] = [];
  for (const row of rows) {
    const url = normalizeMicrositeUrl(row.microsite_url);
    if (!url || !/^\d+$/.test(row.hsid) || seen.has(row.hsid)) continue;
    seen.add(row.hsid);
    schools.push({ hsid: row.hsid, url });
  }
  return schools;
}, ['sitemap', 'live-schools-v1'], { revalidate: SITEMAP_TTL_SECONDS, tags: ['sitemap'] });

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

export function schoolSitemapEntries(school: LiveSchool, players: SitemapPlayer[]) {
  return [
    { loc: `${school.url}/` },
    ...players.map((p) => ({
      loc: `${school.url}/${school.hsid}/player/${encodeURIComponent(p.playerId)}/${p.slug}`,
      lastModified: p.lastModified,
    })),
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
