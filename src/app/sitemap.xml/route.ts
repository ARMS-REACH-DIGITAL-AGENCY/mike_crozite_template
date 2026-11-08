// https://yatstats.com/sitemap.xml - the sitemap index: one child sitemap
// per live school microsite. See src/lib/sitemap.ts.
import { getLiveSchools, sitemapIndexXml, SITEMAP_ROOT, xmlResponse } from '@/lib/sitemap';

export const revalidate = 86400;

export async function GET() {
  try {
    const schools = await getLiveSchools();
    return xmlResponse(sitemapIndexXml([
      `${SITEMAP_ROOT}/sitemaps/root.xml`,
      ...schools.map((s) => `${SITEMAP_ROOT}/sitemaps/school/${s.hsid}.xml`),
    ]));
  } catch {
    // Never cache an empty index when the database is unavailable.
    return new Response('Sitemap temporarily unavailable', { status: 503, headers: { 'Retry-After': '3600' } });
  }
}
