// src/components/yatstats/HeroHeader.tsx
// Gallery-only hero strip: promotional copy + gallery action buttons (filters, reset).
// The stable header chrome (topbar, wordmark, SchoolRow, dividers) is shell-owned by layout.tsx.

export default function HeroHeader() {
  return (
    <div className="yat-media-strip yat-hero">
      <div className="yat-container yat-hero-grid">
        <div className="yat-hero-left">
          <div className="yat-tag-duo">
            <div className="yat-tag-swap">
              <span className="yat-tag-grey">FLIP FOR </span>
              <span className="yat-tag-bold">STATS!</span>
            </div>
            <div className="yat-tag-swap">
              <span className="yat-tag-grey">WHERE THEY </span>
              <span className="yat-tag-bold">YAT?</span>
            </div>
          </div>
        </div>
        <div className="yat-hero-right">
          <button id="openFilters" className="yat-icon-btn" aria-label="Open filters">
            <i className="ri-filter-3-line" />
          </button>
          <button id="filtersReset2" className="yat-icon-btn" aria-label="Reset filters">
            <i className="ri-restart-line" />
          </button>
        </div>
      </div>
    </div>
  );
}
