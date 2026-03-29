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
