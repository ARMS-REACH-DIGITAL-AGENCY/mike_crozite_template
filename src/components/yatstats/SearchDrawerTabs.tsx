'use client';

import { useEffect } from 'react';

type SearchMode = 'name' | 'school' | 'team';

const STATE_NAMES: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming', DC: 'District of Columbia',
};

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
  const microsite = String(player.micrositeUrl || player.microsite_url || '').trim().replace(/\/$/, '');

  if (microsite) {
    return `${microsite}/player/${playerId}/${slug}`;
  }

  return `/${hsid}/player/${playerId}/${slug}`;
}

function schoolUrl(program: any) {
  const microsite = String(program.microsite_url || program.micrositeUrl || '');
  if (microsite) return microsite;
  return `/${encodeURIComponent(String(program.hsid || program.schoolId || ''))}`;
}

function splitSchoolLocation(raw: unknown) {
  const parts = String(raw || '').split(',');
  return {
    city: (parts[0] || '').trim(),
    state: (parts.slice(1).join(',') || '').trim(),
  };
}

function cleanStateCode(value: unknown) {
  return String(value || '').trim().toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2);
}

function stateFullName(value: unknown) {
  const code = cleanStateCode(value);
  return STATE_NAMES[code] || String(value || 'Other').trim() || 'Other';
}

function cleanLocation(city?: unknown, state?: unknown, fallback?: unknown) {
  const c = String(city || '').trim();
  const s = String(state || '').trim();
  if (c && s) return `${c}, ${s}`;
  if (c) return c;
  if (s) return s;
  return String(fallback || '').trim();
}

function schoolCrestUrl(hsid: unknown, fallback?: unknown) {
  const custom = String(fallback || '').trim();
  if (custom) return custom;
  return `https://yatstats-assets.s3.us-west-2.amazonaws.com/school-logos/${esc(hsid)}.png`;
}

function teamLogoPlaceholder() {
  return 'https://yatstats-assets.s3.us-west-2.amazonaws.com/yatstats/team-placeholder.png';
}

function schoolLogoFallback() {
  return 'https://yatstats-assets.s3.us-west-2.amazonaws.com/yatstats/yslogo.png';
}

function renderPlayerRows(players: any[], emptyText: string) {
  if (!players.length) return `<div class="yat-search-empty">${esc(emptyText)}</div>`;

  return `
    <div class="yat-search-section-label">Players</div>
    <div class="yat-search-card-list">
      ${players.map((p) => {
        const name = String(p.displayName || `${p.firstName || ''} ${p.lastName || ''}`.trim() || p.playerId || 'Player');
        const school = String(p.schoolName || '').trim();
        const location = cleanLocation(p.city, p.state);
        const secondLine = [school, location ? `(${location})` : ''].filter(Boolean).join(' ');
        return `
          <a class="yat-search-card yat-search-player-card" href="${esc(playerUrl(p))}">
            <img src="${esc(schoolCrestUrl(p.schoolId || p.hsid, p.crestUrl))}" alt="" class="yat-search-thumb yat-search-school-thumb" onerror="this.src='${schoolLogoFallback()}';this.onerror=null" />
            <span class="yat-search-row-text">
              <strong>${esc(name)}</strong>
              ${secondLine ? `<small>${esc(secondLine)}</small>` : ''}
            </span>
          </a>
        `;
      }).join('')}
    </div>
  `;
}

