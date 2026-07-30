'use client';

import { useEffect } from 'react';

const DRAWER_STATE_KEY = 'yat-drawer-state';

function persistClosedLeftDrawer() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(DRAWER_STATE_KEY) || '{}');
    sessionStorage.setItem(
      DRAWER_STATE_KEY,
      JSON.stringify({
        ...saved,
        left: false,
        leftSearch: false,
      })
    );
  } catch {}
}

export default function DrawerLayoutOverrides() {
  useEffect(() => {
    const closeLeftDrawer = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target?.closest('#closeLeft')) return;

      // The legacy rail controller previously ignored #closeLeft below 780px.
      // Handle the button in capture phase so no later listener can reopen it.
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      const body = document.body;
      body.classList.remove('drawer-left-open', 'yat-left-search-mode');

      const rightDrawerOpen =
        body.classList.contains('drawer-sort-open')
        || body.classList.contains('drawer-right-open')
        || body.classList.contains('drawer-account-open')
        || body.classList.contains('drawer-favorites-open');

      if (!rightDrawerOpen) body.classList.remove('drawer-open');
      persistClosedLeftDrawer();
    };

    document.addEventListener('click', closeLeftDrawer, true);
    return () => document.removeEventListener('click', closeLeftDrawer, true);
  }, []);

  return (
    <style jsx global>{`
      :root {
        --yat-side-drawer-w: 360px;
        --yat-left-drawer-w: var(--yat-side-drawer-w) !important;
        --yat-right-drawer-w: var(--yat-side-drawer-w) !important;
        --yat-min-gallery-card-w: 260px;
      }

      /* Keep the left navigation translucent enough to retain page context. */
      #drawerLeft {
        background: rgba(10, 10, 10, 0.90) !important;
        backdrop-filter: blur(5px) !important;
        -webkit-backdrop-filter: blur(5px) !important;
      }

      body.light-theme #drawerLeft {
        background: rgba(255, 255, 255, 0.92) !important;
      }

      /*
       * Block 3 is owned by Row3MirrorGuard. The legacy interactivity script
       * still writes inline display values to the strip after filtering, which
       * was hiding RETIRED and other non-active cards even when Block 5 showed
       * them. Only the slots stamped from the currently visible Block 5 cards
       * are allowed to render, and !important prevents the legacy inline style
       * from winning the race afterward.
       */
      .gallery-strip[data-react-mirrors-row5="true"] .gallery-strip-inner > [data-playerid] {
        display: none !important;
      }

      .gallery-strip[data-react-mirrors-row5="true"] .gallery-strip-inner > [data-playerid][data-row3-mirror-visible="true"] {
        display: block !important;
      }

      /* Block 2 should behave like Block 1: full-width rail, not centered/max-width, and never pushed by drawers. */
      .yat-row2-shell,
      .yat-row2-shell .yat-schoolrow {
        width: 100% !important;
        max-width: none !important;
      }

      .yat-row2-shell,
      .yat-row2-shell .yat-schoolrow,
      body.drawer-left-open .yat-row2-shell,
      body.drawer-right-open .yat-row2-shell,
      body.drawer-account-open .yat-row2-shell,
      body.drawer-favorites-open .yat-row2-shell,
      body.drawer-left-open.drawer-right-open .yat-row2-shell,
      body.drawer-left-open.drawer-account-open .yat-row2-shell,
      body.drawer-left-open.drawer-favorites-open .yat-row2-shell {
        margin-left: 0 !important;
        margin-right: 0 !important;
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

        body.drawer-left-open .yat-row3-shell,
        body.drawer-left-open .yat-row4-shell,
        body.drawer-left-open .yat-row5-shell,
        body.drawer-left-open .yat-row6-shell {
          margin-left: var(--yat-side-drawer-w) !important;
        }

        body.drawer-right-open .yat-row3-shell,
        body.drawer-right-open .yat-row4-shell,
        body.drawer-right-open .yat-row5-shell,
        body.drawer-right-open .yat-row6-shell,
        body.drawer-account-open .yat-row3-shell,
        body.drawer-account-open .yat-row4-shell,
        body.drawer-account-open .yat-row5-shell,
        body.drawer-account-open .yat-row6-shell,
        body.drawer-favorites-open .yat-row3-shell,
        body.drawer-favorites-open .yat-row4-shell,
        body.drawer-favorites-open .yat-row5-shell,
        body.drawer-favorites-open .yat-row6-shell {
          margin-right: var(--yat-side-drawer-w) !important;
        }

        body.drawer-left-open.drawer-right-open .yat-row3-shell,
        body.drawer-left-open.drawer-right-open .yat-row4-shell,
        body.drawer-left-open.drawer-right-open .yat-row5-shell,
        body.drawer-left-open.drawer-right-open .yat-row6-shell,
        body.drawer-left-open.drawer-account-open .yat-row3-shell,
        body.drawer-left-open.drawer-account-open .yat-row4-shell,
        body.drawer-left-open.drawer-account-open .yat-row5-shell,
        body.drawer-left-open.drawer-account-open .yat-row6-shell,
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
