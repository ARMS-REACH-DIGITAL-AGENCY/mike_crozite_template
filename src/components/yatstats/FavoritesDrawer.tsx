'use client';

import { useCallback, useEffect, useState } from 'react';

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
};

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

function openFavoritesDrawer() {
  document.body.classList.add('drawer-favorites-open', 'drawer-open');
  document.body.classList.remove('drawer-left-open', 'drawer-right-open', 'drawer-account-open');
}

function closeFavoritesDrawer() {
  document.body.classList.remove('drawer-favorites-open', 'drawer-open');
}

function openAccountDrawer(tab: 'signin' | 'register' = 'register') {
  document.body.classList.add('drawer-account-open', 'drawer-open');
  document.body.classList.remove('drawer-left-open', 'drawer-right-open', 'drawer-favorites-open');
  window.dispatchEvent(new CustomEvent('yat:acct-tab', { detail: tab }));
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

function restoreOriginalGridOrder(grid: HTMLElement, items: HTMLElement[]) {
  [...items]
    .sort((a, b) => Number(a.dataset.favoriteOriginalIndex || 0) - Number(b.dataset.favoriteOriginalIndex || 0))
    .forEach((item) => {
      item.style.display = item.dataset.defaultHidden === 'retired' ? 'none' : '';
      grid.appendChild(item);
    });
}

function syncInteractionStrip(playerIds: string[], enabled: boolean) {
  const strip = document.querySelector('.gallery-strip-inner') as HTMLElement | null;
  if (!strip) return;

  const slots = Array.from(strip.querySelectorAll('.gallery-slot[data-playerid]')) as HTMLElement[];
  slots.forEach((slot, index) => {
    if (!slot.dataset.favoriteOriginalIndex) {
      slot.dataset.favoriteOriginalIndex = String(index);
    }
  });

  if (!enabled) {
    [...slots]
      .sort((a, b) => Number(a.dataset.favoriteOriginalIndex || 0) - Number(b.dataset.favoriteOriginalIndex || 0))
      .forEach((slot) => {
        slot.style.display = slot.dataset.defaultHidden === 'retired' ? 'none' : '';
        strip.appendChild(slot);
      });
    return;
  }

  const slotByPlayerId = new Map<string, HTMLElement>();
  slots.forEach((slot) => {
    const playerId = slot.getAttribute('data-playerid') || '';
    if (playerId && !slotByPlayerId.has(playerId)) slotByPlayerId.set(playerId, slot);
    slot.style.display = 'none';
  });

  playerIds.map(String).forEach((playerId) => {
    const slot = slotByPlayerId.get(playerId);
    if (!slot) return;
    slot.style.display = '';
    strip.appendChild(slot);
  });
}

function applyFavoriteDeck(playerIds: string[], enabled: boolean) {
  const grid = currentGrid();
  if (!grid) return;

  const items = getGridCardItems(grid);
  ensureOriginalOrder(items);

  if (!enabled) {
    restoreOriginalGridOrder(grid, items);
    syncInteractionStrip([], false);
    window.dispatchEvent(
      new CustomEvent('yat:favorites-filter-changed', {
        detail: { enabled, playerIds: [] },
      })
    );
    return;
  }

  const orderedIds = playerIds.map(String);
  const idSet = new Set(orderedIds);
  const itemByPlayerId = new Map<string, HTMLElement>();

  items.forEach((item) => {
    const playerId = getItemPlayerId(item);
    if (playerId && !itemByPlayerId.has(playerId)) itemByPlayerId.set(playerId, item);
    item.style.display = 'none';
  });

  orderedIds.forEach((playerId) => {
    const item = itemByPlayerId.get(playerId);
    if (!item) return;
    item.style.display = '';
    grid.appendChild(item);
  });

  syncInteractionStrip(orderedIds, true);

  window.dispatchEvent(
    new CustomEvent('yat:favorites-filter-changed', {
      detail: { enabled, playerIds: orderedIds.filter((id) => idSet.has(id)) },
    })
  );
}

export default function FavoritesDrawer({ currentHsid }: { currentHsid: string }) {
  const [scope, setScope] = useState<'home' | 'all'>('home');
  const [showOnlyFavorites, setShowOnlyFavorites] = useState(false);
  const [players, setPlayers] = useState<FavoritePlayer[]>([]);
  const [playerIds, setPlayerIds] = useState<string[]>([]);
  const [lockedReason, setLockedReason] = useState<string | null>(null);
  const [isSuperfan, setIsSuperfan] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [hasUser, setHasUser] = useState(false);
  const [checkedSession, setCheckedSession] = useState(false);

  const loadFavorites = useCallback(async (nextScope: 'home' | 'all' = scope) => {
    setIsLoading(true);
    const user = await getCurrentUser();
    const uid = user?.uid;
    setCheckedSession(true);

    if (!uid) {
      setHasUser(false);
      setPlayers([]);
      setPlayerIds([]);
      setLockedReason('VISITOR');
      setIsSuperfan(false);
      applyFavoriteDeck([], false);
      setIsLoading(false);
      return;
    }

    setHasUser(true);

    try {
      const response = await fetch(
        `/api/favorites?uid=${encodeURIComponent(uid)}&hsid=${encodeURIComponent(currentHsid)}&scope=${nextScope}`,
        { cache: 'no-store' }
      );
      const data = await response.json();

      const favoritePlayers: FavoritePlayer[] = Array.isArray(data.favoritePlayers)
        ? data.favoritePlayers
        : Array.isArray(data.favorites)
          ? data.favorites
          : [];
      const ids = Array.isArray(data.playerIds)
        ? data.playerIds.map(String)
        : favoritePlayers.map((p) => String(p.player_id));

      setPlayers(favoritePlayers);
      setPlayerIds(ids);
      setLockedReason(data.lockedReason || null);
      setIsSuperfan(Boolean(data.isSuperfan));

      if (showOnlyFavorites) {
        applyFavoriteDeck(ids, true);
      }
    } catch {
      setPlayers([]);
      setPlayerIds([]);
      setLockedReason('LOAD_ERROR');
    } finally {
      setIsLoading(false);
    }
  }, [currentHsid, scope, showOnlyFavorites]);

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      const target = event.target as HTMLElement | null;
      if (!target) return;

      if (target.closest('#openFavorites')) {
        event.preventDefault();
        openFavoritesDrawer();
        void loadFavorites(scope);
        return;
      }

      if (target.id === 'drawerMask' && document.body.classList.contains('drawer-favorites-open')) {
        event.preventDefault();
        closeFavoritesDrawer();
      }
    }

    function handleKeydown(event: KeyboardEvent) {
      if (event.key === 'Escape') closeFavoritesDrawer();
    }

    function handleRefresh() {
      void loadFavorites(scope);
    }

    document.addEventListener('click', handleClick);
    document.addEventListener('keydown', handleKeydown);
    window.addEventListener('yat-auth-success', handleRefresh);
    window.addEventListener('yat-favorites-changed', handleRefresh);
    window.addEventListener('yat-sign-out', handleRefresh);

    return () => {
      document.removeEventListener('click', handleClick);
      document.removeEventListener('keydown', handleKeydown);
      window.removeEventListener('yat-auth-success', handleRefresh);
      window.removeEventListener('yat-favorites-changed', handleRefresh);
      window.removeEventListener('yat-sign-out', handleRefresh);
    };
  }, [loadFavorites, scope]);

  useEffect(() => {
    applyFavoriteDeck(playerIds, showOnlyFavorites);
  }, [playerIds, showOnlyFavorites]);

  const chooseScope = (nextScope: 'home' | 'all') => {
    setScope(nextScope);
    void loadFavorites(nextScope);
  };

  const lockedMessage = (() => {
    if (lockedReason === 'SUPERFAN_REQUIRED') return 'All Schools favorites require Super Fan access.';
    if (lockedReason === 'FOREIGN_MICROSITE') return 'Your Home School favorites are connected to your home microsite.';
    if (lockedReason === 'NO_HOME_HSID') return '';
    if (lockedReason === 'LOAD_ERROR') return 'Could not load favorites. Try again.';
    return '';
  })();

  return (
    <>
      <aside className="yat-drawer yat-drawer-right" id="drawerFavorites" aria-label="Favorites drawer">
        <div
          className="yat-drawer-header"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '10px',
            padding: '12px 14px',
            borderBottom: '1px solid var(--line)',
          }}
        >
          <h3 style={{ margin: 0 }}>MY FAVORITES</h3>
          <button className="yat-icon-btn" aria-label="Close favorites" onClick={closeFavoritesDrawer}>
            <i className="ri-close-line" />
          </button>
        </div>

        <div className="yat-drawer-content">
          {isLoading && !checkedSession ? (
            <div style={{ color: 'var(--muted)', font: '400 13px/1.45 Oswald, sans-serif' }}>
              Loading favorites...
            </div>
          ) : !hasUser ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ color: 'var(--muted)', font: '400 13px/1.45 Oswald, sans-serif' }}>
                Sign up or log in to favorite players. Your signup microsite becomes your Home School.
              </div>
              <button
                type="button"
                onClick={() => openAccountDrawer('register')}
                style={{
                  padding: '10px 12px',
                  border: '1px solid var(--line)',
                  borderRadius: 8,
                  background: 'var(--fg)',
                  color: 'var(--bg)',
                  font: '700 12px Oswald, sans-serif',
                  textTransform: 'uppercase',
                  cursor: 'pointer',
                }}
              >
                Sign Up / Log In
              </button>
            </div>
          ) : (
            <>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, font: '700 12px Oswald, sans-serif', textTransform: 'uppercase' }}>
                <input
                  type="checkbox"
                  checked={showOnlyFavorites}
                  onChange={(event) => setShowOnlyFavorites(event.target.checked)}
                />
                Show My Favorites
              </label>

              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => chooseScope('home')}
                  style={{
                    flex: 1,
                    padding: '8px 10px',
                    border: '1px solid var(--line)',
                    borderRadius: 8,
                    background: scope === 'home' ? 'rgba(255,255,255,.14)' : 'transparent',
                    color: 'var(--fg)',
                    font: '700 11px Oswald, sans-serif',
                    textTransform: 'uppercase',
                    cursor: 'pointer',
                  }}
                >
                  Home School
                </button>
                <button
                  type="button"
                  onClick={() => chooseScope('all')}
                  style={{
                    flex: 1,
                    padding: '8px 10px',
                    border: '1px solid var(--line)',
                    borderRadius: 8,
                    background: scope === 'all' ? 'rgba(255,255,255,.14)' : 'transparent',
                    color: isSuperfan ? 'var(--fg)' : '#ffd166',
                    font: '700 11px Oswald, sans-serif',
                    textTransform: 'uppercase',
                    cursor: 'pointer',
                  }}
                >
                  All Schools ★
                </button>
              </div>

              {lockedMessage && (
                <div style={{ color: '#ffd166', font: '400 12px/1.45 Oswald, sans-serif' }}>
                  {lockedMessage}
                </div>
              )}

              <div style={{ borderTop: '1px solid var(--line)', paddingTop: 12, marginTop: 4 }}>
                <div style={{ font: '700 12px Oswald, sans-serif', letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 8 }}>
                  Favorite Players {isLoading ? '...' : `(${players.length})`}
                </div>

                {players.length === 0 && !isLoading ? (
                  <div style={{ color: 'var(--muted)', font: '400 12px/1.45 Oswald, sans-serif' }}>
                    No favorite players found yet.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    {players.map((player) => (
                      <a
                        key={`${player.player_id}-${player.school_id || ''}`}
                        href={`/${player.school_id || currentHsid}/player/${player.player_id}`}
                        style={{
                          display: 'block',
                          padding: '9px 0',
                          borderBottom: '1px solid var(--line)',
                          font: '700 13px Oswald, sans-serif',
                          textTransform: 'uppercase',
                          color: 'var(--fg)',
                        }}
                      >
                        {player.display_name || player.player_id}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </aside>

      <style jsx global>{`
        body.drawer-favorites-open #drawerFavorites {
          transform: translateX(0);
        }
        body.drawer-favorites-open .yat-drawer-mask {
          opacity: 1;
          pointer-events: auto;
        }
      `}</style>
    </>
  );
}
