'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import PlayerCard from '@/components/yatstats/PlayerCard';

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
  current_team_name?: string | null;
  current_org_or_conference_name?: string | null;
  level_label?: string | null;
  status_label?: string | null;
  class_of?: string | null;
  roster_years?: string[] | null;
};

type CrossSchoolCardEntry =
  | { status: 'loading' }
  | { status: 'error' }
  | {
      status: 'ready';
      player: Record<string, unknown>;
      resolvedHsid: string;
      frontImageUrl: string | null;
      headshotUrl: string | null;
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

function playerHeadshotUrl(playerId: string) {
  return `https://yatstats-assets.s3.us-west-2.amazonaws.com/players/now/${encodeURIComponent(playerId)}.jpg`;
}

function lastNameFromDisplayName(name: string): string {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  return (parts[parts.length - 1] || '').toUpperCase();
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

function removeSyntheticStripSlots(strip: HTMLElement) {
  strip.querySelectorAll('[data-superfan-synthetic="true"]').forEach((node) => node.remove());
}

function createSyntheticStripSlot(player: FavoritePlayer, currentHsid: string): HTMLElement {
  const playerId = String(player.player_id);
  const name = String(player.display_name || playerId);
  const schoolId = String(player.school_id || currentHsid);
  const slug = playerSlug(name);
  const slot = document.createElement('a');
  slot.href = `/${encodeURIComponent(schoolId)}/player/${encodeURIComponent(playerId)}/${encodeURIComponent(slug)}`;
  slot.className = 'gallery-slot gallery-slot-link';
  slot.dataset.playerid = playerId;
  slot.dataset.status = String(player.status_label || 'ACTIVE').toUpperCase();
  slot.dataset.superfanSynthetic = 'true';
  slot.title = name;
  slot.style.display = '';
  slot.innerHTML = `
    <div class="gallery-slot-media">
      <img src="${escapeHtml(playerHeadshotUrl(playerId))}" alt="${escapeHtml(name)}" class="gallery-slot-img" onerror="this.src='/img/headshot-silhouette.png';this.onerror=null" />
      <div class="gallery-slot-gradient"></div>
      <div class="gallery-slot-name-overlay">${escapeHtml(lastNameFromDisplayName(name))}</div>
    </div>
  `;
  return slot;
}

function syncInteractionStrip(players: FavoritePlayer[], enabled: boolean, currentHsid: string) {
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
      return;
    }
    strip.appendChild(createSyntheticStripSlot(player, currentHsid));
  });
}

