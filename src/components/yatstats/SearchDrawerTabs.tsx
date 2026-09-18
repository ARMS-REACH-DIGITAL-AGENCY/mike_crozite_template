'use client';

import { useEffect } from 'react';

type SearchMode = 'name' | 'school' | 'team';

const S3_BASE = 'https://yatstats-assets.s3.us-west-2.amazonaws.com';
const YAT_CIRCLE_CREST_FALLBACK = '/img/yatstats-logo-circle.png';
const HEADSHOT_SILHOUETTE_FALLBACK = '/img/headshot-silhouette.png';

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

function slugify(value: unknown) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function playerIdOf(player: any) {
  return String(player.playerId || player.playerid || player.id || '').trim();
}

function schoolIdOf(item: any) {
  return String(item.schoolId || item.hsid || '').trim();
}

function teamIdOf(item: any) {
  return String(item.currentTeamId || item.current_team_id || item.currentTeamid || item.current_teamid || item.teamid || item.teamId || item.team_id || '').trim();
}

function playerUrl(player: any) {
  const hsid = encodeURIComponent(schoolIdOf(player));
  const playerId = encodeURIComponent(playerIdOf(player));
  const fallbackSlug = slugify(`${player.firstName || player.firstname || ''}-${player.lastName || player.lastname || ''}`);
  const slug = encodeURIComponent(String(player.slug || fallbackSlug));
  const microsite = String(player.micrositeUrl || player.microsite_url || '').trim().replace(/\/$/, '');

  if (microsite) return `${microsite}/player/${playerId}/${slug}`;
  return `/${hsid}/player/${playerId}/${slug}`;
}

