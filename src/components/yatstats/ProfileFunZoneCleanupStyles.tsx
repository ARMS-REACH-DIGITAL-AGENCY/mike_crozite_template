'use client';

export default function ProfileFunZoneCleanupStyles() {
  return (
    <style jsx global>{`
      #playerFunZone #ppTab-stats .psi-player-info { display: none !important; }

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

      /* FunZone must be one fixed zone: content panel above, icon strip anchored to footer. */
      .pp-funzone-outer {
        height: calc(100dvh - var(--row1-h,36px) - var(--row2-h,54px) - var(--row3-h,100px) - var(--row4-h,56px) - var(--footerH,76px)) !important;
        min-height: 318px !important;
        max-height: none !important;
        overflow: hidden !important;
        display: block !important;
        position: relative !important;
        margin: 0 !important;
        padding: 0 !important;
        background: #070707 !important;
      }

      #playerFunZone {
        --profile-tabs-h: 50px !important;
        height: 100% !important;
        min-height: 0 !important;
        width: 100% !important;
        position: relative !important;
        display: block !important;
        overflow: hidden !important;
        margin: 0 !important;
        padding: 0 !important;
        background: #070707 !important;
      }

      #playerFunZone > .pp-fz-panel,
      .pp-funzone > .pp-fz-panel,
      #playerFunZone [id^="ppTab-"] {
        position: absolute !important;
        top: 0 !important;
        left: 0 !important;
        right: 0 !important;
        bottom: var(--profile-tabs-h) !important;
        height: auto !important;
        min-height: 0 !important;
        max-height: none !important;
        display: none !important;
        visibility: hidden !important;
        overflow: auto !important;
        overscroll-behavior: contain !important;
        margin: 0 !important;
        padding: 2px 6px 2px !important;
        background: #070707 !important;
        color: #f4f0e6 !important;
      }

      #playerFunZone > .pp-fz-panel.pp-fz-panel-active,
      .pp-funzone > .pp-fz-panel.pp-fz-panel-active,
      #playerFunZone [id^="ppTab-"].pp-fz-panel-active {
        display: block !important;
        visibility: visible !important;
      }

      #playerFunZone > .pp-fz-panel[hidden],
      #playerFunZone [id^="ppTab-"][hidden] {
        display: none !important;
      }

      #playerFunZone .pp-fz-tabs-shell {
        position: absolute !important;
        left: 0 !important;
        right: 0 !important;
        top: auto !important;
        bottom: 0 !important;
        height: var(--profile-tabs-h) !important;
        min-height: 0 !important;
        max-height: var(--profile-tabs-h) !important;
        z-index: 10010 !important;
        margin: 0 !important;
        padding: 0 !important;
        overflow: hidden !important;
        background: rgba(7,7,7,.98) !important;
        border-top: 1px solid rgba(255,255,255,.12) !important;
        box-shadow: 0 -5px 12px rgba(0,0,0,.40) !important;
      }

      #playerFunZone .pp-fz-tabs {
        height: var(--profile-tabs-h) !important;
        min-height: 0 !important;
        width: 100% !important;
        display: grid !important;
        grid-template-columns: repeat(6, minmax(0, 1fr)) !important;
        align-items: stretch !important;
        justify-items: stretch !important;
        margin: 0 auto !important;
        padding: 0 3px !important;
        background: transparent !important;
      }

      #playerFunZone .pp-fz-tab {
        position: relative !important;
        width: 100% !important;
        height: var(--profile-tabs-h) !important;
        min-height: 0 !important;
        min-width: 0 !important;
        display: flex !important;
        flex-direction: column !important;
        align-items: center !important;
        justify-content: center !important;
        gap: 1px !important;
        margin: 0 !important;
        padding: 2px 1px 1px !important;
        color: rgba(255,255,255,.74) !important;
        text-align: center !important;
        text-decoration: none !important;
      }

      #playerFunZone .pp-fz-tab::before,
      #playerFunZone .pp-fz-tab::after,
      #playerFunZone .pp-fz-tab-default::before,
      #playerFunZone .pp-fz-tab-default::after {
        content: none !important;
        display: none !important;
        opacity: 0 !important;
      }

      #playerFunZone .pp-fz-tab.pp-fz-tab-active { color: #fff !important; }

      #playerFunZone .pp-fz-tab.pp-fz-tab-active::before {
        content: '' !important;
        display: block !important;
        opacity: 1 !important;
        position: absolute !important;
        left: 18% !important;
        right: 18% !important;
        top: 0 !important;
        height: 2px !important;
        background: #d2b45c !important;
      }

      #playerFunZone .pp-fz-tab i { font-size: 19px !important; line-height: 1 !important; margin: 0 !important; padding: 0 !important; }
      #playerFunZone .pp-fz-tab span { font: 900 8px/1 Oswald, Arial, sans-serif !important; letter-spacing: .035em !important; text-transform: uppercase !important; overflow: hidden !important; text-overflow: ellipsis !important; white-space: nowrap !important; max-width: 100% !important; margin: 0 !important; padding: 0 !important; }

      /* Stats grid: tight padding, exact header/body alignment. */
      #playerFunZone #ppTab-stats { padding: 2px 13px 2px !important; }
      #playerFunZone #ppTab-stats .psi-card,
      #playerFunZone #ppTab-stats .psi-table-wrap,
      #playerFunZone #ppTab-stats .psi-shell { margin: 0 !important; }
      #playerFunZone #ppTab-stats .psi-table-wrap { max-height: none !important; height: 100% !important; overflow: auto !important; }
      #playerFunZone #ppTab-stats .psi-table { table-layout: auto !important; width: max-content !important; min-width: max-content !important; border-collapse: separate !important; }
      #playerFunZone #ppTab-stats .psi-table th,
      #playerFunZone #ppTab-stats .psi-table td { width: auto !important; min-width: max-content !important; max-width: none !important; white-space: nowrap !important; box-sizing: border-box !important; }
      #playerFunZone #ppTab-stats .psi-table th button { width: 100% !important; display: flex !important; box-sizing: border-box !important; }

      /* Top header row sticky again. */
      #playerFunZone #ppTab-stats .psi-table thead,
      #playerFunZone #ppTab-stats .psi-table thead tr { position: sticky !important; top: 0 !important; z-index: 200 !important; }
      #playerFunZone #ppTab-stats .psi-table thead th { position: sticky !important; top: 0 !important; z-index: 210 !important; }

      #playerFunZone #ppTab-stats .psi-table th:not(.year):not(.team):not(.level):not(.org_conf):not(.age):not(.posit),
      #playerFunZone #ppTab-stats .psi-table th:not(.year):not(.team):not(.level):not(.org_conf):not(.age):not(.posit) button { text-align: right !important; justify-content: flex-end !important; }
      #playerFunZone #ppTab-stats .psi-table th.year,
      #playerFunZone #ppTab-stats .psi-table th.level,
      #playerFunZone #ppTab-stats .psi-table th.age,
      #playerFunZone #ppTab-stats .psi-table td[data-key="year"],
      #playerFunZone #ppTab-stats .psi-table td[data-key="level"],
      #playerFunZone #ppTab-stats .psi-table td[data-key="age"],
      #playerFunZone #ppTab-stats .psi-table th.year button,
      #playerFunZone #ppTab-stats .psi-table th.level button,
      #playerFunZone #ppTab-stats .psi-table th.age button { text-align: center !important; justify-content: center !important; }
      #playerFunZone #ppTab-stats .psi-table th.team,
      #playerFunZone #ppTab-stats .psi-table th.org_conf,
      #playerFunZone #ppTab-stats .psi-table th.posit,
      #playerFunZone #ppTab-stats .psi-table td[data-key="team"],
      #playerFunZone #ppTab-stats .psi-table td[data-key="org_conf"],
      #playerFunZone #ppTab-stats .psi-table td[data-key="posit"],
      #playerFunZone #ppTab-stats .psi-table th.team button,
      #playerFunZone #ppTab-stats .psi-table th.org_conf button,
      #playerFunZone #ppTab-stats .psi-table th.posit button { text-align: left !important; justify-content: flex-start !important; }

      /* YEAR and TEAM are no longer frozen columns; they auto-fit like Excel columns. */
      #playerFunZone #ppTab-stats .psi-table th.year,
      #playerFunZone #ppTab-stats .psi-table th.team {
        left: auto !important;
        width: auto !important;
        min-width: max-content !important;
        max-width: none !important;
        box-shadow: none !important;
      }

      #playerFunZone #ppTab-stats .psi-table td[data-key="year"],
      #playerFunZone #ppTab-stats .psi-table td[data-key="team"] {
        position: static !important;
        left: auto !important;
        z-index: auto !important;
        width: auto !important;
        min-width: max-content !important;
        max-width: none !important;
        background-image: none !important;
        box-shadow: none !important;
        opacity: 1 !important;
      }

      #playerFunZone #ppTab-stats .psi-table tbody tr td[data-key="year"],
      #playerFunZone #ppTab-stats .psi-table tbody tr td[data-key="team"] { background: var(--psi-cell-bg, rgba(255,255,255,.035)) !important; color: inherit !important; }
      #playerFunZone #ppTab-stats .psi-table tbody tr:nth-child(even) td[data-key="year"],
      #playerFunZone #ppTab-stats .psi-table tbody tr:nth-child(even) td[data-key="team"] { background: var(--psi-cell-bg-alt, rgba(255,255,255,.065)) !important; }
      #playerFunZone #ppTab-stats .psi-table tbody tr:hover td[data-key="year"],
      #playerFunZone #ppTab-stats .psi-table tbody tr:hover td[data-key="team"] { background: var(--psi-cell-hover, rgba(255,255,255,.12)) !important; }

      /* Light theme. */
      html.light-theme .pp-funzone-outer,
      body.light-theme .pp-funzone-outer,
      html.light-theme #playerFunZone,
      body.light-theme #playerFunZone,
      html.light-theme #playerFunZone > .pp-fz-panel,
      body.light-theme #playerFunZone > .pp-fz-panel,
      html.light-theme #playerFunZone [id^="ppTab-"],
      body.light-theme #playerFunZone [id^="ppTab-"] { background: #f6f0e4 !important; color: #17130b !important; }
      html.light-theme #playerFunZone .pp-fz-tabs-shell,
      body.light-theme #playerFunZone .pp-fz-tabs-shell,
      html.light-theme #playerFunZone .pp-fz-tabs,
      body.light-theme #playerFunZone .pp-fz-tabs { background: #fffdf8 !important; color: #17130b !important; border-top-color: rgba(74,54,10,.22) !important; box-shadow: 0 -4px 10px rgba(74,54,10,.08) !important; }
      html.light-theme #playerFunZone .pp-fz-tab,
      body.light-theme #playerFunZone .pp-fz-tab,
      html.light-theme #playerFunZone .pp-fz-tab i,
      body.light-theme #playerFunZone .pp-fz-tab i,
      html.light-theme #playerFunZone .pp-fz-tab span,
      body.light-theme #playerFunZone .pp-fz-tab span,
      html.light-theme #playerFunZone #ppTab-upload,
      body.light-theme #playerFunZone #ppTab-upload,
      html.light-theme #playerFunZone #ppTab-upload *,
      body.light-theme #playerFunZone #ppTab-upload * { color: #17130b !important; text-shadow: none !important; opacity: 1 !important; }
      html.light-theme #playerFunZone #ppTab-upload input,
      body.light-theme #playerFunZone #ppTab-upload input,
      html.light-theme #playerFunZone #ppTab-upload textarea,
      body.light-theme #playerFunZone #ppTab-upload textarea,
      html.light-theme #playerFunZone #ppTab-upload select,
      body.light-theme #playerFunZone #ppTab-upload select { background: #fffdf8 !important; color: #17130b !important; border-color: rgba(74,54,10,.35) !important; }
      html.light-theme #playerFunZone #ppTab-stats .psi-card,
      body.light-theme #playerFunZone #ppTab-stats .psi-card,
      html.light-theme #playerFunZone #ppTab-stats .psi-table-wrap,
      body.light-theme #playerFunZone #ppTab-stats .psi-table-wrap,
      html.light-theme #playerFunZone #ppTab-stats .psi-shell { background: #fffdf8 !important; color: #17130b !important; }
      html.light-theme #playerFunZone #ppTab-stats .psi-table thead th,
      body.light-theme #playerFunZone #ppTab-stats .psi-table thead th { background: linear-gradient(180deg, #eadfbf, #d9c68e) !important; color: #17130b !important; }
      html.light-theme #playerFunZone #ppTab-stats .psi-table tbody tr td,
      body.light-theme #playerFunZone #ppTab-stats .psi-table tbody tr td { background: #ffffff !important; color: #2b2415 !important; }
      html.light-theme #playerFunZone #ppTab-stats .psi-table tbody tr:nth-child(even) td,
      body.light-theme #playerFunZone #ppTab-stats .psi-table tbody tr:nth-child(even) td { background: #f7f1e4 !important; }
      html.light-theme #playerFunZone #ppTab-stats .psi-table tbody tr:hover td,
      body.light-theme #playerFunZone #ppTab-stats .psi-table tbody tr:hover td { background: #eee2c7 !important; color: #17130b !important; }
      html.light-theme #playerFunZone #ppTab-stats .psi-table tbody tr td[data-key="year"],
      body.light-theme #playerFunZone #ppTab-stats .psi-table tbody tr td[data-key="year"],
      html.light-theme #playerFunZone #ppTab-stats .psi-table tbody tr td[data-key="team"],
      body.light-theme #playerFunZone #ppTab-stats .psi-table tbody tr td[data-key="team"] { background: #ffffff !important; color: #2b2415 !important; }
      html.light-theme #playerFunZone #ppTab-stats .psi-table tbody tr:nth-child(even) td[data-key="year"],
      body.light-theme #playerFunZone #ppTab-stats .psi-table tbody tr:nth-child(even) td[data-key="year"],
      html.light-theme #playerFunZone #ppTab-stats .psi-table tbody tr:nth-child(even) td[data-key="team"],
      body.light-theme #playerFunZone #ppTab-stats .psi-table tbody tr:nth-child(even) td[data-key="team"] { background: #f7f1e4 !important; }
      html.light-theme #playerFunZone #ppTab-stats .psi-total-row td,
      body.light-theme #playerFunZone #ppTab-stats .psi-total-row td,
      html.light-theme #playerFunZone #ppTab-stats .psi-total-row td[data-key="year"],
      body.light-theme #playerFunZone #ppTab-stats .psi-total-row td[data-key="year"],
      html.light-theme #playerFunZone #ppTab-stats .psi-total-row td[data-key="team"],
      body.light-theme #playerFunZone #ppTab-stats .psi-total-row td[data-key="team"] { background: linear-gradient(180deg, #e5c569, #f1d891) !important; color: #181109 !important; }

      @media (max-width: 760px) {
        .pp-funzone-outer { height: calc(100dvh - var(--row1-h,34px) - var(--row2-h,48px) - var(--row3-h,100px) - var(--row4-h,56px) - var(--footerH,76px)) !important; min-height: 320px !important; }
        #playerFunZone { --profile-tabs-h: 46px !important; }
        #playerFunZone > .pp-fz-panel,
        .pp-funzone > .pp-fz-panel,
        #playerFunZone [id^="ppTab-"] { bottom: var(--profile-tabs-h) !important; padding: 2px 4px 2px !important; }
        #playerFunZone #ppTab-stats { padding: 2px 13px 2px !important; }
        #playerFunZone .pp-fz-tabs-shell,
        #playerFunZone .pp-fz-tabs,
        #playerFunZone .pp-fz-tab { height: var(--profile-tabs-h) !important; min-height: 0 !important; }
        #playerFunZone .pp-fz-tab i { font-size: 18px !important; }
        #playerFunZone .pp-fz-tab span { font-size: 7px !important; letter-spacing: .03em !important; }
        .yp-meta-strip { grid-template-columns: minmax(0, 1fr) !important; gap: 2px !important; min-height: 38px !important; padding: 4px 13px !important; }
        .yp-meta-team { font-size: 13px !important; }
        .yp-meta-sub { font-size: 8px !important; }
      }
    `}</style>
  );
}
