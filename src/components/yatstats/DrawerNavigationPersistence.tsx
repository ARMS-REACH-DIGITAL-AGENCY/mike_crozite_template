'use client';

import { useEffect } from 'react';

const DRAWER_STATE_KEY = 'yat-drawer-state';
const THEME_KEY = 'yat-theme';

type DrawerState = {
  left: boolean;
  leftSearch: boolean;
  right: '' | 'filters' | 'account' | 'favorites';
};

function getRightState(): DrawerState['right'] {
  if (document.body.classList.contains('drawer-right-open')) return 'filters';
  if (document.body.classList.contains('drawer-account-open')) return 'account';
  if (document.body.classList.contains('drawer-favorites-open')) return 'favorites';
  return '';
}

function saveDrawerState() {
  try {
    const state: DrawerState = {
      left: document.body.classList.contains('drawer-left-open'),
      leftSearch: document.body.classList.contains('yat-left-search-mode'),
      right: getRightState(),
    };
    sessionStorage.setItem(DRAWER_STATE_KEY, JSON.stringify(state));
    localStorage.setItem(THEME_KEY, document.documentElement.classList.contains('light-theme') ? 'light' : 'dark');
  } catch {}
}

function applySavedTheme() {
  try {
    const isLight = (localStorage.getItem(THEME_KEY) || 'dark') === 'light';
    document.documentElement.classList.toggle('light-theme', isLight);
    document.body.classList.toggle('light-theme', isLight);
  } catch {}
}

function restoreDrawerState() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(DRAWER_STATE_KEY) || 'null') as DrawerState | null;
    if (!saved) return;

    document.body.classList.toggle('drawer-left-open', Boolean(saved.left));
    document.body.classList.toggle('yat-left-search-mode', Boolean(saved.left && saved.leftSearch));
    document.body.classList.remove('drawer-right-open', 'drawer-account-open', 'drawer-favorites-open');

    if (saved.right === 'filters') document.body.classList.add('drawer-right-open');
    if (saved.right === 'account') document.body.classList.add('drawer-account-open');
    if (saved.right === 'favorites') document.body.classList.add('drawer-favorites-open');

    document.body.classList.toggle(
      'drawer-open',
      Boolean(saved.left || saved.right)
    );
  } catch {}
}

function showSectionWithoutClosing(tabId: string) {
  const key = tabId === 'team' ? 'current' : tabId;
  const target = document.getElementById(`sec-${key}`);
  if (!target) return false;

  document.querySelectorAll('.yat-section').forEach((section) => {
    section.classList.remove('visible');
  });
  target.classList.add('visible');

  const sectionLabel = document.getElementById('yatSectionLabel');
  if (sectionLabel && !window.location.pathname.includes('/player/')) {
    const labels: Record<string, string> = {
      active: 'ACTIVE BASEBALL ALUMNI',
      news: 'ACTIVE ALUMNI NEWS',
      alltime: 'NEXT-LEVEL ALL-TIME LIST',
      current: '2026 HIGH SCHOOL TEAM',
      fantasy: 'FANTASY BRACKET TOURNEY',
      mentor: 'MENTORSHIP MARKETPLACE',
      partner: 'PARTNERSHIP PROGRAM',
      about: 'ABOUT US',
      faq: "FAQ'S",
    };
    sectionLabel.textContent = labels[key] || key.toUpperCase();
  }

  history.replaceState(null, '', `#sec-${key}`);
  return true;
}

export default function DrawerNavigationPersistence() {
  useEffect(() => {
    applySavedTheme();
    restoreDrawerState();

    const onClickCapture = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;

      const drawer = target.closest('#drawerLeft, #drawerFilters, #drawerFavorites, #drawerAccount');
      const tabLink = target.closest('[data-tab]') as HTMLElement | null;

      // Drawer navigation should behave like a working rail: switch the content, but do not close the rail.
      if (drawer && tabLink && !tabLink.closest('#drawerAccount')) {
        const tab = tabLink.getAttribute('data-tab') || '';
        if (!tab) return;

        event.preventDefault();
        event.stopPropagation();
        if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();

        saveDrawerState();
        showSectionWithoutClosing(tab);
        window.setTimeout(() => {
          applySavedTheme();
          restoreDrawerState();
        }, 0);
        return;
      }

      // Any normal link launched from a drawer should carry the current rail/theme state to the next screen.
      const link = target.closest('a[href]');
      if (drawer && link) {
        saveDrawerState();
        window.setTimeout(() => {
          applySavedTheme();
          restoreDrawerState();
        }, 0);
      }
    };

    const onPageShow = () => {
      applySavedTheme();
      restoreDrawerState();
    };

    document.addEventListener('click', onClickCapture, true);
    window.addEventListener('pageshow', onPageShow);

    return () => {
      document.removeEventListener('click', onClickCapture, true);
      window.removeEventListener('pageshow', onPageShow);
    };
  }, []);

  return null;
}
