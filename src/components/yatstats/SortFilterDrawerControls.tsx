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

function getCardWrap(card: HTMLElement): HTMLElement {
  return (card.closest('[data-player-card-wrap="true"]') as HTMLElement | null) || card;
}

function getGrid(section: HTMLElement): HTMLElement | null {
  return (section.querySelector('.yat-grid') || section.querySelector('#active-grid')) as HTMLElement | null;
}

function getNumericStat(card: HTMLElement, key: string): number | null {
  const raw = card.dataset[statAttrName(key)] || card.getAttribute(`data-stat-${key}`) || '';
  const cleaned = String(raw).replace(/[^0-9.-]/g, '').trim();
  if (!cleaned) return null;

  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) return null;

  return parsed;
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

  const metric = checked.value;
  const sortedCards = [...cards].sort((a, b) => {
    const aCurrent = hasCurrentSeasonStats(a);
    const bCurrent = hasCurrentSeasonStats(b);
    const aw = getCardWrap(a);
    const bw = getCardWrap(b);
    const ai = Number(aw.dataset.sortOriginalIndex || 0);
    const bi = Number(bw.dataset.sortOriginalIndex || 0);

    if (aCurrent !== bCurrent) return aCurrent ? -1 : 1;

    const av = aCurrent ? getNumericStat(a, metric) : null;
    const bv = bCurrent ? getNumericStat(b, metric) : null;

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
    status.textContent = `${label}: ${dir === 'asc' ? 'low to high' : 'high to low'}. Only players with 2026 stats are ranked first; everyone else stays below them.`;
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
      applyFlipCardSort();
    });
  });

  document.querySelectorAll<HTMLInputElement>('input[name="yat-sort-direction"]').forEach((radio) => {
    radio.addEventListener('change', applyFlipCardSort);
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
    input.addEventListener('change', () => window.setTimeout(applyFlipCardSort, 50));
    input.addEventListener('input', () => window.setTimeout(applyFlipCardSort, 50));
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
        color: var(--fg);
        font: 800 11px/1.1 Oswald, sans-serif;
        letter-spacing: .04em;
        text-transform: uppercase;
      }

      .yat-sort-options {
        display: grid;
        grid-template-columns: 1fr;
        gap: 5px;
      }

      .yat-sort-options input:checked + span,
      .yat-sort-direction input:checked + span {
        color: #ffd166;
      }

      .yat-sort-reset {
        min-height: 32px;
        border: 1px solid var(--line);
        border-radius: 7px;
        background: rgba(255, 255, 255, .08);
        color: var(--fg);
        font: 900 11px Oswald, sans-serif;
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
