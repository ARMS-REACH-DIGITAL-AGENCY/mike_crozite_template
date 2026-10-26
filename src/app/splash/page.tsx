// Dedicated school splash replay. This route is intentionally independent
// of the school gallery's cached layout and its first-visit cookie.
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import SchoolSplash from '@/components/yatstats/shell/SchoolSplash';
import { getSchoolByUrl } from '@/lib/db';
import { getSchoolCrestUrl } from '@/lib/schoolAssets';
import { formatSchoolName } from '@/lib/playerUtils';
import { getTitlePartner } from '@/lib/titlePartners';
import { getSplashSponsor } from '@/lib/splashSponsors';
import splashFeaturedPlayers from '@/config/splash-featured-players.json';

export const runtime = 'nodejs';
export const preferredRegion = 'iad1';
export const dynamic = 'force-dynamic';

export default async function SplashReplayPage() {
  const requestHeaders = await headers();
  const host = (requestHeaders.get('x-yat-splash-school-host') || requestHeaders.get('x-forwarded-host') || requestHeaders.get('host') || '').split(':')[0].toLowerCase();
  // Temporary diagnosis: hostnames only; never log cookies, authorization or query values.
  console.info('[splash-replay] request host', { host, original: requestHeaders.get('host'), forwarded: requestHeaders.get('x-forwarded-host'), preserved: requestHeaders.get('x-yat-splash-school-host') });
  if (!/^(?:[a-z0-9-]+\.[a-z]{2}|[1-9][0-9]*)\.yatstats\.com$/.test(host)) notFound();

  const school = await getSchoolByUrl('https://' + host) as Record<string, unknown> | null;
  if (!school) notFound();

  const hsid = String(school.hsid || '');
  if (!/^[1-9][0-9]*$/.test(hsid)) notFound();
  const featured = (splashFeaturedPlayers as Record<string, {
    ids: string[];
    confirmedCutouts?: string[];
    details?: Record<string, { name: string; team: string }>;
  }>)[hsid];

  return (
    <SchoolSplash
      previewMode
      schoolId={hsid}
      crestUrl={getSchoolCrestUrl(hsid)}
      schoolName={formatSchoolName(String(school.hsname || ''))}
      location={String(school.hslocation || '').trim().replace(/\s*,\s*/, ', ')}
      featuredPlayerIds={featured?.ids ?? []}
      confirmedCutoutIds={featured?.confirmedCutouts ?? []}
      featuredPlayerDetails={featured?.details ?? {}}
      partner={getSplashSponsor(hsid) ?? getTitlePartner(hsid)}
    />
  );
}
