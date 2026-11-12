// The drawer classes a touch-only device clears when a school page loads
// (DrawerRailController.restoreDrawerState). A ?join=1 link (event QR
// codes, Nov 2026) opens the JOIN drawer on purpose, so it is kept then:
// clearing it hid the sign-up on every real phone. Kept separate so the
// rule has a test (scripts/test-touch-drawer-reset.cjs).
const TOUCH_LOAD_CLEARED = [
  'drawer-left-open', 'yat-left-search-mode', 'drawer-sort-open',
  'drawer-right-open', 'drawer-account-open', 'drawer-favorites-open',
  'yat-desktop-docked-drawers',
];

export function touchLoadDrawerClassesToClear(search: string): string[] {
  const joining = new URLSearchParams(search).get('join') === '1';
  return joining ? TOUCH_LOAD_CLEARED.filter((name) => name !== 'drawer-account-open') : [...TOUCH_LOAD_CLEARED];
}