function renderSchoolRows(programs: any[], emptyText: string) {
  if (!programs.length) return `<div class="yat-search-empty">${esc(emptyText)}</div>`;

  const grouped = new Map<string, any[]>();
  programs.forEach((s) => {
    const loc = splitSchoolLocation(s.hslocation || s.location);
    const stateCode = cleanStateCode(s.regionid || loc.state || s.state || 'OTHER') || 'OTHER';
    if (!grouped.has(stateCode)) grouped.set(stateCode, []);
    grouped.get(stateCode)!.push(s);
  });

  return Array.from(grouped.entries()).map(([state, rows]) => `
    <div class="yat-search-section-label yat-search-state-label">${esc(stateFullName(state))}</div>
    <div class="yat-search-card-list yat-search-school-list">
      ${rows.map((s) => {
        const hsid = String(s.hsid || s.schoolId || '');
        const name = String(s.hsname || s.schoolName || 'School');
        const loc = splitSchoolLocation(s.hslocation || s.location);
        const location = cleanLocation(loc.city, loc.state, s.hslocation || s.location);
        const stateCode = cleanStateCode(s.regionid || loc.state || s.state);
        const stateLabel = stateCode || 'State';
        const live = String(s.microsite_url || s.micrositeUrl || '').trim();
        const badge = live ? 'Live' : (s.current_aa || s.mlb || s.atnla ? 'Candidate' : 'Not Active');
        const crest = schoolCrestUrl(hsid, s.crestUrl || s.crest_url || s.logoUrl || s.logo_url || s.schoolLogoUrl || s.school_logo_url);
        return `
          <a class="yat-search-card yat-search-school-card" href="${esc(schoolUrl(s))}">
            <div class="yat-search-school-topline">
              <span class="yat-search-school-crest-link" aria-hidden="true">
                <img src="${esc(crest)}" alt="" class="yat-search-thumb yat-search-school-thumb" onerror="this.src='${schoolLogoFallback()}';this.onerror=null" />
              </span>
              <span class="yat-search-row-text">
                <strong>${esc(name)}</strong>
                ${location ? `<small>${esc(location)}</small>` : ''}
              </span>
              <span class="yat-search-school-badge ${live ? 'live' : badge === 'Candidate' ? 'candidate' : ''}">${esc(badge)}</span>
            </div>
            <div class="yat-search-school-stats">
              <span><strong>${esc(s.current_aa ?? 0)}</strong><small>Active</small></span>
              <span><strong>${esc(s.atnla ?? 0)}</strong><small>All-Time</small></span>
              <span><strong>${esc(s.drafted_ratio || (s.drafted_hs && s.drafted ? `${s.drafted_hs}/${s.drafted}` : '--'))}</strong><small>Drafted</small></span>
              <span><strong>${esc(s.mlb ?? 0)}</strong><small>MLB</small></span>
              <span><strong>${s.yatstats_national_rank ? `#${esc(s.yatstats_national_rank)}` : '--'}</strong><small>Nat'l Rank</small></span>
              <span><strong>${s.yatstats_state_rank ? `#${esc(s.yatstats_state_rank)}` : '--'}</strong><small>${esc(stateLabel)}</small></span>
            </div>
          </a>
        `;
      }).join('')}
    </div>
  `).join('');
}

