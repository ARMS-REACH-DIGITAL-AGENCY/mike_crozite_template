// src/components/yatstats/ProfileStatsStyles.tsx
// Profile-page stats tab visual refinement.
// Purpose: make the default Stats FunZone read like a premium modern baseball-card back,
// while preserving the existing server-rendered season-by-season stat data.

export default function ProfileStatsStyles() {
  return (
    <style jsx global>{`
      /* ─────────────────────────────────────────────────────────────
         Player Profile Stats Tab: Baseball-card-back treatment
         Applies only to Block 5 / Profile FunZone stats content.
         ───────────────────────────────────────────────────────────── */

      #playerFunZone #ppTab-stats {
        position: relative;
        color: #f3eee4;
        background:
          radial-gradient(circle at 18% 0%, rgba(245, 200, 90, .16), transparent 26%),
          linear-gradient(180deg, rgba(19, 19, 18, .98), rgba(8, 8, 8, .98));
        padding: 14px 16px calc(var(--profile-tabs-h, 68px) + 18px);
        overflow-x: hidden;
      }

      #playerFunZone #ppTab-stats::before {
        content: "PLAYER STATS";
        position: absolute;
        top: 12px;
        right: 16px;
        z-index: 0;
        color: rgba(255,255,255,.035);
        font: 900 clamp(44px, 9vw, 104px)/.8 "Bebas Neue", Oswald, sans-serif;
        letter-spacing: .05em;
        pointer-events: none;
        white-space: nowrap;
      }

      #playerFunZone #ppTab-stats .pp-stats-section {
        position: relative;
        z-index: 1;
        max-width: 1240px;
        margin: 0 auto 14px;
        border: 1px solid rgba(245, 200, 90, .32);
        background:
          linear-gradient(90deg, rgba(255,255,255,.045), rgba(255,255,255,.018)),
          rgba(6,6,6,.82);
        box-shadow: 0 10px 28px rgba(0,0,0,.34);
      }

      #playerFunZone #ppTab-stats .pp-stats-section:first-child::before {
        content: "Season-by-season table below. Built for stat hounds, styled for fans.";
        display: block;
        padding: 8px 11px 0;
        color: rgba(255,255,255,.58);
        font: 700 10px/1.25 Oswald, sans-serif;
        letter-spacing: .12em;
        text-transform: uppercase;
      }

      #playerFunZone #ppTab-stats .pp-stats-bar {
        min-height: 32px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 8px 11px 7px;
        border-bottom: 1px solid rgba(245, 200, 90, .24);
        background:
          linear-gradient(90deg, rgba(245,200,90,.18), rgba(245,200,90,.04) 45%, transparent),
          rgba(0,0,0,.42);
        color: #f5c85a;
        font: 900 15px/1 "Bebas Neue", Oswald, sans-serif;
        letter-spacing: .12em;
        text-transform: uppercase;
      }

      #playerFunZone #ppTab-stats .pp-stats-bar::after {
        content: "YAT?STATS";
        color: rgba(255,255,255,.36);
        font: 800 9px/1 Oswald, sans-serif;
        letter-spacing: .18em;
      }

      #playerFunZone #ppTab-stats .pp-stats-grid {
        display: grid;
        grid-template-columns: repeat(6, minmax(0, 1fr));
        gap: 1px;
        padding: 1px;
        background: rgba(245,200,90,.14);
      }

      #playerFunZone #ppTab-stats .pp-stat-cell {
        min-height: 52px;
        display: grid;
        place-items: center;
        align-content: center;
        gap: 3px;
        padding: 8px 6px;
        background:
          linear-gradient(180deg, rgba(255,255,255,.07), rgba(255,255,255,.025)),
          #111;
        text-align: center;
      }

      #playerFunZone #ppTab-stats .pp-stat-label {
        color: rgba(245,200,90,.78);
        font: 800 9px/1 Oswald, sans-serif;
        letter-spacing: .14em;
        text-transform: uppercase;
      }

      #playerFunZone #ppTab-stats .pp-stat-val {
        color: #fff;
        font: 900 clamp(20px, 3vw, 34px)/.9 "Bebas Neue", Oswald, sans-serif;
        letter-spacing: .035em;
        text-shadow: 0 1px 0 rgba(0,0,0,.5);
      }

      #playerFunZone #ppTab-stats .pp-season-table-wrap {
        width: 100%;
        overflow-x: auto;
        overflow-y: visible;
        scrollbar-width: thin;
        background: #080808;
      }

      #playerFunZone #ppTab-stats .pp-season-table {
        width: 100%;
        min-width: 920px;
        border-collapse: separate;
        border-spacing: 0;
        color: #f4f4f4;
        font: 700 12px/1.25 Oswald, system-ui, sans-serif;
      }

      #playerFunZone #ppTab-stats .pp-season-table thead th {
        position: sticky;
        top: 0;
        z-index: 2;
        padding: 8px 8px;
        border-bottom: 1px solid rgba(245,200,90,.42);
        background:
          linear-gradient(180deg, #3a3a38, #242421);
        color: #fff7d7;
        font: 900 10px/1 Oswald, sans-serif;
        letter-spacing: .12em;
        text-transform: uppercase;
        text-align: left;
        white-space: nowrap;
      }

      #playerFunZone #ppTab-stats .pp-season-table thead th.num {
        text-align: right;
      }

      #playerFunZone #ppTab-stats .pp-season-table tbody td {
        padding: 6px 8px;
        border-bottom: 1px solid rgba(255,255,255,.08);
        border-right: 1px solid rgba(255,255,255,.045);
        background: rgba(255,255,255,.035);
        white-space: nowrap;
        color: rgba(255,255,255,.86);
      }

      #playerFunZone #ppTab-stats .pp-season-table tbody tr:nth-child(even) td {
        background: rgba(255,255,255,.07);
      }

      #playerFunZone #ppTab-stats .pp-season-table tbody tr:hover td {
        background: rgba(245,200,90,.14);
        color: #fff;
      }

      #playerFunZone #ppTab-stats .pp-season-table tbody td:first-child {
        color: #f5c85a;
        font-weight: 900;
        letter-spacing: .08em;
      }

      #playerFunZone #ppTab-stats .pp-season-table tbody td:nth-child(2) {
        max-width: 260px;
        overflow: hidden;
        text-overflow: ellipsis;
        color: #ffffff;
      }

      #playerFunZone #ppTab-stats .pp-season-table tbody td:nth-child(3) {
        color: rgba(245,200,90,.84);
        font-size: 11px;
        letter-spacing: .08em;
        text-transform: uppercase;
      }

      #playerFunZone #ppTab-stats .pp-season-table tbody td.num {
        text-align: right;
        font-variant-numeric: tabular-nums;
        color: rgba(255,255,255,.9);
      }

      #playerFunZone #ppTab-stats .pp-season-table tbody tr:last-child td {
        border-bottom: 0;
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
          padding: 10px 8px calc(var(--profile-tabs-h, 72px) + 14px);
        }

        #playerFunZone #ppTab-stats .pp-stats-grid {
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }

        #playerFunZone #ppTab-stats .pp-stat-cell {
          min-height: 48px;
        }

        #playerFunZone #ppTab-stats .pp-season-table {
          min-width: 820px;
          font-size: 11px;
        }
      }
    `}</style>
  );
}
