'use client';

import { useEffect, useState } from 'react';
import type { SponsorCardPublic, SponsorCardTemplate } from '@/lib/partners/sponsorCardTypes';
import { readSponsorCard } from '@/lib/partners/sponsorCardPresentation';
import { sponsorCardExample } from '@/lib/partners/sponsorCardExamples';
import PlayerCardFront from './PlayerCardFront';
import SponsorCardBack from './SponsorCardBack';
import SponsorCardStyles from './SponsorCardStyles';

const proofFlip = () => {};

/** The frame has no account or database access. Its parent supplies a proof. */
export default function SponsorCardPreview({ example }: { example?: SponsorCardTemplate } = {}) {
  const [card, setCard] = useState<SponsorCardPublic | null>(() => example ? sponsorCardExample(example) : null);
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    if (example) return;
    const receive = (event: MessageEvent<unknown>) => {
      if (window.parent === window || event.source !== window.parent) return;
      const payload = event.data;
      if (!payload || typeof payload !== 'object' || !('type' in payload) || payload.type !== 'yatstats:sponsor-card-preview') return;
      const next = readSponsorCard('card' in payload ? payload.card : null);
      setCard(next);
      setInvalid(!next);
    };
    window.addEventListener('message', receive);
    // This notification contains no data. The parent checks source/origin
    // before posting the authorized card to this frame's exact origin.
    if (window.parent !== window) window.parent.postMessage({ type: 'yatstats:sponsor-card-preview-ready' }, '*');
    return () => window.removeEventListener('message', receive);
  }, [example]);

  return <main className="yat-sponsor-proof-page">
    <header className="yat-sponsor-proof-heading">
      <p className="yat-sponsor-proof-eyebrow">{example ? 'Example layout · Nothing published' : 'Sponsor card proof'}</p>
      <h1>{card ? card.sponsorName || 'Your community partner' : 'Front & back preview'}</h1>
      <p>{example ? 'Fictional names, years, business, and artwork show the shared card layout.' : 'Preview only · Nothing is published from this frame.'}</p>
      {example && <nav className="yat-sponsor-proof-options" aria-label="Example card backs">
        <a href="?example=banner_text" aria-current={example === 'banner_text' ? 'page' : undefined}>Banner & message</a>
        <a href="?example=share_promotion" aria-current={example === 'share_promotion' ? 'page' : undefined}>Community share</a>
        <a href="?example=full_image" aria-current={example === 'full_image' ? 'page' : undefined}>Full image</a>
      </nav>}
    </header>
    {card ? <div className="yat-sponsor-proof-faces" onClick={event => {
      if ((event.target as Element).closest('a,button')) event.preventDefault();
    }}>
      <figure>
        <figcaption>Front · Active Alumni gallery</figcaption>
        <div className="yat-card yat-sponsor-proof-card" aria-label="Sponsor card front">
          <div className="yat-card-inner"><PlayerCardFront sponsor={card} onSponsorFlip={proofFlip} eager /></div>
        </div>
      </figure>
      <figure>
        <figcaption>Back · {card.backTemplate === 'full_image' ? 'Full image' : card.backTemplate === 'share_promotion' ? 'Community share promotion' : 'Banner & message'}</figcaption>
        <div className="yat-card yat-sponsor-proof-card yat-sponsor-proof-back is-flipped" aria-label="Sponsor card back">
          <div className="yat-card-inner"><SponsorCardBack card={card} onFlip={proofFlip} /></div>
        </div>
      </figure>
    </div> : <p className="yat-sponsor-proof-empty" role="status">{invalid ? 'This card could not be displayed. Review the saved fields and request another preview.' : 'Save a sponsor card in the editor to load its front and back here.'}</p>}
    <SponsorCardStyles />
    <style>{`
      body { padding-bottom:0; }
      .yat-sponsor-proof-page { min-height:100dvh; background:#e9e5dd; color:#27231e; padding:24px; font-family:var(--yat-font-ui,Arial,sans-serif); }
      .yat-sponsor-proof-heading { max-width:552px; margin:0 auto 20px; }
      .yat-sponsor-proof-eyebrow { color:#665443; font-size:10px; font-weight:800; letter-spacing:.14em; text-transform:uppercase; margin-bottom:6px; }
      .yat-sponsor-proof-heading h1 { font-size:20px; line-height:1.2; margin:0 0 5px; }
      .yat-sponsor-proof-heading > p:last-child { font-size:11px; line-height:1.4; color:#675f55; }
      .yat-sponsor-proof-heading > p:not(.yat-sponsor-proof-eyebrow) { font-size:11px; line-height:1.4; color:#675f55; }
      .yat-sponsor-proof-options { display:flex; flex-wrap:wrap; gap:7px; margin-top:14px; }
      .yat-sponsor-proof-options a { padding:6px 9px; border:1px solid #b7aa98; border-radius:3px; color:#4e4132; font-size:10px; font-weight:700; text-decoration:none; }
      .yat-sponsor-proof-options a[aria-current="page"] { background:#17382e; border-color:#17382e; color:#fff7e7; }
      .yat-sponsor-proof-faces { display:grid; grid-template-columns:repeat(2,minmax(0,264px)); gap:24px; justify-content:center; align-items:start; }
      .yat-sponsor-proof-faces figure { min-width:0; margin:0; }
      .yat-sponsor-proof-faces figcaption { color:#5c5145; font-size:10px; font-weight:700; line-height:1.3; margin-bottom:9px; }
      .yat-sponsor-proof-card { width:100%; max-width:264px; }
      .yat-sponsor-proof-card .yat-face { box-shadow:0 2px 5px rgba(35,26,17,.14),0 12px 25px rgba(35,26,17,.18); }
      .yat-sponsor-proof-back .yat-back { transform:none; }
      .yat-sponsor-proof-empty { max-width:552px; margin:0 auto; border:1px dashed #b6a99a; padding:32px 24px; font-size:13px; line-height:1.5; }
      @media (max-width:580px) { .yat-sponsor-proof-page { padding:18px; } .yat-sponsor-proof-faces { grid-template-columns:minmax(0,264px); gap:28px; } .yat-sponsor-proof-heading { max-width:264px; } }
    `}</style>
  </main>;
}
