'use client';

import { useEffect, useRef, useState } from 'react';
import { getNowSilhouetteUrl } from '@/lib/playerImage';

type Player = {
  id: string;
  name: string;
  image?: string | null;
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

export default function InteractionStrip({
  isPlayerProfile = false,
  isGallery = false,
  isNews = false,
  players = [],
}: InteractionStripProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const showActiveStrip = isGallery || isNews;
  const showProfilePlaceholder = isPlayerProfile;

  const updateScrollState = () => {
    const el = scrollRef.current;
    if (!el || !showActiveStrip) return;
    setCanScrollLeft(el.scrollLeft > 0);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth);
  };

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
  }, [players.length, showActiveStrip]);

  const scrollByAmount = (dir: 'left' | 'right') => {
    const el = scrollRef.current;
    if (!el || !showActiveStrip) return;

    const amount = el.clientWidth * 0.8;
    el.scrollBy({
      left: dir === 'left' ? -amount : amount,
      behavior: 'smooth',
    });
  };

  if (!showActiveStrip && !showProfilePlaceholder) {
    return null;
  }

  return (
    <>
      <style jsx>{`
        .gallery-slot-link {
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

        .gallery-slot-img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
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

      <div className="gallery-strip">
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
            players.map((p) => {
              const lastName = getLastName(p.name);
             const fallbackSrc = '/img/headshot-silhouette.png';
              const initialSrc =
                p.image && p.image.trim() !== '' ? p.image : fallbackSrc;

              return (
                <a
                  key={p.id}
                  href="javascript:void(0)"
                  className="gallery-slot gallery-slot-link"
                  data-playerid={p.id}
                  title={p.name}
                >
                  <div className="gallery-slot-media">
                    <img
                      src={initialSrc}
                      alt={p.name}
                      className="gallery-slot-img"
                      onError={(e) => {
                        if (!e.currentTarget.src.endsWith(fallbackSrc)) {
                          e.currentTarget.src = fallbackSrc;
                        }
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
