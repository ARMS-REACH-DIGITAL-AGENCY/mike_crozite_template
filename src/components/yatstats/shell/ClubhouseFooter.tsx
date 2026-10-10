'use client';

import { Doto } from 'next/font/google';

const tickerDateFont = Doto({ subsets: ['latin'], weight: ['700', '900'], display: 'swap' });

import { useEffect, useRef, useState } from 'react';

type Message = { text: string; kind: 'clubhouse' | 'player' | 'sponsor' | 'tournament'; image?: string };
const messages: Message[] = [
  { kind: 'clubhouse', text: "Explore the stories behind your school's active alumni." },
  { kind: 'player', text: 'Follow your favorite alumni from high school to the big leagues.', image: '/img/player-silhouette.png' },
  { kind: 'tournament', text: 'Follow your school in the YAT?STATS World Series.', image: '/img/world-series-trophy-cta.png' },
  { kind: 'sponsor', text: 'Local partners help keep your baseball community connected.' },
];
function Icon({ kind }: { kind: 'fans' | 'players' | 'schools' | 'partners' }) {
  // LED-matrix silhouettes: the shapes are revealed through illuminated circular bulbs,
  // rather than outlined strokes floating above the scoreboard.
  const id = `clubhouse-led-${kind}`;
  const shapes: Record<typeof kind, React.ReactNode> = {
    fans: <><rect x="4" y="2" width="2.5" height="28" rx="1"/><path d="M8 5 L10 5 L10 8 L13 8 L13 10 L17 10 L17 12 L21 12 L21 14 L26 14 L29 16 L24 19 L19 21 L14 23 L9 24 L8 24 Z"/></>,
    players: <><rect x="5" y="2" width="2.5" height="28" rx="1"/><path d="M10 7 L13 8 L13 11 L18 12 L22 14 L29 16 L22 19 L18 21 L12 23 L10 23 Z"/></>,
    schools: <><path d="M16 2 L30 16 L16 30 L2 16 Z"/><path d="M16 8 L24 16 L16 24 L8 16 Z" fill="black"/><circle cx="16" cy="16" r="2"/><path d="M2 16 L16 30 L30 16" fill="none" stroke="url(#clubhouse-led-schools)" strokeWidth="2"/></>,
    partners: <><path d="M2 9 L7 7 L12 10 L17 8 L22 10 L27 7 L30 10 L30 20 L25 20 L21 24 L17 27 L14 25 L11 27 L8 24 L4 22 L2 20 Z"/><path d="M9 15 L13 13 L17 16 L21 14 L24 17 L21 21 L17 20 L14 23 L11 20 Z" fill="black"/></>,
  };
  return <svg viewBox="0 0 32 32" width="30" height="30" aria-hidden="true" focusable="false">
    <defs>
      <pattern id={id} width="2.6" height="2.6" patternUnits="userSpaceOnUse">
        <circle cx="1.3" cy="1.3" r="1.02" fill="#ffb238"/>
      </pattern>
      <filter id={`${id}-glow`} x="-40%" y="-40%" width="180%" height="180%">
        <feGaussianBlur stdDeviation=".48"/>
      </filter>
    </defs>
    <g fill={`url(#${id})`} opacity=".6" filter={`url(#${id}-glow)`}>{shapes[kind]}</g>
    <g fill={`url(#${id})`}>{shapes[kind]}</g>
  </svg>;
}
export default function ClubhouseFooter({ activeAlumni }: { activeAlumni: number | null }) {
  const [index, setIndex] = useState(0);
  const [tickerPaused, setTickerPaused] = useState(false);
  const resumeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (resumeTimer.current) clearTimeout(resumeTimer.current); }, []);
  const pauseTicker = () => {
    if (resumeTimer.current) clearTimeout(resumeTimer.current);
    setTickerPaused(true);
    resumeTimer.current = setTimeout(() => { setTickerPaused(false); resumeTimer.current = null; }, 5000);
  };
  const message = messages[index];
  const nav = [
    { label: 'FANS', kind: 'fans' as const, href: '/#fans' },
    { label: 'PLAYERS', kind: 'players' as const, href: '/#players' },
    { label: 'SCHOOLS', kind: 'schools' as const, href: '/#schools' },
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
      .yat-clubhouse-lane {
        position:relative; width:100%; height:100%; overflow:hidden;
        -webkit-mask-image:linear-gradient(to right, transparent 0, #000 135px, #000 calc(100% - 35px), transparent 100%);
        mask-image:linear-gradient(to right, transparent 0, #000 135px, #000 calc(100% - 35px), transparent 100%);
      }
      .yat-clubhouse-marquee {
        display:flex !important;
        align-items:center;
        height:100%;
        width:max-content;
        min-width:max-content;
        animation:yat-clubhouse-crawl 38s linear 5s infinite !important;
        will-change:transform;
      }
      .yat-clubhouse-marquee[data-paused='true'] {animation-play-state:paused !important;}
      .yat-clubhouse-copy {display:flex;align-items:center;flex:none;gap:6px;height:100%;padding:0 0 0 105px;}
      .yat-clubhouse-nav .yat-clubhouse-intro {
        display:flex !important;align-items:center;flex:none !important;width:auto !important;
        height:100%;padding:0 12px !important;white-space:nowrap;
        color:#ffb238 !important;text-decoration:none !important;
        font-size:17px !important;font-weight:900 !important;line-height:1.05 !important;
        letter-spacing:.05em !important;
        text-shadow:0 0 3px rgba(255,170,40,.8) !important;
      }
      .yat-clubhouse-intro strong {color:#ffb238 !important;font-weight:900;margin-right:12px;white-space:nowrap;}
      .yat-clubhouse-nav .yat-clubhouse-copy > a:not(.yat-clubhouse-intro) {
        display:flex !important;flex:none !important;flex-direction:column !important;
        align-items:center !important;justify-content:center !important;gap:4px;
        width:76px !important;min-width:76px !important;height:100% !important;
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
      <div className="yat-clubhouse-lane" onTouchStart={pauseTicker} onMouseDown={pauseTicker}>
      <div className={`yat-clubhouse-marquee ${tickerDateFont.className}`} data-paused={tickerPaused}>
        {[0,1].map(copy => <div className="yat-clubhouse-copy" key={copy} aria-hidden={copy === 1 ? true : undefined}>
          {nav.map(item => <a key={item.label} href="https://yatstats.com/" tabIndex={copy === 1 ? -1 : undefined}>
            <Icon kind={item.kind}/><small>{item.label}</small>
          </a>)}
          <a className="yat-clubhouse-intro" href="https://yatstats.com/" tabIndex={copy === 1 ? -1 : undefined}>
            <strong>WELCOME TO YAT?STATS</strong>
            NEW HERE? START HERE FOR A GUIDED TOUR. EXPLORE THE PLATFORM AS A FAN, PLAYER, COACH OR PARTNER.
          </a>
        </div>)}
      </div>
      </div>
    </nav>
  </div>;
}
