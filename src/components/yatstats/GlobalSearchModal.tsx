// src/components/yatstats/GlobalSearchModal.tsx
// Global school/player search modal overlay.
// Rendered once in layout.tsx (shell-owned).
// Opened by #btnSearch (shell topbar) or #openSearch (gallery hero strip).

export default function GlobalSearchModal() {
  return (
    <div id="gsModal" className="yat-gs-modal" role="dialog" aria-modal="true" aria-labelledby="gsTitle">
      <div className="yat-gs-overlay" id="gsOverlay" />
      <div className="yat-gs-panel">
        <div className="yat-gs-header">
          <div>
            <div className="yat-gs-title" id="gsTitle">Find a School or Player</div>
            <div className="yat-gs-sub">Browse schools and players across the YAT?STATS network</div>
          </div>
          <button id="gsClose" className="yat-icon-btn" aria-label="Close search" style={{ flexShrink: 0, marginLeft: "12px" }}>
            <i className="ri-close-line" />
          </button>
        </div>
        <div className="yat-gs-body">
          <div className="yat-gs-input-wrap">
            <i className="ri-search-line" aria-hidden="true" />
            <input
              id="gsInput"
              type="search"
              className="yat-gs-input"
              placeholder="Search by school or player…"
              autoComplete="off"
              aria-label="Search schools or players"
              aria-controls="gsResults"
              aria-autocomplete="list"
            />
          </div>
          <div id="gsResults" className="yat-gs-results" role="listbox" aria-label="Search results" aria-live="polite" aria-atomic="true" />
        </div>
      </div>
    </div>
  );
}
