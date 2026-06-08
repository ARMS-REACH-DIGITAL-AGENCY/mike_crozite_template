// src/components/yatstats/shell/GlobalTopbar.tsx
// Renders Row 1 of the shared shell

'use client';

import { useEffect } from 'react';

const DOCKED_DRAWER_AUTO_WIDTH = 1600;
const DOCKED_DRAWER_MIN_WIDTH = 1240;

function showLeftNavigationDrawer() {
  document.body.classList.add('drawer-left-open', 'drawer-open');
  document.body.classList.remove('yat-left-search-mode', 'drawer-sort-open', 'drawer-right-open', 'drawer-account-open');
}

function showLeftSearchDrawer() {
  document.body.classList.add('drawer-left-open', 'drawer-open', 'yat-left-search-mode');
  document.body.classList.remove('drawer-sort-open', 'drawer-right-open', 'drawer-account-open');

  setTimeout(() => {
    const input = document.getElementById('gsInput') as HTMLInputElement | null;
    input?.focus();
    input?.select();
  }, 60);
}

function openAccountDrawer() {
  document.body.classList.add('drawer-account-open', 'drawer-open');
  document.body.classList.remove('drawer-left-open', 'drawer-sort-open', 'drawer-right-open', 'drawer-favorites-open');
}

function requestFavoritesDrawer() {
  document.body.classList.add('drawer-favorites-open', 'drawer-open');
  document.body.classList.remove('drawer-sort-open', 'drawer-right-open', 'drawer-account-open');
  window.dispatchEvent(new CustomEvent('yat:open-favorites'));
}

function dockDesktopDrawers() {
  if (typeof window === 'undefined') return;

  const canAutoDockBothDrawers = window.innerWidth >= DOCKED_DRAWER_AUTO_WIDTH;
  const mustCollapseDrawers = window.innerWidth < DOCKED_DRAWER_MIN_WIDTH;

  document.body.classList.toggle('yat-desktop-docked-drawers', canAutoDockBothDrawers);

  if (canAutoDockBothDrawers) {
    document.body.classList.add('drawer-left-open', 'drawer-favorites-open', 'drawer-open');
    document.body.classList.remove('drawer-sort-open', 'drawer-account-open', 'drawer-right-open');
    window.dispatchEvent(new CustomEvent('yat:open-favorites'));
    return;
  }

  if (mustCollapseDrawers) {
    if (document.body.classList.contains('yat-left-search-mode')) {
      document.body.classList.add('drawer-left-open', 'drawer-open');
      document.body.classList.remove('drawer-favorites-open', 'drawer-sort-open', 'drawer-right-open', 'drawer-account-open');
      return;
    }

    document.body.classList.remove('yat-desktop-docked-drawers');
    document.body.classList.toggle(
      'drawer-open',
      document.body.classList.contains('drawer-left-open') ||
        document.body.classList.contains('drawer-sort-open') ||
        document.body.classList.contains('drawer-right-open') ||
        document.body.classList.contains('drawer-account-open') ||
        document.body.classList.contains('drawer-favorites-open'),
    );
  }
}

