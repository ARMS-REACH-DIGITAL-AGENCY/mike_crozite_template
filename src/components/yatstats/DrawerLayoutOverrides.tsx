'use client';

export default function DrawerLayoutOverrides() {
  return (
    <style jsx global>{`
      :root {
        --yat-side-drawer-w: 360px;
        --yat-left-drawer-w: var(--yat-side-drawer-w) !important;
        --yat-right-drawer-w: var(--yat-side-drawer-w) !important;
        --yat-min-gallery-card-w: 260px;
      }

      .yat-drawer,
      #drawerLeft,
      #drawerFilters,
      #drawerFavorites,
      #drawerAccount {
        width: min(86vw, var(--yat-side-drawer-w)) !important;
        max-width: var(--yat-side-drawer-w) !important;
      }

      @media (min-width: 780px) {
        .yat-drawer,
        #drawerLeft,
        #drawerFilters,
        #drawerFavorites,
        #drawerAccount {
          width: var(--yat-side-drawer-w) !important;
        }

        body.drawer-left-open #drawerLeft,
        body.drawer-right-open #drawerFilters,
        body.drawer-account-open #drawerAccount,
        body.drawer-favorites-open #drawerFavorites {
          top: calc(var(--row1-h) + var(--row2-h)) !important;
          bottom: var(--footerH) !important;
          height: auto !important;
          z-index: 64 !important;
          transform: translateX(0) !important;
        }

        body.drawer-left-open .yat-drawer-mask,
        body.drawer-right-open .yat-drawer-mask,
        body.drawer-account-open .yat-drawer-mask,
        body.drawer-favorites-open .yat-drawer-mask {
          display: none !important;
          opacity: 0 !important;
          pointer-events: none !important;
        }

        body.drawer-open {
          overflow-y: auto !important;
        }

        body.drawer-left-open .yat-row2-shell,
        body.drawer-left-open .yat-row3-shell,
        body.drawer-left-open .yat-row4-shell,
        body.drawer-left-open .yat-row5-shell,
        body.drawer-left-open .yat-row6-shell {
          margin-left: var(--yat-side-drawer-w) !important;
        }

        body.drawer-right-open .yat-row2-shell,
        body.drawer-right-open .yat-row3-shell,
        body.drawer-right-open .yat-row4-shell,
        body.drawer-right-open .yat-row5-shell,
        body.drawer-right-open .yat-row6-shell,
        body.drawer-account-open .yat-row2-shell,
        body.drawer-account-open .yat-row3-shell,
        body.drawer-account-open .yat-row4-shell,
        body.drawer-account-open .yat-row5-shell,
        body.drawer-account-open .yat-row6-shell,
        body.drawer-favorites-open .yat-row2-shell,
        body.drawer-favorites-open .yat-row3-shell,
        body.drawer-favorites-open .yat-row4-shell,
        body.drawer-favorites-open .yat-row5-shell,
        body.drawer-favorites-open .yat-row6-shell {
          margin-right: var(--yat-side-drawer-w) !important;
        }

        body.drawer-left-open.drawer-right-open .yat-row2-shell,
        body.drawer-left-open.drawer-right-open .yat-row3-shell,
        body.drawer-left-open.drawer-right-open .yat-row4-shell,
        body.drawer-left-open.drawer-right-open .yat-row5-shell,
        body.drawer-left-open.drawer-right-open .yat-row6-shell,
        body.drawer-left-open.drawer-account-open .yat-row2-shell,
        body.drawer-left-open.drawer-account-open .yat-row3-shell,
        body.drawer-left-open.drawer-account-open .yat-row4-shell,
        body.drawer-left-open.drawer-account-open .yat-row5-shell,
        body.drawer-left-open.drawer-account-open .yat-row6-shell,
        body.drawer-left-open.drawer-favorites-open .yat-row2-shell,
        body.drawer-left-open.drawer-favorites-open .yat-row3-shell,
        body.drawer-left-open.drawer-favorites-open .yat-row4-shell,
        body.drawer-left-open.drawer-favorites-open .yat-row5-shell,
        body.drawer-left-open.drawer-favorites-open .yat-row6-shell {
          margin-left: var(--yat-side-drawer-w) !important;
          margin-right: var(--yat-side-drawer-w) !important;
        }

        body.drawer-left-open .yat-grid,
        body.drawer-right-open .yat-grid,
        body.drawer-account-open .yat-grid,
        body.drawer-favorites-open .yat-grid,
        body.yat-desktop-docked-drawers .yat-grid {
          grid-template-columns: repeat(auto-fit, minmax(min(100%, 230px), 1fr)) !important;
        }

        body.drawer-left-open.drawer-right-open .yat-grid,
        body.drawer-left-open.drawer-account-open .yat-grid,
        body.drawer-left-open.drawer-favorites-open .yat-grid {
          grid-template-columns: repeat(auto-fit, minmax(min(100%, 220px), 1fr)) !important;
        }

        body.drawer-left-open .yat-schoolrow,
        body.drawer-left-open .gallery-strip,
        body.drawer-left-open .yat-grid,
        body.drawer-left-open .yat-table-wrap,
        body.drawer-left-open .yat-sec-header,
        body.drawer-left-open .yat-placeholder,
        body.drawer-right-open .yat-schoolrow,
        body.drawer-right-open .gallery-strip,
        body.drawer-right-open .yat-grid,
        body.drawer-right-open .yat-table-wrap,
        body.drawer-right-open .yat-sec-header,
        body.drawer-right-open .yat-placeholder,
        body.drawer-account-open .yat-schoolrow,
        body.drawer-account-open .gallery-strip,
        body.drawer-account-open .yat-grid,
        body.drawer-account-open .yat-table-wrap,
        body.drawer-account-open .yat-sec-header,
        body.drawer-account-open .yat-placeholder,
        body.drawer-favorites-open .yat-schoolrow,
        body.drawer-favorites-open .gallery-strip,
        body.drawer-favorites-open .yat-grid,
        body.drawer-favorites-open .yat-table-wrap,
        body.drawer-favorites-open .yat-sec-header,
        body.drawer-favorites-open .yat-placeholder {
          max-width: none !important;
        }
      }

      @media (max-width: 779px) {
        body.drawer-left-open .yat-row2-shell,
        body.drawer-left-open .yat-row3-shell,
        body.drawer-left-open .yat-row4-shell,
        body.drawer-left-open .yat-row5-shell,
        body.drawer-left-open .yat-row6-shell,
        body.drawer-right-open .yat-row2-shell,
        body.drawer-right-open .yat-row3-shell,
        body.drawer-right-open .yat-row4-shell,
        body.drawer-right-open .yat-row5-shell,
        body.drawer-right-open .yat-row6-shell,
        body.drawer-account-open .yat-row2-shell,
        body.drawer-account-open .yat-row3-shell,
        body.drawer-account-open .yat-row4-shell,
        body.drawer-account-open .yat-row5-shell,
        body.drawer-account-open .yat-row6-shell,
        body.drawer-favorites-open .yat-row2-shell,
        body.drawer-favorites-open .yat-row3-shell,
        body.drawer-favorites-open .yat-row4-shell,
        body.drawer-favorites-open .yat-row5-shell,
        body.drawer-favorites-open .yat-row6-shell {
          margin-left: 0 !important;
          margin-right: 0 !important;
        }

        body.drawer-left-open .yat-drawer-mask,
        body.drawer-right-open .yat-drawer-mask,
        body.drawer-account-open .yat-drawer-mask,
        body.drawer-favorites-open .yat-drawer-mask {
          opacity: 1 !important;
          pointer-events: auto !important;
        }
      }
    `}</style>
  );
}
