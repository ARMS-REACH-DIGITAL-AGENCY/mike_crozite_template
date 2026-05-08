'use client';

import { useEffect } from 'react';

const SORT_METRICS = [
  { key: 'gp', label: 'Games Played' },
  { key: 'avg', label: 'Batting Average' },
  { key: 'ops', label: 'OPS' },
  { key: 'obp', label: 'On-Base %' },
  { key: 'slg', label: 'Slugging %' },
  { key: 'hr', label: 'Home Runs' },
  { key: 'rbi', label: 'RBI' },
  { key: 'h', label: 'Hits' },
  { key: 'r', label: 'Runs' },
  { key: 'sb', label: 'Stolen Bases' },
  { key: 'ab', label: 'At Bats' },
  { key: 'era', label: 'ERA' },
  { key: 'whip', label: 'WHIP' },
  { key: 'k', label: 'Strikeouts' },
  { key: 'bb', label: 'Walks' },
  { key: 'ip', label: 'Innings Pitched' },
  { key: 'w', label: 'Wins' },
  { key: 'sv', label: 'Saves' },
];

const STAT_LABEL_ALIASES: Record<string, string[]> = {
  gp: ['GP', 'G'],
  avg: ['AVG'],
  ops: ['OPS'],
  obp: ['OBP'],
  slg: ['SLG'],
  hr: ['HR'],
  rbi: ['RBI'],
  h: ['H'],
  r: ['R'],
  sb: ['SB'],
  ab: ['AB'],
  era: ['ERA'],
  whip: ['WHIP'],
  k: ['K', 'SO'],
  bb: ['BB'],
  ip: ['IP'],
  w: ['W', 'W-L'],
  sv: ['SV', 'SAVES'],
};

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

function getNumericStatFromGrid(card: HTMLElement, key: string): number | null {
  const aliases = (STAT_LABEL_ALIASES[key] || [key]).map((v) => v.toUpperCase());
  const stats = Array.from(card.querySelectorAll('.yat-stat')) as HTMLElement[];

  for (const stat of stats) {
    const label = String(stat.querySelector('.yat-stat-label')?.textContent || '').trim().toUpperCase();
    if (!aliases.includes(label)) continue;

    const value = stat.querySelector('.yat-stat-val')?.textContent || '';
    return parseStatNumber(value);
  }

  return null;
}

function getNumericStat(card: HTMLElement, key: string): number | null {
  const raw = card.dataset[statAttrName(key)] || card.getAttribute(`data-stat-${key}`) || '';
  const dataValue = parseStatNumber(raw);
  if (dataValue != null) return dataValue;

  return getNumericStatFromGrid(card, key);
}

