'use client';

export default function ProfileFunZoneCleanupStyles() {
  return (
    <style jsx global>{`
      #playerFunZone #ppTab-stats .psi-player-info {
        display: none !important;
      }

      /* Keep exactly one tab indicator: kill all BEFORE lines, and only allow AFTER on the active tab. */
      #playerFunZone .pp-fz-tab::before,
      #playerFunZone .pp-fz-tab-default::before {
        content: none !important;
        display: none !important;
        opacity: 0 !important;
      }

      #playerFunZone .pp-fz-tab:not(.pp-fz-tab-active)::after,
      #playerFunZone .pp-fz-tab-default:not(.pp-fz-tab-active)::after {
        content: none !important;
        display: none !important;
        opacity: 0 !important;
      }

      #playerFunZone .pp-fz-tabs {
        display: grid !important;
        grid-template-columns: repeat(6, minmax(0, 1fr)) !important;
        align-items: center !important;
        justify-items: center !important;
        width: 100% !important;
      }

      #playerFunZone .pp-fz-tab {
        width: 100% !important;
        min-width: 0 !important;
        align-items: center !important;
        justify-content: center !important;
        text-align: center !important;
        gap: 3px !important;
        padding-left: 0 !important;
        padding-right: 0 !important;
      }

      #playerFunZone .pp-fz-tab i {
        font-size: 19px !important;
        line-height: 1 !important;
      }

      #playerFunZone .pp-fz-tab span {
        font-size: 10px !important;
        line-height: 1 !important;
      }

      /* Stats grid: Excel-style auto-fit widths and exact header/body alignment. */
      #playerFunZone #ppTab-stats .psi-table {
        table-layout: auto !important;
        width: max-content !important;
        min-width: max-content !important;
        border-collapse: separate !important;
      }

      #playerFunZone #ppTab-stats .psi-table th,
      #playerFunZone #ppTab-stats .psi-table td {
        width: auto !important;
        min-width: max-content !important;
        max-width: none !important;
        white-space: nowrap !important;
        box-sizing: border-box !important;
      }

      #playerFunZone #ppTab-stats .psi-table th button {
        width: 100% !important;
        display: flex !important;
        box-sizing: border-box !important;
      }

      #playerFunZone #ppTab-stats .psi-table th:not(.year):not(.team):not(.level):not(.org_conf):not(.age):not(.posit) {
        text-align: right !important;
      }

      #playerFunZone #ppTab-stats .psi-table th:not(.year):not(.team):not(.level):not(.org_conf):not(.age):not(.posit) button {
        justify-content: flex-end !important;
        text-align: right !important;
      }

      #playerFunZone #ppTab-stats .psi-table th.year,
      #playerFunZone #ppTab-stats .psi-table th.level,
      #playerFunZone #ppTab-stats .psi-table th.age,
      #playerFunZone #ppTab-stats .psi-table td[data-key="year"],
      #playerFunZone #ppTab-stats .psi-table td[data-key="level"],
      #playerFunZone #ppTab-stats .psi-table td[data-key="age"] {
        text-align: center !important;
      }

      #playerFunZone #ppTab-stats .psi-table th.year button,
      #playerFunZone #ppTab-stats .psi-table th.level button,
      #playerFunZone #ppTab-stats .psi-table th.age button {
        justify-content: center !important;
        text-align: center !important;
      }

      #playerFunZone #ppTab-stats .psi-table th.team,
      #playerFunZone #ppTab-stats .psi-table th.org_conf,
      #playerFunZone #ppTab-stats .psi-table th.posit,
      #playerFunZone #ppTab-stats .psi-table td[data-key="team"],
      #playerFunZone #ppTab-stats .psi-table td[data-key="org_conf"],
      #playerFunZone #ppTab-stats .psi-table td[data-key="posit"] {
        text-align: left !important;
      }

      #playerFunZone #ppTab-stats .psi-table th.team button,
      #playerFunZone #ppTab-stats .psi-table th.org_conf button,
      #playerFunZone #ppTab-stats .psi-table th.posit button {
        justify-content: flex-start !important;
        text-align: left !important;
      }

      #playerFunZone #ppTab-stats .psi-table th.year,
      #playerFunZone #ppTab-stats .psi-table td[data-key="year"] {
        position: sticky !important;
        left: 0 !important;
        z-index: 12 !important;
        width: 46px !important;
        min-width: 46px !important;
        max-width: 46px !important;
      }

      #playerFunZone #ppTab-stats .psi-table th.team,
      #playerFunZone #ppTab-stats .psi-table td[data-key="team"] {
        position: sticky !important;
        left: 46px !important;
        z-index: 11 !important;
        min-width: max-content !important;
        max-width: none !important;
      }

      #playerFunZone #ppTab-stats .psi-table th.year,
      #playerFunZone #ppTab-stats .psi-table th.team {
        z-index: 16 !important;
      }

      /* Sticky cells must be opaque, not translucent, while still matching row striping. */
      #playerFunZone #ppTab-stats .psi-table tbody tr td[data-key="year"],
      #playerFunZone #ppTab-stats .psi-table tbody tr td[data-key="team"] {
        background: #101010 !important;
      }

      #playerFunZone #ppTab-stats .psi-table tbody tr:nth-child(even) td[data-key="year"],
      #playerFunZone #ppTab-stats .psi-table tbody tr:nth-child(even) td[data-key="team"] {
        background: #171717 !important;
      }

      #playerFunZone #ppTab-stats .psi-table tbody tr:hover td[data-key="year"],
      #playerFunZone #ppTab-stats .psi-table tbody tr:hover td[data-key="team"] {
        background: #222222 !important;
      }

      /* Align Block 5 stats table to the visual left edge of Block 3's first timeline card. */
      #playerFunZone #ppTab-stats {
        padding-left: 13px !important;
        padding-right: 13px !important;
      }

      #playerFunZone #ppTab-stats .psi-card,
      #playerFunZone #ppTab-stats .psi-table-wrap,
      #playerFunZone #ppTab-stats .psi-shell {
        margin-left: 0 !important;
        margin-right: 0 !important;
      }

      /* White theme: no black backgrounds in the profile/FunZone surface. */
      html.light-theme,
      body.light-theme,
      html.light-theme main,
      body.light-theme main,
      html.light-theme #playerFunZone,
      body.light-theme #playerFunZone,
      html.light-theme #playerFunZone *,
      body.light-theme #playerFunZone * {
        border-color: rgba(74, 54, 10, .22) !important;
      }

      html.light-theme body,
      body.light-theme,
      html.light-theme main,
      body.light-theme main,
      html.light-theme #playerFunZone,
      body.light-theme #playerFunZone,
      html.light-theme #playerFunZone .pp-funzone,
      body.light-theme #playerFunZone .pp-funzone,
      html.light-theme #playerFunZone .pp-funzone-outer,
      body.light-theme #playerFunZone .pp-funzone-outer,
      html.light-theme #playerFunZone .pp-fz-panel,
      body.light-theme #playerFunZone .pp-fz-panel,
      html.light-theme #playerFunZone [id^="ppTab-"],
      body.light-theme #playerFunZone [id^="ppTab-"],
      html.light-theme #playerFunZone #ppTab-stats,
      body.light-theme #playerFunZone #ppTab-stats {
        background: #f6f0e4 !important;
        color: #17130b !important;
      }

      html.light-theme #playerFunZone #ppTab-stats .psi-card,
      body.light-theme #playerFunZone #ppTab-stats .psi-card,
      html.light-theme #playerFunZone #ppTab-stats .psi-table-wrap,
      body.light-theme #playerFunZone #ppTab-stats .psi-table-wrap,
      html.light-theme #playerFunZone #ppTab-stats .psi-shell,
      body.light-theme #playerFunZone #ppTab-stats .psi-shell {
        background: #fffdf8 !important;
        color: #17130b !important;
      }

      html.light-theme #playerFunZone #ppTab-stats .psi-table thead th,
      body.light-theme #playerFunZone #ppTab-stats .psi-table thead th {
        background: linear-gradient(180deg, #eadfbf, #d9c68e) !important;
        color: #17130b !important;
      }

      html.light-theme #playerFunZone #ppTab-stats .psi-table tbody tr td,
      body.light-theme #playerFunZone #ppTab-stats .psi-table tbody tr td {
        background: #ffffff !important;
        color: #2b2415 !important;
      }

      html.light-theme #playerFunZone #ppTab-stats .psi-table tbody tr:nth-child(even) td,
      body.light-theme #playerFunZone #ppTab-stats .psi-table tbody tr:nth-child(even) td {
        background: #f7f1e4 !important;
      }

      html.light-theme #playerFunZone #ppTab-stats .psi-table tbody tr:hover td,
      body.light-theme #playerFunZone #ppTab-stats .psi-table tbody tr:hover td {
        background: #eee2c7 !important;
        color: #17130b !important;
      }

      html.light-theme #playerFunZone #ppTab-stats .psi-total-row td,
      body.light-theme #playerFunZone #ppTab-stats .psi-total-row td,
      html.light-theme #playerFunZone #ppTab-stats .psi-total-row td[data-key="year"],
      body.light-theme #playerFunZone #ppTab-stats .psi-total-row td[data-key="year"],
      html.light-theme #playerFunZone #ppTab-stats .psi-total-row td[data-key="team"],
      body.light-theme #playerFunZone #ppTab-stats .psi-total-row td[data-key="team"] {
        background: linear-gradient(180deg, #e5c569, #f1d891) !important;
        color: #181109 !important;
      }
    `}</style>
  );
}
