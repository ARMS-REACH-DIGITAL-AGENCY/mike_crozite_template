'use client';

export default function DrawerLayoutOverrides() {
  return (
    <style jsx global>{`
      :root {
        --yat-side-drawer-w: 360px;
      }

      /* All five drawer surfaces use the same desktop width:
         left nav, left search, right account/login, right sort/filter, right favorites. */
      .yat-drawer,
      #drawerLeft,
      #drawerFilters,
      #drawerFavorites,
      #drawerAccount {
        width: min(86vw, var(--yat-side-drawer-w)) !important;
        max-width: var(--yat-side-drawer-w) !important;
      }

      @media (min-width: 1180px) {
        .yat-drawer,
        #drawerLeft,
        #drawerFilters,
        #drawerFavorites,
        #drawerAccount {
          width: var(--yat-side-drawer-w) !important;
        }
      }

      /* Sort/filter is a working side rail, not a modal wall.
         Keep the page vertically scrollable and allow wheel/touch scrolling
         through the visible card gallery while the filter drawer is open. */
      body.drawer-right-open {
        overflow-y: auto !important;
      }

      body.drawer-right-open .yat-drawer-mask {
        pointer-events: none !important;
        opacity: 0 !important;
      }

      @media (min-width: 1180px) {
        body.drawer-right-open .yat-row1-shell,
        body.drawer-right-open .yat-row2-shell,
        body.drawer-right-open .yat-row3-shell,
        body.drawer-right-open .yat-row4-shell,
        body.drawer-right-open .yat-row5-shell,
        body.drawer-right-open .gallery-strip,
        body.drawer-right-open .yat-sec-header,
        body.drawer-right-open .yat-placeholder,
        body.drawer-right-open .yat-table-wrap {
          max-width: calc(100vw - var(--yat-side-drawer-w)) !important;
          margin-left: 0 !important;
          margin-right: var(--yat-side-drawer-w) !important;
        }

        body.drawer-right-open .yat-grid {
          max-width: calc(100vw - var(--yat-side-drawer-w)) !important;
          margin-left: 0 !important;
          margin-right: var(--yat-side-drawer-w) !important;
          grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
        }
      }

      @media (min-width: 1180px) and (max-width: 1420px) {
        body.drawer-right-open .yat-grid {
          grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
        }
      }

      @media (max-width: 760px) {
        :root {
          --yat-side-drawer-w: 360px;
        }

        body.drawer-right-open .yat-drawer-mask {
          opacity: 1 !important;
          pointer-events: auto !important;
        }
      }
    `}</style>
  );
}
