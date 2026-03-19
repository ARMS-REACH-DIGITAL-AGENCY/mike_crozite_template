
// src/components/yatstats/shell/GlobalTopbar.tsx
// Renders Row 1 of the shared shell.

export default function GlobalTopbar() {
  return (
    <div className="yat-topbar">
      <div className="yat-left-icons">
        <button id="btnMenu" className="yat-icon-btn" aria-label="Open navigation">
          <i className="ri-menu-line" />
        </button>
        <button id="btnAccount" className="yat-icon-btn" aria-label="Open account drawer">
          <i className="ri-user-line" />
        </button>
        <button id="theme-toggle" className="yat-icon-btn" aria-label="Toggle light/dark theme">
          <i className="ri-sun-line" />
        </button>
      </div>

      <nav className="yat-topnav" aria-label="Top Navigation">
        <a href="#sec-active" className="yat-nav-pair" data-tab="active">
          <span className="thin">ACTIVE </span>
          <span className="bold">BASEBALL ALUMNI</span>
        </a>
        <a href="#sec-alltime" className="yat-nav-pair" data-tab="alltime">
          <span className="thin">NEXT-LEVEL </span>
          <span className="bold">ALL-TIME LIST</span>
        </a>
        <a href="#sec-news" className="yat-nav-pair" data-tab="news">
          <span className="thin">ACTIVE </span>
          <span className="bold">ALUMNI NEWS</span>
        </a>
        <a href="#sec-team" className="yat-nav-pair" data-tab="team">
          <span className="thin">CURRENT </span>
          <span className="bold">TEAM</span>
        </a>
        <a href="#sec-mentor" className="yat-nav-pair" data-tab="mentor">
          <span className="thin">MENTORSHIP </span>
          <span className="bold">MARKETPLACE</span>
        </a>
        <a href="#sec-partner" className="yat-nav-pair" data-tab="partner">
          <span className="thin">PCD ACTION </span>
          <span className="bold">PARTNER PROGRAM</span>
        </a>
        <a href="#sec-faq" className="yat-nav-pair" data-tab="faq">
          <span className="thin">FAQ&apos;S</span>
        </a>
      </nav>

      <div className="yat-wordmark-wrap">
        <a href="/" className="yat-wordmark-link" aria-label="YAT?STATS Home">
          <img className="yat-wordmark-img" src="/img/yatstats-logo.svg" alt="YAT?STATS" width="120" height="24" />
        </a>
      </div>
    </div>
  );
}
