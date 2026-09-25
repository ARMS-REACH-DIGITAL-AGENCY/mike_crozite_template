'use client';

import { useEffect } from 'react';

const PLAYER_GALLERY_SECTIONS = new Set(['active', 'alltime', 'current']);

// The favorites gallery view (toggled from the Favorites drawer) restricts
// the same section's grid down to a set of playerIds by hiding everything
// else. applyFilters used to recompute display purely from filter criteria,
// ignoring that restriction entirely - so touching any filter while viewing
// the favorites gallery re-showed every non-favorite card that matched it.
//
// FavoritesDrawer stamps that restriction directly on the .yat-section
// element (data-favorites-gallery-active / data-favorites-gallery-ids)
// rather than this reading it from a cached copy of the last event it
// happened to receive - a cached copy can go stale if the event and a
// section change interleave, which is what let a temporarily-empty
// playerIds snapshot (favorites still loading) hide every card and never
// recover. Reading the section's own attributes fresh on every pass means
// there is nothing to go stale.
function getFavoritesGalleryRestriction(section: HTMLElement): { enabled: boolean; playerIds: Set<string> } {
  if (section.dataset.favoritesGalleryActive !== 'true') {
    return { enabled: false, playerIds: new Set() };
  }

  const ids = (section.dataset.favoritesGalleryIds || '').split(',').filter(Boolean);
  return { enabled: true, playerIds: new Set(ids) };
}

// A favorite can carry any status/level/org, and a cross-school card starts
// as a bare loading placeholder (a .yat-card with no data-status/data-level/
// etc. set yet) while its real markup is being fetched. Combining that
// placeholder with the section's ambient roster preset (e.g. "active"
// requires a non-empty, non-RETIRED data-status) failed it and hid the
// whole card - and nothing re-evaluated it once the real, correctly-
// attributed card was later injected into the same wrapper, so it never
// came back. Tracked per section so switching sections resets it cleanly.
const favoritesGalleryWasEnabled = new Map<string, boolean>();

function normalize(value: unknown): string {
  return String(value || '').trim().toUpperCase();
}

