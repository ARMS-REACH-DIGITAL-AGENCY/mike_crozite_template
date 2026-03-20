'use client';

import { useEffect, useRef, useState } from 'react';

type Player = {
  id: string;
  name: string;
  image?: string;
};

export default function InteractionStrip({ players = [] }: { players: Player[] }) {
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
    return () => el.removeEventListener('scroll', updateScrollState);
  }, []);

  const scrollByAmount = (dir: 'left' | 'right') => {
    const el = scrollRef.current;
    if (!el) return;

    const amount = el.clientWidth * 0.8;
    el.scrollBy({
      left: dir === 'left' ? -amount : amount,
      behavior: 'smooth',
    });
  };

  return (
    <div className="gallery-strip">
      <button
        className={`gallery-strip-arrow left ${!canScrollLeft ? 'hidden' : ''}`}
        onClick={() => scrollByAmount('left')}
      >
        ‹
      </button>

      <div ref={scrollRef} className="gallery-strip-inner">
        {players.map((p) => (
          <a key={p.id} href={`#player-${p.id}`} className="gallery-slot">
            <img
              src={p.image || '/placeholder.png'}
              alt={p.name}
              className="gallery-slot-img"
            />
          </a>
        ))}
      </div>

      <button
        className={`gallery-strip-arrow right ${!canScrollRight ? 'hidden' : ''}`}
        onClick={() => scrollByAmount('right')}
      >
        ›
      </button>
    </div>
  );
}
