// The Connect & Contribute transaction desk. Everything on the school hub
// explains the community; this page simply routes visitors to the action.
// Do not load dozens of alumni photos here: the photo placement examples are
// lightweight visual previews, not another gallery.

import { getSchoolByHsid, getSchoolByUrl } from '@/lib/db';
import { headers } from 'next/headers';
import ContributeGuide from '@/components/yatstats/ContributeGuide';
import ContributeShadcnPilot from '@/components/yatstats/ContributeShadcnPilot';
import '@/components/yatstats/ContributeShadcnPilot.css';

export async function generateMetadata() {
  return {
    title: 'Connect & Contribute | YAT?STATS',
    description: 'Sponsor a school or player, upload missing baseball photos, send a news tip, add a missing alumnus, or correct the record.',
  };
}

export default async function ConnectContributePage({
  params, searchParams,
}: {
  params: Promise<{ hsid: string }>;
  searchParams?: Promise<{ ui?: string | string[] }>;
}) {
  const { hsid } = await params;
  const query = searchParams ? await searchParams : {};
  const usePilot = query.ui === 'shadcn';
  const host = (await headers()).get('host') || '';
  const byId = /^\d+$/.test(hsid) ? await getSchoolByHsid(hsid).catch(() => null) : null;
  const school = byId || (host ? await getSchoolByUrl(`https://${host}`).catch(() => null) : null);
  const schoolName = String(school?.hsname || 'your school');

  return (
    <section id="sec-mentor" className="yat-section visible">
      {usePilot
        ? <ContributeShadcnPilot schoolName={schoolName} />
        : <ContributeGuide schoolName={schoolName} />}
    </section>
  );
}
