// src/components/yatstats/GlobalSearchModal.tsx
// Global school search modal overlay.
// The #openSearch button that triggers this modal lives in HeroHeader via GlobalSearchModal.
// This component renders both the header action buttons (right side of hero) and the
// full-screen modal overlay. Both are included in a fragment so HeroHeader can place
// the buttons inline while the fixed-position modal sits naturally anywhere in the tree.

export default function GlobalSearchModal() {
  return (
    <>
      {/* Right-side header action buttons */}
      <div className="yat-hero-right">
        <button id="openSearch" className="yat-icon-btn" aria-label="Open global school search">
          <i className="ri-search-line" />
        </button>
        <button id="openFilters" className="yat-icon-btn" aria-label="Open filters">
          <i className="ri-filter-3-line" />
        </button>
        <button id="filtersReset2" className="yat-icon-btn" aria-label="Reset filters">
          <i className="ri-restart-line" />
        </button>
      </div>

      {/* ── GLOBAL SEARCH MODAL ───────────────────────────────────────────── */}
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
    </>
  );
}
