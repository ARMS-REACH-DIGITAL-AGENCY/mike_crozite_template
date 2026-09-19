'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import FlipCardIcon from '@/components/yatstats/icons/FlipCardIcon';

type YatUser = {
  uid?: string;
  email?: string | null;
  homeHsid?: string | null;
  role?: string | null;
};

type FavoritePlayer = {
  player_id: string;
  school_id?: string | null;
  display_name?: string | null;
  last_name?: string | null;
  current_team_name?: string | null;
  current_org_or_conference_name?: string | null;
  level_label?: string | null;
  status_label?: string | null;
  class_of?: string | null;
  roster_years?: string[] | null;
};

const FAVORITES_S3_BASE = 'https://yatstats-assets.s3.us-west-2.amazonaws.com';

function schoolCrestUrl(hsid: unknown) {
  return `${FAVORITES_S3_BASE}/schools/${encodeURIComponent(String(hsid || ''))}.png`;
}

function playerFlipCardUrl(playerId: string, schoolId: string) {
  return `/${encodeURIComponent(schoolId)}?view=active&player=${encodeURIComponent(playerId)}#player-${encodeURIComponent(playerId)}`;
}

function readYatUser(): YatUser | null {
  try {
    const raw = localStorage.getItem('yat-user');
    return raw ? (JSON.parse(raw) as YatUser) : null;
  } catch {
    return null;
  }
}

function writeYatUserFromSession(session: Record<string, unknown>) {
  const uid = String(session.uid || '');
  if (!uid) return null;

  const user: YatUser = {
    uid,
    email: typeof session.email === 'string' ? session.email : null,
    homeHsid: typeof session.homeHsid === 'string' ? session.homeHsid : null,
    role: typeof session.role === 'string' ? session.role : 'fan',
  };

  try {
    localStorage.setItem(
      'yat-user',
      JSON.stringify({
        ...user,
        contactId: session.contactId ?? null,
        firstName: session.firstName ?? null,
        homeSchoolName: session.homeSchoolName ?? null,
        homeSchoolLocation: session.homeSchoolLocation ?? null,
        homeMicrositeUrl: session.homeMicrositeUrl ?? null,
      })
    );
    localStorage.setItem('yat-plan', typeof session.plan === 'string' ? session.plan : 'fan');
  } catch {}

  return user;
}

async function getCurrentUser(): Promise<YatUser | null> {
  const localUser = readYatUser();
  if (localUser?.uid) return localUser;

  try {
    const response = await fetch('/api/auth/session', {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
    });
    const data = await response.json();
    if (data?.authenticated && data?.session?.uid) {
      return writeYatUserFromSession(data.session as Record<string, unknown>);
    }
  } catch {}

  return null;
}

function syncDrawerOpenClass() {
  document.body.classList.toggle(
    'drawer-open',
    document.body.classList.contains('drawer-left-open') ||
      document.body.classList.contains('drawer-sort-open') ||
      document.body.classList.contains('drawer-right-open') ||
      document.body.classList.contains('drawer-account-open') ||
      document.body.classList.contains('drawer-favorites-open'),
  );
}

function openFavoritesDrawer() {
  document.body.classList.add('drawer-favorites-open', 'drawer-open');
  document.body.classList.remove('drawer-left-open', 'drawer-sort-open', 'drawer-right-open', 'drawer-account-open');
}

function closeFavoritesDrawer() {
  document.body.classList.remove('drawer-favorites-open');
  syncDrawerOpenClass();
}