function hasCurrentSeasonStats(card: HTMLElement): boolean {
  if (card.dataset.has2026Stats === 'true' || card.getAttribute('data-has-2026-stats') === 'true') return true;

  const bars = Array.from(card.querySelectorAll('.yat-stats-bar, .fz-stat-bucket-btn, .fz-stats-title'));
  return bars.some((bar) => String(bar.textContent || '').toUpperCase().includes('2026'));
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

function applyFlipCardSort() {
  const checked = document.querySelector<HTMLInputElement>('input[name="yat-sort-stat"]:checked');
  const dir = document.querySelector<HTMLInputElement>('input[name="yat-sort-direction"]:checked')?.value === 'asc' ? 'asc' : 'desc';
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
    const sortedWraps = [...new Set(wraps)].sort(
      (a, b) => Number(a.dataset.sortOriginalIndex || 0) - Number(b.dataset.sortOriginalIndex || 0),
    );

    sortedWraps.forEach((wrap) => grid.appendChild(wrap));
    syncStripToSortedCards(getVisibleCards(section));
    if (status) status.textContent = 'Default roster order.';
    return;
  }

  if (!isActiveAlumniSection(section)) {
    if (status) status.textContent = 'Sorting career/all-time cards will be added after Active Alumni sorting is finalized.';
    return;
  }

  const metric = checked.value;
  const sortedCards = [...cards].sort((a, b) => {
    const aw = getCardWrap(a);
    const bw = getCardWrap(b);
    const ai = Number(aw.dataset.sortOriginalIndex || 0);
    const bi = Number(bw.dataset.sortOriginalIndex || 0);
    const aCurrent = hasCurrentSeasonStats(a);
    const bCurrent = hasCurrentSeasonStats(b);

    // Active Alumni sorts rank only cards with 2026 stats. Career/no-2026 cards stay underneath.
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
    const label = checked.dataset.label || checked.value.toUpperCase();
    status.textContent = `${label}: ${dir === 'asc' ? 'low to high' : 'high to low'}. Active Alumni sort uses 2026 stats only; players without 2026 stats stay below.`;
  }
}

function installSortFilterDrawer() {
  const drawer = document.getElementById('drawerFilters');
  const filters = document.getElementById('filters');
  if (!drawer || !filters) return;

  const heading = drawer.querySelector('h3');
  if (heading) heading.textContent = 'SORT & FILTER';

  if (!document.getElementById('yatSortControls')) {
    const sortGroup = document.createElement('details');
    sortGroup.id = 'yatSortControls';
    sortGroup.className = 'yat-filter-group yat-sort-group';
    sortGroup.open = false;

    sortGroup.innerHTML = `
      <summary>Sort Cards By Stats</summary>
      <div class="yat-sort-controls">
        <div class="yat-sort-direction" role="group" aria-label="Sort direction">
          <label><input type="radio" name="yat-sort-direction" value="desc" checked /> <span>High to Low</span></label>
          <label><input type="radio" name="yat-sort-direction" value="asc" /> <span>Low to High</span></label>
        </div>
        <div class="yat-sort-options">
          ${SORT_METRICS.map((metric) => `
            <label>
              <input type="checkbox" name="yat-sort-stat" value="${metric.key}" data-label="${metric.label}" />
              <span>${metric.label}</span>
            </label>
          `).join('')}
        </div>
        <button type="button" id="yatSortReset" class="yat-sort-reset">Reset Sort</button>
        <div id="yatSortStatus" class="yat-sort-status">Default roster order.</div>
      </div>
    `;

    filters.insertBefore(sortGroup, filters.firstChild);
  }

  const statBoxes = Array.from(document.querySelectorAll<HTMLInputElement>('input[name="yat-sort-stat"]'));
  statBoxes.forEach((box) => {
    box.addEventListener('change', () => {
      if (box.checked) {
        statBoxes.forEach((other) => {
          if (other !== box) other.checked = false;
        });
      }
      window.setTimeout(applyFlipCardSort, 0);
    });
  });

  document.querySelectorAll<HTMLInputElement>('input[name="yat-sort-direction"]').forEach((radio) => {
    radio.addEventListener('change', () => window.setTimeout(applyFlipCardSort, 0));
    radio.addEventListener('click', () => window.setTimeout(applyFlipCardSort, 0));
  });

  document.getElementById('yatSortReset')?.addEventListener('click', () => {
    statBoxes.forEach((box) => {
      box.checked = false;
    });
    const desc = document.querySelector<HTMLInputElement>('input[name="yat-sort-direction"][value="desc"]');
    if (desc) desc.checked = true;
    applyFlipCardSort();
  });

  filters.querySelectorAll('input, select').forEach((input) => {
    input.addEventListener('change', () => window.setTimeout(applyFlipCardSort, 80));
    input.addEventListener('input', () => window.setTimeout(applyFlipCardSort, 80));
  });

  window.addEventListener('yat:favorites-filter-changed', () => window.setTimeout(applyFlipCardSort, 80));
  window.addEventListener('hashchange', () => window.setTimeout(applyFlipCardSort, 120));
  document.addEventListener('click', () => window.setTimeout(applyFlipCardSort, 80), true);

  (window as unknown as { yatApplyFlipCardSort?: () => void }).yatApplyFlipCardSort = applyFlipCardSort;
  window.setTimeout(applyFlipCardSort, 150);
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

      .yat-sort-direction label,
      .yat-sort-options label {
        display: flex;
        align-items: center;
        gap: 8px;
        min-height: 32px;
        border: 1px solid var(--line);
        border-radius: 7px;
        background: rgba(255, 255, 255, 0.04);
        padding: 6px 8px;
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

      .yat-sort-options input:checked + span,
      .yat-sort-direction input:checked + span {
        color: #ffd166;
        font-weight: 600;
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
    `}</style>
  );
}
