// src/components/yatstats/shell/GlobalTopbar.tsx
// Renders Row 1 of the shared shell

'use client';

import { useEffect } from 'react';

const DOCKED_DRAWER_MIN_WIDTH = 1120;

function showLeftNavigationDrawer() {
  document.body.classList.add('drawer-left-open', 'drawer-open');
  document.body.classList.remove('yat-left-search-mode', 'drawer-right-open', 'drawer-account-open');
}

function showLeftSearchDrawer() {
  document.body.classList.add('drawer-left-open', 'drawer-open', 'yat-left-search-mode');
  document.body.classList.remove('drawer-right-open', 'drawer-account-open');

  setTimeout(() => {
    const input = document.getElementById('gsInput') as HTMLInputElement | null;
    input?.focus();
    input?.select();
  }, 60);
}

function openAccountDrawer() {
  document.body.classList.add('drawer-account-open', 'drawer-open');
  document.body.classList.remove('drawer-left-open', 'drawer-right-open', 'drawer-favorites-open');
}

function requestFavoritesDrawer() {
  document.body.classList.add('drawer-favorites-open', 'drawer-open');
  document.body.classList.remove('drawer-right-open', 'drawer-account-open');
  window.dispatchEvent(new CustomEvent('yat:open-favorites'));
}

function dockDesktopDrawers() {
  if (typeof window === 'undefined') return;

  const shouldDock = window.innerWidth >= DOCKED_DRAWER_MIN_WIDTH;

  if (shouldDock) {
    document.body.classList.add('yat-desktop-docked-drawers', 'drawer-left-open', 'drawer-favorites-open', 'drawer-open');
    document.body.classList.remove('drawer-account-open', 'drawer-right-open');
    window.dispatchEvent(new CustomEvent('yat:open-favorites'));
    return;
  }

  document.body.classList.remove('yat-desktop-docked-drawers');

  if (window.innerWidth < DOCKED_DRAWER_MIN_WIDTH) {
    if (document.body.classList.contains('yat-left-search-mode')) {
      document.body.classList.add('drawer-left-open', 'drawer-open');
      document.body.classList.remove('drawer-favorites-open', 'drawer-right-open', 'drawer-account-open');
      return;
    }

    document.body.classList.remove('drawer-left-open', 'drawer-favorites-open', 'drawer-open', 'yat-left-search-mode');
  }
}

