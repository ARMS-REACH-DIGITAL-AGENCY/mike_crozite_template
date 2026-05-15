'use client';

import { MouseEvent, useEffect, useMemo, useRef, useState } from 'react';

const HEADSHOT_FALLBACK_SRC = '/img/headshot-silhouette.png';

type Player = {
  id: string;
  name: string;
  image?: string | null;
  nowImage?: string | null;
  thenImage?: string | null;
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
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 0) return '';
  return parts[parts.length - 1].toUpperCase();
}

function cleanSrc(value?: string | null): string {
  const text = String(value || '').trim();
  if (!text || text.toLowerCase() === 'null' || text.toLowerCase() === 'undefined') return '';
  return text;
}

function normalizeStatus(value?: string | null): string {
  return String(value || '').trim().toUpperCase();
}

function isHighSchoolStatus(value?: string | null): boolean {
  const status = normalizeStatus(value);
  return status === 'HIGH SCHOOL' || status === 'COMMIT' || status === 'UNCOMMITTED';
}

function getSectionFromDom(): string {
  if (typeof document === 'undefined') return '';
  const visible = document.querySelector('.yat-section.visible');
  if (!visible?.id) return '';
  return visible.id.replace(/^sec-/, '') || '';
}

function getSectionFromHash(): string {
  if (typeof window === 'undefined') return '';
  const hash = window.location.hash || '';
  if (!hash.startsWith('#sec-')) return '';
  return hash.replace('#sec-', '') || '';
}

function getCurrentSection(): string {
  return getSectionFromDom() || getSectionFromHash() || 'active';
}

