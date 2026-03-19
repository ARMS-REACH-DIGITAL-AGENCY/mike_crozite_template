
// src/components/yatstats/shell/GlobalTopbar.tsx
// Renders Row 1 of the shared shell - top navigation bar

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
      <div className="yat-topbar-logo">
        <a href="/">
          <img src="/img/yatstats-logo.svg" alt="YAT?STATS" />
        </a>
      </div>
      {/* The right side is empty in this design, but the container is here for balance */}
      <div className="yat-topbar-right"></div>
    </div>
  );
}
