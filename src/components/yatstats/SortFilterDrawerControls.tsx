'use client';

import { useEffect } from 'react';

type SortDirection = 'asc' | 'desc';
type SortMetric = {
  key: string;
  label: string;
  shortLabel: string;
  group: 'batting' | 'pitching';
  defaultDirection?: SortDirection;
};

let currentSortDirection: SortDirection = 'desc';

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

function getSortRoot(): HTMLElement | null {
  return document.getElementById('yatSortControls');
}

function getMetric(key: string, group?: string | null) {
  return SORT_METRICS.find((metric) => metric.key === key && (!group || metric.group === group))
    || SORT_METRICS.find((metric) => metric.key === key)
    || null;
}

function statAttrName(key: string) {
  return `stat${key.charAt(0).toUpperCase()}${key.slice(1)}`;
}

function getVisibleGallerySection(): HTMLElement | null {
  const activeSection = document.getElementById('sec-active');
  const allTimeSection = document.getElementById('sec-alltime');

  if (activeSection?.classList.contains('visible')) return activeSection;
  if (allTimeSection?.classList.contains('visible')) return allTimeSection;

  return null;
}

function isActiveAlumniSection(section: HTMLElement | null) {
  return section?.id === 'sec-active';
}

function getCardWrap(card: HTMLElement): HTMLElement {
  return (card.closest('[data-player-card-wrap="true"]') as HTMLElement | null) || card;
}

function getGrid(section: HTMLElement): HTMLElement | null {
  return (section.querySelector('.yat-grid') || section.querySelector('#active-grid')) as HTMLElement | null;
}