function schoolSectionHref(hsid: string, section: string) {
  return `/${encodeURIComponent(hsid)}#sec-${section}`;
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

    const interceptPlayerProfileSectionNav = (event: MouseEvent) => {
      if (window.location.pathname.indexOf('/player/') === -1) return;

      const target = event.target as HTMLElement | null;
      const navItem = target?.closest('[data-tab]') as HTMLElement | null;
      if (!navItem || navItem.closest('#drawerAccount')) return;

      const tab = navItem.dataset.tab;
      if (!tab) return;

      const section = tab === 'team' ? 'current' : tab;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      window.location.href = schoolSectionHref(hsid, section);
    };

    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', dockDesktopDrawers);
    document.addEventListener('click', interceptSearchClick, true);
    document.addEventListener('click', interceptPlayerProfileSectionNav, true);

    return () => {
      if (resizeTimer) clearTimeout(resizeTimer);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', dockDesktopDrawers);
      document.removeEventListener('click', interceptSearchClick, true);
      document.body.classList.remove('yat-desktop-docked-drawers');
    };
  }, [hsid]);

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
          <a className="yat-topnav-item" data-tab="news" href={schoolSectionHref(hsid, 'news')}><span>ACTIVE ALUMNI</span><strong>NEWS</strong></a>
          <a className="yat-topnav-item" data-tab="alltime" href={schoolSectionHref(hsid, 'alltime')}><span>NEXT-LEVEL</span><strong>ALL-TIME LIST</strong></a>
          <a className="yat-topnav-item" data-tab="current" href={schoolSectionHref(hsid, 'current')}><span>2026</span><strong>TEAM</strong></a>
          <a className="yat-topnav-item" data-tab="fantasy" href={schoolSectionHref(hsid, 'fantasy')}><span>FANTASY</span><strong>BRACKET</strong></a>
          <a className="yat-topnav-item" data-tab="mentor" href={schoolSectionHref(hsid, 'mentor')}><span>MENTORSHIP</span><strong>MARKETPLACE</strong></a>
          <a className="yat-topnav-item" data-tab="partner" href={schoolSectionHref(hsid, 'partner')}><span>PARTNER</span><strong>PROGRAM</strong></a>
          <a className="yat-topnav-item" data-tab="about" href={schoolSectionHref(hsid, 'about')}><span>ABOUT</span><strong>US</strong></a>
          <a className="yat-topnav-item" data-tab="faq" href={schoolSectionHref(hsid, 'faq')}><strong>FAQ&apos;S</strong></a>
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

        /* Mobile profile FunZone fix: keep content in normal flow and center the six-icon row. */
        @media (max-width: 767px) {
          .pp-funzone-outer,
          .pp-funzone {
            min-height: 0 !important;
            height: auto !important;
          }

          .pp-funzone {
            width: 100% !important;
            max-width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
          }

          .pp-fz-panel {
            min-height: 0 !important;
            height: auto !important;
            max-height: none !important;
            overflow: visible !important;
            padding: 10px 10px 8px !important;
            scroll-margin-top: calc(var(--row1-h) + var(--row2-h) + var(--row3-h) + var(--row4-h) + 8px) !important;
            scroll-margin-bottom: calc(var(--profile-tabs-h, 64px) + var(--footerH, 64px) + 12px) !important;
          }

          .pp-fz-panel-default,
          #ppTab-schedule:target,
          #ppTab-stats:target,
          #ppTab-news:target,
          #ppTab-social:target,
          #ppTab-connect:target,
          #ppTab-upload:target {
            display: block !important;
          }

          #ppTab-schedule:target ~ #ppTab-stats.pp-fz-panel-default,
          #ppTab-news:target ~ #ppTab-stats.pp-fz-panel-default,
          #ppTab-social:target ~ #ppTab-stats.pp-fz-panel-default,
          #ppTab-connect:target ~ #ppTab-stats.pp-fz-panel-default,
          #ppTab-upload:target ~ #ppTab-stats.pp-fz-panel-default {
            display: none !important;
          }

          .pp-fz-tabs-shell {
            position: sticky !important;
            left: auto !important;
            right: auto !important;
            bottom: var(--footerH, 64px) !important;
            width: 100% !important;
            height: var(--profile-tabs-h, 64px) !important;
            display: flex !important;
            justify-content: center !important;
            align-items: stretch !important;
            overflow: hidden !important;
            z-index: 10010 !important;
            background: rgba(12,12,12,.985) !important;
            border-top: 1px solid rgba(255,255,255,.12) !important;
            box-shadow: 0 -10px 26px rgba(0,0,0,.58) !important;
          }

          .pp-fz-tabs {
            box-sizing: border-box !important;
            width: 100% !important;
            max-width: 520px !important;
            height: var(--profile-tabs-h, 64px) !important;
            margin: 0 auto !important;
            padding: 0 8px !important;
            display: grid !important;
            grid-template-columns: repeat(6, minmax(0, 1fr)) !important;
            align-items: stretch !important;
            overflow: visible !important;
            scrollbar-width: none !important;
          }

          .pp-fz-tab {
            box-sizing: border-box !important;
            width: auto !important;
            min-width: 0 !important;
            max-width: none !important;
            height: var(--profile-tabs-h, 64px) !important;
            padding: 8px 1px 7px !important;
            display: flex !important;
            flex-direction: column !important;
            align-items: center !important;
            justify-content: center !important;
            gap: 4px !important;
            text-align: center !important;
            font-size: clamp(7px, 2.15vw, 9px) !important;
            letter-spacing: .06em !important;
            line-height: 1 !important;
          }

          .pp-fz-tab i {
            font-size: clamp(18px, 5.2vw, 24px) !important;
            line-height: 1 !important;
          }

          .pp-fz-tab span {
            display: block !important;
            max-width: 100% !important;
            overflow: hidden !important;
            text-overflow: ellipsis !important;
            white-space: nowrap !important;
          }
        }

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
          z-index: 64 !important;
          transform: translateX(0) !important;
        }

        body.drawer-left-open .yat-drawer-mask,
        body.drawer-right-open .yat-drawer-mask,
        body.drawer-account-open .yat-drawer-mask,
        body.drawer-favorites-open .yat-drawer-mask {
          top: calc(var(--row1-h) + var(--row2-h)) !important;
          bottom: var(--footerH) !important;
          height: auto !important;
          z-index: 63 !important;
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
