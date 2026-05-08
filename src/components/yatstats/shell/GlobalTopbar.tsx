// src/components/yatstats/shell/GlobalTopbar.tsx
// Renders Row 1 of the shared shell

'use client';

import { useEffect } from 'react';

const DOCKED_DRAWER_AUTO_WIDTH = 1600;
const DOCKED_DRAWER_MIN_WIDTH = 1240;

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

  const canAutoDockBothDrawers = window.innerWidth >= DOCKED_DRAWER_AUTO_WIDTH;
  const mustCollapseDrawers = window.innerWidth < DOCKED_DRAWER_MIN_WIDTH;

  document.body.classList.toggle('yat-desktop-docked-drawers', canAutoDockBothDrawers);

  if (canAutoDockBothDrawers) {
    document.body.classList.add('drawer-left-open', 'drawer-favorites-open', 'drawer-open');
    document.body.classList.remove('drawer-account-open', 'drawer-right-open');
    window.dispatchEvent(new CustomEvent('yat:open-favorites'));
    return;
  }

  if (mustCollapseDrawers) {
    if (document.body.classList.contains('yat-left-search-mode')) {
      document.body.classList.add('drawer-left-open', 'drawer-open');
      document.body.classList.remove('drawer-favorites-open', 'drawer-right-open', 'drawer-account-open');
      return;
    }

    document.body.classList.remove(
      'drawer-left-open',
      'drawer-favorites-open',
      'drawer-right-open',
      'drawer-account-open',
      'drawer-open',
      'yat-left-search-mode',
    );
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
        :root { --yat-left-drawer-w: clamp(240px, 17vw, 290px); --yat-right-drawer-w: 360px; }

        #drawerLeft .yat-left-search-content { display: none; }
        body.yat-left-search-mode #drawerLeft .yat-left-nav-content { display: none; }
        body.yat-left-search-mode #drawerLeft .yat-left-search-content { display: block; }
        #drawerLeft .yat-search-drawer-title { margin: 0 0 4px; font: 900 15px/1 Oswald, sans-serif; letter-spacing: .06em; text-transform: uppercase; }
        #drawerLeft .yat-search-drawer-sub { margin: 0 0 12px; color: var(--muted); font: 400 10px/1.35 Oswald, sans-serif; letter-spacing: .04em; text-transform: uppercase; }
        #drawerLeft .yat-gs-input-wrap { margin-bottom: 10px; position: relative; display: flex; align-items: center; }
        #drawerLeft .yat-gs-input-wrap i { position: absolute; right: 11px; left: auto; top: 50%; transform: translateY(-50%); pointer-events: none; opacity: .78; z-index: 2; }
        #drawerLeft .yat-gs-input { padding-left: 10px !important; padding-right: 36px !important; }
        #drawerLeft .yat-gs-results { max-height: calc(100vh - var(--row1-h) - var(--row2-h) - var(--footerH) - 170px); overflow: auto; }

        #drawerFavorites { width: min(86vw, var(--yat-right-drawer-w)) !important; }

        .yat-card { container-type: inline-size; container-name: yat-card; }

        .fz-cta-strip { min-height: 28px !important; max-height: 36px !important; gap: clamp(2px, 1cqw, 5px) !important; padding: clamp(2px, .8cqw, 4px) clamp(4px, 1.6cqw, 8px) !important; }
        .fz-yati-img { width: clamp(18px, 9cqw, 28px) !important; max-height: 28px !important; align-self: center !important; }
        .fz-bubble { min-height: 20px !important; display: flex !important; align-items: center !important; padding: clamp(2px, .8cqw, 4px) clamp(4px, 1.5cqw, 8px) !important; border-radius: 6px !important; }
        .fz-bubble-text { font-size: clamp(5px, 2.7cqw, 8px) !important; line-height: 1.05 !important; }
        .fz-panel { padding: clamp(3px, 1.6cqw, 6px) clamp(4px, 1.8cqw, 8px) !important; }
        .fz-stats-shell, .fz-stats { gap: clamp(3px, 1.55cqw, 6px) !important; }

        .fz-stat-bucket-tabs { display: flex !important; flex-wrap: nowrap !important; gap: 2px !important; min-height: 18px !important; }
        .fz-stat-bucket-btn { flex: 1 1 0 !important; height: 18px !important; min-height: 18px !important; padding: 1px 3px !important; white-space: nowrap !important; overflow: hidden !important; text-overflow: ellipsis !important; font-size: clamp(5px, 3cqw, 8px) !important; line-height: 1 !important; border-radius: 5px !important; }

        .fz-stat-bucket-tabs + .fz-stats .yat-stats-bar { display: none !important; }

        .yat-stats-bar { min-height: 18px !important; padding: 2px 5px !important; margin: 0 !important; font-size: clamp(7px, 3.6cqw, 11px) !important; line-height: 1 !important; border-radius: 5px !important; }
        .yat-stats-grid { gap: clamp(3px, 1.7cqw, 6px) !important; grid-template-rows: repeat(4, minmax(0, 1fr)) !important; }
        .yat-stat { min-height: 0 !important; gap: 3px !important; padding: 2px 3px !important; border-radius: 6px !important; flex-direction: column !important; align-items: center !important; justify-content: center !important; overflow: hidden !important; }
        .yat-stat-label { font-size: clamp(6px, 3cqw, 9px) !important; line-height: 1 !important; margin: 0 !important; opacity: .62 !important; white-space: nowrap !important; }
        .yat-stat-val { font-size: clamp(14px, 8.7cqw, 20px) !important; line-height: .92 !important; margin: 0 !important; letter-spacing: -.02em !important; white-space: nowrap !important; max-width: 100% !important; }
        .fz-tab-btn { padding: clamp(2px, 1cqw, 4px) 1px !important; }

        .yat-footer {
          left: 0 !important;
          right: 0 !important;
          width: 100% !important;
          margin-left: 0 !important;
          margin-right: 0 !important;
          z-index: 70 !important;
        }

        body.drawer-left-open #drawerLeft,
        body.drawer-right-open #drawerFilters,
        body.drawer-account-open #drawerAccount,
        body.drawer-favorites-open #drawerFavorites {
          top: calc(var(--row1-h) + var(--row2-h)) !important;
          bottom: var(--footerH) !important;
          height: auto !important;
          z-index: 55 !important;
          transform: translateX(0) !important;
        }

        body.drawer-left-open .yat-drawer-mask,
        body.drawer-right-open .yat-drawer-mask,
        body.drawer-account-open .yat-drawer-mask,
        body.drawer-favorites-open .yat-drawer-mask {
          top: calc(var(--row1-h) + var(--row2-h)) !important;
          bottom: var(--footerH) !important;
          height: auto !important;
          z-index: 50 !important;
        }

        @media (min-width: 1240px) {
          body.drawer-open.drawer-left-open .yat-row2-shell,
          body.drawer-open.drawer-left-open .yat-row3-shell,
          body.drawer-open.drawer-left-open .yat-row4-shell,
          body.drawer-open.drawer-left-open .yat-row5-shell,
          body.drawer-open.drawer-left-open .yat-row6-shell { margin-left: var(--yat-left-drawer-w); }

          body.drawer-open.drawer-favorites-open .yat-row2-shell,
          body.drawer-open.drawer-favorites-open .yat-row3-shell,
          body.drawer-open.drawer-favorites-open .yat-row4-shell,
          body.drawer-open.drawer-favorites-open .yat-row5-shell,
          body.drawer-open.drawer-favorites-open .yat-row6-shell { margin-right: var(--yat-right-drawer-w); }

          body.drawer-open.drawer-left-open #drawerLeft { width: var(--yat-left-drawer-w); }
          body.drawer-open.drawer-favorites-open #drawerFavorites { width: var(--yat-right-drawer-w) !important; }

          body.drawer-open .yat-drawer-mask,
          body.yat-desktop-docked-drawers .yat-drawer-mask { display: none !important; opacity: 0 !important; pointer-events: none !important; }

          body.yat-desktop-docked-drawers.drawer-open { overflow: auto; }
          body.yat-desktop-docked-drawers #drawerLeft { width: var(--yat-left-drawer-w); }
          body.yat-desktop-docked-drawers #drawerFavorites { width: var(--yat-right-drawer-w) !important; }
          body.yat-desktop-docked-drawers .yat-row2-shell,
          body.yat-desktop-docked-drawers .yat-row3-shell,
          body.yat-desktop-docked-drawers .yat-row4-shell,
          body.yat-desktop-docked-drawers .yat-row5-shell,
          body.yat-desktop-docked-drawers .yat-row6-shell { margin-left: var(--yat-left-drawer-w); margin-right: var(--yat-right-drawer-w); }
          body.yat-desktop-docked-drawers .yat-footer { left: 0 !important; right: 0 !important; width: 100% !important; margin-left: 0 !important; margin-right: 0 !important; }
          body.yat-desktop-docked-drawers .yat-schoolrow,
          body.yat-desktop-docked-drawers .gallery-strip,
          body.yat-desktop-docked-drawers .yat-grid,
          body.yat-desktop-docked-drawers .yat-table-wrap,
          body.yat-desktop-docked-drawers .yat-sec-header,
          body.yat-desktop-docked-drawers .yat-placeholder { max-width: none; }
          body.yat-desktop-docked-drawers .yat-grid { grid-template-columns: repeat(5, minmax(0, 1fr)); }
        }

        @media (min-width: 1600px) and (max-width: 1849px) { body.yat-desktop-docked-drawers .yat-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
        @media (min-width: 1240px) and (max-width: 1599px) { body.yat-desktop-docked-drawers .yat-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
        @media (max-width: 1239px) {
          body.yat-desktop-docked-drawers .yat-row2-shell,
          body.yat-desktop-docked-drawers .yat-row3-shell,
          body.yat-desktop-docked-drawers .yat-row4-shell,
          body.yat-desktop-docked-drawers .yat-row5-shell,
          body.yat-desktop-docked-drawers .yat-row6-shell,
          body.yat-desktop-docked-drawers .yat-footer,
          body.drawer-open.drawer-left-open .yat-row2-shell,
          body.drawer-open.drawer-left-open .yat-row3-shell,
          body.drawer-open.drawer-left-open .yat-row4-shell,
          body.drawer-open.drawer-left-open .yat-row5-shell,
          body.drawer-open.drawer-left-open .yat-row6-shell,
          body.drawer-open.drawer-favorites-open .yat-row2-shell,
          body.drawer-open.drawer-favorites-open .yat-row3-shell,
          body.drawer-open.drawer-favorites-open .yat-row4-shell,
          body.drawer-open.drawer-favorites-open .yat-row5-shell,
          body.drawer-open.drawer-favorites-open .yat-row6-shell {
            margin-left: 0 !important;
            margin-right: 0 !important;
          }
        }
      `}</style>
    </>
  );
}