function playerFlipCardUrl(player: any) {
  const playerId = encodeURIComponent(playerIdOf(player));
  const microsite = String(player.micrositeUrl || player.microsite_url || '').trim().replace(/\/$/, '');
  const base = microsite || `/${encodeURIComponent(schoolIdOf(player))}`;
  return `${base}?view=active&player=${playerId}#player-${playerId}`;
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

function cleanRank(value: unknown) {
  return String(value || '').trim().replace(/^#/, '').replace(/\s*\([A-Z]{2}\)\s*$/i, '');
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
  return `${S3_BASE}/schools/${esc(hsid)}.png`;
}

function playerHeadshotUrl(player: any) {
  const custom = String(player.headshotUrl || player.headshot_url || player.playerImageUrl || player.player_image_url || player.imageUrl || player.image_url || player.photoUrl || player.photo_url || '').trim();
  if (custom) return custom;
  return `${S3_BASE}/players/now/${esc(playerIdOf(player))}.jpg`;
}

function teamLogoUrl(item: any) {
  const custom = String(item.teamLogoUrl || item.team_logo_url || item.currentTeamLogoUrl || item.current_team_logo_url || '').trim();
  if (custom) return custom;
  const id = teamIdOf(item);
  if (/^\d+$/.test(id)) return `${S3_BASE}/teams/${esc(id)}.png`;
  return YAT_CIRCLE_CREST_FALLBACK;
}

function schoolLogoFallback() {
  return YAT_CIRCLE_CREST_FALLBACK;
}

function playerHeadshotFallback() {
  return HEADSHOT_SILHOUETTE_FALLBACK;
}

function renderPlayerRows(players: any[], emptyText: string) {
  if (!players.length) return `<div class="yat-search-empty">${esc(emptyText)}</div>`;

  return `
    <div class="yat-search-section-label">Players</div>
    <div class="yat-search-card-list yat-search-player-list">
      ${players.map((p) => {
        const name = String(p.displayName || `${p.firstName || p.firstname || ''} ${p.lastName || p.lastname || ''}`.trim() || p.playerId || 'Player');
        const school = String(p.schoolName || p.hsname || '').trim();
        const location = cleanLocation(p.city, p.state);
        const secondLine = [school, location ? `(${location})` : ''].filter(Boolean).join(' ');
        const crest = schoolCrestUrl(schoolIdOf(p), p.crestUrl || p.crest_url || p.logoUrl || p.logo_url || p.schoolLogoUrl || p.school_logo_url);
        return `
          <div class="yat-search-card yat-search-player-card yat-search-player-result">
            <a class="yat-search-player-headshot-link" href="${esc(playerUrl(p))}" title="Open ${esc(name)} profile">
              <img src="${esc(playerHeadshotUrl(p))}" alt="" class="yat-search-thumb yat-search-player-headshot" onerror="this.src='${playerHeadshotFallback()}';this.onerror=null" />
            </a>
            <a class="yat-search-player-text-link" href="${esc(playerUrl(p))}" title="Open ${esc(name)} profile">
              <strong>${esc(name)}</strong>
              ${secondLine ? `<small>${esc(secondLine)}</small>` : ''}
            </a>
            <a class="yat-search-player-flip-link" href="${esc(playerFlipCardUrl(p))}" title="Open ${esc(school || name)} flip card">
              <img src="${esc(crest)}" alt="" class="yat-search-thumb yat-search-player-hs-logo" onerror="this.src='${schoolLogoFallback()}';this.onerror=null" />
            </a>
            ${favoriteButtonHtml(p, name)}
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function favoriteButtonHtml(player: any, name: string) {
  const playerId = esc(playerIdOf(player));
  const schoolId = esc(schoolIdOf(player));
  return `
    <button
      type="button"
      class="yat-search-fav-btn"
      data-fav-player-id="${playerId}"
      data-fav-player-name="${esc(name)}"
      data-fav-school-id="${schoolId}"
      aria-pressed="false"
      aria-label="Add ${esc(name)} to favorites"
      title="Favorite ${esc(name)}"
    >
      <i class="ri-star-line" aria-hidden="true"></i>
    </button>
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
              <span><strong>${s.yatstats_national_rank ? `#${esc(cleanRank(s.yatstats_national_rank))}` : '--'}</strong><small>Nat'l Rank</small></span>
              <span><strong>${s.yatstats_state_rank ? `#${esc(cleanRank(s.yatstats_state_rank))}` : '--'}</strong><small>${esc(stateLabel)}</small></span>
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

  return Array.from(grouped.entries()).map(([teamLevel, rows]) => {
    const first = rows[0] || {};
    return `
      <div class="yat-search-team-group">
        <div class="yat-search-team-heading">
          <img src="${esc(teamLogoUrl(first))}" alt="" class="yat-search-thumb yat-search-team-thumb" onerror="this.src='${schoolLogoFallback()}';this.onerror=null" />
          <span>${esc(teamLevel)}</span>
        </div>
        <div class="yat-search-card-list yat-search-team-player-list">
          ${rows.map((p) => {
            const name = String(p.displayName || `${p.firstName || p.firstname || ''} ${p.lastName || p.lastname || ''}`.trim() || p.playerId || 'Player');
            const school = String(p.schoolName || p.hsname || '').trim();
            const location = cleanLocation(p.city, p.state);
            const secondLine = [school, location ? `(${location})` : ''].filter(Boolean).join(' ');
            const crest = schoolCrestUrl(schoolIdOf(p), p.crestUrl || p.crest_url || p.logoUrl || p.logo_url || p.schoolLogoUrl || p.school_logo_url);
            return `
              <div class="yat-search-card yat-search-team-player-card yat-search-player-result">
                <a class="yat-search-player-headshot-link" href="${esc(playerUrl(p))}" title="Open ${esc(name)} profile">
                  <img src="${esc(playerHeadshotUrl(p))}" alt="" class="yat-search-thumb yat-search-player-headshot" onerror="this.src='${playerHeadshotFallback()}';this.onerror=null" />
                </a>
                <a class="yat-search-player-text-link" href="${esc(playerUrl(p))}" title="Open ${esc(name)} profile">
                  <strong>${esc(name)}</strong>
                  ${secondLine ? `<small>${esc(secondLine)}</small>` : ''}
                </a>
                <a class="yat-search-player-flip-link" href="${esc(playerFlipCardUrl(p))}" title="Open ${esc(school || name)} flip card">
                  <img src="${esc(crest)}" alt="" class="yat-search-thumb yat-search-player-hs-logo" onerror="this.src='${schoolLogoFallback()}';this.onerror=null" />
                </a>
                ${favoriteButtonHtml(p, name)}
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }).join('');
}

async function fetchJson(url: string) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) return {};
  return res.json();
}

// Favorite toggle in the search results list mirrors FavoriteButton.tsx exactly -
// same auth source (localStorage 'yat-user'/'yat-plan'), same /api/favorites
// contract, and the same pending_fav_* handoff AccountDrawer.tsx already resumes
// after login - so favoriting from a search result while logged out completes
// automatically post-login, identical to favoriting from a profile page.
interface YatUser {
  uid: string;
  contactId?: string | null;
  homeHsid?: string | null;
}

function readYatUser(): YatUser | null {
  try {
    const raw = localStorage.getItem('yat-user');
    return raw ? (JSON.parse(raw) as YatUser) : null;
  } catch {
    return null;
  }
}

function readIsSuperfan(): boolean {
  try {
    return localStorage.getItem('yat-plan') === 'superfan';
  } catch {
    return false;
  }
}

function openAccountDrawer() {
  document.body.classList.add('drawer-account-open', 'drawer-open');
  document.body.classList.remove('drawer-left-open', 'drawer-sort-open', 'drawer-right-open', 'drawer-favorites-open');
}

let searchFavToastEl: HTMLDivElement | null = null;

function showSearchFavToast(message: string, tone: 'success' | 'info' | 'warn' = 'success') {
  if (!searchFavToastEl) {
    searchFavToastEl = document.createElement('div');
    searchFavToastEl.setAttribute('role', 'status');
    searchFavToastEl.setAttribute('aria-live', 'polite');
    searchFavToastEl.className = 'yat-search-fav-toast';
    document.body.appendChild(searchFavToastEl);
  }
  const colors: Record<typeof tone, string> = {
    success: '#16a34a',
    info: 'rgba(255,255,255,.7)',
    warn: '#b8860b',
  };
  searchFavToastEl.style.borderColor = colors[tone];
  searchFavToastEl.style.color = colors[tone];
  searchFavToastEl.textContent = message;
  searchFavToastEl.classList.add('visible');
  window.clearTimeout(Number(searchFavToastEl.dataset.timer) || undefined);
  const timer = window.setTimeout(() => searchFavToastEl?.classList.remove('visible'), 3500);
  searchFavToastEl.dataset.timer = String(timer);
}

function setFavButtonState(button: HTMLElement, favorited: boolean) {
  const name = button.dataset.favPlayerName || 'Player';
  button.setAttribute('aria-pressed', String(favorited));
  button.setAttribute('aria-label', favorited ? `Remove ${name} from favorites` : `Add ${name} to favorites`);
  button.classList.toggle('is-favorited', favorited);
  const icon = button.querySelector('i');
  if (icon) icon.className = favorited ? 'ri-star-fill' : 'ri-star-line';
}

async function hydrateFavoriteButtons(container: HTMLElement) {
  const buttons = Array.from(container.querySelectorAll<HTMLElement>('.yat-search-fav-btn'));
  if (!buttons.length) return;

  const user = readYatUser();
  if (!user?.uid) return;

  try {
    const data = await fetchJson(`/api/favorites?uid=${encodeURIComponent(user.uid)}&scope=button`);
    const ids: string[] = Array.isArray(data?.playerIds) ? data.playerIds.map(String) : [];
    buttons.forEach((button) => {
      if (ids.includes(String(button.dataset.favPlayerId))) setFavButtonState(button, true);
    });
  } catch {
    // Leave buttons in their default (unfavorited) state on failure.
  }
}

async function handleFavoriteButtonClick(button: HTMLElement) {
  const playerId = button.dataset.favPlayerId || '';
  const playerName = button.dataset.favPlayerName || playerId;
  const schoolId = button.dataset.favSchoolId || '';
  if (!playerId) return;

  const user = readYatUser();
  if (!user?.uid) {
    try {
      sessionStorage.setItem('pending_fav_pid', playerId);
      sessionStorage.setItem('pending_fav_name', playerName);
      sessionStorage.setItem('pending_fav_hsid', schoolId);
    } catch {}
    openAccountDrawer();
    return;
  }

  const isSuperfan = readIsSuperfan();
  const isSameSchool = user.homeHsid === schoolId;

  if (!isSuperfan && !isSameSchool) {
    if (!user.homeHsid) {
      showSearchFavToast('Account setup incomplete. Please sign out and sign back in to finish setting up your account.', 'warn');
    } else {
      try {
        sessionStorage.setItem('pending_superfan', '1');
      } catch {}
      showSearchFavToast('Global favoriting requires a Superfan subscription. Upgrade in your account.', 'warn');
    }
    openAccountDrawer();
    return;
  }

  const isFavorited = button.classList.contains('is-favorited');
  button.setAttribute('aria-disabled', 'true');

  try {
    if (isFavorited) {
      const res = await fetch('/api/favorites', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firebaseUid: user.uid, playerId }),
      });
      const data = await res.json();
      if (data?.success) {
        setFavButtonState(button, false);
        showSearchFavToast(`${playerName} removed from favorites`, 'info');
        window.dispatchEvent(new CustomEvent('yat-favorites-changed'));
      } else {
        showSearchFavToast('Could not remove favorite. Please try again.', 'warn');
      }
    } else {
      const res = await fetch('/api/favorites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firebaseUid: user.uid,
          contactId: user.contactId,
          playerId,
          playerName,
          schoolId,
          type: isSuperfan ? 'superfan' : 'fan',
        }),
      });
      const data = await res.json();
      if (data?.success) {
        setFavButtonState(button, true);
        showSearchFavToast(`${playerName} added to your favorites`);
        window.dispatchEvent(new CustomEvent('yat-favorites-changed'));
      } else {
        showSearchFavToast(data?.error || 'Could not save favorite. Please try again.', 'warn');
      }
    }
  } catch {
    showSearchFavToast('Network error. Please try again.', 'warn');
  } finally {
    button.removeAttribute('aria-disabled');
  }
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
          hydrateFavoriteButtons(results);
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
        hydrateFavoriteButtons(results);
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

    const onResultsClick = (event: Event) => {
      const button = (event.target as HTMLElement)?.closest('.yat-search-fav-btn') as HTMLElement | null;
      if (!button || button.hasAttribute('aria-disabled')) return;
      event.preventDefault();
      event.stopPropagation();
      handleFavoriteButtonClick(button);
    };
    results.addEventListener('click', onResultsClick);

    // AccountDrawer resumes a pending_fav_* favorite after login and fires this
    // same event FavoriteButton.tsx listens for - pick it up here too so a
    // favorite started from a search result reflects as saved once login
    // completes, even though the row was rendered before the user signed in.
    const onAuthSuccess = (event: Event) => {
      const detail = (event as CustomEvent).detail || {};
      if (detail.favoriteSaved !== true || !detail.playerId) return;
      results
        .querySelectorAll<HTMLElement>(`.yat-search-fav-btn[data-fav-player-id="${detail.playerId}"]`)
        .forEach((button) => setFavButtonState(button, true));
    };
    window.addEventListener('yat-auth-success', onAuthSuccess);

    return () => {
      drawer.removeEventListener('input', scheduleSearch, true);
      drawer.removeEventListener('keyup', scheduleSearch, true);
      drawer.removeEventListener('search', scheduleSearch, true);
      results.removeEventListener('click', onResultsClick);
      window.removeEventListener('yat-auth-success', onAuthSuccess);
    };
  }, []);

  return (
    <style jsx global>{`
      #drawerLeft .yat-search-drawer-title { margin-bottom: 4px !important; font-size: 18px !important; }
      #drawerLeft .yat-search-drawer-sub { max-width: 330px; margin-bottom: 12px !important; font-size: 10px !important; line-height: 1.35 !important; }
      #drawerLeft .yat-search-mode-label { display: none !important; }
      #drawerLeft .yat-search-mode-buttons { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6px; margin: 10px 0 12px; }
      #drawerLeft .yat-search-mode-btn { min-height: 34px; border: 1px solid var(--line); border-radius: 7px; background: rgba(255,255,255,.04); color: var(--ink); font: 400 11px/1.05 Oswald, sans-serif; text-transform: uppercase; cursor: pointer; }
      #drawerLeft .yat-search-mode-btn.active { background: rgba(255,255,255,.14); color: var(--fg); }
      #drawerLeft .yat-search-empty { color: var(--muted); font: 400 13px/1.4 Oswald, sans-serif; padding: 8px 0; }
      #drawerLeft .yat-search-section-label { margin: 12px 0 8px; color: var(--muted); font: 800 10px/1 Oswald, sans-serif; letter-spacing: .18em; text-transform: uppercase; }
      #drawerLeft .yat-search-state-label { color: var(--ink); font-size: 11px; letter-spacing: .16em; }
      #drawerLeft .yat-search-card-list { display: flex; flex-direction: column; gap: 6px; }
      #drawerLeft .yat-search-card { display: flex; align-items: center; gap: 10px; min-height: 56px; padding: 8px 10px; border: 1px solid var(--line); border-radius: 10px; background: rgba(255,255,255,.045); color: var(--ink); text-decoration: none; }
      #drawerLeft .yat-search-card:hover { color: var(--fg); background: rgba(255,255,255,.08); }
      #drawerLeft .yat-search-thumb { width: 36px; height: 36px; object-fit: cover; border-radius: 5px; flex: 0 0 auto; background: rgba(255,255,255,.08); }
      #drawerLeft .yat-search-school-thumb, #drawerLeft .yat-search-team-thumb { object-fit: contain; }
      #drawerLeft .yat-search-row-text { display: flex; min-width: 0; flex-direction: column; gap: 3px; }
      #drawerLeft .yat-search-row-text strong { font: 700 14px/1.05 Oswald, sans-serif; text-transform: uppercase; }
      #drawerLeft .yat-search-row-text small { color: var(--muted); font: 400 10px/1.2 Oswald, sans-serif; text-transform: uppercase; }
      #drawerLeft .yat-search-school-card { align-items: stretch; flex-direction: column; gap: 8px; padding: 10px; }
      #drawerLeft .yat-search-school-topline { display: grid; grid-template-columns: 54px minmax(0, 1fr) auto; align-items: center; gap: 9px; width: 100%; }
      #drawerLeft .yat-search-school-crest-link { display: flex; align-items: center; justify-content: center; width: 50px; height: 50px; }
      #drawerLeft .yat-search-school-card .yat-search-school-thumb { width: 48px; height: 48px; border-radius: 0; background: transparent; }
      #drawerLeft .yat-search-school-badge { border: 1px solid rgba(255,255,255,.18); border-radius: 5px; padding: 4px 6px; color: var(--muted); font: 700 8px/1 Oswald, sans-serif; letter-spacing: .1em; text-transform: uppercase; white-space: nowrap; }
      #drawerLeft .yat-search-school-badge.live { border-color: rgba(0,255,140,.55); color: #00ff8c; }
      #drawerLeft .yat-search-school-badge.candidate { border-color: rgba(255,209,102,.7); color: #ffd166; }
      #drawerLeft .yat-search-school-stats { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 1px; border-top: 1px solid var(--line); padding-top: 7px; }
      #drawerLeft .yat-search-school-stats span { display: flex; flex-direction: column; align-items: center; justify-content: center; min-width: 0; }
      #drawerLeft .yat-search-school-stats strong { color: var(--fg); font: 900 14px/1 Oswald, sans-serif; white-space: nowrap; }
      #drawerLeft .yat-search-school-stats small { color: var(--muted); font: 400 7px/1.1 Oswald, sans-serif; text-transform: uppercase; white-space: nowrap; }
      #drawerLeft .yat-search-team-group { margin: 12px 0 4px; }
      #drawerLeft .yat-search-team-heading { display: grid; grid-template-columns: 52px minmax(0,1fr); align-items: center; gap: 10px; margin-bottom: 7px; color: var(--fg); font: 800 12px/1.1 Oswald, sans-serif; letter-spacing: .05em; text-transform: uppercase; }
      #drawerLeft .yat-search-team-heading .yat-search-team-thumb { width: 46px; height: 46px; object-fit: contain; border-radius: 0; background: transparent; }
      #drawerLeft .yat-search-team-player-card { min-height: 52px; border-radius: 0; border-width: 0 0 1px; background: transparent; }
      #drawerLeft .yat-search-player-result { display: grid !important; grid-template-columns: 52px minmax(0, 1fr) 46px 34px; align-items: center; column-gap: 10px; padding: 8px 10px; }
      #drawerLeft .yat-search-player-result a { color: inherit; text-decoration: none; }
      #drawerLeft .yat-search-player-headshot-link { display: flex; align-items: center; justify-content: center; }
      #drawerLeft .yat-search-player-headshot { width: 46px; height: 46px; object-fit: cover; border-radius: 4px; background: rgba(0,0,0,.08); }
      #drawerLeft .yat-search-player-text-link { display: flex; min-width: 0; flex-direction: column; gap: 3px; }
      #drawerLeft .yat-search-player-text-link strong { font: 900 14px/1.05 Oswald, sans-serif; text-transform: uppercase; }
      #drawerLeft .yat-search-player-text-link small { color: var(--muted); font: 400 10px/1.15 Oswald, sans-serif; text-transform: uppercase; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      #drawerLeft .yat-search-player-flip-link { display: flex; align-items: center; justify-content: flex-end; }
      #drawerLeft .yat-search-player-hs-logo { width: 40px; height: 40px; object-fit: contain; border-radius: 0; background: transparent; }
      #drawerLeft .yat-search-fav-btn { display: flex; align-items: center; justify-content: center; width: 34px; height: 34px; padding: 0; border: none; background: transparent; color: var(--muted); font-size: 19px; line-height: 1; cursor: pointer; flex: 0 0 auto; }
      #drawerLeft .yat-search-fav-btn:hover { color: var(--accent, #c8a96e); }
      #drawerLeft .yat-search-fav-btn.is-favorited { color: var(--accent, #c8a96e); }
      #drawerLeft .yat-search-fav-btn[aria-disabled] { opacity: .5; cursor: wait; }
      .yat-search-fav-toast { position: fixed; bottom: 80px; left: 50%; transform: translateX(-50%) translateY(12px); background: var(--surface, #1a1a1a); border: 1px solid rgba(255,255,255,.2); padding: 10px 18px; border-radius: 8px; font: 700 12px/1.4 Oswald, sans-serif; letter-spacing: .06em; z-index: 9999; pointer-events: none; white-space: nowrap; box-shadow: 0 4px 16px rgba(0,0,0,.4); opacity: 0; transition: opacity .2s ease, transform .2s ease; }
      .yat-search-fav-toast.visible { opacity: 1; transform: translateX(-50%) translateY(0); }
    `}</style>
  );
}