function applyFavoriteDeck(players: FavoritePlayer[], enabled: boolean, currentHsid: string, crossSchoolContainers: Map<string, HTMLElement>): string[] {
  const grid = currentGrid();
  if (!grid) return [];

  const items = getGridCardItems(grid);
  ensureOriginalOrder(items);

  if (!enabled) {
    restoreOriginalGridOrder(grid, items);
    syncInteractionStrip([], false, currentHsid);
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

  syncInteractionStrip(players, true, currentHsid);
  window.dispatchEvent(new CustomEvent('yat:favorites-filter-changed', { detail: { enabled, playerIds: players.map((p) => String(p.player_id)) } }));
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
  const [showSuperfanList, setShowSuperfanList] = useState(false);
  const [showGalleryView, setShowGalleryView] = useState(false);
  const [homePlayers, setHomePlayers] = useState<FavoritePlayer[]>([]);
  const [superfanPlayers, setSuperfanPlayers] = useState<FavoritePlayer[]>([]);
  const [lockedReason, setLockedReason] = useState<string | null>(null);
  const [isSuperfan, setIsSuperfan] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [hasUser, setHasUser] = useState(false);
  const [checkedSession, setCheckedSession] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [missingCardIds, setMissingCardIds] = useState<string[]>([]);
  const [crossSchoolCards, setCrossSchoolCards] = useState<Record<string, CrossSchoolCardEntry>>({});
  const crossSchoolContainersRef = useRef<Map<string, HTMLElement>>(new Map());
  const fetchingCardIdsRef = useRef<Set<string>>(new Set());

  const displayedPlayers = useMemo(() => {
    const combined = showSuperfanList && isSuperfan ? [...homePlayers, ...superfanPlayers] : homePlayers;
    return [...combined].sort((a, b) =>
      String(a.display_name || a.player_id).localeCompare(String(b.display_name || b.player_id), undefined, { sensitivity: 'base' })
    );
  }, [homePlayers, isSuperfan, showSuperfanList, superfanPlayers]);

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
    setMissingCardIds(missing);
  }, [displayedPlayers, showGalleryView, currentHsid]);

  useEffect(() => {
    missingCardIds.forEach((playerId) => {
      if (fetchingCardIdsRef.current.has(playerId)) return;
      fetchingCardIdsRef.current.add(playerId);
      setCrossSchoolCards((prev) => ({ ...prev, [playerId]: { status: 'loading' } }));

      fetch(`/api/players/${encodeURIComponent(playerId)}/card`, { cache: 'no-store' })
        .then((res) => (res.ok ? res.json() : Promise.reject(new Error('card fetch failed'))))
        .then((data) => {
          setCrossSchoolCards((prev) => ({
            ...prev,
            [playerId]: {
              status: 'ready',
              player: data.player,
              resolvedHsid: String(data.resolvedHsid || ''),
              frontImageUrl: data.frontImageUrl ?? null,
              headshotUrl: data.headshotUrl ?? null,
            },
          }));
        })
        .catch(() => {
          setCrossSchoolCards((prev) => ({ ...prev, [playerId]: { status: 'error' } }));
        });
    });
  }, [missingCardIds]);

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
          <h3 style={{ margin: 0 }}>MY FAVORITE PLAYERS</h3>
          {hasUser && (
            <div className="yat-favorite-header-icons" role="group" aria-label="Favorites view controls">
              <button
                type="button"
                className={showGalleryView ? 'yat-icon-btn active' : 'yat-icon-btn'}
                aria-label="Flip Card Gallery View"
                aria-pressed={showGalleryView}
                title="Flip Card Gallery View"
                onClick={() => handleGalleryViewChange(!showGalleryView)}
              >
                <i className="ri-layout-grid-line" />
              </button>
              <button
                type="button"
                className={!showSuperfanList ? 'yat-icon-btn active' : 'yat-icon-btn'}
                aria-label="Home Fan"
                aria-pressed={!showSuperfanList}
                title="Home Fan"
                onClick={() => setShowSuperfanList(false)}
              >
                <i className="ri-home-4-line" />
              </button>
              <button
                type="button"
                className={showSuperfanList ? 'yat-icon-btn active' : 'yat-icon-btn'}
                aria-label="Global Super Fan"
                aria-pressed={showSuperfanList}
                title="Global Super Fan"
                onClick={() => setShowSuperfanList(true)}
              >
                <i className="ri-earth-line" />
              </button>
            </div>
          )}
          <button className="yat-icon-btn" id="closeFavorites" aria-label="Close favorites" onClick={closeFavoritesDrawer}>
            <i className="ri-close-line" />
          </button>
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
              <label className="yat-favorite-gallery-toggle">
                <input type="checkbox" checked={showGalleryView} onChange={(event) => handleGalleryViewChange(event.target.checked)} />
                Flip Card Gallery View
              </label>

              <div className="yat-favorite-scope-toggle" role="group" aria-label="Favorites list scope">
                <button type="button" onClick={() => setShowSuperfanList(false)} className={!showSuperfanList ? 'yat-favorite-tab active' : 'yat-favorite-tab'}>
                  Home Fan
                </button>
                <button type="button" onClick={() => setShowSuperfanList(true)} className={showSuperfanList ? 'yat-favorite-tab active' : 'yat-favorite-tab'}>
                  Global Super Fan
                </button>
              </div>

              {lockedMessage && <div className="yat-favorite-lock-message">{lockedMessage}</div>}

              {showSuperfanList && !isSuperfan && (
                <div className="yat-favorite-lock-message" style={{ marginBottom: 10 }}>
                  Showing home team only - Super Fan unlocks cross-school favorites.{' '}
                  <button type="button" onClick={() => openAccountDrawer('register')} style={{ background: 'none', border: 'none', padding: 0, color: '#ffd166', textDecoration: 'underline', cursor: 'pointer', font: 'inherit' }}>
                    Upgrade
                  </button>
                </div>
              )}

              <div className="yat-favorite-list-wrap">
                <FavoriteLinks players={displayedPlayers} currentHsid={currentHsid} onUnfavorite={handleUnfavorite} removingId={removingId} />
              </div>
            </>
          )}
        </div>
      </aside>

      {missingCardIds.map((playerId) => {
        const container = crossSchoolContainersRef.current.get(playerId);
        if (!container) return null;
        const entry = crossSchoolCards[playerId];

        if (!entry || entry.status === 'loading') {
          return createPortal(
            <div key={playerId} className="yat-card yat-cross-school-card-loading" data-playerid={playerId}>
              Loading card&hellip;
            </div>,
            container
          );
        }

        if (entry.status === 'error') {
          const fallbackPlayer = displayedPlayers.find((p) => String(p.player_id) === playerId);
          const name = fallbackPlayer?.display_name || playerId;
          const schoolId = fallbackPlayer?.school_id || currentHsid;
          const slug = playerSlug(String(name));
          return createPortal(
            <div key={playerId} className="yat-card yat-cross-school-card-error" data-playerid={playerId}>
              <span>Could not load {name}&apos;s card.</span>
              <a href={`/${schoolId}/player/${playerId}/${slug}`}>Open profile</a>
            </div>,
            container
          );
        }

        return createPortal(
          <PlayerCard
            key={playerId}
            player={entry.player}
            resolvedHsid={entry.resolvedHsid}
            frontImageUrl={entry.frontImageUrl}
            headshotUrl={entry.headshotUrl}
          />,
          container
        );
      })}

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

        #drawerFavorites .yat-favorite-gallery-toggle {
          display: flex;
          align-items: center;
          gap: 8px;
          min-height: 38px;
          border-bottom: 1px solid var(--line);
          font: 400 14px Oswald, sans-serif;
          letter-spacing: 0;
          text-transform: uppercase;
          color: var(--ink);
        }

        #drawerFavorites .yat-favorite-scope-toggle {
          display: flex;
          gap: 8px;
        }

        #drawerFavorites .yat-favorite-header-icons {
          display: flex;
          align-items: center;
          gap: 4px;
          flex: 1;
          justify-content: flex-end;
        }

        #drawerFavorites .yat-favorite-header-icons .yat-icon-btn.active {
          color: var(--accent, #c8a96e);
          background: rgba(200,169,110,.15);
        }

        #drawerFavorites .yat-favorite-tab {
          flex: 1;
          min-height: 38px;
          padding: 8px 10px;
          border: 1px solid var(--line);
          border-radius: 8px;
          background: transparent;
          color: var(--ink);
          font: 400 13px/1.1 Oswald, sans-serif;
          letter-spacing: 0;
          text-transform: uppercase;
          cursor: pointer;
        }

        #drawerFavorites .yat-favorite-tab.active {
          background: rgba(255,255,255,.14);
          color: var(--fg);
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