export default function GlobalTopbar({ hsid }: { hsid: string }) {
  useEffect(() => {
    dockDesktopDrawers();

    let resizeTimer: ReturnType<typeof setTimeout> | null = null;
    const onResize = () => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(dockDesktopDrawers, 120);
    };

    const interceptSearchClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target?.closest('#openSearch')) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      showLeftSearchDrawer();
    };

    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', dockDesktopDrawers);
    document.addEventListener('click', interceptSearchClick, true);

    return () => {
      if (resizeTimer) clearTimeout(resizeTimer);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', dockDesktopDrawers);
      document.removeEventListener('click', interceptSearchClick, true);
      document.body.classList.remove('yat-desktop-docked-drawers');
    };
  }, []);

  return (
    <>
      <div className="yat-topbar">
        <div className="yat-topbar-left">
          <button id="btnMenu" className="yat-icon-btn" aria-label="Open navigation" onClick={(event) => { event.preventDefault(); event.stopPropagation(); showLeftNavigationDrawer(); }}>
            <i className="ri-menu-line" />
          </button>
          <button id="btnAccount" className="yat-icon-btn" aria-label="Open account drawer" onClick={(event) => { event.preventDefault(); event.stopPropagation(); openAccountDrawer(); }}>
            <i className="ri-user-line" />
          </button>
          <button id="theme-toggle" className="yat-icon-btn" aria-label="Toggle light/dark theme">
            <i className="ri-sun-line" />
          </button>
          <button id="openFavorites" className="yat-icon-btn" aria-label="Open favorites" title="Open favorites" onClick={(event) => { event.preventDefault(); event.stopPropagation(); requestFavoritesDrawer(); }}>
            <i className="ri-heart-line" />
          </button>
          <button id="openSearch" className="yat-icon-btn" aria-label="Open global search" title="Open global search" onClick={(event) => { event.preventDefault(); event.stopPropagation(); showLeftSearchDrawer(); }}>
            <i className="ri-search-line" />
          </button>
        </div>

        <nav className="yat-topnav" aria-label="Desktop navigation">
          <a className="yat-topnav-item" href={`/${hsid}`}><span>WHERE THEY</span><strong>YAT?</strong></a>
          <a className="yat-topnav-item" data-tab="news" href="#sec-news"><span>ACTIVE ALUMNI</span><strong>NEWS</strong></a>
          <a className="yat-topnav-item" data-tab="alltime" href="#sec-alltime"><span>NEXT-LEVEL</span><strong>ALL-TIME LIST</strong></a>
          <a className="yat-topnav-item" data-tab="current" href="#sec-current"><span>2026</span><strong>TEAM</strong></a>
          <a className="yat-topnav-item" data-tab="fantasy" href="#sec-fantasy"><span>FANTASY</span><strong>BRACKET</strong></a>
          <a className="yat-topnav-item" data-tab="mentor" href="#sec-mentor"><span>MENTORSHIP</span><strong>MARKETPLACE</strong></a>
          <a className="yat-topnav-item" data-tab="partner" href="#sec-partner"><span>PARTNER</span><strong>PROGRAM</strong></a>
          <a className="yat-topnav-item" data-tab="about" href="#sec-about"><span>ABOUT</span><strong>US</strong></a>
          <a className="yat-topnav-item" data-tab="faq" href="#sec-faq"><strong>FAQ'S</strong></a>
        </nav>

        <div className="yat-wordmark-wrap">
          <a id="topbarHomeCrestLink" href="#" aria-label="Go to my home school" className="yat-topbar-home-crest-link" hidden>
            <img id="topbarHomeCrestImg" src="" alt="My home school" className="yat-topbar-home-crest" />
          </a>
          <a href="https://yatstats.com" aria-label="Go to YAT?STATS homepage">
            <img src="https://yatstats-assets.s3.us-west-2.amazonaws.com/yatstats/yslogo.png" alt="YAT?STATS" className="yat-wordmark-img" />
          </a>
        </div>
      </div>

      <style jsx global>{`
        #drawerLeft .yat-left-search-content { display: none; }
        body.yat-left-search-mode #drawerLeft .yat-left-nav-content { display: none; }
        body.yat-left-search-mode #drawerLeft .yat-left-search-content { display: block; }
        #drawerLeft .yat-search-drawer-title { margin: 0 0 4px; font: 900 15px/1 Oswald, sans-serif; letter-spacing: .06em; text-transform: uppercase; }
        #drawerLeft .yat-search-drawer-sub { margin: 0 0 12px; color: var(--muted); font: 400 10px/1.35 Oswald, sans-serif; letter-spacing: .04em; text-transform: uppercase; }
        #drawerLeft .yat-gs-input-wrap { margin-bottom: 10px; }
        #drawerLeft .yat-gs-results { max-height: calc(100vh - var(--row1-h) - var(--footerH) - 130px); overflow: auto; }

        /* FunZone readability pass: remove redundant stats headers and restore bigger mobile stat cells. */
        .fz-cta-strip { min-height: 34px !important; max-height: 42px !important; gap: clamp(2px, 1cqi, 5px) !important; padding: clamp(2px, .8cqi, 4px) clamp(4px, 1.6cqi, 8px) !important; }
        .fz-yati-img { width: clamp(22px, 6.5cqi, 34px) !important; max-height: 34px !important; align-self: center !important; }
        .fz-bubble { min-height: 24px !important; display: flex !important; align-items: center !important; padding: clamp(2px, .8cqi, 4px) clamp(4px, 1.5cqi, 8px) !important; border-radius: 6px !important; }
        .fz-bubble-text { font-size: clamp(5px, 1.9cqi, 8px) !important; line-height: 1.12 !important; }
        .fz-panel { padding: clamp(4px, 1.35cqi, 8px) clamp(5px, 1.8cqi, 10px) !important; }
        .fz-stats-shell, .fz-stats { gap: clamp(4px, 1.2cqi, 7px) !important; }

        .fz-stat-bucket-tabs { display: flex !important; flex-wrap: nowrap !important; gap: 3px !important; min-height: 22px !important; }
        .fz-stat-bucket-btn { flex: 1 1 0 !important; height: 22px !important; min-height: 22px !important; padding: 2px 5px !important; white-space: nowrap !important; overflow: hidden !important; text-overflow: ellipsis !important; font-size: clamp(7px, 2.1cqi, 10px) !important; line-height: 1 !important; border-radius: 5px !important; }

        /* If bucket tabs exist, they ARE the stats header. Do not render a second row repeating the selected bucket. */
        .fz-stat-bucket-tabs + .fz-stats .yat-stats-bar { display: none !important; }

        .yat-stats-bar { min-height: 22px !important; padding: 2px 6px !important; margin: 0 !important; font-size: clamp(10px, 3cqi, 15px) !important; line-height: 1 !important; border-radius: 5px !important; }
        .yat-stats-grid { gap: clamp(5px, 1.35cqi, 8px) !important; grid-template-rows: repeat(4, minmax(0, 1fr)) !important; }
        .yat-stat { min-height: 0 !important; gap: 2px !important; padding: 3px 4px !important; border-radius: 8px !important; flex-direction: column !important; align-items: center !important; justify-content: center !important; }
        .yat-stat-label { font-size: clamp(10px, 3.1cqi, 15px) !important; line-height: .95 !important; margin: 0 !important; opacity: .62 !important; }
        .yat-stat-val { font-size: clamp(23px, 7.6cqi, 34px) !important; line-height: .92 !important; margin: 0 !important; }
        .fz-tab-btn { padding: clamp(3px, 1cqi, 5px) 1px !important; }

        @media (min-width: 1120px) {
          body.yat-desktop-docked-drawers.drawer-open { overflow: auto; }
          body.yat-desktop-docked-drawers .yat-drawer-mask { display: none !important; opacity: 0 !important; pointer-events: none !important; }
          body.yat-desktop-docked-drawers #drawerLeft,
          body.yat-desktop-docked-drawers #drawerFavorites { top: var(--row1-h); bottom: var(--footerH); height: auto; z-index: 55; transform: translateX(0) !important; }
          body.yat-desktop-docked-drawers #drawerLeft { width: clamp(240px, 17vw, 290px); }
          body.yat-desktop-docked-drawers #drawerFavorites { width: clamp(280px, 19vw, 340px); }
          body.yat-desktop-docked-drawers .yat-row2-shell,
          body.yat-desktop-docked-drawers .yat-row3-shell,
          body.yat-desktop-docked-drawers .yat-row4-shell,
          body.yat-desktop-docked-drawers .yat-row5-shell,
          body.yat-desktop-docked-drawers .yat-row6-shell,
          body.yat-desktop-docked-drawers .yat-footer { margin-left: clamp(240px, 17vw, 290px); margin-right: clamp(280px, 19vw, 340px); }
          body.yat-desktop-docked-drawers .yat-footer { left: clamp(240px, 17vw, 290px); right: clamp(280px, 19vw, 340px); width: auto; margin-left: 0; margin-right: 0; }
          body.yat-desktop-docked-drawers .yat-schoolrow,
          body.yat-desktop-docked-drawers .gallery-strip,
          body.yat-desktop-docked-drawers .yat-grid,
          body.yat-desktop-docked-drawers .yat-table-wrap,
          body.yat-desktop-docked-drawers .yat-sec-header,
          body.yat-desktop-docked-drawers .yat-placeholder { max-width: none; }
          body.yat-desktop-docked-drawers .yat-grid { grid-template-columns: repeat(5, minmax(0, 1fr)); }
        }

        @media (min-width: 1120px) and (max-width: 1500px) { body.yat-desktop-docked-drawers .yat-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
        @media (min-width: 1120px) and (max-width: 1280px) { body.yat-desktop-docked-drawers .yat-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
        @media (max-width: 1119px) {
          body.yat-desktop-docked-drawers .yat-row2-shell,
          body.yat-desktop-docked-drawers .yat-row3-shell,
          body.yat-desktop-docked-drawers .yat-row4-shell,
          body.yat-desktop-docked-drawers .yat-row5-shell,
          body.yat-desktop-docked-drawers .yat-row6-shell,
          body.yat-desktop-docked-drawers .yat-footer { margin-left: 0; margin-right: 0; }
        }
      `}</style>
    </>
  );
}
