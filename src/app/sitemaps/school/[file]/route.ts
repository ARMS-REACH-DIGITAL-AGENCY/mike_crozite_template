// https://sitemaps.yatstats.com/sitemaps/school/<hsid>.xml - one live school's hub
// and its Active Alumni player profiles, on the school's own subdomain.
import { getLiveSchools, getSitemapPlayers, schoolSitemapEntries, urlSetXml, xmlResponse } from '@/lib/sitemap';

export const revalidate = 86400;

export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const hsid = (file.match(/^([1-9]\d*)\.xml$/) || [])[1];
  if (!hsid) return new Response('Not found', { status: 404 });
  try {
    const school = (await getLiveSchools()).find((s) => s.hsid === hsid);
    if (!school) return new Response('Not found', { status: 404 });
    const players = await getSitemapPlayers(hsid);
    return xmlResponse(urlSetXml(schoolSitemapEntries(school, players)));
  } catch {
    return new Response('Sitemap temporarily unavailable', { status: 503, headers: { 'Retry-After': '3600' } });
  }
}