function parseStatNumber(raw: unknown): number | null {
  const text = String(raw ?? '').trim();
  if (!text || text === '--') return null;

  if (text.includes('-')) {
    const first = text.split('-')[0];
    const firstParsed = Number(String(first).replace(/[^0-9.-]/g, ''));
    return Number.isFinite(firstParsed) ? firstParsed : null;
  }

  const cleaned = text.replace(/[^0-9.-]/g, '').trim();
  if (!cleaned) return null;

  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function getNumericStat(card: HTMLElement, key: string): number | null {
  const raw = card.dataset[statAttrName(key)] || card.getAttribute(`data-stat-${key}`) || '';
  return parseStatNumber(raw);
}

function hasCurrentSeasonStats(card: HTMLElement): boolean {
  return card.dataset.has2026Stats === 'true' || card.getAttribute('data-has-2026-stats') === 'true';
}

function getVisibleCards(section: HTMLElement): HTMLElement[] {
  return Array.from(section.querySelectorAll('.yat-card[data-playerid]')).filter((node) => {
    const card = node as HTMLElement;
    const wrap = getCardWrap(card);
    if (wrap.style.display === 'none') return false;
    if (wrap.hasAttribute('hidden')) return false;
    if (card.style.display === 'none') return false;
    return true;
  }) as HTMLElement[];
}

function syncStripToSortedCards(cards: HTMLElement[]) {
  const strip = document.querySelector('.gallery-strip-inner') as HTMLElement | null;
  if (!strip) return;

  const slots = Array.from(strip.querySelectorAll('.gallery-slot-link[data-playerid]')) as HTMLElement[];
  const slotMap = new Map<string, HTMLElement>();

  slots.forEach((slot) => {
    const playerId = slot.getAttribute('data-playerid') || '';
    if (playerId && !slotMap.has(playerId)) slotMap.set(playerId, slot);
  });

  const visibleIds = cards.map((card) => card.getAttribute('data-playerid') || '').filter(Boolean);

  visibleIds.forEach((playerId) => {
    const slot = slotMap.get(playerId);
    if (slot) {
      slot.style.display = '';
      strip.appendChild(slot);
    }
  });

  slots.forEach((slot) => {
    const playerId = slot.getAttribute('data-playerid') || '';
    slot.style.display = visibleIds.includes(playerId) ? '' : 'none';
  });
}

function restoreDefaultCardOrder() {
  const section = getVisibleGallerySection();
  if (!section) return;

  const grid = getGrid(section);
  if (!grid) return;

  const cards = Array.from(section.querySelectorAll('.yat-card[data-playerid]')) as HTMLElement[];
  const wraps = cards.map(getCardWrap);

  wraps.forEach((wrap, index) => {
    if (!wrap.dataset.sortOriginalIndex) wrap.dataset.sortOriginalIndex = String(index);
  });

  const sortedWraps = [...new Set(wraps)].sort(
    (a, b) => Number(a.dataset.sortOriginalIndex || 0) - Number(b.dataset.sortOriginalIndex || 0),
  );

  sortedWraps.forEach((wrap) => grid.appendChild(wrap));
  syncStripToSortedCards(getVisibleCards(section));
}

function getSelectedSortInput(): HTMLInputElement | null {
  return getSortRoot()?.querySelector<HTMLInputElement>('input[name="yat-sort-stat"]:checked') || null;
}

function isSortSelected() {
  return Boolean(getSelectedSortInput());
}

function selectedDirection(): SortDirection {
  const root = getSortRoot();
  const locked = root?.dataset.yatSortDirection === 'asc' ? 'asc' : root?.dataset.yatSortDirection === 'desc' ? 'desc' : null;
  if (locked) return locked;
  return currentSortDirection;
}

function setDirection(direction: SortDirection) {
  currentSortDirection = direction;
  const root = getSortRoot();
  if (!root) return;

  root.dataset.yatSortDirection = direction;
  root.querySelectorAll<HTMLInputElement>('input[name="yat-sort-direction"]').forEach((radio) => {
    radio.checked = radio.value === direction;
    radio.defaultChecked = radio.value === direction;
    const label = radio.closest('label');
    label?.classList.toggle('yat-sort-direction-active', radio.value === direction);
  });
}

function applyFlipCardSort() {
  const checked = getSelectedSortInput();
  const dir = selectedDirection();
  const status = document.getElementById('yatSortStatus');
  const section = getVisibleGallerySection();

  if (!section) return;

  const grid = getGrid(section);
  if (!grid) return;

  const cards = Array.from(section.querySelectorAll('.yat-card[data-playerid]')) as HTMLElement[];
  const wraps = cards.map(getCardWrap);

  wraps.forEach((wrap, index) => {
    if (!wrap.dataset.sortOriginalIndex) wrap.dataset.sortOriginalIndex = String(index);
  });

  if (!checked) {
    if (status) status.textContent = 'Default roster order.';
    return;
  }

  if (!isActiveAlumniSection(section)) {
    if (status) status.textContent = 'Career/all-time sorting will be handled separately later.';
    return;
  }

  const metric = checked.value;
  const metricGroup = checked.dataset.group || '';
  const sortedCards = [...cards].sort((a, b) => {
    const aw = getCardWrap(a);
    const bw = getCardWrap(b);
    const ai = Number(aw.dataset.sortOriginalIndex || 0);
    const bi = Number(bw.dataset.sortOriginalIndex || 0);
    const aCurrent = hasCurrentSeasonStats(a);
    const bCurrent = hasCurrentSeasonStats(b);

    if (aCurrent !== bCurrent) return aCurrent ? -1 : 1;
    if (!aCurrent && !bCurrent) return ai - bi;

    const av = getNumericStat(a, metric);
    const bv = getNumericStat(b, metric);

    if (av == null && bv == null) return ai - bi;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (av === bv) return ai - bi;

    return dir === 'asc' ? av - bv : bv - av;
  });

  const appended = new Set<HTMLElement>();
  sortedCards.forEach((card) => {
    const wrap = getCardWrap(card);
    if (appended.has(wrap)) return;
    appended.add(wrap);
    grid.appendChild(wrap);
  });

  syncStripToSortedCards(getVisibleCards(section));

  if (status) {
    const metricInfo = getMetric(metric, metricGroup);
    const label = checked.dataset.label || metricInfo?.label || checked.value.toUpperCase();
    status.textContent = `${label}: ${dir === 'asc' ? 'low to high' : 'high to low'}. Active Alumni sort uses 2026 stats only.`;
  }
}

function rerunSortIfActive(delay = 80) {
  if (!isSortSelected()) return;
  window.setTimeout(applyFlipCardSort, delay);
}

function metricOption(metric: SortMetric) {
  return `
    <label class="yat-sort-option yat-sort-option-${metric.group}">
      <input type="checkbox" name="yat-sort-stat" value="${metric.key}" data-label="${metric.label}" data-group="${metric.group}" data-default-direction="${metric.defaultDirection || 'desc'}" />
      <span class="yat-sort-short">${metric.shortLabel}</span>
      <span class="yat-sort-full">${metric.label}</span>
    </label>
  `;
}

function installSortFilterDrawer() {
  const drawer = document.getElementById('drawerFilters');
  const filters = document.getElementById('filters');
  if (!drawer || !filters) return;

  const heading = drawer.querySelector('h3');
  if (heading) heading.textContent = 'SORT & FILTER';

  if (!document.getElementById('yatSortControls')) {
    const battingMetrics = SORT_METRICS.filter((metric) => metric.group === 'batting');
    const pitchingMetrics = SORT_METRICS.filter((metric) => metric.group === 'pitching');
    const sortGroup = document.createElement('details');
    sortGroup.id = 'yatSortControls';
    sortGroup.className = 'yat-filter-group yat-sort-group';
    sortGroup.open = false;

    sortGroup.innerHTML = `
      <summary>Sort Cards By Stats</summary>
      <div class="yat-sort-controls">
        <div class="yat-sort-direction" role="group" aria-label="Sort direction">
          <label><input type="radio" name="yat-sort-direction" value="desc" /> <span>High to Low</span></label>
          <label><input type="radio" name="yat-sort-direction" value="asc" /> <span>Low to High</span></label>
        </div>
        <div class="yat-sort-columns">
          <div class="yat-sort-column">
            <div class="yat-sort-column-title">Batting</div>
            <div class="yat-sort-options yat-sort-options-batting">
              ${battingMetrics.map(metricOption).join('')}
            </div>
          </div>
          <div class="yat-sort-column">
            <div class="yat-sort-column-title">Pitching</div>
            <div class="yat-sort-options yat-sort-options-pitching">
              ${pitchingMetrics.map(metricOption).join('')}
            </div>
          </div>
        </div>
        <button type="button" id="yatSortReset" class="yat-sort-reset">Reset Sort</button>
        <div id="yatSortStatus" class="yat-sort-status">Default roster order.</div>
      </div>
    `;

    filters.insertBefore(sortGroup, filters.firstChild);
  }

  const root = getSortRoot();
  if (!root) return;

  setDirection(currentSortDirection);

  const statBoxes = Array.from(root.querySelectorAll<HTMLInputElement>('input[name="yat-sort-stat"]'));
  statBoxes.forEach((box) => {
    box.addEventListener('change', () => {
      if (box.checked) {
        statBoxes.forEach((other) => {
          if (other !== box) other.checked = false;
        });
        setDirection(box.dataset.defaultDirection === 'asc' ? 'asc' : 'desc');
      }
      window.setTimeout(applyFlipCardSort, 0);
    });
  });

  root.querySelectorAll<HTMLInputElement>('input[name="yat-sort-direction"]').forEach((radio) => {
    const handleDirection = (event: Event) => {
      event.stopPropagation();
      setDirection(radio.value === 'asc' ? 'asc' : 'desc');
      window.setTimeout(applyFlipCardSort, 0);
    };
    radio.addEventListener('change', handleDirection);
    radio.addEventListener('click', handleDirection);
  });

  document.getElementById('yatSortReset')?.addEventListener('click', () => {
    statBoxes.forEach((box) => {
      box.checked = false;
    });
    setDirection('desc');
    restoreDefaultCardOrder();
    const status = document.getElementById('yatSortStatus');
    if (status) status.textContent = 'Default roster order.';
  });

  filters.querySelectorAll('input, select').forEach((input) => {
    if (root.contains(input)) return;
    input.addEventListener('change', () => rerunSortIfActive(80));
    input.addEventListener('input', () => rerunSortIfActive(80));
  });

  window.addEventListener('yat:favorites-filter-changed', () => rerunSortIfActive(80));
  window.addEventListener('hashchange', () => rerunSortIfActive(120));

  (window as unknown as { yatApplyFlipCardSort?: () => void }).yatApplyFlipCardSort = applyFlipCardSort;
}

export default function SortFilterDrawerControls() {
  useEffect(() => {
    installSortFilterDrawer();
  }, []);

  return (
    <style jsx global>{`
      .yat-sort-group {
        border-bottom: 1px solid var(--line);
        margin-bottom: 8px;
        padding-bottom: 10px;
      }

      .yat-sort-controls {
        display: flex;
        flex-direction: column;
        gap: 10px;
        padding-top: 10px;
      }

      .yat-sort-direction {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 7px;
      }

      .yat-sort-columns {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
        align-items: start;
      }

      .yat-sort-column-title {
        margin: 0 0 5px;
        color: var(--muted);
        font: 600 11px Oswald, sans-serif;
        letter-spacing: .06em;
        text-transform: uppercase;
      }

      .yat-sort-direction label,
      .yat-sort-options label {
        display: flex;
        align-items: center;
        gap: 6px;
        min-height: 30px;
        border: 1px solid var(--line);
        border-radius: 7px;
        background: rgba(255, 255, 255, 0.04);
        padding: 5px 7px;
        color: var(--ink);
        font: 400 12px Oswald, sans-serif;
        letter-spacing: 0;
        text-transform: uppercase;
        cursor: pointer;
      }

      .yat-sort-options {
        display: grid;
        grid-template-columns: 1fr;
        gap: 5px;
      }

      .yat-sort-short {
        flex: 0 0 auto;
        min-width: 26px;
        font-weight: 700;
        letter-spacing: .04em;
      }

      .yat-sort-full {
        flex: 1 1 auto;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        color: var(--muted);
        font-size: 10px;
      }

      .yat-sort-options input:checked + .yat-sort-short,
      .yat-sort-direction input:checked + span,
      .yat-sort-direction-active span {
        color: #ffd166;
        font-weight: 600;
      }

      .yat-sort-options input:checked ~ .yat-sort-full {
        color: #ffd166;
      }

      .yat-sort-reset {
        min-height: 32px;
        border: 1px solid var(--line);
        border-radius: 7px;
        background: rgba(255, 255, 255, .08);
        color: var(--fg);
        font: 400 12px Oswald, sans-serif;
        text-transform: uppercase;
        cursor: pointer;
      }

      .yat-sort-status {
        color: var(--muted);
        font: 400 11px/1.35 Oswald, sans-serif;
        letter-spacing: .03em;
      }

      @media (max-width: 420px) {
        .yat-sort-columns {
          grid-template-columns: 1fr;
        }
      }
    `}</style>
  );
}
