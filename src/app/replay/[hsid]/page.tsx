// Reliable shared splash replay by school ID. No hostname lookup or gallery data.
import { notFound } from 'next/navigation';
import { getSchoolByHsid } from '@/lib/db';
import { getSchoolCrestUrl } from '@/lib/schoolAssets';
import { formatSchoolName } from '@/lib/playerUtils';
import { getTitlePartner } from '@/lib/titlePartners';
import { getSplashSponsor } from '@/lib/splashSponsors';
import SchoolSplash from '@/components/yatstats/shell/SchoolSplash';
import featuredPlayers from '@/config/splash-featured-players.json';

export const runtime = 'nodejs';
export const preferredRegion = 'iad1';
export const dynamic = 'force-dynamic';

export default async function ReplaySchoolSplash({ params }: { params: Promise<{ hsid: string }> }) {
  const { hsid } = await params;
  if (!/^[1-9][0-9]*$/.test(hsid) || Number(hsid) > 2147483647) notFound();

  const school = (await getSchoolByHsid(hsid)) as Record<string, unknown> | null;
  if (!school) notFound();
  const confirmedHsid = String(school.hsid || '');
  if (confirmedHsid !== hsid) notFound();
  const featured = (featuredPlayers as Record<string, {
    ids: string[];
    confirmedCutouts?: string[];
    details?: Record<string, { name: string; team: string }>;
  }>)[confirmedHsid];

  return (
    <SchoolSplash
      previewMode
      schoolId={confirmedHsid}
      crestUrl={getSchoolCrestUrl(confirmedHsid)}
      schoolName={formatSchoolName(String(school.hsname || ''))}
      location={String(school.hslocation || '').trim().replace(/\s*,\s*/, ', ')}
      featuredPlayerIds={featured?.ids ?? []}
      confirmedCutoutIds={featured?.confirmedCutouts ?? []}
      featuredPlayerDetails={featured?.details ?? {}}
      partner={getSplashSponsor(confirmedHsid) ?? getTitlePartner(confirmedHsid)}
    />
  );
}
