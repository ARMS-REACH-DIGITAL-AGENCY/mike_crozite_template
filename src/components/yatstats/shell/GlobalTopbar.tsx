// src/components/yatstats/shell/GlobalTopbar.tsx
// Renders Row 1 of the shared shell

'use client';

import { useEffect } from 'react';

const DOCKED_DRAWER_MIN_WIDTH = 1120;

function openAccountDrawer() {
  document.body.classList.add('drawer-account-open', 'drawer-open');
  document.body.classList.remove('drawer-left-open', 'drawer-right-open', 'drawer-favorites-open');
}

function requestFavoritesDrawer() {
  document.body.classList.add('drawer-favorites-open', 'drawer-open');
  document.body.classList.remove('drawer-left-open', 'drawer-right-open', 'drawer-account-open');
  window.dispatchEvent(new CustomEvent('yat:open-favorites'));
}

function dockDesktopDrawers() {
  if (typeof window === 'undefined') return;

  const shouldDock = window.innerWidth >= DOCKED_DRAWER_MIN_WIDTH && !window.location.pathname.includes('/player/');

  if (shouldDock) {
    document.body.classList.add('yat-desktop-docked-drawers', 'drawer-left-open', 'drawer-favorites-open', 'drawer-open');
    document.body.classList.remove('drawer-account-open', 'drawer-right-open');
    window.dispatchEvent(new CustomEvent('yat:open-favorites'));
    return;
  }

  document.body.classList.remove('yat-desktop-docked-drawers');

  if (window.innerWidth < DOCKED_DRAWER_MIN_WIDTH) {
    document.body.classList.remove('drawer-left-open', 'drawer-favorites-open', 'drawer-open');
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

    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', dockDesktopDrawers);

    return () => {
      if (resizeTimer) clearTimeout(resizeTimer);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', dockDesktopDrawers);
      document.body.classList.remove('yat-desktop-docked-drawers');
    };
  }, []);

  return (
    <>
      <div className="yat-topbar">
        <div className="yat-topbar-left">
          <button id="btnMenu" className="yat-icon-btn" aria-label="Open navigation">
            <i className="ri-menu-line" />
          </button>

          <button
            id="btnAccount"
            className="yat-icon-btn"
            aria-label="Open account drawer"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              openAccountDrawer();
            }}
          >
            <i className="ri-user-line" />
          </button>

          <button id="theme-toggle" className="yat-icon-btn" aria-label="Toggle light/dark theme">
            <i className="ri-sun-line" />
          </button>

          <button
            id="openFavorites"
            className="yat-icon-btn"
            aria-label="Open favorites"
            title="Open favorites"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              requestFavoritesDrawer();
            }}
          >
            <i className="ri-star-line" />
          </button>
        </div>

        <nav className="yat-topnav" aria-label="Desktop navigation">
          <a className="yat-topnav-item" href={`/${hsid}`}>
            <span>WHERE THEY</span>
            <strong>YAT?</strong>
          </a>

          <a className="yat-topnav-item" data-tab="news" href="#sec-news">
            <span>ACTIVE ALUMNI</span>
            <strong>NEWS</strong>
          </a>

          <a className="yat-topnav-item" data-tab="alltime" href="#sec-alltime">
            <span>NEXT-LEVEL</span>
            <strong>ALL-TIME LIST</strong>
          </a>

          <a className="yat-topnav-item" data-tab="current" href="#sec-current">
            <span>2026</span>
            <strong>TEAM</strong>
          </a>

          <a className="yat-topnav-item" data-tab="fantasy" href="#sec-fantasy">
            <span>FANTASY</span>
            <strong>BRACKET</strong>
          </a>

          <a className="yat-topnav-item" data-tab="mentor" href="#sec-mentor">
            <span>MENTORSHIP</span>
            <strong>MARKETPLACE</strong>
          </a>

          <a className="yat-topnav-item" data-tab="partner" href="#sec-partner">
            <span>PARTNER</span>
            <strong>PROGRAM</strong>
          </a>

          <a className="yat-topnav-item" data-tab="about" href="#sec-about">
            <span>ABOUT</span>
            <strong>US</strong>
          </a>

          <a className="yat-topnav-item" data-tab="faq" href="#sec-faq">
            <strong>FAQ'S</strong>
          </a>
        </nav>

        <div className="yat-wordmark-wrap">
          <a
            id="topbarHomeCrestLink"
            href="#"
            aria-label="Go to my home school"
            className="yat-topbar-home-crest-link"
            hidden
          >
            <img
              id="topbarHomeCrestImg"
              src=""
              alt="My home school"
              className="yat-topbar-home-crest"
            />
          </a>

          <a href="https://yatstats.com" aria-label="Go to YAT?STATS homepage">
            <img
              src="https://yatstats-assets.s3.us-west-2.amazonaws.com/yatstats/yslogo.png"
              alt="YAT?STATS"
              className="yat-wordmark-img"
            />
          </a>
        </div>
      </div>

      <style jsx global>{`
        @media (min-width: 1120px) {
          body.yat-desktop-docked-drawers.drawer-open {
            overflow: auto;
          }

          body.yat-desktop-docked-drawers .yat-drawer-mask {
            display: none !important;
            opacity: 0 !important;
            pointer-events: none !important;
          }

          body.yat-desktop-docked-drawers #drawerLeft,
          body.yat-desktop-docked-drawers #drawerFavorites {
            top: var(--row1-h);
            bottom: var(--footerH);
            height: auto;
            z-index: 55;
            transform: translateX(0) !important;
          }

          body.yat-desktop-docked-drawers #drawerLeft {
            width: clamp(240px, 17vw, 290px);
          }

          body.yat-desktop-docked-drawers #drawerFavorites {
            width: clamp(280px, 19vw, 340px);
          }

          body.yat-desktop-docked-drawers .yat-row2-shell,
          body.yat-desktop-docked-drawers .yat-row3-shell,
          body.yat-desktop-docked-drawers .yat-row4-shell,
          body.yat-desktop-docked-drawers .yat-row5-shell,
          body.yat-desktop-docked-drawers .yat-row6-shell,
          body.yat-desktop-docked-drawers .yat-footer {
            margin-left: clamp(240px, 17vw, 290px);
            margin-right: clamp(280px, 19vw, 340px);
          }

          body.yat-desktop-docked-drawers .yat-footer {
            left: clamp(240px, 17vw, 290px);
            right: clamp(280px, 19vw, 340px);
            width: auto;
            margin-left: 0;
            margin-right: 0;
          }

          body.yat-desktop-docked-drawers .yat-schoolrow,
          body.yat-desktop-docked-drawers .gallery-strip,
          body.yat-desktop-docked-drawers .yat-grid,
          body.yat-desktop-docked-drawers .yat-table-wrap,
          body.yat-desktop-docked-drawers .yat-sec-header,
          body.yat-desktop-docked-drawers .yat-placeholder {
            max-width: none;
          }

          body.yat-desktop-docked-drawers .yat-grid {
            grid-template-columns: repeat(5, minmax(0, 1fr));
          }
        }

        @media (min-width: 1120px) and (max-width: 1500px) {
          body.yat-desktop-docked-drawers .yat-grid {
            grid-template-columns: repeat(4, minmax(0, 1fr));
          }
        }

        @media (min-width: 1120px) and (max-width: 1280px) {
          body.yat-desktop-docked-drawers .yat-grid {
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }
        }

        @media (max-width: 1119px) {
          body.yat-desktop-docked-drawers .yat-row2-shell,
          body.yat-desktop-docked-drawers .yat-row3-shell,
          body.yat-desktop-docked-drawers .yat-row4-shell,
          body.yat-desktop-docked-drawers .yat-row5-shell,
          body.yat-desktop-docked-drawers .yat-row6-shell,
          body.yat-desktop-docked-drawers .yat-footer {
            margin-left: 0;
            margin-right: 0;
          }
        }
      `}</style>
    </>
  );
}
