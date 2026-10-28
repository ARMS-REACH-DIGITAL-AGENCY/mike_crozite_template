import type { SponsorCardPublic } from '@/lib/partners/sponsorCardTypes';
import { sponsorCardCopy } from '@/lib/partners/sponsorCardPresentation';

export default function SponsorCardBack({ card, onFlip, hidden = false }: {
  card: SponsorCardPublic;
  onFlip?: () => void;
  hidden?: boolean;
}) {
  const copy = sponsorCardCopy(card);
  const fullImage = card.backTemplate === 'full_image';
  const flip = onFlip ? <button type="button" className={`yat-sponsor-back-flip${fullImage ? ' yat-sponsor-art-flip' : ''}`} onClick={onFlip} aria-label={`Show the front of ${card.sponsorName || 'this sponsor'}'s card`}>↶ Flip card</button> : null;
  const art = card.fullImageUrl
    ? <img src={card.fullImageUrl} alt={card.fullImageAlt || `${card.sponsorName} sponsor artwork`} loading="lazy" decoding="async" />
    : <span className="yat-sponsor-art-placeholder">Full-card artwork will appear here.</span>;

  return <div className="yat-face yat-back yat-sponsor-back" inert={hidden ? true : undefined} aria-hidden={hidden ? true : undefined}>
    <div className="yat-sponsor-paper">
      <div className="yat-sponsor-back-inner">
        {fullImage ? <>
          {copy.ctaUrl ? <a className="yat-sponsor-art" href={copy.ctaUrl} target="_blank" rel="noopener noreferrer sponsored" aria-label={copy.ctaLabel || `Visit ${card.sponsorName}`}>{art}</a> : <div className="yat-sponsor-art">{art}</div>}
          {flip}
        </> : <>
          <div className="yat-sponsor-banner">
            {card.bannerImageUrl ? <img src={card.bannerImageUrl} alt={card.bannerImageAlt || `${card.sponsorName} banner`} loading="lazy" decoding="async" />
              : card.sponsorLogoUrl ? <img className="yat-sponsor-logo" src={card.sponsorLogoUrl} alt={card.sponsorName} loading="lazy" decoding="async" />
                : <span className="yat-sponsor-banner-name">{card.sponsorName || 'Your community partner'}</span>}
          </div>
          <section className="yat-sponsor-funzone" aria-label="Sponsor message">
            <div className="yat-sponsor-kicker">Community partner</div>
            <div className="yat-sponsor-message" tabIndex={0} role="region" aria-label={`${card.sponsorName || 'Community partner'} message`}>
              {copy.headline && <h3>{copy.headline}</h3>}
              {copy.body && <p>{copy.body}</p>}
            </div>
            {(copy.ctaUrl && copy.ctaLabel || flip) && <div className="yat-sponsor-actions">
              {copy.ctaUrl && copy.ctaLabel && <a className="yat-sponsor-cta" href={copy.ctaUrl} target="_blank" rel="noopener noreferrer sponsored">{copy.ctaLabel} ↗</a>}
              {flip}
            </div>}
          </section>
        </>}
      </div>
    </div>
  </div>;
}