function renderTeamRows(players: any[], emptyText: string) {
  if (!players.length) return `<div class="yat-search-empty">${esc(emptyText)}</div>`;

  const grouped = new Map<string, any[]>();
  players.forEach((p) => {
    const team = String(p.currentTeamName || p.current_team_name || 'Current Team Unknown').trim() || 'Current Team Unknown';
    const level = String(p.levelLabel || p.level_label || '').trim();
    const key = `${team}${level ? ` - ${level}` : ''}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(p);
  });

  return Array.from(grouped.entries()).map(([teamLevel, rows]) => `
    <div class="yat-search-team-group">
      <div class="yat-search-team-heading">
        <img src="${esc(teamLogoPlaceholder())}" alt="" class="yat-search-thumb yat-search-team-thumb" onerror="this.src='${schoolLogoFallback()}';this.onerror=null" />
        <span>${esc(teamLevel)}</span>
      </div>
      <div class="yat-search-card-list">
        ${rows.map((p) => {
          const name = String(p.displayName || `${p.firstName || ''} ${p.lastName || ''}`.trim() || p.playerId || 'Player');
          const school = String(p.schoolName || '').trim();
          const location = cleanLocation(p.city, p.state);
          const secondLine = [school, location ? `(${location})` : ''].filter(Boolean).join(' ');
          return `
            <a class="yat-search-card yat-search-team-player-card" href="${esc(playerUrl(p))}">
              <img src="${esc(schoolCrestUrl(p.schoolId || p.hsid, p.crestUrl))}" alt="" class="yat-search-thumb yat-search-school-thumb" onerror="this.src='${schoolLogoFallback()}';this.onerror=null" />
              <span class="yat-search-row-text">
                <strong>${esc(name)}</strong>
                ${secondLine ? `<small>${esc(secondLine)}</small>` : ''}
              </span>
            </a>
          `;
        }).join('')}
      </div>
    </div>
  `).join('');
}

async function fetchJson(url: string) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) return {};
  return res.json();
}

export default function SearchDrawerTabs() {
  useEffect(() => {
    const drawer = document.querySelector('#drawerLeft .yat-left-search-content') as HTMLElement | null;
    const searchInput = document.getElementById('gsInput') as HTMLInputElement | null;
    const searchResults = document.getElementById('gsResults') as HTMLElement | null;
    const title = document.getElementById('gsTitle');
    const sub = drawer?.querySelector('.yat-search-drawer-sub') as HTMLElement | null;
    if (!drawer || !searchInput || !searchResults) return;

    const input = searchInput;
    const results = searchResults;

    if (title) title.textContent = 'Search the YAT?STATS Database';
    if (sub) sub.textContent = "Browse by the player's name, the high school he attended, or by his current college or professional team";
    input.placeholder = 'Search by name, school, or team...';

    const oldModeLabel = drawer.querySelector('.yat-search-mode-label');
    if (oldModeLabel) oldModeLabel.remove();

    if (!document.getElementById('yatSearchModeTabs')) {
      const tabs = document.createElement('div');
      tabs.id = 'yatSearchModeTabs';
      tabs.className = 'yat-search-mode-tabs';
      tabs.innerHTML = `
        <div class="yat-search-mode-buttons" role="tablist" aria-label="Search mode">
          <button type="button" class="yat-search-mode-btn active" data-search-mode="name">Player Name</button>
          <button type="button" class="yat-search-mode-btn" data-search-mode="school">High School</button>
          <button type="button" class="yat-search-mode-btn" data-search-mode="team">Current Team</button>
        </div>
      `;
      input.closest('.yat-gs-input-wrap')?.insertAdjacentElement('afterend', tabs);
    }

    let mode: SearchMode = 'name';
    let timer: ReturnType<typeof setTimeout> | null = null;
    let requestId = 0;

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

        const data = await fetchJson(`/api/teams/search?q=${encodeURIComponent(q)}&limit=75`);
        if (thisRequest !== requestId) return;
        results.innerHTML = renderTeamRows(Array.isArray(data.teams) ? data.teams : [], 'No current team matches.');
      } catch {
        if (thisRequest === requestId) results.innerHTML = '<div class="yat-search-empty">Search failed. Try again.</div>';
      }
    }

    const setMode = (next: SearchMode) => {
      mode = next;
      drawer.querySelectorAll<HTMLElement>('[data-search-mode]').forEach((button) => {
        button.classList.toggle('active', button.dataset.searchMode === next);
      });
      runSearch();
    };

    function scheduleSearch(event?: Event) {
      event?.preventDefault?.();
      event?.stopPropagation?.();
      event?.stopImmediatePropagation?.();
      if (timer) clearTimeout(timer);
      timer = setTimeout(runSearch, 180);
    }

    drawer.addEventListener('input', scheduleSearch, true);
    drawer.addEventListener('keyup', scheduleSearch, true);
    drawer.addEventListener('search', scheduleSearch, true);

    drawer.querySelectorAll<HTMLButtonElement>('[data-search-mode]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        const next = button.dataset.searchMode as SearchMode;
        if (next) setMode(next);
      }, true);
    });

    results.innerHTML = '<div class="yat-search-empty">Start typing to search.</div>';

    return () => {
      drawer.removeEventListener('input', scheduleSearch, true);
      drawer.removeEventListener('keyup', scheduleSearch, true);
      drawer.removeEventListener('search', scheduleSearch, true);
    };
  }, []);

  return (
    <style jsx global>{`
      #drawerLeft .yat-search-drawer-title {
        margin-bottom: 4px !important;
        font-size: 18px !important;
      }

      #drawerLeft .yat-search-drawer-sub {
        max-width: 330px;
        margin-bottom: 12px !important;
        font-size: 10px !important;
        line-height: 1.35 !important;
      }

      #drawerLeft .yat-search-mode-label { display: none !important; }

      #drawerLeft .yat-search-mode-buttons {
        display: grid;
        grid-template-columns: 1fr 1fr 1fr;
        gap: 6px;
        margin: 10px 0 12px;
      }

      #drawerLeft .yat-search-mode-btn {
        min-height: 34px;
        border: 1px solid var(--line);
        border-radius: 7px;
        background: rgba(255,255,255,.04);
        color: var(--ink);
        font: 400 11px/1.05 Oswald, sans-serif;
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

      #drawerLeft .yat-search-section-label {
        margin: 12px 0 8px;
        color: var(--muted);
        font: 800 10px/1 Oswald, sans-serif;
        letter-spacing: .18em;
        text-transform: uppercase;
      }

      #drawerLeft .yat-search-state-label {
        color: var(--ink);
        font-size: 11px;
        letter-spacing: .16em;
      }

      #drawerLeft .yat-search-card-list {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }

      #drawerLeft .yat-search-card {
        display: flex;
        align-items: center;
        gap: 10px;
        min-height: 56px;
        padding: 8px 10px;
        border: 1px solid var(--line);
        border-radius: 10px;
        background: rgba(255,255,255,.045);
        color: var(--ink);
        text-decoration: none;
      }

      #drawerLeft .yat-search-card:hover {
        color: var(--fg);
        background: rgba(255,255,255,.08);
      }

      #drawerLeft .yat-search-thumb {
        width: 36px;
        height: 36px;
        object-fit: cover;
        border-radius: 5px;
        flex: 0 0 auto;
        background: rgba(255,255,255,.08);
      }

      #drawerLeft .yat-search-school-thumb,
      #drawerLeft .yat-search-team-thumb { object-fit: contain; }

      #drawerLeft .yat-search-row-text {
        display: flex;
        min-width: 0;
        flex-direction: column;
        gap: 3px;
      }

      #drawerLeft .yat-search-row-text strong {
        font: 700 14px/1.05 Oswald, sans-serif;
        text-transform: uppercase;
      }

      #drawerLeft .yat-search-row-text small {
        color: var(--muted);
        font: 400 10px/1.2 Oswald, sans-serif;
        text-transform: uppercase;
      }

      #drawerLeft .yat-search-school-card {
        align-items: stretch;
        flex-direction: column;
        gap: 8px;
        padding: 10px;
      }

      #drawerLeft .yat-search-school-topline {
        display: grid;
        grid-template-columns: 54px minmax(0, 1fr) auto;
        align-items: center;
        gap: 9px;
        width: 100%;
      }

      #drawerLeft .yat-search-school-crest-link {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 50px;
        height: 50px;
      }

      #drawerLeft .yat-search-school-card .yat-search-school-thumb {
        width: 48px;
        height: 48px;
        border-radius: 0;
        background: transparent;
      }

      #drawerLeft .yat-search-school-badge {
        border: 1px solid rgba(255,255,255,.18);
        border-radius: 5px;
        padding: 4px 6px;
        color: var(--muted);
        font: 700 8px/1 Oswald, sans-serif;
        letter-spacing: .1em;
        text-transform: uppercase;
        white-space: nowrap;
      }

      #drawerLeft .yat-search-school-badge.live {
        border-color: rgba(0,255,140,.55);
        color: #00ff8c;
      }

      #drawerLeft .yat-search-school-badge.candidate {
        border-color: rgba(255,209,102,.7);
        color: #ffd166;
      }

      #drawerLeft .yat-search-school-stats {
        display: grid;
        grid-template-columns: repeat(6, minmax(0, 1fr));
        gap: 1px;
        border-top: 1px solid var(--line);
        padding-top: 7px;
      }

      #drawerLeft .yat-search-school-stats span {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        min-width: 0;
      }

      #drawerLeft .yat-search-school-stats strong {
        color: var(--fg);
        font: 900 14px/1 Oswald, sans-serif;
        white-space: nowrap;
      }

      #drawerLeft .yat-search-school-stats small {
        color: var(--muted);
        font: 400 7px/1.1 Oswald, sans-serif;
        text-transform: uppercase;
        white-space: nowrap;
      }

      #drawerLeft .yat-search-team-group { margin: 12px 0 4px; }

      #drawerLeft .yat-search-team-heading {
        display: flex;
        align-items: center;
        gap: 9px;
        margin-bottom: 7px;
        color: var(--fg);
        font: 800 12px/1.1 Oswald, sans-serif;
        letter-spacing: .05em;
        text-transform: uppercase;
      }

      #drawerLeft .yat-search-team-player-card {
        min-height: 52px;
        border-radius: 0;
        border-width: 0 0 1px;
        background: transparent;
        padding-left: 0;
        padding-right: 0;
      }
    `}</style>
  );
}
