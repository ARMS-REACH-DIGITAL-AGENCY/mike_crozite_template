'use client';

import { MouseEvent, useEffect, useMemo, useRef, useState } from 'react';

const HEADSHOT_FALLBACK_SRC = '/img/headshot-silhouette.png';
const YAT_ASSETS_BASE = 'https://yatstats-assets.s3.us-west-2.amazonaws.com';
const PLAYER_NOW_BASE = `${YAT_ASSETS_BASE}/players/now`;
const PLAYER_THEN_BASE = `${YAT_ASSETS_BASE}/players/then`;
const UNCOMMITTED_BADGE_SRC = `${YAT_ASSETS_BASE}/colleges/uncommitted.png`;
const PLAYER_GALLERY_SECTIONS = new Set(['active', 'alltime', 'current']);

type Player = {
  id: string;
  name: string;
  image?: string | null;
  nowImage?: string | null;
  thenImage?: string | null;
  currentImage?: string | null;
  fallbackImage?: string | null;
  imageFit?: 'cover' | 'contain';
  status?: string | null;
  isPitcher?: boolean;
};

type InteractionStripProps = {
  isPlayerProfile?: boolean;
  isGallery?: boolean;
  isNews?: boolean;
  players?: Player[];
};

function getLastName(name: string): string {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  return parts.length ? parts[parts.length - 1].toUpperCase() : '';
}

function cleanSrc(value?: string | null): string {
  const text = String(value || '').trim();
  if (!text || text.toLowerCase() === 'null' || text.toLowerCase() === 'undefined') return '';
  return text;
}

