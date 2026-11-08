// https://yatstats.com/sitemaps/root.xml - the platform landing page.
import { SITEMAP_ROOT, urlSetXml, xmlResponse } from '@/lib/sitemap';

export const dynamic = 'force-static';

export function GET() {
  return xmlResponse(urlSetXml([{ loc: `${SITEMAP_ROOT}/` }]));
}