function getCurrentSection(): string {
  if (typeof window === 'undefined' || typeof document === 'undefined') return 'active';

  const hash = window.location.hash || '';
  if (hash.startsWith('#sec-')) return hash.replace(/^#sec-/, '').toLowerCase();

  const visible = document.querySelector<HTMLElement>('.yat-section.visible');
  if (visible?.id?.startsWith('sec-')) return visible.id.replace(/^sec-/, '').toLowerCase();

  return 'active';
}

function getGroupBoxes(groupId: string): HTMLInputElement[] {
  const group = document.getElementById(groupId);
  if (!group) return [];

  return Array.from(
    group.querySelectorAll<HTMLInputElement>('input[type="checkbox"]:not([data-select-all])')
  );
}

function getSelectedValues(groupId: string): string[] {
  return getGroupBoxes(groupId)
    .filter((input) => input.checked)
    .map((input) => normalize(input.value));
}

function syncSelectAll(groupId: string) {
  const group = document.getElementById(groupId);
  const selectAll = group?.querySelector<HTMLInputElement>('input[type="checkbox"][data-select-all]');
  if (!selectAll) return;

  const boxes = getGroupBoxes(groupId);
  selectAll.checked = boxes.length > 0 && boxes.every((box) => box.checked);
  selectAll.indeterminate = boxes.some((box) => box.checked) && !selectAll.checked;
}

function syncEverySelectAll() {
  ['filterStatus', 'filterGradClass', 'filterRosterYears', 'filterLevels', 'filterOrgs']
    .forEach(syncSelectAll);
}

function clearFilters() {
  document.querySelectorAll<HTMLInputElement>('#filters input').forEach((input) => {
    if (input.type === 'checkbox') {
      input.checked = false;
      input.indeterminate = false;
    } else {
      input.value = '';
    }
  });
}

function setAll(groupId: string, checked: boolean) {
  getGroupBoxes(groupId).forEach((box) => {
    box.checked = checked;
  });
  syncSelectAll(groupId);
}

function setValues(groupId: string, values: string[]) {
  const wanted = values.map(normalize);
  getGroupBoxes(groupId).forEach((box) => {
    box.checked = wanted.includes(normalize(box.value));
  });
  syncSelectAll(groupId);
}

function matchesGraduatingClass(value: string, selected: string[]): boolean {
  if (!selected.length) return true;

  const year = Number.parseInt(value, 10);
  return selected.some((choice) => {
    if (choice === value) return true;
    if (choice === 'PRE-1980') return Number.isFinite(year) && year < 1980;

    const range = choice.match(/^(\d{4})-(\d{4})$/);
    if (!range || !Number.isFinite(year)) return false;

    return year >= Number(range[1]) && year <= Number(range[2]);
  });
}

function applyFilters(section: string) {
  if (!PLAYER_GALLERY_SECTIONS.has(section)) return;

  const targetSection = document.getElementById(`sec-${section}`);
  if (!targetSection) return;

  const nameFilter = String(
    (document.getElementById('filterName') as HTMLInputElement | null)?.value || ''
  ).trim().toLowerCase();

  const statuses = getSelectedValues('filterStatus');
  const levels = getSelectedValues('filterLevels');
  const organizations = getSelectedValues('filterOrgs');
  const gradClasses = getSelectedValues('filterGradClass');
  const rosterYears = getSelectedValues('filterRosterYears');
  const favoritesGallery = getFavoritesGalleryRestriction(targetSection);

  targetSection.querySelectorAll<HTMLElement>('.yat-card[data-playerid]').forEach((card) => {
    const playerId = card.dataset.playerid || '';
    const name = String(card.dataset.name || '').toLowerCase();
    const status = normalize(card.dataset.status);
    const level = normalize(card.dataset.level);
    const organization = normalize(card.dataset.org);
    const gradClass = normalize(card.dataset.gradclass);
    const cardRosterYears = String(card.dataset.rosteryears || '')
      .split(',')
      .map(normalize)
      .filter(Boolean);

    const show =
      (!favoritesGallery.enabled || favoritesGallery.playerIds.has(playerId))
      && (!nameFilter || name.includes(nameFilter))
      && (!statuses.length || statuses.includes(status))
      && (!levels.length || levels.includes(level))
      && (!organizations.length || organizations.includes(organization))
      && matchesGraduatingClass(gradClass, gradClasses)
      && (!rosterYears.length || cardRosterYears.some((year) => rosterYears.includes(year)));

    const displayTarget = card.closest<HTMLElement>('[data-player-card-wrap="true"]') || card;
    displayTarget.style.display = show ? '' : 'none';
  });

  window.dispatchEvent(new CustomEvent('yat:gallery-filtered', { detail: { section } }));
}

function applyPreset(section: string) {
  if (!PLAYER_GALLERY_SECTIONS.has(section)) return;

  clearFilters();

  if (section === 'active') {
    const statuses = getGroupBoxes('filterStatus')
      .map((box) => normalize(box.value))
      .filter((status) => status && status !== 'RETIRED');
    setValues('filterStatus', statuses);
  }

  if (section === 'alltime') {
    setAll('filterStatus', true);
  }

  if (section === 'current') {
    setAll('filterStatus', true);
    setValues('filterLevels', ['HIGH SCHOOL']);
  }

  syncEverySelectAll();
  applyFilters(section);
}

// "Take me to his flip card" links (favorites drawer, search, the profile's
// school bar) arrive as ?view=active&player={id}#player-{id} -- view=active
// for everyone. The tab and these presets follow #sec-{tab} (or whichever
// tab is showing), so a #player- hash never changed tabs, and the browser
// just jumped to the first element with that id: every alum is rendered in
// both Active and All-Time with the same id, so for a retired player that
// was his copy hidden in Active. (YatInteractivity's handler for these
// links never runs: that inline script has failed to parse since Sept 20.)
function readLinkedPlayer(): { id: string; view: string } {
  const params = new URLSearchParams(window.location.search);
  const hash = window.location.hash || '';
  const fromHash = hash.startsWith('#player-') ? decodeURIComponent(hash.slice('#player-'.length)) : '';
  const id = String(params.get('player') || fromHash || '').trim();
  let view = String(params.get('view') || '').toLowerCase().replace(/[-_]/g, '');
  if (view === 'team') view = 'current';
  return { id, view: PLAYER_GALLERY_SECTIONS.has(view) ? view : 'active' };
}

// Whether a tab's roster preset (applyPreset) shows this card.
function presetShows(section: string, card: HTMLElement): boolean {
  const status = normalize(card.dataset.status);
  if (section === 'active') {
    const allowed = getGroupBoxes('filterStatus').map((box) => normalize(box.value)).filter((s) => s && s !== 'RETIRED');
    return allowed.length ? allowed.includes(status) : status !== 'RETIRED';
  }
  if (section === 'current') return normalize(card.dataset.level) === 'HIGH SCHOOL';
  return true;
}

function findCard(section: string, playerId: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`#sec-${section} .yat-card[data-playerid="${CSS.escape(playerId)}"]`);
}

