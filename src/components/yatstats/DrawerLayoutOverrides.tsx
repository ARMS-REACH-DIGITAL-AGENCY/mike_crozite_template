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

    const closeOnDestination = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      const link = target?.closest('#drawerLeft a[href]') as HTMLAnchorElement | null;
      if (!link || link.style.display === 'none') return;
      // Do not interrupt navigation; close synchronously in capture phase.
      const body = document.body;
      body.classList.remove('drawer-left-open', 'yat-left-search-mode');
      if (!body.classList.contains('drawer-sort-open')
        && !body.classList.contains('drawer-right-open')
        && !body.classList.contains('drawer-account-open')
        && !body.classList.contains('drawer-favorites-open')) body.classList.remove('drawer-open');
      persistClosedLeftDrawer();
    };
    document.addEventListener('click', closeOnDestination, true);
    document.addEventListener('click', closeLeftDrawer, true);
    return () => { document.removeEventListener('click', closeLeftDrawer, true); document.removeEventListener('click', closeOnDestination, true); };
  }, []);

  /* Match the Connect & Contribute selection highlight without changing the
     existing navigation, drawer opening, or section routing behavior. */
  useEffect(() => {
    const nav = document.querySelector<HTMLElement>('#drawerLeft .yat-left-nav-content .yat-drawer-nav');
    if (!nav) return;
    const links = Array.from(nav.querySelectorAll<HTMLAnchorElement>('.yat-drawer-nav-item'));

    const highlight = (selected: HTMLAnchorElement | null) => {
      for (const link of links) {
        if (link === selected) link.setAttribute('aria-current', 'page');
        else link.removeAttribute('aria-current');
      }
    };

    const syncFromLocation = () => {
      const pathname = window.location.pathname;
      if (/\/connect-contribute(?:\/|$)/.test(pathname)) {
        highlight(nav.querySelector<HTMLAnchorElement>('[data-cc-link]'));
      } else if (/\/player\//.test(pathname)) {
        // A profile is not itself one of the listed school destinations.
        highlight(null);
      } else {
        const section = window.location.hash.match(/^#sec-([a-z-]+)/i)?.[1];
        highlight(
          (section ? nav.querySelector<HTMLAnchorElement>('[data-tab="' + section + '"]') : null)
          || nav.querySelector<HTMLAnchorElement>('.yat-drawer-visiting-school')
        );
      }
    };

    const onNavigationClick = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;
      const clickedLink = target.closest('#drawerLeft .yat-drawer-nav-item') as HTMLAnchorElement | null;
      if (clickedLink) {
        highlight(clickedLink);
        return;
      }
      // Other section controls update the selected link without waiting for a
      // hashchange event (some routes use history.replaceState).
      const sectionControl = target.closest('[data-tab]') as HTMLElement | null;
      if (sectionControl) {
        const tab = sectionControl.dataset.tab;
        const item = tab ? nav.querySelector<HTMLAnchorElement>('[data-tab="' + tab + '"]') : null;
        if (item) highlight(item);
      } else if (target.closest('#btnMenu')) {
        syncFromLocation();
      }
    };

    syncFromLocation();
    document.addEventListener('click', onNavigationClick, true);
    window.addEventListener('hashchange', syncFromLocation);
    window.addEventListener('popstate', syncFromLocation);
    window.addEventListener('pageshow', syncFromLocation);
    return () => {
      document.removeEventListener('click', onNavigationClick, true);
      window.removeEventListener('hashchange', syncFromLocation);
      window.removeEventListener('popstate', syncFromLocation);
      window.removeEventListener('pageshow', syncFromLocation);
    };
  }, []);

  return (
    <style jsx global>{`
      :root {
        --yat-side-drawer-w: 360px;
        --yat-left-drawer-w: var(--yat-side-drawer-w) !important;
        --yat-right-drawer-w: var(--yat-side-drawer-w) !important;
        --yat-min-gallery-card-w: 260px;
      }


      body:not(.yat-left-search-mode) #drawerLeft { width: min(86vw, var(--yat-side-drawer-w)) !important; max-width: var(--yat-side-drawer-w) !important; }
      /* Matching translucent surfaces for both themes and every drawer. */
      #drawerSort, #drawerFilters, #drawerFavorites, #drawerAccount { background:rgba(6,6,6,.70)!important; backdrop-filter:blur(4px)!important; -webkit-backdrop-filter:blur(4px)!important; }
      body.light-theme #drawerSort, body.light-theme #drawerFilters, body.light-theme #drawerFavorites, body.light-theme #drawerAccount { background:rgba(255,255,255,.76)!important; }
      @media (max-width: 779px) {
        body.drawer-sort-open #drawerSort { top:calc(var(--row1-h) + var(--row2-h))!important; bottom:var(--footerH)!important; height:auto!important; z-index:64!important; } body.yat-left-search-mode #drawerLeft { width: 100vw !important; max-width: 100vw !important; } }
      #drawerLeft .yat-left-nav-content .yat-drawer-nav-item { display:flex; align-items:center; gap:10px; letter-spacing:-.045em !important; word-spacing:-.12em !important; }
      #drawerLeft .yat-left-nav-content .yat-drawer-nav-item > span { display:inline-block; letter-spacing:-.045em; word-spacing:-.12em; }
      #drawerLeft .yat-left-nav-content .yat-drawer-nav-item > span strong { margin-left:0; margin-right:0; }
      #drawerLeft .yat-left-nav-content .yat-drawer-nav { padding-right:12px; }
      /* Exact rail/status color: TIMELINE_YELLOW in ZoomableCareerTimeline. */
      #drawerLeft { --yat-bracket-accent: #ffb21c; }
      body.light-theme #drawerLeft { --yat-bracket-accent: #8a5a00; }
      #drawerLeft .yat-bracket-symbol { display: block; width: 24px; height: 24px; flex: none; background-color: currentColor; -webkit-mask: url('/img/nav/fantasy-bracket.png') center / contain no-repeat; mask: url('/img/nav/fantasy-bracket.png') center / contain no-repeat; }
      #drawerLeft .yat-left-nav-content .yat-drawer-fantasy-highlight { padding: 8px 0; border: 0; border-radius: 0; background: none; box-shadow: none; outline: none; color: var(--yat-bracket-accent); }
      #drawerLeft .yat-left-nav-content .yat-drawer-fantasy-highlight > .yat-drawer-fantasy-copy { display: flex; flex: 1; min-width: 0; flex-direction: column; gap: 3px; font-size: clamp(9px, 2.8vw, 12px); line-height: 1.15; }
      #drawerLeft .yat-drawer-fantasy-copy > span { display: block; white-space: nowrap; }
      #drawerLeft .yat-left-nav-content .yat-drawer-fantasy-highlight { gap: 7px; }
      #drawerLeft .yat-left-nav-content .yat-drawer-fantasy-highlight > .yat-fantasy-countdown { display: flex; flex: 0 0 clamp(104px, 32vw, 124px); width: clamp(104px, 32vw, 124px); margin-left: auto; padding: 5px 6px 6px; flex-direction: column; gap: 4px; border: 0; border-radius: 5px; background: linear-gradient(145deg, #286343, #1c4f34); color: #fff; letter-spacing: normal; word-spacing: normal; text-transform: uppercase; }
      #drawerLeft .yat-fantasy-countdown-date { display: block; text-align: center; color: #ffb21c; font: 700 12px/1.05 Caveat, "Segoe Print", cursive; letter-spacing: 0; text-transform: none; }
      #drawerLeft .yat-fantasy-countdown-cells { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 4px; }
      #drawerLeft .yat-fantasy-countdown-cell { display: flex; min-width: 0; flex-direction: column; align-items: stretch; gap: 3px; text-align: center; }
      #drawerLeft .yat-fantasy-countdown-unit { color: #fff; font: 600 7px/1 Oswald, sans-serif; letter-spacing: .025em; }
      #drawerLeft .yat-fantasy-countdown-number { display: block; padding: 4px 1px 3px; border: 0; border-radius: 4px; background: linear-gradient(180deg, #071c0e, #102f1b); box-shadow: inset 0 2px 5px rgba(0,0,0,.45); color: #ffb21c; font: 700 19px/1 Oswald, sans-serif; font-variant-numeric: tabular-nums; letter-spacing: -.035em; text-shadow: 0 1px 1px #000; }
      /* Treat the fantasy destination as a regular menu title, with a compact side countdown. */
      #drawerLeft .yat-left-nav-content .yat-drawer-fantasy-highlight > .yat-drawer-fantasy-copy {
        font-family: var(--yat-font-compact), "Barlow Condensed", sans-serif;
        font-size: inherit;
        font-weight: 700;
        line-height: 1.08;
        letter-spacing: normal !important;
        word-spacing: normal !important;
        gap: 2px;
      }
      #drawerLeft .yat-drawer-fantasy-copy > span { white-space: normal; font-size: inherit; letter-spacing: normal !important; word-spacing: normal !important; }
      #drawerLeft .yat-drawer-fantasy-copy > span:nth-child(2) { font-weight: 700; }
      #drawerLeft .yat-left-nav-content .yat-drawer-fantasy-highlight > .yat-fantasy-countdown {
        flex: 0 0 115px;
        width:115px;
        padding: 4px 5px;
        gap: 3px;
      }
      #drawerLeft .yat-fantasy-countdown-date { font-size: 9px; line-height: 1.1; white-space: nowrap; }
      #drawerLeft .yat-fantasy-countdown-cells { gap: 3px; }
      #drawerLeft .yat-fantasy-countdown-cell { gap: 2px; }
      #drawerLeft .yat-fantasy-countdown-number { font-size: 16px; padding: 3px 1px 2px; }
      @media (max-width: 420px) {
        #drawerLeft .yat-left-nav-content .yat-drawer-fantasy-highlight { gap: 5px; }
        #drawerLeft .yat-left-nav-content .yat-drawer-fantasy-highlight > .yat-fantasy-countdown { flex-basis: 108px; width: 108px; }
        #drawerLeft .yat-fantasy-countdown-date { font-size: 8.5px; }
      }
      #drawerLeft .yat-drawer-fantasy-highlight:is(:hover, :focus-visible) .yat-drawer-fantasy-copy > span { text-decoration: underline; text-underline-offset: 3px; }
      #drawerLeft .yat-drawer-fantasy-highlight:focus-visible .yat-bracket-symbol { filter: drop-shadow(0 0 3px currentColor); }
      #drawerLeft .yat-nav-page-icon { width:22px; min-width:22px; text-align:center; font-size:20px; }
      #drawerLeft .yat-nav-page-crest { width:25px; height:25px; object-fit:contain; flex:none; }
      #drawerLeft .yat-nav-custom-icon { width:24px; height:24px; min-width:24px; display:block; object-fit:contain; flex:none; mix-blend-mode:multiply; }
      body:not(.light-theme) #drawerLeft .yat-nav-custom-icon { filter:invert(1); mix-blend-mode:screen; }
      #drawerLeft .yat-nav-custom-icon.yat-nav-tour-icon { width:30px; height:30px; min-width:30px; margin-left:-3px; margin-right:-3px; }

      #drawerLeft .yat-drawer-visiting-school > .yat-drawer-crest-thumb { display:none; }
      #drawerLeft .yat-left-search-content { padding-left:20px; padding-right:20px; }
      /* Keep the left navigation translucent enough to retain page context. */
      #drawerLeft {
        background: rgba(6, 6, 6, 0.57) !important;
        backdrop-filter: blur(3px) !important;
        -webkit-backdrop-filter: blur(3px) !important;
      }

      body.light-theme #drawerLeft {
        background: rgba(255, 255, 255, 0.68) !important;
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
        body.drawer-sort-open #drawerSort,
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
        body.drawer-sort-open .yat-drawer-mask,
        body.drawer-sort-open .yat-drawer-mask,
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

        body.drawer-sort-open .yat-row3-shell,
        body.drawer-sort-open .yat-row4-shell,
        body.drawer-sort-open .yat-row5-shell,
        body.drawer-sort-open .yat-row6-shell,
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
        body.drawer-sort-open .yat-grid,
        body.drawer-right-open .yat-grid,
        body.drawer-account-open .yat-grid,
        body.drawer-favorites-open .yat-grid,
        body.yat-desktop-docked-drawers .yat-grid {
          /* Same fixed card width as the base .yat-grid rule (YatStyles):
             an open drawer means fewer columns, never bigger cards. The old
             auto-fit + 1fr tracks stretched the cards to fill the row, so
             a filter that left one card blew it up to full width. */
          grid-template-columns: repeat(auto-fill, min(100%, 264px)) !important;
          justify-content: center;
        }

        body.drawer-left-open .yat-schoolrow,
        body.drawer-left-open .gallery-strip,
        body.drawer-left-open .yat-grid,
        body.drawer-left-open .yat-table-wrap,
        body.drawer-left-open .yat-sec-header,
        body.drawer-left-open .yat-placeholder,
        body.drawer-sort-open .yat-schoolrow,
        body.drawer-sort-open .gallery-strip,
        body.drawer-sort-open .yat-grid,
        body.drawer-sort-open .yat-table-wrap,
        body.drawer-sort-open .yat-sec-header,
        body.drawer-sort-open .yat-placeholder,
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
        body.drawer-sort-open .yat-row2-shell,
        body.drawer-sort-open .yat-row3-shell,
        body.drawer-sort-open .yat-row4-shell,
        body.drawer-sort-open .yat-row5-shell,
        body.drawer-sort-open .yat-row6-shell,
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
      /* YAT?STATS photo/data/news contribution drawer: ONE unified geometry,
         regardless of entry point (account success, player card, portal).
         The four rows remain browsable while it is open. */
      #drawerContribute.yat-drawer {
        position:fixed!important;
        inset:auto 0 0 auto!important;
        top:0!important;
        height:100dvh!important;
        width:var(--yat-side-drawer-w)!important;
        max-width:var(--yat-side-drawer-w)!important;
        box-sizing:border-box!important;
        overflow-x:hidden!important;
        overflow-y:auto!important;
        background:rgba(6,6,6,.80)!important;
        backdrop-filter:blur(9px)!important;
        -webkit-backdrop-filter:blur(9px)!important;
        border-left:1px solid var(--line)!important;
        border-right:0!important;
        transform:translateX(105%)!important;
        transition:transform .22s ease!important;
        z-index:64!important;
      }
      body.light-theme #drawerContribute.yat-drawer {background:rgba(255,255,255,.87)!important;}
      body.drawer-contribute-open #drawerContribute.yat-drawer {transform:translateX(0)!important;}
      @media (min-width:780px) {
        body.drawer-contribute-open {overflow-y:auto!important;}
        body #drawerContribute.yat-drawer {
          top:calc(var(--row1-h) + var(--row2-h))!important;
          bottom:var(--footerH)!important;
          height:auto!important;
        }
        body.drawer-contribute-open .yat-drawer-mask {
          display:none!important;
          opacity:0!important;
          pointer-events:none!important;
        }
        body.drawer-contribute-open .yat-row3-shell,
        body.drawer-contribute-open .yat-row4-shell,
        body.drawer-contribute-open .yat-row5-shell,
        body.drawer-contribute-open .yat-row6-shell {
          margin-right:var(--yat-side-drawer-w)!important;
          transition:margin-right .22s ease;
        }
      }
      @media (max-width:779px) {
        #drawerContribute.yat-drawer {
          top:0!important;bottom:0!important;height:100dvh!important;
          width:100vw!important;max-width:100vw!important;
          z-index:2147483200!important;
        }
        body.drawer-contribute-open .yat-drawer-mask {
          opacity:1!important;pointer-events:auto!important;
          z-index:2147483199!important;
        }
      }
      /* Mobile navigation uses the same visual rhythm as the Connect &
         Contribute list: compact Archivo labels, no rules, rounded grey
         selection. Reserve scrolling room above the fixed ticker/footer. */
      @media (max-width:779px) {
        body.drawer-left-open #drawerLeft {
          bottom:var(--footerH, 88px)!important;
          height:auto!important;
        }
        #drawerLeft .yat-left-nav-content {
          flex:1 1 auto;
          min-height:0;
          overflow-y:auto;
          overscroll-behavior-y:contain;
          padding:8px 12px calc(16px + env(safe-area-inset-bottom, 0px));
          scrollbar-width:thin;
        }
        #drawerLeft .yat-left-nav-content .yat-drawer-nav {
          gap:3px;
          padding-right:0;
        }
        #drawerLeft .yat-left-nav-content .yat-drawer-nav-item {
          box-sizing:border-box;
          display:flex;
          align-items:center;
          flex:0 0 auto;
          min-height:46px;
          padding:7px 9px;
          gap:10px;
          border:0!important;
          border-bottom:0!important;
          border-radius:4px;
          background:transparent;
          color:var(--ink);
          text-decoration:none;
          font:800 14px/1.15 var(--yat-font-ui, Archivo, sans-serif)!important;
          letter-spacing:-.02em!important;
          word-spacing:normal!important;
          transition:background-color .12s ease;
        }
        #drawerLeft .yat-left-nav-content .yat-drawer-nav-item > span {
          min-width:0;
          letter-spacing:-.02em!important;
          word-spacing:normal!important;
          text-decoration:none;
        }
        #drawerLeft .yat-left-nav-content .yat-drawer-nav-item > span strong {
          font-weight:inherit;
          letter-spacing:inherit;
        }
        #drawerLeft .yat-left-nav-content :is(.yat-drawer-home-school,.yat-drawer-visiting-school) {
          margin-right:34px;
        }
        #drawerLeft .yat-left-nav-content .yat-drawer-nav-item:is(:hover,:active,:focus-visible,[aria-current="page"]) {
          background:var(--line);
        }
        #drawerLeft .yat-left-nav-content .yat-drawer-nav-item:focus-visible {
          outline:2px solid var(--fg);
          outline-offset:-2px;
        }
        /* Retain the special tournament art and countdown, but give its row
           the same background highlight and compact typography. */
        #drawerLeft .yat-left-nav-content .yat-drawer-fantasy-highlight {
          min-height:56px;
          padding:7px 9px;
          border-radius:4px;
          background:transparent;
          color:var(--yat-bracket-accent);
        }
        #drawerLeft .yat-left-nav-content .yat-drawer-fantasy-highlight > .yat-drawer-fantasy-copy {
          font:800 12px/1.12 var(--yat-font-ui, Archivo, sans-serif);
        }
        #drawerLeft .yat-left-nav-content .yat-drawer-fantasy-highlight:is(:hover,:active,:focus-visible,[aria-current="page"]) {
          background:var(--line);
          color:var(--yat-bracket-accent);
        }
      }

    `}</style>
  );
}
