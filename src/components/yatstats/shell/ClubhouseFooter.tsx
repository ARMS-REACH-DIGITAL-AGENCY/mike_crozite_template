'use client';

import { Doto } from 'next/font/google';

const tickerDateFont = Doto({ subsets: ['latin'], weight: ['700', '900'], display: 'swap' });

import { useState } from 'react';

type Message = { text: string; kind: 'clubhouse' | 'player' | 'sponsor' | 'tournament'; image?: string };
const messages: Message[] = [
  { kind: 'clubhouse', text: "Explore the stories behind your school's active alumni." },
  { kind: 'player', text: 'Follow your favorite alumni from high school to the big leagues.', image: '/img/player-silhouette.png' },
  { kind: 'tournament', text: 'Follow your school in the YAT?STATS World Series.', image: '/img/world-series-trophy-cta.png' },
  { kind: 'sponsor', text: 'Local partners help keep your baseball community connected.' },
];
function Icon({ kind }: { kind: 'fans' | 'players' | 'coaches' | 'partners' | 'faq' }) {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return <svg viewBox="0 0 32 32" width="25" height="25" aria-hidden="true" {...common}>
    {kind === 'fans' && <><circle cx="16" cy="9" r="5"/><path d="M5 27v-4c0-6 5-10 11-10s11 4 11 10v4M9 27h14"/></>}
    {kind === 'players' && <><circle cx="16" cy="8" r="4"/><path d="m11 15-4 8m14-8 4 8M11 15l5 4 5-4M16 19v9M8 28h16"/></>}
    {kind === 'coaches' && <><path d="M7 25 25 7M5 21l6 6M21 5l6 6"/><circle cx="24" cy="23" r="5"/><path d="m21 20 6 6m0-6-6 6"/></>}
    {kind === 'faq' && <><circle cx="16" cy="16" r="12"/><path d="M12 12a4 4 0 1 1 6 3.5c-2 1-2 2-2 4"/><circle cx="16" cy="24" r="1" fill="currentColor" stroke="none"/></>}
    {kind === 'partners' && <><path d="m3 16 7-5 7 4 5-3 7 4-10 10-6-3-4 1zM10 11l5-4 7 5M13 23l4-4m-1 6 5-5"/></>}
  </svg>;
}
export default function ClubhouseFooter({ activeAlumni }: { activeAlumni: number | null }) {
  const [index, setIndex] = useState(0);
  const message = messages[index];
  const nav = [
    { label: 'FANS', kind: 'fans' as const, href: '/#fans' },
    { label: 'PLAYERS', kind: 'players' as const, href: '/#players' },
    { label: 'COACHES', kind: 'coaches' as const, href: '/#coaches' },
    { label: 'PARTNERS', kind: 'partners' as const, href: '/#partners' },
  ];
  return <div className="yat-clubhouse" aria-label="YaTi's clubhouse">
    <div className="yat-clubhouse-facts">
      <div className="yat-clubhouse-hero">
        <img src={message.image || 'https://yatstats-assets.s3.us-west-2.amazonaws.com/yatstats/YaTi.png'} alt="" />
      </div>
      <div className="yat-clubhouse-message">
        <span aria-live="polite">{message.text}</span>
        <div className="yat-clubhouse-fact-controls">
          <button type="button" onClick={() => setIndex((index + messages.length - 1) % messages.length)} aria-label="Previous message">‹</button>
          <span>{index + 1}/{messages.length}</span>
          <button type="button" onClick={() => setIndex((index + 1) % messages.length)} aria-label="Next message">›</button>
        </div>
      </div>
      <div className="yat-clubhouse-count"><strong>{activeAlumni ?? '—'}</strong><span>ACTIVE<br/>ALUMNI</span></div>
    </div>
    {/* Shared ticker design: identical Doto font and status styling as BracketTicker. */}
    <style jsx global>{`
      .yat-clubhouse-nav {
        display:block !important;
        position:relative !important;
        overflow:hidden !important;
        background-color:#070503 !important;
        background-image:radial-gradient(rgba(255,160,40,.07) 1px,transparent 1.4px) !important;
        background-size:4px 4px !important;
        border-top:1px solid #1d1408 !important;
      }
      .yat-clubhouse-marquee {
        display:flex !important;
        align-items:center;
        height:100%;
        width:max-content;
        min-width:max-content;
        animation:yat-clubhouse-crawl 38s linear infinite !important;
        will-change:transform;
      }
      .yat-clubhouse-marquee:hover,.yat-clubhouse-marquee:focus-within {animation-play-state:paused !important;}
      .yat-clubhouse-copy {display:flex;align-items:center;flex:none;gap:24px;height:100%;padding:0 24px;}
      .yat-clubhouse-nav .yat-clubhouse-intro {
        display:flex !important;align-items:center;flex:none !important;width:auto !important;
        height:100%;padding:0 12px !important;white-space:nowrap;
        color:#ff7a1a !important;text-decoration:none !important;
        font-size:11px !important;font-weight:700 !important;line-height:1 !important;
        text-shadow:0 0 3px rgba(255,110,20,.9) !important;
      }
      .yat-clubhouse-intro strong {color:#ffb238 !important;font-weight:900;margin-right:12px;}
      .yat-clubhouse-nav .yat-clubhouse-copy > a:not(.yat-clubhouse-intro) {
        display:flex !important;flex:none !important;flex-direction:column !important;
        align-items:center !important;justify-content:center !important;gap:4px;
        width:78px !important;min-width:78px !important;height:100% !important;
        background:transparent !important;text-decoration:none !important;
      }
      .yat-clubhouse-nav .yat-clubhouse-copy svg {
        color:#ffb238 !important;
        filter:drop-shadow(0 0 2px rgba(255,170,40,.48));
      }
      .yat-clubhouse-nav .yat-clubhouse-copy small {
        display:block !important;
        font-family:inherit !important;font-size:11px !important;
        font-weight:700 !important;line-height:1 !important;
        letter-spacing:0 !important;color:#ff7a1a !important;
        -webkit-text-fill-color:#ff7a1a !important;
        text-shadow:0 0 3px rgba(255,110,20,.9) !important;
        background:none !important;filter:none !important;
      }
      @keyframes yat-clubhouse-crawl {
        from {transform:translate3d(0,0,0);}
        to {transform:translate3d(-50%,0,0);}
      }
      @media (prefers-reduced-motion:reduce) {
        .yat-clubhouse-marquee {animation:none !important;}
        .yat-clubhouse-nav {overflow-x:auto !important;}
      }
    `}</style>
    <nav className="yat-clubhouse-nav" aria-label="Explore YAT?STATS">
      <div className={`yat-clubhouse-marquee ${tickerDateFont.className}`}>
        {[0,1].map(copy => <div className="yat-clubhouse-copy" key={copy} aria-hidden={copy === 1 ? true : undefined}>
          <a className="yat-clubhouse-intro" href="https://yatstats.com/" tabIndex={copy === 1 ? -1 : undefined}>
            <strong>WELCOME TO YAT?STATS</strong>
            NEW HERE? START HERE FOR A GUIDED TOUR. EXPLORE THE PLATFORM AS A FAN, PLAYER, COACH OR PARTNER.
          </a>
          {nav.map(item => <a key={item.label} href="https://yatstats.com/" tabIndex={copy === 1 ? -1 : undefined}>
            <Icon kind={item.kind}/><small>{item.label}</small>
          </a>)}
        </div>)}
      </div>
    </nav>
  </div>;
}