// The tab a linked player lives on: the requested one if its preset shows
// him, else Current (the high school team), else All-Time (everyone).
function sectionForPlayer(playerId: string, requested: string): string {
  const order = [requested, 'current', 'alltime', 'active'].filter((s, i, all) => all.indexOf(s) === i);
  for (const section of order) {
    const card = findCard(section, playerId);
    if (card && presetShows(section, card)) return section;
  }
  return requested;
}

function scrollToLinkedCard(section: string, playerId: string) {
  // Re-aim for a moment while cards above it finish laying out, unless the
  // fan starts scrolling on their own.
  let stopped = false;
  let highlighted = false;
  const stop = () => { stopped = true; };
  window.addEventListener('touchstart', stop, { once: true, passive: true });
  window.addEventListener('wheel', stop, { once: true, passive: true });
  const aim = () => {
    if (stopped) return;
    const card = findCard(section, playerId);
    const shown = card && (card.closest<HTMLElement>('[data-player-card-wrap="true"]') || card).style.display !== 'none';
    if (!card || !shown) return;
    card.scrollIntoView({ behavior: 'auto', block: 'center' });
    if (!highlighted) {
      highlighted = true;
      card.animate?.(
        [{ boxShadow: '0 0 0 4px #f5c542' }, { boxShadow: '0 0 0 4px #f5c542' }, { boxShadow: '0 0 0 0 rgba(245,197,66,0)' }],
        { duration: 1800, easing: 'ease-out' }
      );
    }
  };
  [120, 350, 700, 1200, 1800].forEach((ms) => window.setTimeout(aim, ms));
  window.setTimeout(() => {
    window.removeEventListener('touchstart', stop);
    window.removeEventListener('wheel', stop);
  }, 1900);
}

// Point the address at the player's tab (#sec-{tab}, which SharedShell and
// this controller both follow), keeping ?player= so the link still names
// him, then scroll to his card.
function openLinkedPlayer() {
  if (window.location.pathname.includes('/player/')) return;
  const { id, view } = readLinkedPlayer();
  if (!id) return;
  const section = sectionForPlayer(id, view);
  const query = `?view=${section}&player=${encodeURIComponent(id)}`;
  window.history.replaceState(null, '', `${window.location.pathname}${query}#sec-${section}`);
  window.dispatchEvent(new HashChangeEvent('hashchange'));
  scrollToLinkedCard(section, id);
}

