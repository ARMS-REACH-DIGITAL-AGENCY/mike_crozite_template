// https://sitemaps.yatstats.com/sitemaps/school/<hsid>.xml - one live school's hub
// and its Active Alumni player profiles, on the school's own subdomain.
import { getLiveSchools, getSitemapPlayers, schoolSitemapEntries, urlSetXml, xmlResponse } from '@/lib/sitemap';

export const revalidate = 86400;

export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const hsid = (file.match(/^([1-9]\d*)\.xml$/) || [])[1];
  if (!hsid) return new Response('Not found', { status: 404 });
  try {
    const schools = await getLiveSchools();
    const school = schools.find((s) => s.hsid === hsid);
    if (!school || school.retiredInto) return new Response('Not found', { status: 404 });
    const twinSchools = schools.filter((s) => s.retiredInto === hsid);
    const [players, ...twinPlayers] = await Promise.all([
      getSitemapPlayers(hsid),
      ...twinSchools.map((t) => getSitemapPlayers(t.hsid)),
    ]);
    const twins = twinSchools.map((t, i) => ({ school: t, players: twinPlayers[i] }));
    return xmlResponse(urlSetXml(schoolSitemapEntries(school, players, twins)));
  } catch {
    return new Response('Sitemap temporarily unavailable', { status: 503, headers: { 'Retry-After': '3600' } });
  }
}
