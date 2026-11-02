'use client';

// Keeps each sponsor card (SponsorFlipCard) in its slot after the gallery
// scripts re-sort the player cards. The server already renders it in the
// right place; the filter/sort scripts then re-append player cards, which
// would push the sponsor card to the top. Slots (src/lib/sponsorFlipCards.ts):
//   Active Alumni   in front of the first card ranked after ROOKIE
//   2027 HS Team    2nd, after the coach
//   All-Time        after the leading retired coaches
import { useEffect } from 'react';
import { SPONSOR_AFTER_LEVEL_RANK } from '@/lib/sponsorFlipCards';
import { LEVEL_RANK } from '@/lib/playerUtils';

const GRIDS: Record<string, string> = { active: 'active-grid', current: 'current-grid', alltime: 'alltime-grid' };

function rank(card: HTMLElement) {
  const level = String(card.dataset.level || '').trim().toUpperCase().replace(/\s+/g, '-')
    .replace(/^NCAA-?D([123])$/, 'NCAA-D$1').replace(/^HIGH-SCHOOL$/, 'HIGH SCHOOL');
  return LEVEL_RANK[level] ?? LEVEL_RANK[level.replace(/-/g, ' ')] ?? 99;
}
const isCoach = (card: HTMLElement) => /(?:^|[ -])COACH(?:$|[ -])/.test(String(card.dataset.status || '').toUpperCase());

// The grid's player items in order: a wrapper, or a bare card.
function playerItems(grid: HTMLElement): { item: HTMLElement; card: HTMLElement }[] {
  return Array.from(grid.children).flatMap((child) => {
    const node = child as HTMLElement;
    if (node.dataset.sponsorWrap) return [];
    const card = node.matches('.yat-card[data-playerid]') ? node : node.querySelector<HTMLElement>('.yat-card[data-playerid]');
    return card ? [{ item: node, card }] : [];
  });
}

function place(section: string) {
  const grid = document.getElementById(GRIDS[section]);
  if (!grid) return;
  const sponsors = Array.from(grid.querySelectorAll<HTMLElement>(`:scope > [data-sponsor-wrap="${section}"]`));
  if (!sponsors.length) return;
  const items = playerItems(grid);
  let before: HTMLElement | null;
  if (section === 'active') {
    before = items.find(({ card }) => rank(card) > SPONSOR_AFTER_LEVEL_RANK)?.item || null;
  } else if (section === 'current') {
    before = items[1]?.item || null;
  } else {
    before = items.find(({ card }) => !isCoach(card))?.item || null;
  }
  // Already there (together, right before `before`, or at the end): leave
  // the DOM alone, so the observer below never loops.
  const together = sponsors.every((s, i) => i === 0 || sponsors[i - 1].nextElementSibling === s);
  const last = sponsors[sponsors.length - 1];
  const inSlot = before ? last.nextElementSibling === before : !last.nextElementSibling;
  if (together && inSlot) return;
  sponsors.forEach((s) => (before ? grid.insertBefore(s, before) : grid.appendChild(s)));
}

export default function SponsorCardPlacer() {
  useEffect(() => {
    let queued = false;
    const run = () => {
      if (queued) return;
      queued = true;
      window.requestAnimationFrame(() => { queued = false; Object.keys(GRIDS).forEach(place); });
    };
    run();
    const observer = new MutationObserver(run);
    Object.values(GRIDS).forEach((id) => {
      const grid = document.getElementById(id);
      if (grid) observer.observe(grid, { childList: true });
    });
    window.addEventListener('yat:gallery-filtered', run);
    window.addEventListener('yat:alltime-gallery-loaded', run);
    return () => {
      observer.disconnect();
      window.removeEventListener('yat:gallery-filtered', run);
      window.removeEventListener('yat:alltime-gallery-loaded', run);
    };
  }, []);
  return null;
}
