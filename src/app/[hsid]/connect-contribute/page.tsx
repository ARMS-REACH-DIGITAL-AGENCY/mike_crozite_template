// <school>.yatstats.com/connect-contribute/ - the Connect & Contribute
// Portal's own page, inside the school's shell (topbar, drawers, row 2).
// The shell reads this path as the "mentor" section (SharedShell,
// YatInteractivity), so the section label and nav match it.

export async function generateMetadata() {
  return {
    title: 'Connect & Contribute Portal | YAT?STATS',
    description: 'Share photos, memories and news tips, request a personalized message from a player, and support a player or the school.',
  };
}

export default function ConnectContributePage() {
  return (
    <section id="sec-mentor" className="yat-section visible">
      <div className="yat-placeholder">
        <div className="yat-placeholder-title">CONNECT &amp; CONTRIBUTE PORTAL</div>
        <div className="yat-placeholder-body">
          Share photos, memories and news tips about your school&apos;s alumni, request a personalized
          message from a player, and support a player or the school. Coming soon.
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/img/connect-contribute-coming-soon.jpg"
          alt="Connect & Contribute Portal - Coming Soon. Real Players. Real Conversations. A Brighter Tomorrow."
          style={{ display: 'block', width: '100%', maxWidth: 560, height: 'auto', margin: '24px auto 0', borderRadius: 6 }}
        />
      </div>
    </section>
  );
}
