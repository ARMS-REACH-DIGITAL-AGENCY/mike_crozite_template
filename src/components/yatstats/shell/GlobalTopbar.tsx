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

      <div className="yat-wordmark-wrap">
        {/*
          Home school crest — shown to the LEFT of the YAT?STATS logo when the user
          is logged in and has a home_hsid. Hidden by default (hidden attribute);
          YatInteractivity.tsx populates src + href and removes the hidden attribute
          once the user profile is loaded from the session.
        */}
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

      <div className="yat-topbar-right" />
    </div>
  );
}
