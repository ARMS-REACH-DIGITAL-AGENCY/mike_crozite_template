// src/components/yatstats/HeroHeader.tsx
// Hero strip for the gallery page: "FLIP FOR STATS!" / "WHERE THEY YAT?" tag duo.
// The header, SchoolRow, drawers, and GS modal are owned by [hsid]/layout.tsx.

export default function HeroHeader() {
  return (
    <div className="yat-hero">
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
      </div>
    </div>
  );
}
