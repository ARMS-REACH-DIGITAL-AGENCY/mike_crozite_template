'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

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

function playerFrontImageUrl(playerId: string) {
  return `https://yatstats-assets.s3.us-west-2.amazonaws.com/players/then/${encodeURIComponent(playerId)}.jpg`;
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

function createSyntheticFavoriteCard(player: FavoritePlayer, currentHsid: string): HTMLElement {
  const playerId = String(player.player_id);
  const schoolId = String(player.school_id || currentHsid);
  const name = String(player.display_name || playerId);
  const status = String(player.status_label || 'ACTIVE').toUpperCase();
  const level = String(player.level_label || '');
  const team = String(player.current_team_name || '--');
  const org = String(player.current_org_or_conference_name || '');
  const classOf = String(player.class_of || '');
  const slug = playerSlug(name);

  const wrap = document.createElement('div');
  wrap.dataset.playerCardWrap = 'true';
  wrap.dataset.playerid = playerId;
  wrap.dataset.superfanSynthetic = 'true';
  wrap.style.display = '';

  wrap.innerHTML = `
    <article
      id="player-${escapeHtml(playerId)}"
      class="yat-card yat-card-superfan-synthetic"
      data-name="${escapeHtml(name.toLowerCase())}"
      data-playerid="${escapeHtml(playerId)}"
      data-level="${escapeHtml(level)}"
      data-org="${escapeHtml(org)}"
      data-gradclass="${escapeHtml(classOf)}"
      data-rosteryears=""
      data-status="${escapeHtml(status)}"
      data-slug="${escapeHtml(slug)}"
    >
      <div class="yat-card-inner">
        <div class="yat-flip">
          <a href="/${escapeHtml(schoolId)}/player/${escapeHtml(playerId)}/${escapeHtml(slug)}" style="display:block;height:100%;text-decoration:none;color:inherit;">
            <div class="yat-card-face yat-card-front" style="position:relative;min-height:420px;background:#050505;overflow:hidden;">
              <img src="${escapeHtml(playerFrontImageUrl(playerId))}" alt="${escapeHtml(name)}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:.78;" onerror="this.src='${escapeHtml(playerHeadshotUrl(playerId))}';this.onerror=function(){this.style.display='none'}" />
              <div style="position:absolute;inset:0;background:linear-gradient(to bottom, rgba(0,0,0,.08), rgba(0,0,0,.9));"></div>
              <div style="position:absolute;left:18px;right:18px;bottom:18px;">
                <div style="font:900 42px/0.88 Oswald, sans-serif;text-transform:uppercase;letter-spacing:-.04em;color:#fff;">${escapeHtml(name)}</div>
                <div style="margin-top:10px;font:700 14px/1.1 Oswald, sans-serif;color:#fff;">${escapeHtml(team)}</div>
                ${org ? `<div style="font:400 12px/1.1 Oswald, sans-serif;color:#cfcfcf;">${escapeHtml(org)}</div>` : ''}
                <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:12px;">
                  <span style="border:1px solid rgba(255,255,255,.35);border-radius:5px;padding:4px 7px;font:700 11px Oswald,sans-serif;color:#fff;text-transform:uppercase;">${escapeHtml(status)}</span>
                  ${level ? `<span style="border:1px solid rgba(255,255,255,.35);border-radius:5px;padding:4px 7px;font:700 11px Oswald,sans-serif;color:#fff;text-transform:uppercase;">${escapeHtml(level)}</span>` : ''}
                  ${classOf ? `<span style="border:1px solid rgba(255,255,255,.35);border-radius:5px;padding:4px 7px;font:700 11px Oswald,sans-serif;color:#fff;text-transform:uppercase;">CLASS OF ${escapeHtml(classOf)}</span>` : ''}
                </div>
                <div style="margin-top:14px;font:700 10px Oswald,sans-serif;color:#ffd166;text-transform:uppercase;letter-spacing:.08em;">Super Fan Favorite</div>
              </div>
            </div>
          </a>
        </div>
      </div>
    </article>
  `;

  return wrap;
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

function applyFavoriteDeck(players: FavoritePlayer[], enabled: boolean, currentHsid: string) {
  const grid = currentGrid();
  if (!grid) return;

  const items = getGridCardItems(grid);
  ensureOriginalOrder(items);

  if (!enabled) {
    restoreOriginalGridOrder(grid, items);
    syncInteractionStrip([], false, currentHsid);
    window.dispatchEvent(new CustomEvent('yat:favorites-filter-changed', { detail: { enabled, playerIds: [] } }));
    return;
  }

  removeSyntheticFavorites(grid);

  const freshItems = getGridCardItems(grid).filter((item) => item.dataset.superfanSynthetic !== 'true');
  const itemByPlayerId = new Map<string, HTMLElement>();

  freshItems.forEach((item) => {
    const playerId = getItemPlayerId(item);
    if (playerId && !itemByPlayerId.has(playerId)) itemByPlayerId.set(playerId, item);
    item.style.display = 'none';
  });

  players.forEach((player) => {
    const playerId = String(player.player_id);
    const existing = itemByPlayerId.get(playerId);
    if (existing) {
      existing.style.display = '';
      grid.appendChild(existing);
      return;
    }
    grid.appendChild(createSyntheticFavoriteCard(player, currentHsid));
  });

  syncInteractionStrip(players, true, currentHsid);
  window.dispatchEvent(new CustomEvent('yat:favorites-filter-changed', { detail: { enabled, playerIds: players.map((p) => String(p.player_id)) } }));
}

function FavoriteLinks({ players, currentHsid }: { players: FavoritePlayer[]; currentHsid: string }) {
  if (!players.length) {
    return <div className="yat-favorite-empty">No favorite players found yet.</div>;
  }

  return (
    <div className="yat-favorite-link-list">
      {players.map((player) => {
        const playerId = String(player.player_id);
        const name = String(player.display_name || playerId);
        const slug = playerSlug(name);
        return (
          <a key={`${player.player_id}-${player.school_id || ''}`} href={`/${player.school_id || currentHsid}/player/${player.player_id}/${slug}`} className="yat-favorite-player-link">
            <img src={playerHeadshotUrl(playerId)} alt="" aria-hidden="true" className="yat-favorite-thumb" onError={(event) => { event.currentTarget.style.visibility = 'hidden'; }} />
            <span>{name}</span>
          </a>
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

  const displayedPlayers = useMemo(() => {
    return showSuperfanList && isSuperfan ? [...homePlayers, ...superfanPlayers] : homePlayers;
  }, [homePlayers, isSuperfan, showSuperfanList, superfanPlayers]);

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
      applyFavoriteDeck([], false, currentHsid);
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
    applyFavoriteDeck(displayedPlayers, showGalleryView, currentHsid);
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
          <h3 style={{ margin: 0 }}>MY FAVORITE PLAYERS</h3>
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

              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" onClick={() => setShowSuperfanList(false)} className={!showSuperfanList ? 'yat-favorite-tab active' : 'yat-favorite-tab'}>
                  Home Team Profile List
                </button>
                <button type="button" onClick={() => setShowSuperfanList(true)} className={showSuperfanList ? 'yat-favorite-tab active' : 'yat-favorite-tab'}>
                  Super Fan Profile List
                </button>
              </div>

              {lockedMessage && <div className="yat-favorite-lock-message">{lockedMessage}</div>}

              {!showSuperfanList ? (
                <div className="yat-favorite-list-wrap">
                  <FavoriteLinks players={homePlayers} currentHsid={currentHsid} />
                </div>
              ) : !isSuperfan ? (
                <div className="yat-favorite-list-wrap" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div className="yat-favorite-lock-message">
                    Super Fan access unlocks cross-school favorite player lists.
                  </div>
                  <button type="button" onClick={() => openAccountDrawer('register')} style={{ padding: '10px 12px', border: '1px solid var(--line)', borderRadius: 8, background: '#ffd166', color: '#111', font: '700 12px Oswald, sans-serif', textTransform: 'uppercase', cursor: 'pointer' }}>
                    Become a Super Fan
                  </button>
                </div>
              ) : (
                <div className="yat-favorite-list-wrap yat-favorite-two-col">
                  <FavoriteLinks players={homePlayers} currentHsid={currentHsid} />
                  <FavoriteLinks players={superfanPlayers} currentHsid={currentHsid} />
                </div>
              )}
            </>
          )}
        </div>
      </aside>

      <style jsx global>{`
        body.drawer-favorites-open #drawerFavorites { transform: translateX(0); }
        body.drawer-favorites-open .yat-drawer-mask { opacity: 1; pointer-events: auto; }

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

        #drawerFavorites .yat-favorite-two-col {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 14px;
        }

        #drawerFavorites .yat-favorite-link-list {
          display: flex;
          flex-direction: column;
        }

        #drawerFavorites .yat-favorite-player-link {
          display: flex;
          align-items: center;
          gap: 10px;
          min-height: 44px;
          padding: 8px 0;
          border-bottom: 1px solid var(--line);
          color: var(--ink);
          font: 400 14px Oswald, sans-serif;
          letter-spacing: 0;
          text-transform: uppercase;
          text-decoration: none;
        }

        #drawerFavorites .yat-favorite-player-link:hover {
          color: var(--fg);
        }

        #drawerFavorites .yat-favorite-player-link span {
          display: block;
          min-width: 0;
          white-space: normal;
        }

        #drawerFavorites .yat-favorite-thumb {
          width: 28px;
          height: 28px;
          object-fit: cover;
          border-radius: 3px;
          flex: 0 0 auto;
          background: rgba(255,255,255,.08);
        }
      `}</style>
    </>
  );
}
