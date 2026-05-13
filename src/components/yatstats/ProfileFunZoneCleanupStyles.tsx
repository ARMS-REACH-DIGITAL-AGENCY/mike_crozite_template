'use client';

export default function ProfileFunZoneCleanupStyles() {
  return (
    <style jsx global>{`
      #playerFunZone #ppTab-stats .psi-player-info { display: none !important; }

      /* One active tab indicator only. */
      #playerFunZone .pp-fz-tab::before,
      #playerFunZone .pp-fz-tab-default::before,
      #playerFunZone .pp-fz-tab:not(.pp-fz-tab-active)::after,
      #playerFunZone .pp-fz-tab-default:not(.pp-fz-tab-active)::after {
        content: none !important;
        display: none !important;
        opacity: 0 !important;
      }

      /* Block 4 / career-line metadata band: readable in both themes. */
      .yat-row4-shell,
      .yat-row4-shell #playerCareerStrip,
      .yat-profile-meta-row-host,
      .yat-profile-meta-row-host .yp-meta-strip,
      .profile-row-4,
      .pp-row-4,
      [data-profile-row="4"] {
        background: #070707 !important;
        color: #f4f0e6 !important;
      }

      .yp-meta-strip {
        display: grid !important;
        grid-template-columns: minmax(0, 1.35fr) repeat(5, minmax(54px, auto)) !important;
        align-items: center !important;
        gap: 8px !important;
        padding: 5px 13px !important;
        min-height: 40px !important;
        color: #f4f0e6 !important;
        text-transform: uppercase !important;
      }

      .yp-meta-team,
      .yp-meta-sub {
        color: #f4f0e6 !important;
        opacity: 1 !important;
        text-shadow: none !important;
      }

      .yp-meta-team {
        font: 900 15px/1 Oswald, Arial, sans-serif !important;
        letter-spacing: .05em !important;
        white-space: nowrap !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
      }

      .yp-meta-sub {
        font: 700 9px/1.1 Oswald, Arial, sans-serif !important;
        letter-spacing: .10em !important;
        color: rgba(244,240,230,.78) !important;
      }

      html.light-theme .yat-row4-shell,
      body.light-theme .yat-row4-shell,
      html.light-theme .yat-row4-shell #playerCareerStrip,
      body.light-theme .yat-row4-shell #playerCareerStrip,
      html.light-theme .yat-profile-meta-row-host,
      body.light-theme .yat-profile-meta-row-host,
      html.light-theme .yat-profile-meta-row-host .yp-meta-strip,
      body.light-theme .yat-profile-meta-row-host .yp-meta-strip,
      html.light-theme .profile-row-4,
      body.light-theme .profile-row-4,
      html.light-theme .pp-row-4,
      body.light-theme .pp-row-4,
      html.light-theme [data-profile-row="4"],
      body.light-theme [data-profile-row="4"] {
        background: #f6f0e4 !important;
        color: #17130b !important;
      }

      html.light-theme .yp-meta-team,
      body.light-theme .yp-meta-team,
      html.light-theme .yp-meta-sub,
      body.light-theme .yp-meta-sub {
        color: #17130b !important;
        opacity: 1 !important;
        text-shadow: none !important;
      }

      /* Make the old dark gap in Block 4 light in white theme. */
      html.light-theme .yat-row4-shell #playerCareerStrip:empty,
      body.light-theme .yat-row4-shell #playerCareerStrip:empty,
      html.light-theme .yat-row4-shell #playerCareerStrip:empty::before,
      body.light-theme .yat-row4-shell #playerCareerStrip:empty::before {
        background: #f6f0e4 !important;
      }

      /* Reclaim vertical room in Block 5: no excess strip padding or phantom gap above icons. */
      #playerFunZone {
        overflow: hidden !important;
      }

      #playerFunZone > .pp-fz-panel,
      .pp-funzone > .pp-fz-panel,
      .pp-fz-panel {
        padding-bottom: 0 !important;
        margin-bottom: 0 !important;
      }

      #playerFunZone > .pp-fz-panel.pp-fz-panel-active,
      .pp-funzone > .pp-fz-panel.pp-fz-panel-active,
      .pp-fz-panel.pp-fz-panel-active {
        display: block !important;
        visibility: visible !important;
        overflow: auto !important;
      }

      #playerFunZone .pp-fz-tabs-shell {
        position: sticky !important;
        bottom: 0 !important;
        z-index: 30 !important;
        margin: 0 !important;
        padding: 0 !important;
        min-height: 0 !important;
        background: #070707 !important;
      }

      #playerFunZone .pp-fz-tabs {
        display: grid !important;
        grid-template-columns: repeat(6, minmax(0, 1fr)) !important;
        align-items: center !important;
        justify-items: center !important;
        width: 100% !important;
        min-height: 56px !important;
        height: 56px !important;
        margin: 0 !important;
        padding: 0 !important;
        background: #070707 !important;
      }

      #playerFunZone .pp-fz-tab {
        width: 100% !important;
        height: 56px !important;
        min-width: 0 !important;
        display: flex !important;
        flex-direction: column !important;
        align-items: center !important;
        justify-content: center !important;
        text-align: center !important;
        gap: 2px !important;
        margin: 0 !important;
        padding: 2px 0 0 !important;
        color: #d8d8d8 !important;
      }

      #playerFunZone .pp-fz-tab i {
        font-size: 22px !important;
        line-height: 1 !important;
        margin: 0 !important;
        padding: 0 !important;
      }

      #playerFunZone .pp-fz-tab span {
        font-size: 10px !important;
        line-height: 1 !important;
        margin: 0 !important;
        padding: 0 !important;
      }

      #playerFunZone .pp-fz-tab.pp-fz-tab-active::after {
        content: '' !important;
        opacity: 1 !important;
        position: absolute !important;
        left: 22% !important;
        right: 22% !important;
        top: 0 !important;
        height: 3px !important;
        background: #d9b75b !important;
        display: block !important;
      }

      /* Stats grid: Excel-style auto-fit widths and exact header/body alignment. */
      #playerFunZone #ppTab-stats {
        padding: 6px 13px 0 !important;
      }

      #playerFunZone #ppTab-stats .psi-card,
      #playerFunZone #ppTab-stats .psi-table-wrap,
      #playerFunZone #ppTab-stats .psi-shell {
        margin-left: 0 !important;
        margin-right: 0 !important;
      }

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

      #playerFunZone #ppTab-stats .psi-table th:not(.year):not(.team):not(.level):not(.org_conf):not(.age):not(.posit),
      #playerFunZone #ppTab-stats .psi-table th:not(.year):not(.team):not(.level):not(.org_conf):not(.age):not(.posit) button {
        text-align: right !important;
        justify-content: flex-end !important;
      }

      #playerFunZone #ppTab-stats .psi-table th.year,
      #playerFunZone #ppTab-stats .psi-table th.level,
      #playerFunZone #ppTab-stats .psi-table th.age,
      #playerFunZone #ppTab-stats .psi-table td[data-key="year"],
      #playerFunZone #ppTab-stats .psi-table td[data-key="level"],
      #playerFunZone #ppTab-stats .psi-table td[data-key="age"],
      #playerFunZone #ppTab-stats .psi-table th.year button,
      #playerFunZone #ppTab-stats .psi-table th.level button,
      #playerFunZone #ppTab-stats .psi-table th.age button {
        text-align: center !important;
        justify-content: center !important;
      }

      #playerFunZone #ppTab-stats .psi-table th.team,
      #playerFunZone #ppTab-stats .psi-table th.org_conf,
      #playerFunZone #ppTab-stats .psi-table th.posit,
      #playerFunZone #ppTab-stats .psi-table td[data-key="team"],
      #playerFunZone #ppTab-stats .psi-table td[data-key="org_conf"],
      #playerFunZone #ppTab-stats .psi-table td[data-key="posit"],
      #playerFunZone #ppTab-stats .psi-table th.team button,
      #playerFunZone #ppTab-stats .psi-table th.org_conf button,
      #playerFunZone #ppTab-stats .psi-table th.posit button {
        text-align: left !important;
        justify-content: flex-start !important;
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

      /* Dark-mode frozen columns: solid, opaque, and still striped. */
      html:not(.light-theme) #playerFunZone #ppTab-stats .psi-table tbody tr td[data-key="year"],
      body:not(.light-theme) #playerFunZone #ppTab-stats .psi-table tbody tr td[data-key="year"],
      html:not(.light-theme) #playerFunZone #ppTab-stats .psi-table tbody tr td[data-key="team"],
      body:not(.light-theme) #playerFunZone #ppTab-stats .psi-table tbody tr td[data-key="team"] {
        background-color: #101010 !important;
        background-image: none !important;
        opacity: 1 !important;
        background-clip: padding-box !important;
        color: #f4f0e6 !important;
        box-shadow: 4px 0 10px rgba(0,0,0,.55), inset -1px 0 rgba(255,255,255,.10) !important;
      }

      html:not(.light-theme) #playerFunZone #ppTab-stats .psi-table tbody tr:nth-child(even) td[data-key="year"],
      body:not(.light-theme) #playerFunZone #ppTab-stats .psi-table tbody tr:nth-child(even) td[data-key="year"],
      html:not(.light-theme) #playerFunZone #ppTab-stats .psi-table tbody tr:nth-child(even) td[data-key="team"],
      body:not(.light-theme) #playerFunZone #ppTab-stats .psi-table tbody tr:nth-child(even) td[data-key="team"] {
        background-color: #171717 !important;
      }

      html:not(.light-theme) #playerFunZone #ppTab-stats .psi-table tbody tr:hover td[data-key="year"],
      body:not(.light-theme) #playerFunZone #ppTab-stats .psi-table tbody tr:hover td[data-key="year"],
      html:not(.light-theme) #playerFunZone #ppTab-stats .psi-table tbody tr:hover td[data-key="team"],
      body:not(.light-theme) #playerFunZone #ppTab-stats .psi-table tbody tr:hover td[data-key="team"] {
        background-color: #222222 !important;
      }

      /* White theme: no black backgrounds in profile/FunZone surfaces. */
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
      body.light-theme #playerFunZone [id^="ppTab-"] {
        background: #f6f0e4 !important;
        color: #17130b !important;
      }

      html.light-theme #playerFunZone .pp-fz-tabs-shell,
      body.light-theme #playerFunZone .pp-fz-tabs-shell,
      html.light-theme #playerFunZone .pp-fz-tabs,
      body.light-theme #playerFunZone .pp-fz-tabs {
        background: #fffdf8 !important;
        color: #17130b !important;
        border-top: 1px solid rgba(74,54,10,.22) !important;
        box-shadow: 0 -4px 10px rgba(74,54,10,.08) !important;
      }

      html.light-theme #playerFunZone .pp-fz-tab,
      body.light-theme #playerFunZone .pp-fz-tab,
      html.light-theme #playerFunZone .pp-fz-tab i,
      body.light-theme #playerFunZone .pp-fz-tab i,
      html.light-theme #playerFunZone .pp-fz-tab span,
      body.light-theme #playerFunZone .pp-fz-tab span {
        color: #2b2415 !important;
        opacity: 1 !important;
      }

      html.light-theme #playerFunZone #ppTab-upload,
      body.light-theme #playerFunZone #ppTab-upload,
      html.light-theme #playerFunZone #ppTab-upload *,
      body.light-theme #playerFunZone #ppTab-upload * {
        color: #17130b !important;
        text-shadow: none !important;
        opacity: 1 !important;
      }

      html.light-theme #playerFunZone #ppTab-upload input,
      body.light-theme #playerFunZone #ppTab-upload input,
      html.light-theme #playerFunZone #ppTab-upload textarea,
      body.light-theme #playerFunZone #ppTab-upload textarea,
      html.light-theme #playerFunZone #ppTab-upload select,
      body.light-theme #playerFunZone #ppTab-upload select {
        background: #fffdf8 !important;
        color: #17130b !important;
        border-color: rgba(74,54,10,.35) !important;
      }

      html.light-theme #playerFunZone #ppTab-stats .psi-card,
      body.light-theme #playerFunZone #ppTab-stats .psi-card,
      html.light-theme #playerFunZone #ppTab-stats .psi-table-wrap,
      body.light-theme #playerFunZone #ppTab-stats .psi-table-wrap,
      html.light-theme #playerFunZone #ppTab-stats .psi-shell {
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

      @media (max-width: 760px) {
        .yp-meta-strip {
          grid-template-columns: minmax(0, 1fr) !important;
          gap: 2px !important;
          min-height: 38px !important;
          padding: 4px 13px !important;
        }
        .yp-meta-team { font-size: 13px !important; }
        .yp-meta-sub { font-size: 8px !important; }
        #playerFunZone .pp-fz-tabs,
        #playerFunZone .pp-fz-tab { height: 54px !important; min-height: 54px !important; }
      }
    `}</style>
  );
}