function openAccountDrawer(tab: 'signin' | 'register' = 'register') {
  document.body.classList.add('drawer-account-open', 'drawer-open');
  document.body.classList.remove('drawer-left-open', 'drawer-sort-open', 'drawer-right-open', 'drawer-favorites-open');
  window.dispatchEvent(new CustomEvent('yat:acct-tab', { detail: tab }));
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function playerSlug(name: string): string {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const FAVORITES_SORT_KEY = 'yat-favorites-sort';

function readSortByLastNamePreference(): boolean {
  try {
    return localStorage.getItem(FAVORITES_SORT_KEY) === 'last';
  } catch {
    return false;
  }
}

function writeSortByLastNamePreference(byLastName: boolean) {
  try {
    localStorage.setItem(FAVORITES_SORT_KEY, byLastName ? 'last' : 'first');
  } catch {}
}

const NAME_SUFFIXES = new Set(['JR', 'SR', 'II', 'III', 'IV', 'V']);

function stripTrailingNameSuffix(parts: string[]): string[] {
  const trimmed = [...parts];
  while (trimmed.length > 1) {
    const last = trimmed[trimmed.length - 1].toUpperCase().replace(/\.$/, '');
    if (!NAME_SUFFIXES.has(last)) break;
    trimmed.pop();
  }
  return trimmed;
}

function favoriteSortKey(player: FavoritePlayer, byLastName: boolean): string {
  const name = String(player.display_name || player.player_id).trim();
  if (!byLastName) return name;

  // Prefer the stored last_name column (api/favorites now returns it). The
  // word-splitting fallback below only runs for the rare player missing a
  // stored last name, and even then skips a trailing generational suffix
  // (Jr., Sr., II...) so "Ken Griffey Jr." sorts under Griffey, not Jr.
  const stored = String(player.last_name || '').trim();
  if (stored) return stored;

  const parts = stripTrailingNameSuffix(name.split(/\s+/).filter(Boolean));
  return parts.length > 1 ? parts[parts.length - 1] : name;
}

function playerHeadshotUrl(playerId: string) {
  return `https://yatstats-assets.s3.us-west-2.amazonaws.com/players/now/${encodeURIComponent(playerId)}.jpg`;
}

function cardContainerFromCard(card: HTMLElement): HTMLElement {
  return (card.closest('[data-player-card-wrap="true"]') as HTMLElement | null) || card;
}

function currentGrid(): HTMLElement | null {
  const visibleSection = document.querySelector('.yat-section.visible') as HTMLElement | null;
  return (
    visibleSection?.querySelector('.yat-grid') ||
    document.querySelector('#active-grid') ||
    document.querySelector('.yat-grid')
  ) as HTMLElement | null;
}

function isPlayerProfilePage(): boolean {
  return typeof window !== 'undefined' && window.location.pathname.includes('/player/');
}

function goToFavoritesGallery(currentHsid: string) {
  try {
    sessionStorage.setItem('yat-open-favorites-gallery', '1');
  } catch {}
  window.location.href = `/${encodeURIComponent(currentHsid)}?favorites=1`;
}

function getGridCardItems(grid: HTMLElement): HTMLElement[] {
  const directWrapped = Array.from(grid.querySelectorAll(':scope > [data-player-card-wrap="true"]')) as HTMLElement[];
  if (directWrapped.length) return directWrapped;

  const directCards = Array.from(grid.querySelectorAll(':scope > .yat-card[data-playerid]')) as HTMLElement[];
  if (directCards.length) return directCards;

  const nestedCards = Array.from(grid.querySelectorAll('.yat-card[data-playerid]')) as HTMLElement[];
  return nestedCards.map(cardContainerFromCard);
}

function ensureOriginalOrder(items: HTMLElement[]) {
  items.forEach((item, index) => {
    if (!item.dataset.favoriteOriginalIndex) {
      item.dataset.favoriteOriginalIndex = String(index);
    }
  });
}

function getItemPlayerId(item: HTMLElement): string {
  return item.getAttribute('data-playerid') || item.querySelector('.yat-card[data-playerid]')?.getAttribute('data-playerid') || '';
}

function removeSyntheticFavorites(grid: HTMLElement) {
  grid.querySelectorAll('[data-superfan-synthetic="true"]').forEach((node) => node.remove());
}

function restoreOriginalGridOrder(grid: HTMLElement, items: HTMLElement[]) {
  removeSyntheticFavorites(grid);
  [...items]
    .filter((item) => item.dataset.superfanSynthetic !== 'true')
    .sort((a, b) => Number(a.dataset.favoriteOriginalIndex || 0) - Number(b.dataset.favoriteOriginalIndex || 0))
    .forEach((item) => {
      item.style.display = item.dataset.defaultHidden === 'retired' ? 'none' : '';
      grid.appendChild(item);
    });
}

// A cross-school favorite has no server-rendered card on the current
// subdomain's page. Rather than hand-building a lookalike, this container
// is a portal target: the drawer fetches the player's real card data and
// mounts the actual <PlayerCard> component into it, so it gets the same
// scoped styling, layout, and flip behavior as every native card.
function ensureCrossSchoolContainer(containers: Map<string, HTMLElement>, playerId: string): HTMLElement {
  let container = containers.get(playerId);
  if (!container) {
    container = document.createElement('div');
    container.dataset.playerCardWrap = 'true';
    container.dataset.playerid = playerId;
    container.dataset.superfanSynthetic = 'true';
    containers.set(playerId, container);
  }
  return container;
}

// PlayerCardBack renders an async Server Component (the 7-day snapshot),
// which can only ever run on the server - a React portal to a client-side
// <PlayerCard> throws "async Client Component" and crashes the whole page.
// So instead of rendering the component in the browser, fetch a server-
// rendered copy of it from /embed/player-card/[playerId] (same, unforked
// component) and inject the finished HTML. Its styled-jsx <style> tags live
// in that fetched document's <head>, not in the fragment itself, so any not
// already present on this page get copied over too (deduped by exact text).
const injectedEmbedStyleSignatures = new Set<string>();

function ensureEmbedStylesInjected(doc: Document) {
  doc.querySelectorAll('style').forEach((style) => {
    const text = style.textContent || '';
    if (!text.trim() || injectedEmbedStyleSignatures.has(text)) return;
    injectedEmbedStyleSignatures.add(text);
    const clone = document.createElement('style');
    clone.textContent = text;
    document.head.appendChild(clone);
  });
}

// A Super Fan can have 20-30 cross-school favorites, each needing its own
// embed fetch. One retry absorbs the transient failures that come from
// firing that many requests at once against a serverless DB-backed route
// (cold starts, momentary connection pressure) - a card that still won't
// resolve on a clean second attempt is a genuine problem, not this.
async function fetchCardEmbedMarkup(playerId: string, attempt = 1): Promise<string | null> {
  try {
    const res = await fetch(`/embed/player-card/${encodeURIComponent(playerId)}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`embed fetch failed with status ${res.status}`);

    const html = await res.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const root = doc.querySelector('[data-card-embed-root="true"]');
    if (!root || !root.querySelector('.yat-card[data-playerid]')) {
      throw new Error('embed response missing card markup');
    }

    ensureEmbedStylesInjected(doc);
    return root.innerHTML;
  } catch {
    if (attempt >= 2) return null;
    await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
    return fetchCardEmbedMarkup(playerId, attempt + 1);
  }
}

// Native cards get reliable tap-to-flip from PlayerCardFlipBehavior.tsx, a
// React component rendered inside each card that finds its own ancestor
// .yat-card in a useEffect and attaches a click listener directly to it.
// That never runs for a cross-school card: this markup is injected via
// innerHTML, so React never mounts anything in it, and that useEffect never
// fires. Cross-school cards were left depending solely on YatInteractivity's
// older page-wide delegated listener - confirmed live, tapping did nothing
// at all, anywhere on the card, while the same click-driven "Flip All"
// button (a direct classList.toggle, not a click event) worked fine. Wiring
// this exact same per-card listener manually is what PlayerCardFlipBehavior
// would have attached had React been able to mount it.
function attachFlipListener(card: HTMLElement) {
  if (card.dataset.flipListenerAttached === 'true') return;
  card.dataset.flipListenerAttached = 'true';

  card.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest('a, button, input, select, textarea, label, [role="button"]')) return;

    event.stopPropagation();
    card.classList.toggle('is-flipped');
  });
}

// FunZone (the six-tab area on the card back) always renders all six panels
// now and switches which one shows via a CSS class, specifically so a
// vanilla click listener like this one can drive it - React's own onClick/
// useState in FunZone.tsx never runs for a card injected via innerHTML.
function attachFunZoneTabListener(card: HTMLElement) {
  if (card.dataset.funZoneTabListenerAttached === 'true') return;
  card.dataset.funZoneTabListenerAttached = 'true';

  card.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const tabBtn = target.closest<HTMLElement>('.fz-tab-btn[data-fz-tab]');
    if (!tabBtn) return;

    const tabId = tabBtn.dataset.fzTab;
    if (!tabId) return;

    event.stopPropagation();

    tabBtn.closest('.fz-tab-strip')?.querySelectorAll<HTMLElement>('.fz-tab-btn').forEach((btn) => {
      const isActive = btn === tabBtn;
      btn.classList.toggle('fz-tab-active', isActive);
      btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });

    tabBtn.closest('.fz-root')?.querySelectorAll<HTMLElement>('.fz-panel[data-fz-tab]').forEach((panel) => {
      panel.classList.toggle('fz-panel-active', panel.dataset.fzTab === tabId);
    });
  });
}

function renderCardErrorFallback(name: string, schoolId: string, playerId: string): string {
  const slug = playerSlug(name);
  return `
    <div class="yat-card yat-cross-school-card-error" data-playerid="${escapeHtml(playerId)}" data-superfan-synthetic="true">
      <span>Could not load ${escapeHtml(name)}&apos;s card.</span>
      <a href="/${escapeHtml(schoolId)}/player/${escapeHtml(playerId)}/${escapeHtml(slug)}">Open profile</a>
    </div>
  `;
}

function removeSyntheticStripSlots(strip: HTMLElement) {
  strip.querySelectorAll('[data-superfan-synthetic="true"]').forEach((node) => node.remove());
}

function syncInteractionStrip(players: FavoritePlayer[], enabled: boolean) {
  const strip = document.querySelector('.gallery-strip-inner') as HTMLElement | null;
  if (!strip) return;

  const slots = Array.from(strip.querySelectorAll('.gallery-slot[data-playerid]')) as HTMLElement[];
  slots.forEach((slot, index) => {
    if (!slot.dataset.favoriteOriginalIndex) {
      slot.dataset.favoriteOriginalIndex = String(index);
    }
  });

  if (!enabled) {
    removeSyntheticStripSlots(strip);
    [...slots]
      .filter((slot) => slot.dataset.superfanSynthetic !== 'true')
      .sort((a, b) => Number(a.dataset.favoriteOriginalIndex || 0) - Number(b.dataset.favoriteOriginalIndex || 0))
      .forEach((slot) => {
        slot.style.display = slot.dataset.defaultHidden === 'retired' ? 'none' : '';
        strip.appendChild(slot);
      });
    return;
  }

  removeSyntheticStripSlots(strip);
  const freshSlots = Array.from(strip.querySelectorAll('.gallery-slot[data-playerid]')) as HTMLElement[];
  const slotByPlayerId = new Map<string, HTMLElement>();
  freshSlots.forEach((slot) => {
    const playerId = slot.getAttribute('data-playerid') || '';
    if (playerId && !slotByPlayerId.has(playerId)) slotByPlayerId.set(playerId, slot);
    slot.style.display = 'none';
  });

  players.forEach((player) => {
    const playerId = String(player.player_id);
    const existing = slotByPlayerId.get(playerId);
    if (existing) {
      existing.style.display = '';
      strip.appendChild(existing);
    }
    // A cross-school favorite with no native slot here is Row3MirrorGuard's
    // job, not this function's: it mirrors row 5's real DOM (name, photo,
    // order) whenever it changes. This function used to also create its own
    // synthetic slot from the favorites API's display_name, independently
    // and out of sync with that guard - whichever ran last won, which is
    // exactly what caused duplicate photos and raw-playerid labels to keep
    // reappearing after Row3MirrorGuard had already fixed them.
  });
}

// GalleryFilterController needs to know, at the moment it actually runs a
// filter pass, whether the favorites gallery is restricting the visible
// section and to which playerIds - not whatever it last heard from an
// event, which can go stale if that event and a filter pass interleave
// with a section change. Stamping the restriction directly on the section
// element means every filter pass reads the live, authoritative state
// instead of a cached snapshot.
function setFavoritesGalleryRestriction(grid: HTMLElement, enabled: boolean, playerIds: string[]) {
  const section = grid.closest<HTMLElement>('.yat-section');
  if (!section) return;

  if (!enabled) {
    delete section.dataset.favoritesGalleryActive;
    delete section.dataset.favoritesGalleryIds;
    return;
  }

  section.dataset.favoritesGalleryActive = 'true';
  section.dataset.favoritesGalleryIds = playerIds.join(',');
}

function applyFavoriteDeck(players: FavoritePlayer[], enabled: boolean, currentHsid: string, crossSchoolContainers: Map<string, HTMLElement>): string[] {
  const grid = currentGrid();
  if (!grid) return [];

  const items = getGridCardItems(grid);
  ensureOriginalOrder(items);

  if (!enabled) {
    restoreOriginalGridOrder(grid, items);
    syncInteractionStrip([], false);
    setFavoritesGalleryRestriction(grid, false, []);
    window.dispatchEvent(new CustomEvent('yat:favorites-filter-changed', { detail: { enabled, playerIds: [] } }));
    return [];
  }

  removeSyntheticFavorites(grid);

  const freshItems = getGridCardItems(grid).filter((item) => item.dataset.superfanSynthetic !== 'true');
  const itemByPlayerId = new Map<string, HTMLElement>();

  freshItems.forEach((item) => {
    const playerId = getItemPlayerId(item);
    if (playerId && !itemByPlayerId.has(playerId)) itemByPlayerId.set(playerId, item);
    item.style.display = 'none';
  });

  const missingIds: string[] = [];

  players.forEach((player) => {
    const playerId = String(player.player_id);
    const existing = itemByPlayerId.get(playerId);
    if (existing) {
      existing.style.display = '';
      grid.appendChild(existing);
      return;
    }
    grid.appendChild(ensureCrossSchoolContainer(crossSchoolContainers, playerId));
    missingIds.push(playerId);
  });

  syncInteractionStrip(players, true);
  const playerIds = players.map((p) => String(p.player_id));
  setFavoritesGalleryRestriction(grid, true, playerIds);
  window.dispatchEvent(new CustomEvent('yat:favorites-filter-changed', { detail: { enabled, playerIds } }));
  return missingIds;
}

function FavoriteLinks({
  players,
  currentHsid,
  onUnfavorite,
  removingId,
}: {
  players: FavoritePlayer[];
  currentHsid: string;
  onUnfavorite: (player: FavoritePlayer) => void;
  removingId: string | null;
}) {
  if (!players.length) {
    return <div className="yat-favorite-empty">No favorite players found yet.</div>;
  }

  return (
    <div className="yat-favorite-link-list">
      {players.map((player) => {
        const playerId = String(player.player_id);
        const schoolId = String(player.school_id || currentHsid);
        const name = String(player.display_name || playerId);
        const slug = playerSlug(name);
        const profileHref = `/${schoolId}/player/${playerId}/${slug}`;
        const subtitle = String(player.current_team_name || '').trim();

        return (
          <div key={`${playerId}-${schoolId}`} className="yat-favorite-row">
            <a href={profileHref} className="yat-favorite-headshot-link" title={`Open ${name} profile`}>
              <img
                src={playerHeadshotUrl(playerId)}
                alt=""
                className="yat-favorite-thumb yat-favorite-headshot"
                onError={(event) => { event.currentTarget.src = '/img/headshot-silhouette.png'; }}
              />
            </a>
            <a href={profileHref} className="yat-favorite-text-link" title={`Open ${name} profile`}>
              <strong>{name}</strong>
              {subtitle && <small>{subtitle}</small>}
            </a>
            <a href={playerFlipCardUrl(playerId, schoolId)} className="yat-favorite-flip-link" title="Open flip card">
              <img
                src={schoolCrestUrl(schoolId)}
                alt=""
                className="yat-favorite-thumb yat-favorite-hs-logo"
                onError={(event) => { event.currentTarget.src = '/img/yatstats-logo-circle.png'; }}
              />
            </a>
            <button
              type="button"
              className="yat-favorite-star-btn"
              aria-label={`Remove ${name} from favorites`}
              aria-disabled={removingId === playerId}
              onClick={() => onUnfavorite(player)}
            >
              <i className="ri-star-fill" aria-hidden="true" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

export default function FavoritesDrawer({ currentHsid }: { currentHsid: string }) {
  const [showGalleryView, setShowGalleryView] = useState(false);
  const [sortByLastName, setSortByLastNameState] = useState(false);
  const [homePlayers, setHomePlayers] = useState<FavoritePlayer[]>([]);
  const [superfanPlayers, setSuperfanPlayers] = useState<FavoritePlayer[]>([]);
  const [lockedReason, setLockedReason] = useState<string | null>(null);
  const [isSuperfan, setIsSuperfan] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [hasUser, setHasUser] = useState(false);
  const [checkedSession, setCheckedSession] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const crossSchoolContainersRef = useRef<Map<string, HTMLElement>>(new Map());
  const cardFetchStatusRef = useRef<Map<string, 'loading' | 'done'>>(new Map());

  useEffect(() => {
    setSortByLastNameState(readSortByLastNamePreference());
  }, []);

  const handleSortModeChange = useCallback((byLastName: boolean) => {
    setSortByLastNameState(byLastName);
    writeSortByLastNamePreference(byLastName);
  }, []);

  const displayedPlayers = useMemo(() => {
    const combined = isSuperfan ? [...homePlayers, ...superfanPlayers] : homePlayers;
    return [...combined].sort((a, b) =>
      favoriteSortKey(a, sortByLastName).localeCompare(favoriteSortKey(b, sortByLastName), undefined, { sensitivity: 'base' })
    );
  }, [homePlayers, isSuperfan, superfanPlayers, sortByLastName]);

  const handleUnfavorite = useCallback(async (player: FavoritePlayer) => {
    const playerId = String(player.player_id);
    const user = readYatUser();
    if (!user?.uid || removingId) return;

    setRemovingId(playerId);
    try {
      const res = await fetch('/api/favorites', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firebaseUid: user.uid, playerId }),
      });
      const data = await res.json();
      if (data?.success) {
        setHomePlayers((prev) => prev.filter((p) => String(p.player_id) !== playerId));
        setSuperfanPlayers((prev) => prev.filter((p) => String(p.player_id) !== playerId));
        window.dispatchEvent(new CustomEvent('yat-favorites-changed'));
      }
    } catch {
      // Leave the row in place on failure; the user can retry.
    } finally {
      setRemovingId(null);
    }
  }, [removingId]);

  const loadFavorites = useCallback(async () => {
    setIsLoading(true);
    const user = await getCurrentUser();
    const uid = user?.uid;
    setCheckedSession(true);

    if (!uid) {
      setHasUser(false);
      setHomePlayers([]);
      setSuperfanPlayers([]);
      setLockedReason('VISITOR');
      setIsSuperfan(false);
      applyFavoriteDeck([], false, currentHsid, crossSchoolContainersRef.current);
      setIsLoading(false);
      return;
    }

    setHasUser(true);

    try {
      const homeResponse = await fetch(`/api/favorites?uid=${encodeURIComponent(uid)}&hsid=${encodeURIComponent(currentHsid)}&scope=home`, { cache: 'no-store' });
      const homeData = await homeResponse.json();
      const homeList: FavoritePlayer[] = Array.isArray(homeData.favoritePlayers) ? homeData.favoritePlayers : [];

      setHomePlayers(homeList);
      setIsSuperfan(Boolean(homeData.isSuperfan));

      if (homeData.isSuperfan) {
        const superResponse = await fetch(`/api/favorites?uid=${encodeURIComponent(uid)}&hsid=${encodeURIComponent(currentHsid)}&scope=all`, { cache: 'no-store' });
        const superData = await superResponse.json();
        setSuperfanPlayers(Array.isArray(superData.favoritePlayers) ? superData.favoritePlayers : []);
        setLockedReason(superData.lockedReason || null);
      } else {
        setSuperfanPlayers([]);
        setLockedReason(null);
      }
    } catch {
      setHomePlayers([]);
      setSuperfanPlayers([]);
      setLockedReason('LOAD_ERROR');
    } finally {
      setIsLoading(false);
    }
  }, [currentHsid]);

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      const target = event.target as HTMLElement | null;
      if (!target) return;

      if (target.closest('#openFavorites')) {
        event.preventDefault();
        openFavoritesDrawer();
        void loadFavorites();
        return;
      }

      if (target.id === 'drawerMask' && document.body.classList.contains('drawer-favorites-open')) {
        event.preventDefault();
        closeFavoritesDrawer();
      }
    }

    function handleOpenFavoritesEvent() {
      openFavoritesDrawer();
      void loadFavorites();
    }

    function handleKeydown(event: KeyboardEvent) {
      if (event.key === 'Escape') closeFavoritesDrawer();
    }

    function handleRefresh() {
      void loadFavorites();
    }

    document.addEventListener('click', handleClick);
    document.addEventListener('keydown', handleKeydown);
    window.addEventListener('yat:open-favorites', handleOpenFavoritesEvent);
    window.addEventListener('yat-auth-success', handleRefresh);
    window.addEventListener('yat-favorites-changed', handleRefresh);
    window.addEventListener('yat-sign-out', handleRefresh);

    return () => {
      document.removeEventListener('click', handleClick);
      document.removeEventListener('keydown', handleKeydown);
      window.removeEventListener('yat:open-favorites', handleOpenFavoritesEvent);
      window.removeEventListener('yat-auth-success', handleRefresh);
      window.removeEventListener('yat-favorites-changed', handleRefresh);
      window.removeEventListener('yat-sign-out', handleRefresh);
    };
  }, [loadFavorites]);

  useEffect(() => {
    const shouldAutoOpen = new URLSearchParams(window.location.search).get('favorites') === '1' || sessionStorage.getItem('yat-open-favorites-gallery') === '1';
    if (!shouldAutoOpen) return;

    try {
      sessionStorage.removeItem('yat-open-favorites-gallery');
    } catch {}

    openFavoritesDrawer();
    setShowGalleryView(true);
    void loadFavorites();
  }, [loadFavorites]);

  useEffect(() => {
    const missing = applyFavoriteDeck(displayedPlayers, showGalleryView, currentHsid, crossSchoolContainersRef.current);

    // GalleryFilterController only re-scans `.yat-card[data-playerid]`
    // elements when this event fires. A cross-school card's real markup
    // (with the data-level/data-status/etc. attributes filters actually
    // read) lands well after applyFavoriteDeck's own dispatch above, so
    // without a nudge here it never gets evaluated against an active
    // filter and just stays visible no matter what's checked.
    // GalleryFilterController reads the restriction fresh off the section's
    // own data-favorites-gallery-* attributes and ignores this event's
    // detail entirely, so it doesn't need playerIds here - but
    // SortFilterDrawerControls' favorite-scoped stat sort still caches
    // detail.playerIds directly off this same event, and an empty array
    // silently emptied that cache on every one of these nudges.
    const currentPlayerIds = displayedPlayers.map((p) => String(p.player_id));
    const nudgeFavoritesFilter = () => {
      window.dispatchEvent(new CustomEvent('yat:favorites-filter-changed', { detail: { enabled: showGalleryView, playerIds: currentPlayerIds } }));
    };

    const pending = missing.filter((playerId) => !cardFetchStatusRef.current.has(playerId));
    pending.forEach((playerId) => {
      cardFetchStatusRef.current.set(playerId, 'loading');
      const container = crossSchoolContainersRef.current.get(playerId);
      if (container) {
        container.innerHTML = `<div class="yat-card yat-cross-school-card-loading" data-playerid="${escapeHtml(playerId)}" data-superfan-synthetic="true">Loading card&hellip;</div>`;
      }
    });
    if (pending.length) nudgeFavoritesFilter();

    const loadOne = (playerId: string) => {
      const showFallback = () => {
        cardFetchStatusRef.current.set(playerId, 'done');
        const c = crossSchoolContainersRef.current.get(playerId);
        if (!c) return;
        const fallbackPlayer = displayedPlayers.find((p) => String(p.player_id) === playerId);
        const name = String(fallbackPlayer?.display_name || playerId);
        const schoolId = String(fallbackPlayer?.school_id || currentHsid);
        c.innerHTML = renderCardErrorFallback(name, schoolId, playerId);
        nudgeFavoritesFilter();
      };

      return fetchCardEmbedMarkup(playerId)
        .then((markup) => {
          cardFetchStatusRef.current.set(playerId, 'done');
          const c = crossSchoolContainersRef.current.get(playerId);
          if (!c) return;
          if (markup) {
            c.innerHTML = markup;
            // The wrapper carries data-superfan-synthetic so legacy gallery
            // scripts (GalleryUniverseController, Row3MirrorGuard) leave this
            // DOM alone - but their :not([data-superfan-synthetic]) selectors
            // check the .yat-card element itself, not its ancestors, so the
            // real injected card needs the same marker directly on it too.
            const injectedCard = c.querySelector<HTMLElement>('.yat-card[data-playerid]');
            injectedCard?.setAttribute('data-superfan-synthetic', 'true');
            if (injectedCard) {
              attachFlipListener(injectedCard);
              attachFunZoneTabListener(injectedCard);
            }
            nudgeFavoritesFilter();
          } else {
            showFallback();
          }
        })
        .catch(showFallback);
    };

    // The DB pool behind /embed/player-card (src/lib/db.ts) allows only 5
    // connections total, shared with every other request the site is
    // serving. A Super Fan with 20-30 favorites bursting even 4 at once
    // leaves almost no headroom and starves other traffic - 2 keeps this
    // well under that ceiling while still loading faster than one at a time.
    const CROSS_SCHOOL_CARD_CONCURRENCY = 2;
    let cursor = 0;
    const runNext = (): void => {
      if (cursor >= pending.length) return;
      const playerId = pending[cursor++];
      void loadOne(playerId).finally(runNext);
    };
    for (let i = 0; i < Math.min(CROSS_SCHOOL_CARD_CONCURRENCY, pending.length); i++) runNext();
  }, [displayedPlayers, showGalleryView, currentHsid]);

  const handleGalleryViewChange = (checked: boolean) => {
    if (checked && (isPlayerProfilePage() || !currentGrid())) {
      const wantsGallery = window.confirm('Would you like to navigate away from this profile page to see your favorites in your flip card gallery?');
      if (wantsGallery) {
        goToFavoritesGallery(currentHsid);
      }
      return;
    }

    setShowGalleryView(checked);
  };

  const lockedMessage = (() => {
    if (lockedReason === 'LOAD_ERROR') return 'Could not load favorites. Try again.';
    return '';
  })();

  return (
    <>
      <aside className="yat-drawer yat-drawer-right" id="drawerFavorites" aria-label="Favorites drawer">
        <div className="yat-drawer-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', padding: '12px 14px', borderBottom: '1px solid var(--line)' }}>
          <h3 style={{ margin: 0 }}>FAVORITES</h3>
          <div className="yat-favorite-header-icons" role="group" aria-label="Favorites view controls">
            {hasUser && (
              <>
                <button
                  type="button"
                  className="yat-favorite-sort-chip"
                  onClick={() => handleSortModeChange(!sortByLastName)}
                  aria-label={sortByLastName ? 'Sorted last name first - tap to sort first name first' : 'Sorted first name first - tap to sort last name first'}
                  title="Toggle sort order"
                >
                  <i className="ri-sort-alphabet-asc" aria-hidden="true" />
                  {sortByLastName ? 'Last, First' : 'First, Last'}
                </button>
                <button
                  type="button"
                  className={showGalleryView ? 'yat-icon-btn active' : 'yat-icon-btn'}
                  aria-label="Flip Card Gallery View"
                  aria-pressed={showGalleryView}
                  title="Flip Card Gallery View"
                  onClick={() => handleGalleryViewChange(!showGalleryView)}
                >
                  <FlipCardIcon size={18} />
                </button>
              </>
            )}
            <button className="yat-icon-btn" id="closeFavorites" aria-label="Close favorites" onClick={closeFavoritesDrawer}>
              <i className="ri-close-line" />
            </button>
          </div>
        </div>

        <div className="yat-drawer-content">
          {isLoading && !checkedSession ? (
            <div className="yat-favorite-empty">Loading favorites...</div>
          ) : !hasUser ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="yat-favorite-empty">Sign up or log in to favorite players. Your signup microsite becomes your Home School.</div>
              <button type="button" onClick={() => openAccountDrawer('register')} style={{ padding: '10px 12px', border: '1px solid var(--line)', borderRadius: 8, background: 'var(--fg)', color: 'var(--bg)', font: '700 12px Oswald, sans-serif', textTransform: 'uppercase', cursor: 'pointer' }}>
                Sign Up / Log In
              </button>
            </div>
          ) : (
            <>
              {lockedMessage && <div className="yat-favorite-lock-message">{lockedMessage}</div>}

              <div className="yat-favorite-list-wrap">
                <FavoriteLinks players={displayedPlayers} currentHsid={currentHsid} onUnfavorite={handleUnfavorite} removingId={removingId} />
              </div>
            </>
          )}
        </div>
      </aside>

      <style jsx global>{`
        body.drawer-favorites-open #drawerFavorites { transform: translateX(0); }
        body.drawer-favorites-open .yat-drawer-mask { opacity: 1; pointer-events: auto; }

        .yat-cross-school-card-loading,
        .yat-cross-school-card-error {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 8px;
          min-height: 200px;
          padding: 16px;
          text-align: center;
          color: var(--muted);
          font: 400 13px/1.4 Oswald, sans-serif;
          text-transform: uppercase;
        }

        .yat-cross-school-card-error a {
          color: #ffd166;
          text-decoration: underline;
        }

        #drawerFavorites .yat-favorite-empty,
        #drawerFavorites .yat-favorite-lock-message {
          color: var(--muted);
          font: 400 13px/1.45 Oswald, sans-serif;
          letter-spacing: 0;
        }

        #drawerFavorites .yat-favorite-lock-message {
          color: #ffd166;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: .03em;
        }

        #drawerFavorites .yat-favorite-header-icons {
          display: flex;
          align-items: center;
          gap: 14px;
          justify-content: flex-end;
        }

        #drawerFavorites .yat-favorite-header-icons .yat-icon-btn.active {
          color: var(--accent, #c8a96e);
          background: rgba(200,169,110,.15);
        }

        #drawerFavorites .yat-favorite-sort-chip {
          display: flex;
          align-items: center;
          gap: 5px;
          flex-shrink: 0;
          height: 26px;
          padding: 0 10px;
          border: 1px solid var(--line);
          border-radius: 999px;
          background: transparent;
          color: var(--ink);
          font: 400 11px/1 Oswald, sans-serif;
          letter-spacing: .02em;
          text-transform: uppercase;
          white-space: nowrap;
          cursor: pointer;
        }

        #drawerFavorites .yat-favorite-sort-chip:hover {
          background: rgba(255,255,255,.08);
        }

        #drawerFavorites .yat-favorite-sort-chip i {
          font-size: 13px;
        }

        #drawerFavorites .yat-favorite-list-wrap {
          border-top: 1px solid var(--line);
          margin-top: 4px;
          padding-top: 12px;
        }

        #drawerFavorites .yat-favorite-link-list {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        #drawerFavorites .yat-favorite-row {
          display: grid;
          grid-template-columns: 46px minmax(0, 1fr) 40px 34px;
          align-items: center;
          column-gap: 10px;
          min-height: 56px;
          padding: 8px 10px;
          border: 1px solid var(--line);
          border-radius: 10px;
          background: rgba(255,255,255,.045);
        }

        #drawerFavorites .yat-favorite-row a {
          color: inherit;
          text-decoration: none;
        }

        #drawerFavorites .yat-favorite-headshot-link {
          display: flex;
          align-items: center;
          justify-content: center;
        }

        #drawerFavorites .yat-favorite-headshot {
          width: 46px;
          height: 46px;
          object-fit: cover;
          border-radius: 4px;
          background: rgba(0,0,0,.08);
        }

        #drawerFavorites .yat-favorite-text-link {
          display: flex;
          min-width: 0;
          flex-direction: column;
          gap: 3px;
        }

        #drawerFavorites .yat-favorite-text-link strong {
          font: 900 14px/1.05 Oswald, sans-serif;
          text-transform: uppercase;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        #drawerFavorites .yat-favorite-text-link small {
          color: var(--muted);
          font: 400 10px/1.15 Oswald, sans-serif;
          text-transform: uppercase;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        #drawerFavorites .yat-favorite-flip-link {
          display: flex;
          align-items: center;
          justify-content: center;
        }

        #drawerFavorites .yat-favorite-hs-logo {
          width: 34px;
          height: 34px;
          object-fit: contain;
          border-radius: 0;
          background: transparent;
        }

        #drawerFavorites .yat-favorite-star-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 34px;
          height: 34px;
          padding: 0;
          border: none;
          background: transparent;
          color: var(--accent, #c8a96e);
          font-size: 19px;
          line-height: 1;
          cursor: pointer;
          flex: 0 0 auto;
        }

        #drawerFavorites .yat-favorite-star-btn:hover {
          color: #e8c98a;
        }

        #drawerFavorites .yat-favorite-star-btn[aria-disabled="true"] {
          opacity: .5;
          cursor: wait;
        }
      `}</style>
    </>
  );
}