function getExtensionFallbackSrc(value?: string | null): string {
  const src = cleanSrc(value);
  if (!src) return '';
  if (/\.jpe?g(?=($|[?#]))/i.test(src)) return src.replace(/\.jpe?g(?=($|[?#]))/i, '.png');
  if (/\.png(?=($|[?#]))/i.test(src)) return src.replace(/\.png(?=($|[?#]))/i, '.jpg');
  return '';
}

function normalizeStatus(value?: string | null): string {
  return String(value || '').trim().toUpperCase();
}

function isHighSchoolStatus(value?: string | null): boolean {
  const status = normalizeStatus(value);
  return status === 'HIGH SCHOOL' || status === 'COMMIT' || status === 'UNCOMMITTED';
}

function getCurrentSection(): string {
  if (typeof window === 'undefined' || typeof document === 'undefined') return 'active';

  const hash = window.location.hash || '';
  if (hash.startsWith('#sec-')) return hash.replace(/^#sec-/, '') || 'active';

  const visible = document.querySelector<HTMLElement>('.yat-section.visible');
  if (visible?.id?.startsWith('sec-')) return visible.id.replace(/^sec-/, '') || 'active';

  return 'active';
}

function escapeSelector(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(value);
  return value.replace(/[^a-zA-Z0-9_-]/g, '');
}

function isCardVisible(card: HTMLElement): boolean {
  const wrapper = card.closest<HTMLElement>('[data-player-card-wrap="true"]');
  return !card.hidden
    && card.style.display !== 'none'
    && (!wrapper || (!wrapper.hidden && wrapper.style.display !== 'none'));
}

function scrollToPlayerCard(playerId: string, sectionKey: string) {
  if (typeof document === 'undefined') return;

  const safeId = String(playerId || '').trim();
  if (!safeId) return;

  const section = document.getElementById(`sec-${sectionKey}`);
  const escapedId = escapeSelector(safeId);
  const target = section?.querySelector<HTMLElement>(`.yat-card[data-playerid="${escapedId}"]`)
    || section?.querySelector<HTMLElement>(`#player-${escapedId}`);

  if (!target) return;

  const wrapper = target.closest<HTMLElement>('[data-player-card-wrap="true"]');
  if (wrapper) {
    wrapper.style.display = '';
    wrapper.hidden = false;
    wrapper.classList.remove('is-hidden');
  }

  target.style.display = '';
  target.hidden = false;
  target.classList.remove('is-hidden');
  target.scrollIntoView({ behavior: 'smooth', block: 'start', inline: 'nearest' });
}

function fallbackPlayersForSection(section: string, players: Player[]): Player[] {
  if (section === 'current') {
    return players.filter((player) => isHighSchoolStatus(player.status));
  }

  if (section === 'alltime') {
    return players.filter((player) => !isHighSchoolStatus(player.status)).map((player) => ({
      ...player,
      image: cleanSrc(player.thenImage) || cleanSrc(player.image),
      imageFit: 'cover',
    }));
  }

  if (section === 'active' || section === 'news') {
    return players
      .filter((player) => {
        const status = normalizeStatus(player.status);
        return !isHighSchoolStatus(status) && status !== 'RETIRED';
      })
      .map((player) => ({
        ...player,
        image: cleanSrc(player.nowImage) || cleanSrc(player.image),
        imageFit: 'cover',
      }));
  }

  return [];
}

function readPlayersFromVisibleBlockFive(
  section: string,
  playersById: Map<string, Player>
): Player[] {
  if (!PLAYER_GALLERY_SECTIONS.has(section)) return [];

  const targetSection = document.getElementById(`sec-${section}`);
  if (!targetSection) return [];

  const seen = new Set<string>();
  const result: Player[] = [];

  targetSection.querySelectorAll<HTMLElement>('.yat-card[data-playerid]').forEach((card) => {
    if (!isCardVisible(card)) return;

    const id = String(card.dataset.playerid || '').trim();
    if (!id || seen.has(id)) return;
    seen.add(id);

    const source = playersById.get(id);
    const rawName = String(source?.name || card.dataset.name || '').trim();
    const name = rawName || `Player ${id}`;
    const nowImage = cleanSrc(card.dataset.thumbnailNow)
      || cleanSrc(source?.nowImage)
      || `${PLAYER_NOW_BASE}/${encodeURIComponent(id)}.jpg`;
    const thenImage = cleanSrc(card.dataset.thumbnailThen)
      || cleanSrc(source?.thenImage)
      || `${PLAYER_THEN_BASE}/${encodeURIComponent(id)}.jpg`;
    const currentImage = cleanSrc(card.dataset.thumbnailCurrent)
      || cleanSrc(source?.currentImage)
      || cleanSrc(source?.image)
      || UNCOMMITTED_BADGE_SRC;

    const isCurrent = section === 'current';
    const isAllTime = section === 'alltime';
    const selectedImage = isCurrent ? currentImage : isAllTime ? thenImage : nowImage;
    const fallbackImage = isCurrent
      ? cleanSrc(card.dataset.thumbnailCurrentFallback) || UNCOMMITTED_BADGE_SRC
      : isAllTime
        ? cleanSrc(card.dataset.thumbnailThenFallback) || HEADSHOT_FALLBACK_SRC
        : cleanSrc(card.dataset.thumbnailNowFallback) || cleanSrc(source?.fallbackImage) || HEADSHOT_FALLBACK_SRC;

    result.push({
      id,
      name,
      image: selectedImage,
      nowImage,
      thenImage,
      currentImage,
      fallbackImage,
      imageFit: isCurrent ? 'contain' : 'cover',
      status: normalizeStatus(card.dataset.status || source?.status),
      isPitcher: source?.isPitcher,
    });
  });

  return result;
}

function playerSignature(players: Player[]): string {
  return players.map((player) => `${player.id}:${cleanSrc(player.image)}:${player.imageFit || 'cover'}`).join('|');
}

export default function InteractionStrip({
  isPlayerProfile = false,
  isGallery = false,
  isNews = false,
  players = [],
}: InteractionStripProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [activeSection, setActiveSection] = useState(getCurrentSection);
  const [sectionPlayers, setSectionPlayers] = useState<Player[]>(() =>
    fallbackPlayersForSection(getCurrentSection(), players)
  );

  const playersById = useMemo(
    () => new Map(players.map((player) => [String(player.id), player])),
    [players]
  );

  const showPlayerStrip = isGallery || isNews || PLAYER_GALLERY_SECTIONS.has(activeSection) || activeSection === 'news';
  const showProfilePlaceholder = isPlayerProfile;
  const isCurrentTeamTab = activeSection === 'current';

  const updateScrollState = () => {
    const el = scrollRef.current;
    if (!el || !showPlayerStrip) return;
    setCanScrollLeft(el.scrollLeft > 0);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  };

  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    let frame = 0;

    const syncFromPage = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const section = getCurrentSection();
        setActiveSection(section);

        const nextPlayers = PLAYER_GALLERY_SECTIONS.has(section)
          ? readPlayersFromVisibleBlockFive(section, playersById)
          : fallbackPlayersForSection(section, players);

        const resolvedPlayers = nextPlayers.length
          ? nextPlayers
          : fallbackPlayersForSection(section, players);

        setSectionPlayers((current) =>
          playerSignature(current) === playerSignature(resolvedPlayers) ? current : resolvedPlayers
        );

        window.setTimeout(updateScrollState, 0);
      });
    };

    syncFromPage();
    window.addEventListener('hashchange', syncFromPage);
    window.addEventListener('popstate', syncFromPage);
    window.addEventListener('yat:gallery-filtered', syncFromPage as EventListener);
    document.addEventListener('click', syncFromPage, true);

    const observer = new MutationObserver(syncFromPage);
    document.querySelectorAll('.yat-section').forEach((section) => {
      observer.observe(section, { attributes: true, attributeFilter: ['class'] });
    });

    const rowFive = document.querySelector('.yat-row5-shell');
    if (rowFive) {
      observer.observe(rowFive, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ['style', 'hidden', 'class'],
      });
    }

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('hashchange', syncFromPage);
      window.removeEventListener('popstate', syncFromPage);
      window.removeEventListener('yat:gallery-filtered', syncFromPage as EventListener);
      document.removeEventListener('click', syncFromPage, true);
      observer.disconnect();
    };
  }, [players, playersById]);

  useEffect(() => {
    updateScrollState();
    const el = scrollRef.current;
    if (!el || !showPlayerStrip) return;

    el.addEventListener('scroll', updateScrollState);
    window.addEventListener('resize', updateScrollState);

    return () => {
      el.removeEventListener('scroll', updateScrollState);
      window.removeEventListener('resize', updateScrollState);
    };
  }, [sectionPlayers.length, showPlayerStrip, isCurrentTeamTab]);

  const scrollByAmount = (direction: 'left' | 'right') => {
    const el = scrollRef.current;
    if (!el || !showPlayerStrip) return;

    el.scrollBy({
      left: direction === 'left' ? -(el.clientWidth * 0.8) : el.clientWidth * 0.8,
      behavior: 'smooth',
    });
  };

  const handleSlotClick = (event: MouseEvent<HTMLAnchorElement>, playerId: string) => {
    event.preventDefault();

    // News keeps its separate delegated player-filter behavior. Player gallery
    // pages use the same thumbnail as an anchor to the matching block-five card.
    if (activeSection !== 'news' && PLAYER_GALLERY_SECTIONS.has(activeSection)) {
      scrollToPlayerCard(playerId, activeSection);
    }
  };

  const shouldRenderPlaceholder = !showPlayerStrip && !showProfilePlaceholder;

  return (
    <>
      <style jsx>{`
        .gallery-slot-link,
        .gallery-current-slot-link {
          display: block;
          text-decoration: none;
          color: inherit;
        }

        .gallery-slot-media {
          position: relative;
          width: 100%;
          height: 100%;
          overflow: hidden;
          background: #000;
        }

        .gallery-current-slot-link .gallery-slot-media {
          display: flex;
          align-items: center;
          justify-content: center;
          background: #000;
        }

        :global(body.light-theme) .gallery-current-slot-link .gallery-slot-media {
          background: #fff;
        }

        .gallery-slot-img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }

        .gallery-slot-img--contain {
          object-fit: contain;
          object-position: center center;
          padding: 5px;
          background: #050505;
        }

        .gallery-current-slot-link .gallery-slot-img--contain {
          object-fit: contain;
          object-position: center center;
          padding: 6px;
          background: transparent;
        }

        .gallery-slot-gradient {
          position: absolute;
          left: 0;
          right: 0;
          bottom: 0;
          height: 50%;
          z-index: 1;
          pointer-events: none;
          background: linear-gradient(to top, rgba(0,0,0,.8) 0%, rgba(0,0,0,.65) 18%, rgba(0,0,0,.45) 34%, rgba(0,0,0,.2) 44%, rgba(0,0,0,0) 100%);
        }

        .gallery-slot-name-overlay {
          position: absolute;
          left: 0;
          right: 0;
          bottom: 4px;
          z-index: 2;
          text-align: center;
          font-size: 10px;
          line-height: 1;
          font-weight: 700;
          letter-spacing: .08em;
          text-transform: uppercase;
          color: #fff;
          text-shadow: 0 1px 3px rgba(0,0,0,.95);
          pointer-events: none;
          padding: 0 4px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
      `}</style>

      <div className="gallery-strip" data-active-section={activeSection} data-react-mirrors-row5="true">
        {showPlayerStrip && (
          <button
            type="button"
            className={`gallery-strip-arrow left ${!canScrollLeft ? 'hidden' : ''}`}
            onClick={() => scrollByAmount('left')}
            aria-label="Scroll left"
          >
            ‹
          </button>
        )}

        <div ref={showPlayerStrip ? scrollRef : null} className="gallery-strip-inner">
          {showPlayerStrip ? (
            sectionPlayers.map((player) => {
              const lastName = getLastName(player.name);
              const fallbackSrc = cleanSrc(player.fallbackImage) || (isCurrentTeamTab ? UNCOMMITTED_BADGE_SRC : HEADSHOT_FALLBACK_SRC);
              const nowSrc = cleanSrc(player.nowImage)
                || `${PLAYER_NOW_BASE}/${encodeURIComponent(player.id)}.jpg`;
              const thenSrc = cleanSrc(player.thenImage)
                || `${PLAYER_THEN_BASE}/${encodeURIComponent(player.id)}.jpg`;
              const currentSrc = cleanSrc(player.currentImage) || UNCOMMITTED_BADGE_SRC;
              const displaySrc = cleanSrc(player.image)
                || (isCurrentTeamTab ? currentSrc : activeSection === 'alltime' ? thenSrc : nowSrc);
              const status = normalizeStatus(player.status);
              const imageFit = player.imageFit === 'contain' ? 'contain' : 'cover';
              const linkClassName = isCurrentTeamTab
                ? 'gallery-slot gallery-current-slot-link'
                : 'gallery-slot gallery-slot-link';

              return (
                <a
                  key={`${activeSection}-${player.id}`}
                  href={`#player-${encodeURIComponent(player.id)}`}
                  className={linkClassName}
                  data-playerid={player.id}
                  data-status={status}
                  data-default-hidden={status === 'RETIRED' ? 'retired' : undefined}
                  title={player.name}
                  onClick={(event) => handleSlotClick(event, player.id)}
                >
                  <div className="gallery-slot-media">
                    <img
                      src={displaySrc}
                      alt={player.name}
                      className={imageFit === 'contain' ? 'gallery-slot-img gallery-slot-img--contain' : 'gallery-slot-img'}
                      data-now-src={nowSrc}
                      data-then-src={thenSrc}
                      data-current-src={currentSrc}
                      onError={(event) => {
                        const image = event.currentTarget;

                        if (image.dataset.extensionFallbackApplied !== 'true') {
                          const alternateSrc = getExtensionFallbackSrc(image.getAttribute('src'));
                          if (alternateSrc && alternateSrc !== image.getAttribute('src')) {
                            image.dataset.extensionFallbackApplied = 'true';
                            image.src = alternateSrc;
                            return;
                          }
                        }

                        if (image.dataset.fallbackApplied === 'true') return;
                        image.dataset.fallbackApplied = 'true';
                        image.src = fallbackSrc;
                      }}
                    />
                    {!isCurrentTeamTab && <div className="gallery-slot-gradient" />}
                    {lastName ? <div className="gallery-slot-name-overlay">{lastName}</div> : null}
                  </div>
                </a>
              );
            })
          ) : (
            <div
              aria-hidden="true"
              data-shell-placeholder={shouldRenderPlaceholder ? 'true' : undefined}
              style={{ width: '100%', minHeight: '100%' }}
            />
          )}
        </div>

        {showPlayerStrip && (
          <button
            type="button"
            className={`gallery-strip-arrow right ${!canScrollRight ? 'hidden' : ''}`}
            onClick={() => scrollByAmount('right')}
            aria-label="Scroll right"
          >
            ›
          </button>
        )}
      </div>
    </>
  );
}
