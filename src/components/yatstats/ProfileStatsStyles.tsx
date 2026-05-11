// src/components/yatstats/ProfileStatsStyles.tsx
// Profile-page stats tab visual refinement.
// This deliberately moves away from the oversized stat-card grid and toward a
// dense, readable, season-by-season baseball-card-back table inspired by TBC.

export default function ProfileStatsStyles() {
  return (
    <style>{`
      #playerFunZone #ppTab-stats {
        position: relative;
        color: #101010;
        background: #0b0b0b;
        padding: 10px 12px calc(var(--profile-tabs-h, 68px) + 14px);
        overflow-x: hidden;
      }

      /* The profile stats tab needs to lead with the actual year-by-year table,
         not a teaser grid. Hide all stat-card grids in this profile tab for now. */
      #playerFunZone #ppTab-stats .pp-stats-section:has(.pp-stats-grid) {
        display: none;
      }

      #playerFunZone #ppTab-stats .pp-stats-section {
        width: 100%;
        max-width: none;
        margin: 0 auto 12px;
        border: 1px solid #b8a55b;
        background: #e8e8e8;
        box-shadow: none;
      }

      #playerFunZone #ppTab-stats .pp-stats-bar {
        min-height: 26px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 6px 8px 5px;
        border-bottom: 1px solid #9b9b9b;
        background: #f5efad;
        color: #111;
        font-size: 0;
      }

      #playerFunZone #ppTab-stats .pp-stats-bar::before {
        content: "Want the stats? Full season-by-season record";
        color: #111;
        font: 700 12px/1 Arial, sans-serif;
        letter-spacing: 0;
        text-transform: none;
      }

      #playerFunZone #ppTab-stats .pp-stats-bar::after {
        content: "YAT?STATS Data View";
        color: #0a49c7;
        font: 700 12px/1 Arial, sans-serif;
        letter-spacing: 0;
        text-decoration: underline;
        text-transform: none;
      }

      #playerFunZone #ppTab-stats .pp-season-table-wrap {
        width: 100%;
        overflow-x: auto;
        overflow-y: visible;
        background: #e8e8e8;
        scrollbar-width: thin;
      }

      #playerFunZone #ppTab-stats .pp-season-table {
        width: 100%;
        min-width: 980px;
        border-collapse: collapse;
        border-spacing: 0;
        color: #050505;
        background: #e8e8e8;
        font: 700 12px/1.15 Arial, Helvetica, sans-serif;
        table-layout: auto;
      }

      #playerFunZone #ppTab-stats .pp-season-table thead th {
        position: sticky;
        top: 0;
        z-index: 2;
        padding: 3px 5px;
        border: 1px solid #111;
        background: #626262;
        color: #fff;
        font: 800 12px/1 Arial, Helvetica, sans-serif;
        letter-spacing: 0;
        text-transform: lowercase;
        text-align: left;
        white-space: nowrap;
      }

      #playerFunZone #ppTab-stats .pp-season-table thead th.num {
        text-align: right;
      }

      #playerFunZone #ppTab-stats .pp-season-table tbody td {
        padding: 3px 5px;
        border: 1px solid #111;
        background: #efefef;
        white-space: nowrap;
        color: #050505;
        font-variant-numeric: tabular-nums;
      }

      #playerFunZone #ppTab-stats .pp-season-table tbody tr:nth-child(even) td {
        background: #dcdcdc;
      }

      #playerFunZone #ppTab-stats .pp-season-table tbody tr:hover td {
        background: #d8edf5;
        color: #000;
      }

      #playerFunZone #ppTab-stats .pp-season-table tbody td:first-child {
        color: #111;
        font-weight: 900;
        letter-spacing: 0;
      }

      #playerFunZone #ppTab-stats .pp-season-table tbody td:nth-child(2) {
        max-width: 260px;
        overflow: hidden;
        text-overflow: ellipsis;
        color: #0645ad;
        text-decoration: underline;
      }

      #playerFunZone #ppTab-stats .pp-season-table tbody td:nth-child(3) {
        color: #0645ad;
        font-size: 12px;
        letter-spacing: 0;
        text-transform: none;
      }

      #playerFunZone #ppTab-stats .pp-season-table tbody td.num {
        text-align: right;
        color: #050505;
      }

      #playerFunZone #ppTab-stats .pp-season-table tbody td.num:nth-child(4),
      #playerFunZone #ppTab-stats .pp-season-table tbody td.num:nth-child(8) {
        background: rgba(159, 211, 222, .55);
      }

      #playerFunZone #ppTab-stats .pp-fz-placeholder {
        min-height: 260px;
        display: grid;
        place-items: center;
        text-align: center;
        color: rgba(255,255,255,.65);
      }

      @media (max-width: 860px) {
        #playerFunZone #ppTab-stats {
          padding: 8px 6px calc(var(--profile-tabs-h, 72px) + 12px);
        }

        #playerFunZone #ppTab-stats .pp-season-table {
          min-width: 880px;
          font-size: 11px;
        }

        #playerFunZone #ppTab-stats .pp-season-table thead th,
        #playerFunZone #ppTab-stats .pp-season-table tbody td {
          padding: 3px 4px;
          font-size: 11px;
        }
      }
    `}</style>
  );
}
