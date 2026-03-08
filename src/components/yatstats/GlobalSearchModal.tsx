// src/components/yatstats/GlobalSearchModal.tsx
// Hero inline search bar: input + close button + search/filter action buttons
// Note: the #heroSearchDrop dropdown container is rendered by HeroHeader (outside the grid)
// so it positions correctly via CSS position:absolute relative to .yat-hero.

export default function GlobalSearchModal() {
  return (
    <div className="yat-hero-right">
      <div id="heroSearchWrap" className="yat-inline-search">
        <input
          id="heroSearchInput"
          type="search"
          className="yat-hero-search-input"
          placeholder="Search players &amp; schools…"
          autoComplete="off"
        />
        <button id="heroSearchClose" className="yat-icon-btn" aria-label="Close search">
          <i className="ri-close-line" />
        </button>
      </div>
      <button id="openSearch" className="yat-icon-btn" aria-label="Open search">
        <i className="ri-search-line" />
      </button>
      <button id="openFilters" className="yat-icon-btn" aria-label="Open filters">
        <i className="ri-filter-3-line" />
      </button>
      <button id="filtersReset2" className="yat-icon-btn" aria-label="Reset filters">
        <i className="ri-restart-line" />
      </button>
    </div>
  );
}
