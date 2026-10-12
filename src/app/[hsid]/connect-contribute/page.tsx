// <school>.yatstats.com/connect-contribute/ - the Connect & Contribute
// Portal's own page, inside the school's shell (topbar, drawers, row 2).
// The shell reads this path as the "mentor" section (SharedShell,
// YatInteractivity), so the section label and nav match it.

import ContributeButtons from '@/components/yatstats/ContributeButtons';

export async function generateMetadata() {
  return {
    title: 'Connect & Contribute Portal | YAT?STATS',
    description: 'Share photos, memories and news tips, request a personalized message from a player, and support a player or the school.',
  };
}

export default function ConnectContributePage() {
  return (
    <section id="sec-mentor" className="yat-section visible">
      <div className="yat-placeholder" style={{ textAlign: 'left', maxWidth: 980, margin: '0 auto' }}>
        <div className="yat-placeholder-title">CONNECT &amp; CONTRIBUTE PORTAL</div>
        <div className="yat-placeholder-body">
          YAT?STATS is built by the people who know these players best: their families, coaches,
          teammates and fans. See a silhouette where a photo should be, a stat we missed, or a player
          who isn&apos;t here? Send it in. We review everything before it goes on the site.
        </div>
        <ContributeButtons />
      </div>
    </section>
  );
}
