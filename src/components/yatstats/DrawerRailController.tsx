'use client';

import { useEffect } from 'react';

const RAIL_MIN_WIDTH = 780;
const BOTH_RAILS_MIN_WIDTH = 1180;

function hasLeftOpen() {
  return document.body.classList.contains('drawer-left-open');
}

function hasAnyRightOpen() {
  return document.body.classList.contains('drawer-right-open')
    || document.body.classList.contains('drawer-account-open')
    || document.body.classList.contains('drawer-favorites-open');
}

function closeRightRails() {
  document.body.classList.remove('drawer-right-open', 'drawer-account-open', 'drawer-favorites-open');
}

function syncRailMode() {
  const width = window.innerWidth;
  const railCapable = width >= RAIL_MIN_WIDTH;
  const bothCapable = width >= BOTH_RAILS_MIN_WIDTH;

  document.body.classList.toggle('yat-rail-capable', railCapable);
  document.body.classList.toggle('yat-both-rails-capable', bothCapable);

  if (!railCapable) {
    document.body.classList.remove('yat-both-rails-capable', 'yat-desktop-docked-drawers');
    return;
  }

  if (!bothCapable && hasLeftOpen() && hasAnyRightOpen()) {
    closeRightRails();
  }

  document.body.classList.toggle('drawer-open', hasLeftOpen() || hasAnyRightOpen());
}

export default function DrawerRailController() {
  useEffect(() => {
    syncRailMode();

    let timer: ReturnType<typeof setTimeout> | null = null;
    const onResize = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(syncRailMode, 80);
    };

    const onClickCapture = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      const body = document.body;
      const bothCapable = window.innerWidth >= BOTH_RAILS_MIN_WIDTH;
      const railCapable = window.innerWidth >= RAIL_MIN_WIDTH;

      if (!railCapable) return;

      if (target.closest('#btnMenu, #openMenu')) {
        window.setTimeout(() => {
          body.classList.add('drawer-left-open', 'drawer-open');
          if (!bothCapable) closeRightRails();
          syncRailMode();
        }, 0);
        return;
      }

      if (target.closest('#openSearch')) {
        window.setTimeout(() => {
          body.classList.add('drawer-left-open', 'drawer-open', 'yat-left-search-mode');
          if (!bothCapable) closeRightRails();
          syncRailMode();
        }, 0);
        return;
      }

      if (target.closest('#openFilters')) {
        window.setTimeout(() => {
          body.classList.add('drawer-right-open', 'drawer-open');
          body.classList.remove('drawer-account-open', 'drawer-favorites-open');
          if (!bothCapable) body.classList.remove('drawer-left-open', 'yat-left-search-mode');
          syncRailMode();
        }, 0);
        return;
      }

      if (target.closest('#btnAccount')) {
        window.setTimeout(() => {
          body.classList.add('drawer-account-open', 'drawer-open');
          body.classList.remove('drawer-right-open', 'drawer-favorites-open');
          if (!bothCapable) body.classList.remove('drawer-left-open', 'yat-left-search-mode');
          syncRailMode();
        }, 0);
        return;
      }

      if (target.closest('#openFavorites')) {
        window.setTimeout(() => {
          body.classList.add('drawer-favorites-open', 'drawer-open');
          body.classList.remove('drawer-right-open', 'drawer-account-open');
          if (!bothCapable) body.classList.remove('drawer-left-open', 'yat-left-search-mode');
          syncRailMode();
        }, 0);
        return;
      }

      if (target.closest('#closeLeft')) {
        window.setTimeout(() => {
          body.classList.remove('drawer-left-open', 'yat-left-search-mode');
          syncRailMode();
        }, 0);
        return;
      }

      if (target.closest('#closeFilters')) {
        window.setTimeout(() => {
          body.classList.remove('drawer-right-open');
          syncRailMode();
        }, 0);
        return;
      }

      if (target.closest('#closeAccount')) {
        window.setTimeout(() => {
          body.classList.remove('drawer-account-open');
          syncRailMode();
        }, 0);
        return;
      }

      if (target.closest('#closeFavorites')) {
        window.setTimeout(() => {
          body.classList.remove('drawer-favorites-open');
          syncRailMode();
        }, 0);
      }
    };

    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', syncRailMode);
    document.addEventListener('click', onClickCapture, true);

    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', syncRailMode);
      document.removeEventListener('click', onClickCapture, true);
      document.body.classList.remove('yat-rail-capable', 'yat-both-rails-capable');
    };
  }, []);

  return null;
}
