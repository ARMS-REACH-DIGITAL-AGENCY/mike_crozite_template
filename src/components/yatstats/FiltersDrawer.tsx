// src/components/yatstats/FiltersDrawer.tsx
// Right-side filters drawer: by favorites, by name, by level, by graduating class.
// The "By My Favorites" section is hidden by default; YatInteractivity reveals it
// and stamps data-fav="true" on cards once the user's favorites are fetched.

interface FiltersDrawerProps {
  gradClasses: string[];
}

export default function FiltersDrawer({ gradClasses }: FiltersDrawerProps) {
  return (
    <aside className="yat-drawer yat-drawer-right" id="drawerFilters">
      <button className="yat-icon-btn yat-close-btn" id="closeFilters">
        <i className="ri-close-line" />
      </button>
      <h3>FILTERS</h3>
      <div className="yat-drawer-content" id="filters">

        {/* ── My Favorites toggle ─────────────────────────────────────────────
            Hidden until YatInteractivity fetches the user's favorites and
            stamps data-fav="true" on the matching yat-card elements.
            YatInteractivity removes the `display:none` style on this group
            once the fetch completes and at least one favorite exists.       */}
        <details className="yat-filter-group" id="filterFavsGroup" style={{ display: 'none' }}>
          <summary>By My Favorites</summary>
          <div className="yat-filter-options">
            <label>
              <input type="checkbox" id="filterFavs" value="favs" />{' '}
              Show my favorites only
            </label>
          </div>
        </details>

        <details className="yat-filter-group" open>
          <summary>By Name</summary>
          <div className="yat-filter-options">
            <input id="filterName" type="text" placeholder="Type a name…" />
          </div>
        </details>
        <details className="yat-filter-group">
          <summary>By Level</summary>
          <div className="yat-filter-options" id="filterLevels">
            {["MLB", "AAA", "AA", "A+", "A", "INDY", "NCAA", "JUCO", "NAIA"].map((l) => (
              <label key={l}>
                <input type="checkbox" value={l} /> {l}
              </label>
            ))}
          </div>
        </details>
        <details className="yat-filter-group">
          <summary>By Graduating Class</summary>
          <div className="yat-filter-options" id="filterGradClass">
            {gradClasses.map((yr) => (
              <label key={yr}>
                <input type="checkbox" value={yr} /> CLASS OF {yr}
              </label>
            ))}
          </div>
        </details>
      </div>
      <div className="yat-drawer-footer">
        <button
          id="filtersReset"
          className="yat-icon-btn"
          style={{ padding: "10px 14px", border: "1px solid var(--line)", borderRadius: "12px" }}
        >
          <i className="ri-restart-line" /> Reset Filters
        </button>
      </div>
    </aside>
  );
}