function scrollToPlayerCard(playerId: string, isCurrentTeamTab: boolean) {
  if (typeof document === 'undefined') return;

  const safeId = String(playerId || '').trim();
  if (!safeId) return;

  const section = isCurrentTeamTab
    ? document.getElementById('sec-current')
    : document.getElementById('sec-active') || document.getElementById('sec-alltime');

  const target =
    section?.querySelector(`#player-${CSS.escape(safeId)}`) ||
    section?.querySelector(`.yat-card[data-playerid="${CSS.escape(safeId)}"]`) ||
    document.getElementById(`player-${safeId}`) ||
    document.querySelector(`.yat-card[data-playerid="${CSS.escape(safeId)}"]`);

  if (!target) return;

  const wrap = target.closest('[data-player-card-wrap="true"]') as HTMLElement | null;
  if (wrap) {
    wrap.style.display = '';
    wrap.removeAttribute('hidden');
    wrap.classList.remove('is-hidden');
  }

  (target as HTMLElement).style.display = '';
  target.removeAttribute('hidden');
  target.classList.remove('is-hidden');
  target.scrollIntoView({ behavior: 'smooth', block: 'start', inline: 'nearest' });
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

  const showActiveStrip = isGallery || isNews;
  const showProfilePlaceholder = isPlayerProfile;
  const isCurrentTeamTab = activeSection === 'current';

  const visiblePlayers = useMemo(() => {
    if (!showActiveStrip) return [];

    return players.filter((p) => {
      const isHighSchool = isHighSchoolStatus(p.status);
      return isCurrentTeamTab ? isHighSchool : !isHighSchool;
    });
  }, [players, showActiveStrip, isCurrentTeamTab]);

  const updateScrollState = () => {
    const el = scrollRef.current;
    if (!el || !showActiveStrip) return;
    setCanScrollLeft(el.scrollLeft > 0);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth);
  };

  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    let frame = 0;

    const syncSection = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        setActiveSection(getCurrentSection());
        window.setTimeout(updateScrollState, 0);
      });
    };

    syncSection();

    window.addEventListener('hashchange', syncSection);
    window.addEventListener('popstate', syncSection);
    document.addEventListener('click', syncSection, true);

    const observer = new MutationObserver(syncSection);
    document.querySelectorAll('.yat-section').forEach((section) => {
      observer.observe(section, { attributes: true, attributeFilter: ['class'] });
    });

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('hashchange', syncSection);
      window.removeEventListener('popstate', syncSection);
      document.removeEventListener('click', syncSection, true);
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!showActiveStrip) return;

    updateScrollState();
    const el = scrollRef.current;
    if (!el) return;

    el.addEventListener('scroll', updateScrollState);
    window.addEventListener('resize', updateScrollState);

    return () => {
      el.removeEventListener('scroll', updateScrollState);
      window.removeEventListener('resize', updateScrollState);
    };
  }, [visiblePlayers.length, showActiveStrip, isCurrentTeamTab]);

  const scrollByAmount = (dir: 'left' | 'right') => {
    const el = scrollRef.current;
    if (!el || !showActiveStrip) return;

    const amount = el.clientWidth * 0.8;
    el.scrollBy({
      left: dir === 'left' ? -amount : amount,
      behavior: 'smooth',
    });
  };

  const handleSlotClick = (event: MouseEvent<HTMLAnchorElement>, playerId: string) => {
    event.preventDefault();

    if (isCurrentTeamTab) {
      scrollToPlayerCard(playerId, true);
    }
  };

  if (!showActiveStrip && !showProfilePlaceholder) {
    return null;
  }

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
          background: linear-gradient(
            to top,
            rgba(0, 0, 0, 0.8) 0%,
            rgba(0, 0, 0, 0.65) 18%,
            rgba(0, 0, 0, 0.45) 34%,
            rgba(0, 0, 0, 0.2) 44%,
            rgba(0, 0, 0, 0) 100%
          );
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
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: #fff;
          text-shadow: 0 1px 3px rgba(0, 0, 0, 0.95);
          pointer-events: none;
          padding: 0 4px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
      `}</style>

      <div className="gallery-strip" data-active-section={activeSection}>
        {showActiveStrip && (
          <button
            type="button"
            className={`gallery-strip-arrow left ${!canScrollLeft ? 'hidden' : ''}`}
            onClick={() => scrollByAmount('left')}
            aria-label="Scroll left"
          >
            ‹
          </button>
        )}

        <div ref={showActiveStrip ? scrollRef : null} className="gallery-strip-inner">
          {showActiveStrip ? (
            visiblePlayers.map((p) => {
              const lastName = getLastName(p.name);
              const fallbackSrc = cleanSrc(p.fallbackImage) || HEADSHOT_FALLBACK_SRC;
              const nowSrc = cleanSrc(p.nowImage) || cleanSrc(p.image) || fallbackSrc;
              const thenSrc = cleanSrc(p.thenImage) || nowSrc;
              const initialSrc = nowSrc;
              const status = normalizeStatus(p.status);
              const isRetired = status === 'RETIRED';
              const imageFit = p.imageFit === 'contain' ? 'contain' : 'cover';
              const linkClassName = isCurrentTeamTab
                ? 'gallery-slot gallery-current-slot-link'
                : 'gallery-slot gallery-slot-link';

              return (
                <a
                  key={`${activeSection}-${p.id}`}
                  href="javascript:void(0)"
                  className={linkClassName}
                  data-playerid={p.id}
                  data-status={status}
                  data-default-hidden={isRetired ? 'retired' : undefined}
                  style={{ display: isRetired ? 'none' : undefined }}
                  title={p.name}
                  onClick={(event) => handleSlotClick(event, p.id)}
                >
                  <div className="gallery-slot-media">
                    <img
                      src={initialSrc}
                      alt={p.name}
                      className={imageFit === 'contain' ? 'gallery-slot-img gallery-slot-img--contain' : 'gallery-slot-img'}
                      data-now-src={nowSrc}
                      data-then-src={thenSrc}
                      onError={(e) => {
                        const img = e.currentTarget;

                        if (img.dataset.fallbackApplied === 'true') return;

                        img.dataset.fallbackApplied = 'true';
                        img.src = fallbackSrc;
                      }}
                    />
                    <div className="gallery-slot-gradient" />
                    {lastName ? (
                      <div className="gallery-slot-name-overlay">{lastName}</div>
                    ) : null}
                  </div>
                </a>
              );
            })
          ) : (
            <div aria-hidden="true" style={{ width: '100%', minHeight: '100%' }} />
          )}
        </div>

        {showActiveStrip && (
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
