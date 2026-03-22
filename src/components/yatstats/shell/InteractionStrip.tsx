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

  const updateScrollState = () => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 0);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth);
  };

  useEffect(() => {
    updateScrollState();
    const el = scrollRef.current;
    if (!el) return;

    el.addEventListener('scroll', updateScrollState);
    window.addEventListener('resize', updateScrollState);

    return () => {
      el.removeEventListener('scroll', updateScrollState);
      window.removeEventListener('resize', updateScrollState);
    };
  }, [players.length, isPlayerProfile, isGallery, isNews]);

  const scrollByAmount = (dir: 'left' | 'right') => {
    const el = scrollRef.current;
    if (!el) return;

    const amount = el.clientWidth * 0.8;
    el.scrollBy({
      left: dir === 'left' ? -amount : amount,
      behavior: 'smooth',
    });
  };

  if (isPlayerProfile) {
    return null;
  }

  if (!isGallery && !isNews) {
    return null;
  }

  return (
    <div className="gallery-strip">
      <button
        type="button"
        className={`gallery-strip-arrow left ${!canScrollLeft ? 'hidden' : ''}`}
        onClick={() => scrollByAmount('left')}
        aria-label="Scroll left"
      >
        ‹
      </button>

      <div ref={scrollRef} className="gallery-strip-inner">
        {players.map((p) => (
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
        ))}
      </div>

      <button
        type="button"
        className={`gallery-strip-arrow right ${!canScrollRight ? 'hidden' : ''}`}
        onClick={() => scrollByAmount('right')}
        aria-label="Scroll right"
      >
        ›
      </button>
    </div>
  );
}
