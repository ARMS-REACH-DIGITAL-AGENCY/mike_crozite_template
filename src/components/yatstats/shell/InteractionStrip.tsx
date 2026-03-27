'use client';

import { useEffect, useRef, useState } from 'react';

type Player = {
  id: string;
  name: string;
  image?: string;
};

type InteractionStripProps = {
  isPlayerProfile?: boolean;
  isGallery?: boolean;
  isNews?: boolean;
  players?: Player[];
};

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
          players.map((p) => (
            <a key={p.id} href={`#player-${p.id}`} className="gallery-slot" title={p.name}>
              <img
                src={p.image || '/img/headshot-silhouette.png'}
                alt={p.name}
                className="gallery-slot-img"
                onError={(e) => {
                  const fallback = '/img/headshot-silhouette.png';
                  if (e.currentTarget.src !== window.location.origin + fallback) {
                    e.currentTarget.src = fallback;
                  }
                }}
              />
            </a>
          ))
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
  );
}