export default function GalleryFilterController() {
  useEffect(() => {
    let lastSection = '';
    let sectionTimer: number | null = null;

    const syncSection = () => {
      if (sectionTimer !== null) window.clearTimeout(sectionTimer);
      sectionTimer = window.setTimeout(() => {
        const section = getCurrentSection();
        if (section === lastSection) return;
        lastSection = section;
        applyPreset(section);
      }, 0);
    };

    const onChangeCapture = (event: Event) => {
      const target = event.target as HTMLInputElement | null;
      if (!target?.closest('#filters')) return;

      const section = getCurrentSection();
      if (!PLAYER_GALLERY_SECTIONS.has(section)) return;

      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();

      if (target.matches('input[type="checkbox"][data-select-all]')) {
        const group = target.closest<HTMLElement>('.yat-filter-options');
        group?.querySelectorAll<HTMLInputElement>('input[type="checkbox"]:not([data-select-all])')
          .forEach((box) => {
            box.checked = target.checked;
          });
      } else {
        const groupId = target.closest<HTMLElement>('.yat-filter-options')?.id;
        if (groupId) syncSelectAll(groupId);
      }

      applyFilters(section);
    };

    const onInputCapture = (event: Event) => {
      const target = event.target as HTMLInputElement | null;
      if (!target || target.id !== 'filterName') return;

      const section = getCurrentSection();
      if (!PLAYER_GALLERY_SECTIONS.has(section)) return;

      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
      applyFilters(section);
    };

    const onClickCapture = (event: MouseEvent) => {
      const target = event.target as Element | null;
      if (!target?.closest('#filtersReset, #filtersReset2')) return;

      const section = getCurrentSection();
      if (!PLAYER_GALLERY_SECTIONS.has(section)) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      applyPreset(section);
    };

    // FavoritesDrawer has already stamped the restriction onto the section
    // element by the time this fires (same synchronous function); this
    // event is just the nudge to re-run applyFilters, which reads that
    // state fresh rather than trusting this event's own payload.
    const onFavoritesFilterChanged = () => {
      const section = getCurrentSection();
      if (!PLAYER_GALLERY_SECTIONS.has(section)) return;

      const targetSection = document.getElementById(`sec-${section}`);
      const isEnabledNow = Boolean(targetSection) && getFavoritesGalleryRestriction(targetSection as HTMLElement).enabled;
      const wasEnabled = favoritesGalleryWasEnabled.get(section) || false;
      favoritesGalleryWasEnabled.set(section, isEnabledNow);

      if (isEnabledNow && !wasEnabled) {
        // Entering the favorites gallery for this section: start from no
        // filter restriction so a favorite (or its still-loading placeholder)
        // is never excluded by whatever roster preset the section normally
        // applies. The user can still narrow within favorites by touching a
        // filter control while this view stays open.
        clearFilters();
        syncEverySelectAll();
      } else if (!isEnabledNow && wasEnabled) {
        // Leaving the favorites gallery: restore the section's normal
        // roster preset instead of leaving filters in the cleared state
        // favorites view started from.
        applyPreset(section);
        return;
      }

      applyFilters(section);
    };

    window.addEventListener('hashchange', syncSection);
    window.addEventListener('popstate', syncSection);
    document.addEventListener('click', syncSection, true);
    document.addEventListener('change', onChangeCapture, true);
    document.addEventListener('input', onInputCapture, true);
    document.addEventListener('click', onClickCapture, true);
    window.addEventListener('yat:favorites-filter-changed', onFavoritesFilterChanged);

    const sectionObserver = new MutationObserver(syncSection);
    document.querySelectorAll('.yat-section').forEach((section) => {
      sectionObserver.observe(section, { attributes: true, attributeFilter: ['class'] });
    });

    openLinkedPlayer();
    syncSection();

    return () => {
      if (sectionTimer !== null) window.clearTimeout(sectionTimer);
      window.removeEventListener('hashchange', syncSection);
      window.removeEventListener('popstate', syncSection);
      document.removeEventListener('click', syncSection, true);
      document.removeEventListener('change', onChangeCapture, true);
      document.removeEventListener('input', onInputCapture, true);
      document.removeEventListener('click', onClickCapture, true);
      window.removeEventListener('yat:favorites-filter-changed', onFavoritesFilterChanged);
      sectionObserver.disconnect();
    };
  }, []);

  return null;
}
