'use client';

import { useRef, useState } from 'react';
import type { SponsorCardPublic } from '@/lib/partners/sponsorCardTypes';
import PlayerCardFront from './PlayerCardFront';
import SponsorCardBack from './SponsorCardBack';
import SponsorCardStyles from './SponsorCardStyles';

/** Two faces only. Never mount PlayerCard's stats, profile, or favorite clients. */
export default function SponsorFlipCard({ card }: { card: SponsorCardPublic }) {
  const [flipped, setFlipped] = useState(false);
  const article = useRef<HTMLElement>(null);
  const flip = (focusButton = false) => {
    const next = !flipped;
    setFlipped(next);
    if (focusButton) window.requestAnimationFrame(() => {
      article.current?.querySelector<HTMLButtonElement>(next ? '.yat-sponsor-back-flip' : '.yat-front-flip-button')?.focus({ preventScroll: true });
    });
  };

  return <article
    ref={article}
    className={`yat-card yat-sponsor-card${flipped ? ' is-flipped' : ''}`}
    data-sponsor-card="true"
    data-sponsor-id={card.id}
    data-level="SPONSOR"
    data-name={[card.firstName, card.lastName, card.sponsorName].join(' ')}
    data-org={card.organization}
    data-gradclass={card.gradClass}
    data-rosteryears={card.varsityYears.join(',')}
    role="group"
    aria-roledescription="two-sided sponsor card"
    aria-label={`Sponsor: ${card.sponsorName || [card.firstName, card.lastName].join(' ')}. ${flipped ? 'Back' : 'Front'} of card.`}
    tabIndex={0}
    onClick={event => {
      event.stopPropagation();
      if (!(event.target as Element).closest('a,button,input,select,textarea,[role="region"]')) flip();
    }}
    onKeyDown={event => {
      if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
        event.preventDefault();
        event.stopPropagation();
        flip();
      }
    }}
  >
    <div className="yat-card-inner"><div className="yat-flip">
      <PlayerCardFront sponsor={card} onSponsorFlip={() => flip(true)} sponsorFaceHidden={flipped} />
      <SponsorCardBack card={card} onFlip={() => flip(true)} hidden={!flipped} />
    </div></div>
    <SponsorCardStyles />
  </article>;
}
