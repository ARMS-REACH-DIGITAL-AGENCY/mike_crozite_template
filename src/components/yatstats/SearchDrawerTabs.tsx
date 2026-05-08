'use client';

import { useEffect } from 'react';

type SearchMode = 'name' | 'school' | 'team';

function esc(value: unknown) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function playerUrl(player: any) {
  const hsid = encodeURIComponent(String(player.schoolId || player.hsid || ''));
  const playerId = encodeURIComponent(String(player.playerId || player.playerid || ''));
  const slug = encodeURIComponent(String(player.slug || `${player.firstName || ''}-${player.lastName || ''}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')));
  return `/${hsid}/player/${playerId}/${slug}`;
}

function schoolUrl(program: any) {
  const microsite = String(program.microsite_url || program.micrositeUrl || '');
  if (microsite) return microsite;
  return `/${encodeURIComponent(String(program.hsid || program.schoolId || ''))}`;
}

function renderPlayerRows(players: any[], emptyText: string) {
  if (!players.length) return `<div class="yat-search-empty">${esc(emptyText)}</div>`;
  return players.map((p) => {
    const name = String(p.displayName || `${p.firstName || ''} ${p.lastName || ''}`.trim() || p.playerId || 'Player');
    const school = String(p.schoolName || '');
    const metaBits = [school, p.currentTeamName, p.levelLabel].filter(Boolean).join(' • ');
    return `
      <a class="yat-search-result-row" href="${esc(playerUrl(p))}">
        <img src="https://yatstats-assets.s3.us-west-2.amazonaws.com/players/now/${esc(p.playerId || p.playerid)}.jpg" alt="" class="yat-search-thumb" onerror="this.style.visibility='hidden'" />
        <span class="yat-search-row-text">
          <strong>${esc(name)}</strong>
          ${metaBits ? `<small>${esc(metaBits)}</small>` : ''}
        </span>
      </a>
    `;
  }).join('');
}

function renderSchoolRows(programs: any[], emptyText: string) {
  if (!programs.length) return `<div class="yat-search-empty">${esc(emptyText)}</div>`;
  return programs.map((s) => {
    const name = String(s.hsname || s.schoolName || 'School');
    const loc = String(s.hslocation || s.location || '');
    const hsid = String(s.hsid || s.schoolId || '');
    return `
      <a class="yat-search-result-row" href="${esc(schoolUrl(s))}">
        <img src="https://yatstats-assets.s3.us-west-2.amazonaws.com/school-logos/${esc(hsid)}.png" alt="" class="yat-search-thumb yat-search-school-thumb" onerror="this.style.visibility='hidden'" />
        <span class="yat-search-row-text">
          <strong>${esc(name)}</strong>
          ${loc ? `<small>${esc(loc)}</small>` : ''}
        </span>
      </a>
    `;
  }).join('');
}

async function fetchJson(url: string) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) return {};
  return res.json();
}

export default function SearchDrawerTabs() {
  useEffect(() => {
    const drawer = document.querySelector('#drawerLeft .yat-left-search-content') as HTMLElement | null;
    const input = document.getElementById('gsInput') as HTMLInputElement | null;
    const results = document.getElementById('gsResults') as HTMLElement | null;
    if (!drawer || !input || !results) return;

    if (!document.getElementById('yatSearchModeTabs')) {
      const tabs = document.createElement('div');
      tabs.id = 'yatSearchModeTabs';
      tabs.className = 'yat-search-mode-tabs';
      tabs.innerHTML = `
        <div class="yat-search-mode-label">Search for a player by</div>
        <div class="yat-search-mode-buttons" role="tablist" aria-label="Search mode">
          <button type="button" class="yat-search-mode-btn active" data-search-mode="name">Name</button>
          <button type="button" class="yat-search-mode-btn" data-search-mode="school">High School</button>
          <button type="button" class="yat-search-mode-btn" data-search-mode="team">Current Team</button>
        </div>
      `;
      input.closest('.yat-gs-input-wrap')?.insertAdjacentElement('afterend', tabs);
    }

    let mode: SearchMode = 'name';
    let timer: ReturnType<typeof setTimeout> | null = null;
    let requestId = 0;

    const setMode = (next: SearchMode) => {
      mode = next;
      drawer.querySelectorAll<HTMLElement>('[data-search-mode]').forEach((button) => {
        button.classList.toggle('active', button.dataset.searchMode === next);
      });
      runSearch();
    };

    const renderLoading = () => {
      results.innerHTML = '<div class="yat-search-empty">Searching...</div>';
    };

    async function runSearch() {
      const q = input.value.trim();
      const thisRequest = ++requestId;

      if (!q) {
        results.innerHTML = '<div class="yat-search-empty">Start typing to search.</div>';
        return;
      }

      renderLoading();

      try {
        if (mode === 'name') {
          const data = await fetchJson(`/api/players/search?q=${encodeURIComponent(q)}&limit=30`);
          if (thisRequest !== requestId) return;
          results.innerHTML = renderPlayerRows(Array.isArray(data.players) ? data.players : [], 'No player matches.');
          return;
        }

        if (mode === 'school') {
          const data = await fetchJson(`/api/schools/search?q=${encodeURIComponent(q)}&limit=30`);
          if (thisRequest !== requestId) return;
          results.innerHTML = renderSchoolRows(Array.isArray(data.programs) ? data.programs : [], 'No school matches.');
          return;
        }

        const data = await fetchJson(`/api/teams/search?q=${encodeURIComponent(q)}&limit=40`);
        if (thisRequest !== requestId) return;
        results.innerHTML = renderPlayerRows(Array.isArray(data.teams) ? data.teams : [], 'No current team matches.');
      } catch {
        if (thisRequest === requestId) results.innerHTML = '<div class="yat-search-empty">Search failed. Try again.</div>';
      }
    }

    function scheduleSearch(event?: Event) {
      event?.stopPropagation();
      if (timer) clearTimeout(timer);
      timer = setTimeout(runSearch, 180);
    }

    input.addEventListener('input', scheduleSearch, true);
    input.addEventListener('keyup', scheduleSearch, true);
    input.addEventListener('search', scheduleSearch, true);

    drawer.querySelectorAll<HTMLButtonElement>('[data-search-mode]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const next = button.dataset.searchMode as SearchMode;
        if (next) setMode(next);
      });
    });

    results.innerHTML = '<div class="yat-search-empty">Start typing to search.</div>';

    return () => {
      input.removeEventListener('input', scheduleSearch, true);
      input.removeEventListener('keyup', scheduleSearch, true);
      input.removeEventListener('search', scheduleSearch, true);
    };
  }, []);

  return (
    <style jsx global>{`
      #drawerLeft .yat-search-mode-label {
        margin: 10px 0 6px;
        color: var(--muted);
        font: 400 11px/1 Oswald, sans-serif;
        letter-spacing: .06em;
        text-transform: uppercase;
      }

      #drawerLeft .yat-search-mode-buttons {
        display: grid;
        grid-template-columns: 1fr 1fr 1fr;
        gap: 6px;
        margin-bottom: 10px;
      }

      #drawerLeft .yat-search-mode-btn {
        min-height: 34px;
        border: 1px solid var(--line);
        border-radius: 7px;
        background: rgba(255,255,255,.04);
        color: var(--ink);
        font: 400 12px/1.05 Oswald, sans-serif;
        text-transform: uppercase;
        cursor: pointer;
      }

      #drawerLeft .yat-search-mode-btn.active {
        background: rgba(255,255,255,.14);
        color: var(--fg);
      }

      #drawerLeft .yat-search-empty {
        color: var(--muted);
        font: 400 13px/1.4 Oswald, sans-serif;
        padding: 8px 0;
      }

      #drawerLeft .yat-search-result-row {
        display: flex;
        align-items: center;
        gap: 10px;
        min-height: 48px;
        padding: 8px 0;
        border-bottom: 1px solid var(--line);
        color: var(--ink);
        text-decoration: none;
      }

      #drawerLeft .yat-search-result-row:hover { color: var(--fg); }

      #drawerLeft .yat-search-thumb {
        width: 30px;
        height: 30px;
        object-fit: cover;
        border-radius: 3px;
        flex: 0 0 auto;
        background: rgba(255,255,255,.08);
      }

      #drawerLeft .yat-search-school-thumb { object-fit: contain; }

      #drawerLeft .yat-search-row-text {
        display: flex;
        min-width: 0;
        flex-direction: column;
        gap: 2px;
      }

      #drawerLeft .yat-search-row-text strong {
        font: 400 14px/1.05 Oswald, sans-serif;
        text-transform: uppercase;
      }

      #drawerLeft .yat-search-row-text small {
        color: var(--muted);
        font: 400 10px/1.2 Oswald, sans-serif;
        text-transform: uppercase;
      }
    `}</style>
  );
}
