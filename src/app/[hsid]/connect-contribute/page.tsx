// The Connect & Contribute transaction desk. Everything on the school hub
// explains the community; this page simply routes visitors to the action.
// Do not load dozens of alumni photos here: the photo placement examples are
// lightweight visual previews, not another gallery.

import { getSchoolByHsid } from '@/lib/db';
import ContributeGuide from '@/components/yatstats/ContributeGuide';

export async function generateMetadata() {
  return {
    title: 'Connect & Contribute | YAT?STATS',
    description: 'Sponsor a school or player, upload missing baseball photos, send a news tip, add a missing alumnus, or correct the record.',
  };
}

export default async function ConnectContributePage({ params }: { params: Promise<{ hsid: string }> }) {
  const { hsid } = await params;
  const school = /^\d+$/.test(hsid)
    ? await getSchoolByHsid(hsid).catch(() => null)
    : null;
  const schoolName = String(school?.hsname || 'your school');

  return (
    <section id="sec-mentor" className="yat-section visible">
      <ContributeGuide schoolName={schoolName} />
    </section>
  );
}
