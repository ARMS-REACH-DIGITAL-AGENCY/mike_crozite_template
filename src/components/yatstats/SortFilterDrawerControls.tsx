'use client';

import { useEffect } from 'react';

type SortDirection = 'asc' | 'desc';
type SortScope = 'season' | 'career';
type CareerLevel = 'mlb' | 'minors' | 'college';
type CareerStats = Partial<Record<CareerLevel, { bat?: Record<string, string>; pit?: Record<string, string> }>>;

const CAREER_LEVELS: { key: CareerLevel; label: string; statusLabel: string }[] = [
  { key: 'mlb', label: 'MLB', statusLabel: 'MLB career' },
  { key: 'minors', label: 'Minors', statusLabel: 'minor league career' },
  { key: 'college', label: 'College', statusLabel: 'college career' },
];
type SortMetric = {
  key: string;
  label: string;
  shortLabel: string;
  group: 'batting' | 'pitching';
  defaultDirection?: SortDirection;
};

let currentSortDirection: SortDirection = 'desc';
let currentSortScope: SortScope = 'season';
let currentCareerLevel: CareerLevel = 'mlb';
const careerStatsCache = new WeakMap<HTMLElement, CareerStats | null>();
let favoritesSortEnabled = false;
let favoriteSortPlayerIds = new Set<string>();

const SORT_METRICS: SortMetric[] = [
  { key: 'avg', label: 'Batting Average', shortLabel: 'AVG', group: 'batting', defaultDirection: 'desc' },
  { key: 'ab', label: 'At Bats', shortLabel: 'AB', group: 'batting', defaultDirection: 'desc' },
  { key: 'h', label: 'Hits', shortLabel: 'H', group: 'batting', defaultDirection: 'desc' },
  { key: 'obp', label: 'On-Base %', shortLabel: 'OBP', group: 'batting', defaultDirection: 'desc' },
  { key: 'r', label: 'Runs', shortLabel: 'R', group: 'batting', defaultDirection: 'desc' },
  { key: 'bb', label: 'Walks', shortLabel: 'BB', group: 'batting', defaultDirection: 'desc' },
  { key: 'slg', label: 'Slugging %', shortLabel: 'SLG', group: 'batting', defaultDirection: 'desc' },
  { key: 'hr', label: 'Home Runs', shortLabel: 'HR', group: 'batting', defaultDirection: 'desc' },
  { key: 'rbi', label: 'RBI', shortLabel: 'RBI', group: 'batting', defaultDirection: 'desc' },
  { key: 'ops', label: 'OPS', shortLabel: 'OPS', group: 'batting', defaultDirection: 'desc' },
  { key: 'sb', label: 'Stolen Bases', shortLabel: 'SB', group: 'batting', defaultDirection: 'desc' },
  { key: 'gp', label: 'Games Played', shortLabel: 'GP', group: 'batting', defaultDirection: 'desc' },
  { key: 'ip', label: 'Innings Pitched', shortLabel: 'IP', group: 'pitching', defaultDirection: 'desc' },
  { key: 'er', label: 'Earned Runs', shortLabel: 'ER', group: 'pitching', defaultDirection: 'asc' },
  { key: 'era', label: 'ERA', shortLabel: 'ERA', group: 'pitching', defaultDirection: 'asc' },
  { key: 'k', label: 'Strikeouts', shortLabel: 'K', group: 'pitching', defaultDirection: 'desc' },
  { key: 'bb', label: 'Walks Allowed', shortLabel: 'BB', group: 'pitching', defaultDirection: 'asc' },
  { key: 'whip', label: 'WHIP', shortLabel: 'WHIP', group: 'pitching', defaultDirection: 'asc' },
  { key: 'k9', label: 'K/9', shortLabel: 'K/9', group: 'pitching', defaultDirection: 'desc' },
  { key: 'bb9', label: 'BB/9', shortLabel: 'BB/9', group: 'pitching', defaultDirection: 'asc' },
  { key: 'kbb', label: 'K/BB', shortLabel: 'K/BB', group: 'pitching', defaultDirection: 'desc' },
  { key: 'wl', label: 'Wins', shortLabel: 'W-L', group: 'pitching', defaultDirection: 'desc' },
  { key: 'sv', label: 'Saves', shortLabel: 'SAVES', group: 'pitching', defaultDirection: 'desc' },
  { key: 'gp', label: 'Games Played', shortLabel: 'GP', group: 'pitching', defaultDirection: 'desc' },
];

