'use client';

// A sponsor's 5x7 flip card in a school gallery (src/lib/sponsorFlipCards.ts).
// Same card shell as a player card (.yat-card > .yat-card-inner > .yat-flip
// with a front and a back face), so it has the same size, frame and flip.
// It deliberately has no data-playerid: the gallery's player scripts
// (filters, sorts, favorites, Flip All, the headshot strip, the alumni
// count) only look at cards with a playerid, so they leave it alone.
import { useCallback, useState, type KeyboardEvent, type MouseEvent } from 'react';
import type { SponsorFlipCard as Sponsor, SponsorSection } from '@/lib/sponsorFlipCards';

export default function SponsorFlipCard({ sponsor, section, eager = false }: {
  sponsor: Sponsor; section: SponsorSection; eager?: boolean;
}) {
  const [flipped, setFlipped] = useState(false);
  const toggle = useCallback(() => setFlipped((v) => !v), []);
  const onClick = (event: MouseEvent<HTMLElement>) => {
    if ((event.target as Element).closest('a')) return;
    // The page also has a delegated card-click handler; this card flips itself.
    event.stopPropagation();
    toggle();
  };
  const onKey = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    toggle();
  };
  const url = String(sponsor.destinationUrl || '').trim();
  return (
    <div
      data-player-card-wrap="true"
      data-sponsor-wrap={section}
      data-sponsor-id={sponsor.id}
    >
      <article
        className={'yat-card yat-sponsor-card' + (flipped ? ' is-flipped' : '')}
        data-sponsor-card="true"
        data-sponsor-id={sponsor.id}
        role="button"
        tabIndex={0}
        aria-pressed={flipped}
        aria-label={`${sponsor.sponsorName} sponsor card. Tap to flip.`}
        onClick={onClick}
        onKeyDown={onKey}
      >
        <div className="yat-card-inner">
          <div className="yat-flip">
            <div className="yat-face yat-front yat-sponsor-face">
              <img src={sponsor.frontImage} alt={sponsor.frontAlt} loading={eager ? 'eager' : 'lazy'} decoding="async" />
              <span className="yat-sponsor-badge">FOUNDING PARTNER</span>
            </div>
            <div className="yat-face yat-back yat-sponsor-face">
              <img src={sponsor.backImage} alt={sponsor.backAlt} loading="lazy" decoding="async" />
              {url && (
                <a className="yat-sponsor-cta" href={url} target="_blank" rel="noopener sponsored"
                  aria-label={`${sponsor.sponsorName}: see if you qualify`} />
              )}
            </div>
          </div>
        </div>
      </article>
      <style>{`
        .yat-sponsor-card{cursor:pointer}
        .yat-sponsor-card:focus-visible{outline:3px solid #e5ba42;outline-offset:3px}
        .yat-sponsor-face{overflow:hidden;background:#0b0b0b}
        .yat-sponsor-face>img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block}
        .yat-sponsor-badge{position:absolute;top:6px;right:6px;z-index:2;padding:2px 5px;border-radius:3px;background:rgba(0,0,0,.62);color:#ffd84a;font:800 8px/1 Oswald,Arial,sans-serif;letter-spacing:.08em}
        .yat-sponsor-cta{position:absolute;left:8%;right:8%;bottom:4%;height:12%;z-index:2;border-radius:6px}
        .yat-sponsor-cta:focus-visible{outline:3px solid #fff}
      `}</style>
    </div>
  );
}
