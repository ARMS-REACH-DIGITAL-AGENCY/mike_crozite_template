// Swipe between the tabs on the back of a flip card (.fz-root), the same way
// the player profile page's Fun Zone works (ProfileFunZoneStabilizer).
//
// One set of listeners on the document covers every card: React-rendered
// ones (FunZone.tsx) and the static copies injected into the Favorites
// drawer (which React never hydrates). A swipe "presses" the next or
// previous .fz-tab-btn, so each kind of card switches tabs through its own
// existing click handling.

const SWIPE_MIN_PX = 50;

let installed = false;

// True when the finger started on something inside the card that scrolls
// sideways and still has room to scroll that way - that scrolls first.
function scrollsSideways(start: Element | null, stop: Element, dx: number) {
  for (let el = start as HTMLElement | null; el && el !== stop; el = el.parentElement) {
    if (el.scrollWidth <= el.clientWidth + 1) continue;
    const overflowX = getComputedStyle(el).overflowX;
    if (overflowX !== 'auto' && overflowX !== 'scroll') continue;
    if (dx < 0 && el.scrollLeft + el.clientWidth < el.scrollWidth - 1) return true;
    if (dx > 0 && el.scrollLeft > 1) return true;
  }
  return false;
}

export function installFunZoneSwipe() {
  if (installed || typeof document === 'undefined') return;
  installed = true;

  let start: { x: number; y: number; root: Element; target: Element; horizontal: boolean | null } | null = null;

  document.addEventListener(
    'touchstart',
    (event) => {
      start = null;
      if (event.touches.length !== 1) return;
      const target = event.target instanceof Element ? event.target : null;
      const root = target?.closest('.fz-root');
      if (!target || !root) return;
      const t = event.touches[0];
      start = { x: t.clientX, y: t.clientY, root, target, horizontal: null };
    },
    { passive: true }
  );

  // Once a gesture on the card back is clearly sideways, keep it from also
  // scrolling whatever the card sits in.
  document.addEventListener(
    'touchmove',
    (event) => {
      if (!start || event.touches.length !== 1) return;
      const t = event.touches[0];
      const dx = t.clientX - start.x;
      const dy = t.clientY - start.y;
      if (start.horizontal === null && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
        start.horizontal = Math.abs(dx) > Math.abs(dy) * 1.5 && !scrollsSideways(start.target, start.root, dx);
      }
      if (start.horizontal && event.cancelable) event.preventDefault();
    },
    { passive: false }
  );

  document.addEventListener(
    'touchend',
    (event) => {
      const s = start;
      start = null;
      const t = event.changedTouches[0];
      if (!s || !t || !s.horizontal) return;
      const dx = t.clientX - s.x;
      const dy = t.clientY - s.y;
      if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) < Math.abs(dy) * 1.5) return;

      const buttons = Array.from(s.root.querySelectorAll<HTMLElement>('.fz-tab-strip .fz-tab-btn'));
      const current = buttons.findIndex((btn) => btn.classList.contains('fz-tab-active'));
      if (current < 0) return;
      const next = buttons[current + (dx < 0 ? 1 : -1)];
      next?.click();
    },
    { passive: true }
  );

  document.addEventListener('touchcancel', () => { start = null; }, { passive: true });
}
