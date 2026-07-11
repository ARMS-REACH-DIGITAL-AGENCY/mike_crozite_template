'use client';

import { useEffect } from 'react';

const PLAYER_GALLERY_SECTIONS = new Set(['active', 'alltime', 'current']);

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

  targetSection.querySelectorAll<HTMLElement>('.yat-card[data-playerid]').forEach((card) => {
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
      (!nameFilter || name.includes(nameFilter))
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

    window.addEventListener('hashchange', syncSection);
    window.addEventListener('popstate', syncSection);
    document.addEventListener('click', syncSection, true);
    document.addEventListener('change', onChangeCapture, true);
    document.addEventListener('input', onInputCapture, true);
    document.addEventListener('click', onClickCapture, true);

    const sectionObserver = new MutationObserver(syncSection);
    document.querySelectorAll('.yat-section').forEach((section) => {
      sectionObserver.observe(section, { attributes: true, attributeFilter: ['class'] });
    });

    syncSection();

    return () => {
      if (sectionTimer !== null) window.clearTimeout(sectionTimer);
      window.removeEventListener('hashchange', syncSection);
      window.removeEventListener('popstate', syncSection);
      document.removeEventListener('click', syncSection, true);
      document.removeEventListener('change', onChangeCapture, true);
      document.removeEventListener('input', onInputCapture, true);
      document.removeEventListener('click', onClickCapture, true);
      sectionObserver.disconnect();
    };
  }, []);

  return null;
}
