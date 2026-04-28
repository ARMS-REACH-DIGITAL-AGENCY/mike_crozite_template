// src/components/yatstats/shell/GlobalTopbar.tsx
// Renders Row 1 of the shared shell

export default function GlobalTopbar() {
  return (
    <div className="yat-topbar">
      <div className="yat-topbar-left">
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

      <nav className="yat-topnav" aria-label="Desktop navigation">
        <a className="yat-topnav-item" data-tab="gallery" href="#sec-gallery">
          <span>WHERE THEY</span>
          <strong>YAT?</strong>
        </a>

        <a className="yat-topnav-item" data-tab="news" href="#sec-news">
          <span>ACTIVE ALUMNI</span>
          <strong>NEWS</strong>
        </a>

        <a className="yat-topnav-item" data-tab="alltime" href="#sec-alltime">
          <span>NEXT-LEVEL</span>
          <strong>ALL-TIME LIST</strong>
        </a>

        <a className="yat-topnav-item" data-tab="current" href="#sec-current">
          <span>2026</span>
          <strong>TEAM</strong>
        </a>

        <a className="yat-topnav-item" data-tab="fantasy" href="#sec-fantasy">
          <span>FANTASY</span>
          <strong>BRACKET</strong>
        </a>

        <a className="yat-topnav-item" data-tab="mentor" href="#sec-mentor">
          <span>MENTORSHIP</span>
          <strong>MARKETPLACE</strong>
        </a>

        <a className="yat-topnav-item" data-tab="partner" href="#sec-partner">
          <span>PARTNER</span>
          <strong>PROGRAM</strong>
        </a>

        <a className="yat-topnav-item" data-tab="about" href="#sec-about">
          <span>ABOUT</span>
          <strong>US</strong>
        </a>

        <a className="yat-topnav-item" data-tab="faq" href="#sec-faq">
          <strong>FAQ'S</strong>
        </a>
      </nav>

      <div className="yat-wordmark-wrap">
        <a
          id="topbarHomeCrestLink"
          href="#"
          aria-label="Go to my home school"
          className="yat-topbar-home-crest-link"
          hidden
        >
          <img
            id="topbarHomeCrestImg"
            src=""
            alt="My home school"
            className="yat-topbar-home-crest"
          />
        </a>

        <a href="https://yatstats.com" aria-label="Go to YAT?STATS homepage">
          <img
            src="https://yatstats-assets.s3.us-west-2.amazonaws.com/yatstats/yslogo.png"
            alt="YAT?STATS"
            className="yat-wordmark-img"
          />
        </a>
      </div>
    </div>
  );
}
