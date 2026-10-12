// <school>.yatstats.com/connect-contribute/ - the Connect & Contribute
// Portal's own page, inside the school's shell (topbar, drawers, row 2).
// The shell reads this path as the "mentor" section (SharedShell,
// YatInteractivity): row 3 is the shared strip with a circle per option,
// and this page is row 4, what each option is and why we need it.

import { getSchoolByHsid } from '@/lib/db';
import ContributeGuide from '@/components/yatstats/ContributeGuide';

export async function generateMetadata() {
  return {
    title: 'Connect & Contribute Portal | YAT?STATS',
    description: 'Send photos, update data, add missing next-level alumni and send news tips, connect with a player, or sponsor the page.',
  };
}

export default async function ConnectContributePage({ params }: { params: Promise<{ hsid: string }> }) {
  const { hsid } = await params;
  const school = /^\d+$/.test(hsid) ? ((await getSchoolByHsid(hsid).catch(() => null)) as Record<string, unknown> | null) : null;
  return (
    <section id="sec-mentor" className="yat-section visible">
      <ContributeGuide schoolName={String(school?.hsname || '')} />
    </section>
  );
}