function getSortRoot(): HTMLElement | null { return document.getElementById('yatSortControls'); }
function getMetric(key: string, group?: string | null) { return SORT_METRICS.find((m) => m.key === key && (!group || m.group === group)) || SORT_METRICS.find((m) => m.key === key) || null; }
function statAttrName(key: string) { return `stat${key.charAt(0).toUpperCase()}${key.slice(1)}`; }
function getVisibleGallerySection(): HTMLElement | null {
  const active = document.getElementById('sec-active');
  const allTime = document.getElementById('sec-alltime');
  if (active?.classList.contains('visible')) return active;
  if (allTime?.classList.contains('visible')) return allTime;
  return null;
}
function getCardWrap(card: HTMLElement): HTMLElement { return (card.closest('[data-player-card-wrap="true"]') as HTMLElement | null) || card; }
function getGrid(section: HTMLElement): HTMLElement | null { return (section.querySelector('.yat-grid') || section.querySelector('#active-grid')) as HTMLElement | null; }
function getPlayerId(card: HTMLElement): string { return card.getAttribute('data-playerid') || ''; }
function parseStatNumber(raw: unknown): number | null {
  const text = String(raw ?? '').trim();
  if (!text || text === '--') return null;
  if (text.includes('-')) {
    const first = Number(String(text.split('-')[0]).replace(/[^0-9.-]/g, ''));
    return Number.isFinite(first) ? first : null;
  }
  const parsed = Number(text.replace(/[^0-9.-]/g, '').trim());
  return Number.isFinite(parsed) ? parsed : null;
}
function getNumericStat(card: HTMLElement, key: string): number | null { return parseStatNumber(card.dataset[statAttrName(key)] || card.getAttribute(`data-stat-${key}`) || ''); }
// The batting and pitching feeds reuse the same names for walks (bb) and
// games (gp). Each column sorts on its own feed's value: pitching GP ranks
// pitchers by games pitched, batting GP ranks hitters by games played, and
// players with nothing on that side drop below the ranked group.
const GROUP_SPLIT_METRICS = new Set(['bb', 'gp']);
function getSeasonStat(card: HTMLElement, key: string, group: string): number | null {
  if (!GROUP_SPLIT_METRICS.has(key)) return getNumericStat(card, key);
  const side = group === 'pitching' ? 'pit' : 'bat';
  return parseStatNumber(card.getAttribute(`data-stat-${side}-${key}`) || '');
}
function hasCurrentSeasonStats(card: HTMLElement): boolean { return card.dataset.has2026Stats === 'true' || card.getAttribute('data-has-2026-stats') === 'true'; }
// All-Time cards don't carry current-season stats, but every player also has
// an Active-section twin that does, so season sorting on All-Time reads it.
function seasonSourceCard(card: HTMLElement, section: HTMLElement): HTMLElement {
  if (section.id !== 'sec-alltime') return card;
  const id = getPlayerId(card);
  if (!id) return card;
  const twin = document.querySelector<HTMLElement>(`#sec-active .yat-card[data-playerid="${CSS.escape(id)}"]`);
  return twin || card;
}
function getCareerStats(card: HTMLElement): CareerStats | null {
  if (careerStatsCache.has(card)) return careerStatsCache.get(card) ?? null;
  let parsed: CareerStats | null = null;
  const raw = card.getAttribute('data-career-stats');
  if (raw) {
    try { parsed = JSON.parse(raw) as CareerStats; } catch { parsed = null; }
  }
  careerStatsCache.set(card, parsed);
  return parsed;
}
function getCareerStat(card: HTMLElement, level: CareerLevel, group: string, key: string): number | null {
  const line = getCareerStats(card)?.[level]?.[group === 'pitching' ? 'pit' : 'bat'];
  return line ? parseStatNumber(line[key]) : null;
}
function getVisibleCards(section: HTMLElement): HTMLElement[] {
  return Array.from(section.querySelectorAll('.yat-card[data-playerid]')).filter((node) => {
    const card = node as HTMLElement;
    const wrap = getCardWrap(card);
    return wrap.style.display !== 'none' && !wrap.hasAttribute('hidden') && card.style.display !== 'none';
  }) as HTMLElement[];
}
function syncStripToSortedCards(cards: HTMLElement[]) {
  const strip = document.querySelector('.gallery-strip-inner') as HTMLElement | null;
  if (!strip) return;
  const slots = Array.from(strip.querySelectorAll('.gallery-slot-link[data-playerid]')) as HTMLElement[];
  const slotMap = new Map<string, HTMLElement>();
  slots.forEach((slot) => { const id = slot.getAttribute('data-playerid') || ''; if (id && !slotMap.has(id)) slotMap.set(id, slot); });
  const visibleIds = cards.map((card) => card.getAttribute('data-playerid') || '').filter(Boolean);
  visibleIds.forEach((id) => { const slot = slotMap.get(id); if (slot) { slot.style.display = ''; strip.appendChild(slot); } });
  slots.forEach((slot) => { const id = slot.getAttribute('data-playerid') || ''; slot.style.display = visibleIds.includes(id) ? '' : 'none'; });
}
function restoreDefaultCardOrder() {
  const section = getVisibleGallerySection();
  const grid = section ? getGrid(section) : null;
  if (!section || !grid) return;
  const cards = Array.from(section.querySelectorAll('.yat-card[data-playerid]')) as HTMLElement[];
  const wraps = cards.map(getCardWrap);
  wraps.forEach((wrap, index) => { if (!wrap.dataset.sortOriginalIndex) wrap.dataset.sortOriginalIndex = String(index); });
  [...new Set(wraps)].sort((a, b) => Number(a.dataset.sortOriginalIndex || 0) - Number(b.dataset.sortOriginalIndex || 0)).forEach((wrap) => grid.appendChild(wrap));
  syncStripToSortedCards(getVisibleCards(section));
}
function getSelectedSortInput(): HTMLInputElement | null { return getSortRoot()?.querySelector<HTMLInputElement>('input[name="yat-sort-stat"]:checked') || null; }
function isSortSelected() { return Boolean(getSelectedSortInput()); }
function selectedDirection(): SortDirection {
  const root = getSortRoot();
  const locked = root?.dataset.yatSortDirection === 'asc' ? 'asc' : root?.dataset.yatSortDirection === 'desc' ? 'desc' : null;
  return locked || currentSortDirection;
}
function selectedScope(): SortScope {
  const root = getSortRoot();
  const locked = root?.dataset.yatSortScope === 'career' ? 'career' : root?.dataset.yatSortScope === 'season' ? 'season' : null;
  return locked || currentSortScope;
}
function setDirection(direction: SortDirection) { currentSortDirection = direction; const root = getSortRoot(); if (root) root.dataset.yatSortDirection = direction; }
function setScope(scope: SortScope) {
  currentSortScope = scope;
  const root = getSortRoot();
  if (!root) return;
  root.dataset.yatSortScope = scope;
  const toggle = root.querySelector<HTMLButtonElement>('#yatSortScopeSwitch');
  if (toggle) toggle.setAttribute('aria-checked', scope === 'career' ? 'true' : 'false');
  root.querySelectorAll<HTMLElement>('[data-yat-sort-scope]').forEach((label) => label.classList.toggle('active', label.dataset.yatSortScope === scope));
  const levels = root.querySelector<HTMLElement>('.yat-sort-career-levels');
  if (levels) levels.hidden = scope !== 'career';
}
function setCareerLevel(level: CareerLevel) {
  currentCareerLevel = level;
  const root = getSortRoot();
  if (!root) return;
  root.querySelectorAll<HTMLButtonElement>('[data-yat-career-level]').forEach((button) => {
    const on = button.dataset.yatCareerLevel === level;
    button.classList.toggle('active', on);
    button.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
}
function favoriteScopeCards(cards: HTMLElement[]): HTMLElement[] { return (!favoritesSortEnabled || !favoriteSortPlayerIds.size) ? cards : cards.filter((card) => favoriteSortPlayerIds.has(getPlayerId(card))); }

function applyFlipCardSort() {
  const checked = getSelectedSortInput();
  const dir = selectedDirection();
  const scope = selectedScope();
  const status = document.getElementById('yatSortStatus');
  const section = getVisibleGallerySection();
  const grid = section ? getGrid(section) : null;
  if (!section || !grid) return;
  const cards = Array.from(section.querySelectorAll('.yat-card[data-playerid]')) as HTMLElement[];
  const wraps = cards.map(getCardWrap);
  wraps.forEach((wrap, index) => { if (!wrap.dataset.sortOriginalIndex) wrap.dataset.sortOriginalIndex = String(index); });
  // Visibility (favorites-gallery restriction AND whatever the fan has
  // checked in Filters - level, status, etc.) is GalleryFilterController's
  // job alone now. This used to also force every favorited card's wrap
  // back to visible here, running ~80ms after GalleryFilterController's own
  // pass (see rerunSortIfActive below) - it always won that race, so
  // checking a level filter while a stat sort was active looked like the
  // filter did nothing at all.
  if (!checked) {
    if (status) status.textContent = favoritesSortEnabled ? 'Favorites gallery order.' : 'Default roster order.';
    if (favoritesSortEnabled) syncStripToSortedCards(getVisibleCards(section));
    return;
  }
  const metric = checked.value;
  const metricGroup = checked.dataset.group || '';
  const level = currentCareerLevel;
  const scopedCards = favoriteScopeCards(cards);
  // Players with no stats for the chosen scope (no current-season row, or no
  // career at the chosen level) keep roster order below the ranked group.
  const statFor = (card: HTMLElement): number | null => {
    if (scope === 'career') return getCareerStat(card, level, metricGroup, metric);
    const source = seasonSourceCard(card, section);
    return hasCurrentSeasonStats(source) ? getSeasonStat(source, metric, metricGroup) : null;
  };
  const sortedCards = [...scopedCards].sort((a, b) => {
    const ai = Number(getCardWrap(a).dataset.sortOriginalIndex || 0);
    const bi = Number(getCardWrap(b).dataset.sortOriginalIndex || 0);
    const av = statFor(a);
    const bv = statFor(b);
    if (av == null && bv == null) return ai - bi;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (av === bv) return ai - bi;
    return dir === 'asc' ? av - bv : bv - av;
  });
  const appended = new Set<HTMLElement>();
  sortedCards.forEach((card) => { const wrap = getCardWrap(card); if (!appended.has(wrap)) { appended.add(wrap); grid.appendChild(wrap); } });
  syncStripToSortedCards(favoritesSortEnabled ? sortedCards : getVisibleCards(section));
  if (status) {
    const metricInfo = getMetric(metric, metricGroup);
    const label = checked.dataset.label || metricInfo?.label || checked.value.toUpperCase();
    const levelText = CAREER_LEVELS.find((l) => l.key === level)?.statusLabel || 'career';
    const modeText = scope === 'season'
      ? '2026 season stats. Players without 2026 stats stay below the ranked group.'
      : `${levelText} stats. Players with no ${levelText} stats stay below the ranked group.`;
    const fav = favoritesSortEnabled ? ' Favorite gallery sort uses selected favorites only.' : '';
    status.textContent = `Sorted by ${label}. ${modeText}${fav}`;
  }
}
function rerunSortIfActive(delay = 80) { if (isSortSelected()) window.setTimeout(applyFlipCardSort, delay); }
function metricOption(metric: SortMetric) {
  return `<label class="yat-sort-option yat-sort-option-${metric.group}" title="${metric.label}"><input type="checkbox" name="yat-sort-stat" value="${metric.key}" data-label="${metric.label}" data-group="${metric.group}" data-default-direction="${metric.defaultDirection || 'desc'}" aria-label="${metric.label}" /><span class="yat-sort-short">${metric.shortLabel}</span></label>`;
}
function hasAnyDrawerOpen() { return document.body.classList.contains('drawer-left-open') || document.body.classList.contains('drawer-sort-open') || document.body.classList.contains('drawer-right-open') || document.body.classList.contains('drawer-account-open') || document.body.classList.contains('drawer-favorites-open'); }
function openSortDrawer() { document.body.classList.add('drawer-sort-open', 'drawer-open'); document.body.classList.remove('drawer-left-open', 'drawer-right-open', 'drawer-account-open', 'drawer-favorites-open'); }
function closeSortDrawer() { document.body.classList.remove('drawer-sort-open'); document.body.classList.toggle('drawer-open', hasAnyDrawerOpen()); }

function installSortDrawer() {
  const filtersDrawer = document.getElementById('drawerFilters');
  const filters = document.getElementById('filters');
  const sortHost = document.getElementById('sortControls');
  if (!filtersDrawer || !filters || !sortHost) return;
  const filterHeading = filtersDrawer.querySelector('h3');
  if (filterHeading) filterHeading.textContent = 'FILTER';
  const oldSortRoot = document.getElementById('yatSortControls');
  if (oldSortRoot && oldSortRoot.parentElement !== sortHost) oldSortRoot.remove();
  if (!document.getElementById('yatSortControls')) {
    const battingMetrics = SORT_METRICS.filter((m) => m.group === 'batting');
    const pitchingMetrics = SORT_METRICS.filter((m) => m.group === 'pitching');
    const sortGroup = document.createElement('section');
    sortGroup.id = 'yatSortControls';
    sortGroup.className = 'yat-sort-group';
    const careerLevelButtons = CAREER_LEVELS.map((l) => `<button type="button" class="yat-sort-level-btn" data-yat-career-level="${l.key}" aria-pressed="false">${l.label}</button>`).join('');
    sortGroup.innerHTML = `<div class="yat-sort-controls"><div class="yat-sort-scope-switch"><button type="button" class="yat-sort-scope-label active" data-yat-sort-scope="season">2026 Season</button><button type="button" id="yatSortScopeSwitch" class="yat-sort-switch" role="switch" aria-checked="false" aria-label="Sort by career stats"><span class="yat-sort-switch-knob"></span></button><button type="button" class="yat-sort-scope-label" data-yat-sort-scope="career">Career</button></div><div class="yat-sort-career-levels" role="group" aria-label="Career level" hidden>${careerLevelButtons}</div><div class="yat-sort-columns"><div class="yat-sort-column"><div class="yat-sort-column-title">Batting</div><div class="yat-sort-options yat-sort-options-batting">${battingMetrics.map(metricOption).join('')}</div></div><div class="yat-sort-column"><div class="yat-sort-column-title">Pitching</div><div class="yat-sort-options yat-sort-options-pitching">${pitchingMetrics.map(metricOption).join('')}</div></div></div><button type="button" id="yatSortReset" class="yat-sort-reset">Reset Sort</button><div id="yatSortStatus" class="yat-sort-status">Default roster order.</div></div>`;
    sortHost.appendChild(sortGroup);
  }
  const root = getSortRoot();
  if (!root) return;
  setDirection(currentSortDirection);
  setScope(currentSortScope);
  setCareerLevel(currentCareerLevel);
  const statBoxes = Array.from(root.querySelectorAll<HTMLInputElement>('input[name="yat-sort-stat"]'));
  statBoxes.forEach((box) => {
    box.addEventListener('change', () => {
      if (box.checked) {
        statBoxes.forEach((other) => { if (other !== box) other.checked = false; });
        setDirection(box.dataset.defaultDirection === 'asc' ? 'asc' : 'desc');
      }
      window.setTimeout(applyFlipCardSort, 0);
    });
  });
  root.querySelectorAll<HTMLButtonElement>('[data-yat-sort-scope]').forEach((button) => {
    button.addEventListener('click', () => { setScope(button.dataset.yatSortScope === 'career' ? 'career' : 'season'); window.setTimeout(applyFlipCardSort, 0); });
  });
  root.querySelector<HTMLButtonElement>('#yatSortScopeSwitch')?.addEventListener('click', () => {
    setScope(selectedScope() === 'career' ? 'season' : 'career');
    window.setTimeout(applyFlipCardSort, 0);
  });
  root.querySelectorAll<HTMLButtonElement>('[data-yat-career-level]').forEach((button) => {
    button.addEventListener('click', () => {
      const level = CAREER_LEVELS.find((l) => l.key === button.dataset.yatCareerLevel)?.key;
      if (!level) return;
      setCareerLevel(level);
      window.setTimeout(applyFlipCardSort, 0);
    });
  });
  document.getElementById('yatSortReset')?.addEventListener('click', () => {
    statBoxes.forEach((box) => { box.checked = false; });
    setDirection('desc');
    setScope('season');
    setCareerLevel('mlb');
    restoreDefaultCardOrder();
    const status = document.getElementById('yatSortStatus');
    if (status) status.textContent = favoritesSortEnabled ? 'Favorites gallery order.' : 'Default roster order.';
  });
  filters.querySelectorAll('input, select').forEach((input) => { input.addEventListener('change', () => rerunSortIfActive(80)); input.addEventListener('input', () => rerunSortIfActive(80)); });
  document.getElementById('openSort')?.addEventListener('click', (event) => { event.preventDefault(); openSortDrawer(); });
  document.getElementById('closeSort')?.addEventListener('click', (event) => { event.preventDefault(); closeSortDrawer(); });
  window.addEventListener('yat:favorites-filter-changed', (event) => {
    const detail = (event as CustomEvent<{ enabled?: boolean; playerIds?: string[] }>).detail || {};
    favoritesSortEnabled = Boolean(detail.enabled);
    favoriteSortPlayerIds = new Set((detail.playerIds || []).map((id) => String(id)));
    rerunSortIfActive(80);
  });
  window.addEventListener('hashchange', () => rerunSortIfActive(120));
  (window as unknown as { yatApplyFlipCardSort?: () => void }).yatApplyFlipCardSort = applyFlipCardSort;
}

export default function SortFilterDrawerControls() {
  useEffect(() => { installSortDrawer(); }, []);
  return <><aside className="yat-drawer yat-drawer-right yat-sort-drawer" id="drawerSort"><div className="yat-drawer-header yat-sort-drawer-header"><h3>SORT</h3><button className="yat-icon-btn" id="closeSort" aria-label="Close sort"><i className="ri-close-line" /></button></div><div className="yat-drawer-content" id="sortControls" /></aside><style jsx global>{`
    #drawerSort{transform:translateX(100%);transition:transform .22s ease}body.drawer-sort-open #drawerSort{transform:translateX(0)!important}body.drawer-sort-open .yat-drawer-mask{display:none!important;opacity:0!important;pointer-events:none!important}.yat-sort-drawer-header{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 14px;border-bottom:1px solid var(--line)}.yat-sort-drawer-header h3{margin:0}.yat-sort-group{border-bottom:1px solid var(--line);margin-bottom:8px;padding-bottom:10px}.yat-sort-controls{display:flex;flex-direction:column;gap:10px;padding-top:10px}.yat-sort-scope-switch{display:flex;align-items:center;justify-content:center;gap:10px}.yat-sort-scope-label{padding:4px 2px;border:0;background:none;color:var(--muted);font:700 12px/1 Oswald,sans-serif;letter-spacing:.08em;text-transform:uppercase;cursor:pointer}.yat-sort-scope-label.active{color:#d8b85f}.yat-sort-switch{position:relative;flex:0 0 auto;width:46px;height:24px;padding:0;border:1px solid var(--line);border-radius:999px;background:rgba(255,255,255,.1);cursor:pointer;transition:background .18s ease}.yat-sort-switch-knob{position:absolute;top:2px;left:2px;width:18px;height:18px;border-radius:50%;background:#d8b85f;box-shadow:0 1px 3px rgba(0,0,0,.4);transition:transform .18s ease}.yat-sort-switch[aria-checked="true"] .yat-sort-switch-knob{transform:translateX(22px)}.yat-sort-switch:focus-visible,.yat-sort-scope-label:focus-visible,.yat-sort-level-btn:focus-visible{outline:2px solid #d8b85f;outline-offset:2px}.yat-sort-career-levels{display:flex;justify-content:center;gap:6px}.yat-sort-career-levels[hidden]{display:none}.yat-sort-level-btn{min-height:26px;padding:0 12px;border:1px solid var(--line);border-radius:999px;background:rgba(255,255,255,.04);color:var(--ink);font:600 11px/1 Oswald,sans-serif;letter-spacing:.06em;text-transform:uppercase;cursor:pointer}.yat-sort-level-btn.active{background:#d8b85f;border-color:#d8b85f;color:#111}.yat-sort-columns{display:grid;grid-template-columns:1fr 1fr;gap:8px;align-items:start}.yat-sort-column-title{margin:0 0 5px;color:var(--muted);font:600 11px Oswald,sans-serif;letter-spacing:.06em;text-transform:uppercase}.yat-sort-options{display:grid;grid-template-columns:1fr;gap:5px}.yat-sort-options label{display:flex;align-items:center;gap:6px;min-height:30px;border:1px solid var(--line);border-radius:7px;background:rgba(255,255,255,.04);padding:5px 7px;color:var(--ink);font:400 12px Oswald,sans-serif;text-transform:uppercase;cursor:pointer}.yat-sort-short{flex:0 0 auto;font-weight:700;letter-spacing:.04em}.yat-sort-options input:checked+.yat-sort-short{color:#ffd166}.yat-sort-reset{min-height:32px;border:1px solid var(--line);border-radius:7px;background:rgba(255,255,255,.08);color:var(--fg);font:400 12px Oswald,sans-serif;text-transform:uppercase;cursor:pointer}.yat-sort-status{color:var(--muted);font:400 11px/1.35 Oswald,sans-serif;letter-spacing:.03em}@media (min-width:780px){body.drawer-sort-open #drawerSort{top:calc(var(--row1-h) + var(--row2-h))!important;bottom:var(--footerH)!important;height:auto!important;z-index:64!important}body.drawer-sort-open .yat-row3-shell,body.drawer-sort-open .yat-row4-shell,body.drawer-sort-open .yat-row5-shell,body.drawer-sort-open .yat-row6-shell{margin-right:var(--yat-side-drawer-w,360px)!important}body.drawer-left-open.drawer-sort-open .yat-row3-shell,body.drawer-left-open.drawer-sort-open .yat-row4-shell,body.drawer-left-open.drawer-sort-open .yat-row5-shell,body.drawer-left-open.drawer-sort-open .yat-row6-shell{margin-left:var(--yat-side-drawer-w,360px)!important;margin-right:var(--yat-side-drawer-w,360px)!important}body.drawer-sort-open .yat-grid{grid-template-columns:repeat(auto-fit,minmax(min(100%,230px),1fr))!important}}@media (max-width:779px){body.drawer-sort-open .yat-drawer-mask{display:block!important;opacity:1!important;pointer-events:auto!important}}
  `}</style></>;
}
