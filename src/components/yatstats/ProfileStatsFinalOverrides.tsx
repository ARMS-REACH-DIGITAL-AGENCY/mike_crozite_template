'use client';

export default function ProfileStatsFinalOverrides() {
  return (
    <style jsx global>{`
      #playerFunZone {
        --stats-year-col-w: 34px !important;
      }

      @media (max-width: 760px) {
        #playerFunZone {
          --stats-year-col-w: 34px !important;
        }
      }

      /* Center the stats table/card inside the FunZone stats panel. */
      #playerFunZone #ppTab-stats {
        text-align: center !important;
      }

      #playerFunZone #ppTab-stats .psi-shell {
        width: 100% !important;
        min-height: 100% !important;
        display: flex !important;
        flex-direction: column !important;
        justify-content: flex-start !important;
        align-items: center !important;
        gap: 10px !important;
      }

      #playerFunZone #ppTab-stats .psi-card {
        width: fit-content !important;
        max-width: 100% !important;
        height: auto !important;
        max-height: none !important;
        flex: 0 0 auto !important;
        margin-left: auto !important;
        margin-right: auto !important;
        text-align: initial !important;
      }

      #playerFunZone #ppTab-stats .psi-table-wrap {
        width: fit-content !important;
        max-width: 100% !important;
        height: auto !important;
        max-height: calc(100dvh - var(--row1-h, 36px) - var(--row2-h, 54px) - var(--row3-h, 100px) - var(--row4-h, 56px) - var(--profile-tabs-h, 50px) - var(--footerH, 76px) - 22px) !important;
        margin-left: auto !important;
        margin-right: auto !important;
        text-align: initial !important;
      }

      #playerFunZone #ppTab-stats .psi-table {
        margin-left: auto !important;
        margin-right: auto !important;
      }

      /* Center the FunZone icon strip below the container instead of letting it hug the left edge. */
      #playerFunZone .pp-fz-tabs-shell {
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
      }

      #playerFunZone .pp-fz-tabs {
        width: min(100%, 420px) !important;
        max-width: 420px !important;
        margin-left: auto !important;
        margin-right: auto !important;
        padding-left: 0 !important;
        padding-right: 0 !important;
        justify-content: center !important;
      }

      #playerFunZone .pp-fz-tab {
        align-items: center !important;
        justify-content: center !important;
        text-align: center !important;
      }

      #playerFunZone .pp-fz-tab i {
        display: block !important;
        margin: 0 auto !important;
      }

      /* YEAR: only wide enough for a four-digit season, centered. */
      #playerFunZone #ppTab-stats .psi-table th.year,
      #playerFunZone #ppTab-stats .psi-table td[data-key="year"] {
        width: var(--stats-year-col-w) !important;
        min-width: var(--stats-year-col-w) !important;
        max-width: var(--stats-year-col-w) !important;
        left: 0 !important;
        text-align: center !important;
        justify-content: center !important;
      }

      #playerFunZone #ppTab-stats .psi-table th.year button {
        justify-content: center !important;
        text-align: center !important;
      }

      /* TEAM must start immediately after the narrowed YEAR column. */
      #playerFunZone #ppTab-stats .psi-table th.team,
      #playerFunZone #ppTab-stats .psi-table td[data-key="team"] {
        left: var(--stats-year-col-w) !important;
      }

      /* POS should be centered like YEAR / LEVEL / AGE. */
      #playerFunZone #ppTab-stats .psi-table th.posit,
      #playerFunZone #ppTab-stats .psi-table td[data-key="posit"] {
        text-align: center !important;
        justify-content: center !important;
      }

      #playerFunZone #ppTab-stats .psi-table th.posit button {
        justify-content: center !important;
        text-align: center !important;
      }

      /* Freeze panes: top-left header cells and first two body columns must be fully opaque. */
      html:not(.light-theme) #playerFunZone #ppTab-stats .psi-table thead th.year,
      body:not(.light-theme) #playerFunZone #ppTab-stats .psi-table thead th.year,
      html:not(.light-theme) #playerFunZone #ppTab-stats .psi-table thead th.team,
      body:not(.light-theme) #playerFunZone #ppTab-stats .psi-table thead th.team {
        background-color: #151515 !important;
        background-image: linear-gradient(#202020, #101010) !important;
        color: #f4f0e6 !important;
        opacity: 1 !important;
        z-index: 4000 !important;
      }

      html:not(.light-theme) #playerFunZone #ppTab-stats .psi-table tbody tr td[data-key="year"],
      body:not(.light-theme) #playerFunZone #ppTab-stats .psi-table tbody tr td[data-key="year"],
      html:not(.light-theme) #playerFunZone #ppTab-stats .psi-table tbody tr td[data-key="team"],
      body:not(.light-theme) #playerFunZone #ppTab-stats .psi-table tbody tr td[data-key="team"] {
        background-color: #101010 !important;
        background-image: linear-gradient(#101010, #101010) !important;
        color: #f4f0e6 !important;
        opacity: 1 !important;
      }

      html:not(.light-theme) #playerFunZone #ppTab-stats .psi-table tbody tr:nth-child(even) td[data-key="year"],
      body:not(.light-theme) #playerFunZone #ppTab-stats .psi-table tbody tr:nth-child(even) td[data-key="year"],
      html:not(.light-theme) #playerFunZone #ppTab-stats .psi-table tbody tr:nth-child(even) td[data-key="team"],
      body:not(.light-theme) #playerFunZone #ppTab-stats .psi-table tbody tr:nth-child(even) td[data-key="team"] {
        background-color: #171717 !important;
        background-image: linear-gradient(#171717, #171717) !important;
      }

      html:not(.light-theme) #playerFunZone #ppTab-stats .psi-table tfoot tr.psi-level-total-row td[data-key="year"],
      body:not(.light-theme) #playerFunZone #ppTab-stats .psi-table tfoot tr.psi-level-total-row td[data-key="year"],
      html:not(.light-theme) #playerFunZone #ppTab-stats .psi-table tfoot tr.psi-level-total-row td[data-key="team"],
      body:not(.light-theme) #playerFunZone #ppTab-stats .psi-table tfoot tr.psi-level-total-row td[data-key="team"] {
        background-color: #5b4718 !important;
        background-image: linear-gradient(#5b4718, #5b4718) !important;
        opacity: 1 !important;
      }

      html:not(.light-theme) #playerFunZone #ppTab-stats .psi-table tfoot tr.psi-bucket-total-row td[data-key="year"],
      body:not(.light-theme) #playerFunZone #ppTab-stats .psi-table tfoot tr.psi-bucket-total-row td[data-key="year"],
      html:not(.light-theme) #playerFunZone #ppTab-stats .psi-table tfoot tr.psi-bucket-total-row td[data-key="team"],
      body:not(.light-theme) #playerFunZone #ppTab-stats .psi-table tfoot tr.psi-bucket-total-row td[data-key="team"] {
        background-color: #27210f !important;
        background-image: linear-gradient(#27210f, #27210f) !important;
        opacity: 1 !important;
      }
    `}</style>
  );
}
