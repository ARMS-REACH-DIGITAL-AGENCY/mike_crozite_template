'use client';

import { useEffect } from 'react';

const RAIL_MIN_WIDTH = 780;
const BOTH_RAILS_MIN_WIDTH = 1180;
const DRAWER_STATE_KEY = 'yat-drawer-state';
const THEME_KEY = 'yat-theme';

type DrawerState = {
  left: boolean;
  leftSearch: boolean;
  right: '' | 'sort' | 'filters' | 'account' | 'favorites';
};

function hasLeftOpen() {
  return document.body.classList.contains('drawer-left-open');
}

function getRightState(): DrawerState['right'] {
  if (document.body.classList.contains('drawer-sort-open')) return 'sort';
  if (document.body.classList.contains('drawer-right-open')) return 'filters';
  if (document.body.classList.contains('drawer-account-open')) return 'account';
  if (document.body.classList.contains('drawer-favorites-open')) return 'favorites';
  return '';
}

function hasAnyRightOpen() {
  return getRightState() !== '';
}

function closeRightRails() {
  document.body.classList.remove('drawer-sort-open', 'drawer-right-open', 'drawer-account-open', 'drawer-favorites-open');
}

function applyThemeFromStorage() {
  try {
    const saved = localStorage.getItem(THEME_KEY) || 'dark';
    const isLight = saved === 'light';
    document.documentElement.classList.toggle('light-theme', isLight);
    document.body.classList.toggle('light-theme', isLight);
    const icon = document.querySelector('#theme-toggle i');
    if (icon) icon.className = isLight ? 'ri-moon-line' : 'ri-sun-line';
  } catch {}
}

function readSavedDrawerState(): DrawerState | null {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(DRAWER_STATE_KEY) || 'null') as DrawerState | null;
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveDrawerState() {
  try {
    const state: DrawerState = {
      left: hasLeftOpen(),
      leftSearch: document.body.classList.contains('yat-left-search-mode'),
      right: getRightState(),
    };
    sessionStorage.setItem(DRAWER_STATE_KEY, JSON.stringify(state));
  } catch {}
}

function applyRightState(right: DrawerState['right']) {
  closeRightRails();
  if (right === 'sort') document.body.classList.add('drawer-sort-open');
  if (right === 'filters') document.body.classList.add('drawer-right-open');
  if (right === 'account') document.body.classList.add('drawer-account-open');
  if (right === 'favorites') {
    document.body.classList.add('drawer-favorites-open');
    window.dispatchEvent(new CustomEvent('yat:open-favorites'));
  }
}

function restoreDrawerState() {
  const saved = readSavedDrawerState();
  if (!saved) return;

  const width = window.innerWidth;
  const railCapable = width >= RAIL_MIN_WIDTH;
  const bothCapable = width >= BOTH_RAILS_MIN_WIDTH;

  if (!railCapable) return;

  document.body.classList.toggle('drawer-left-open', Boolean(saved.left));
  document.body.classList.toggle('yat-left-search-mode', Boolean(saved.left && saved.leftSearch));

  if (bothCapable || !saved.left) {
    applyRightState(saved.right || '');
  } else {
    applyRightState('');
  }

  syncRailMode();
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
  saveDrawerState();
}

function restoreAfterLegacyHandlers() {
  window.setTimeout(() => {
    applyThemeFromStorage();
    restoreDrawerState();
    syncRailMode();
  }, 0);
}

export default function DrawerRailController() {
  useEffect(() => {
    applyThemeFromStorage();
    restoreDrawerState();
    syncRailMode();

    let timer: ReturnType<typeof setTimeout> | null = null;
    const onResize = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        applyThemeFromStorage();
        syncRailMode();
      }, 80);
    };

    const onClickCapture = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      const body = document.body;
      const bothCapable = window.innerWidth >= BOTH_RAILS_MIN_WIDTH;
      const railCapable = window.innerWidth >= RAIL_MIN_WIDTH;

      if (target.closest('#theme-toggle')) {
        window.setTimeout(() => {
          applyThemeFromStorage();
          saveDrawerState();
        }, 0);
        return;
      }

      if (!railCapable) return;

      if (target.closest('#btnMenu, #openMenu')) {
        window.setTimeout(() => {
          body.classList.add('drawer-left-open', 'drawer-open');
          body.classList.remove('yat-left-search-mode');
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

      if (target.closest('#openSort')) {
        window.setTimeout(() => {
          body.classList.add('drawer-sort-open', 'drawer-open');
          body.classList.remove('drawer-right-open', 'drawer-account-open', 'drawer-favorites-open');
          if (!bothCapable) body.classList.remove('drawer-left-open', 'yat-left-search-mode');
          syncRailMode();
        }, 0);
        return;
      }

      if (target.closest('#openFilters')) {
        window.setTimeout(() => {
          body.classList.add('drawer-right-open', 'drawer-open');
          body.classList.remove('drawer-sort-open', 'drawer-account-open', 'drawer-favorites-open');
          if (!bothCapable) body.classList.remove('drawer-left-open', 'yat-left-search-mode');
          syncRailMode();
        }, 0);
        return;
      }

      if (target.closest('#btnAccount')) {
        window.setTimeout(() => {
          body.classList.add('drawer-account-open', 'drawer-open');
          body.classList.remove('drawer-sort-open', 'drawer-right-open', 'drawer-favorites-open');
          if (!bothCapable) body.classList.remove('drawer-left-open', 'yat-left-search-mode');
          syncRailMode();
        }, 0);
        return;
      }

      if (target.closest('#openFavorites')) {
        window.setTimeout(() => {
          body.classList.add('drawer-favorites-open', 'drawer-open');
          body.classList.remove('drawer-sort-open', 'drawer-right-open', 'drawer-account-open');
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

      if (target.closest('#closeSort')) {
        window.setTimeout(() => {
          body.classList.remove('drawer-sort-open');
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
        return;
      }

      const link = target.closest('a[href]') as HTMLAnchorElement | null;
      if (link) {
        saveDrawerState();
        try {
          localStorage.setItem(THEME_KEY, document.documentElement.classList.contains('light-theme') ? 'light' : 'dark');
        } catch {}
      }

      if (target.closest('[data-tab]')) {
        restoreAfterLegacyHandlers();
      }
    };

    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', syncRailMode);
    window.addEventListener('pageshow', () => {
      applyThemeFromStorage();
      restoreDrawerState();
    });
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
