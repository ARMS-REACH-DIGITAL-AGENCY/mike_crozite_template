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
// The images below are compressed copies of the four user-supplied LED artworks.
const suppliedLedArt = {
  fans: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABELDA8MChEPDg8TEhEUGSobGRcXGTMkJh4qPDU/Pjs1OjlDS2BRQ0daSDk6U3FUWmNma2xrQFB2fnRofWBpa2f/2wBDARITExkWGTEbGzFnRTpFZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2f/wAARCABaAE8DASIAAhEBAxEB/8QAGgAAAgMBAQAAAAAAAAAAAAAAAAEDBAUGAv/EACwQAAEEAgEDAwIHAQEAAAAAAAEAAgMRBCESBRMxIiNBBmEUJDIzQkNRcZH/xAAYAQADAQEAAAAAAAAAAAAAAAAAAgMBBP/EACERAAMAAgICAgMAAAAAAAAAAAABAhExAyESQRMyQlFS/9oADAMBAAIRAxEAPwDhRyop0eH2Q0aO1NjYzsghrbOroC0reBkm+kQuDteEEO5fC3OpdBbjQtkjymyjtteaB1axXMIkq0s2q0NUOdnkcuR8JC+JTA9R2kB6TtOIBvig8rCCPQNoI2NoMDfJAuyivX5QBs7QA28aK0Oj9Rk6dMZICA9zS02L0VntOjpTY59Q9JS2k1hlIeGdX1LqU7GQ4xbMyPIiY1/cYLIvyFl9R6BMMt34SGaSEu4tc5tEmrKudfkbJkYPtzsqNoPdNf8AhU+ZP2Hs4PBHcfoTk/C45bnHidniq2cm6Li5wcCKUdCj/q6aDL6fIwskwIeTuAvuH/dlQu6GMlxdDLjMa9z+Le54AV1y4+ywQfD7RzxA4/dB46V/M6ZLisZyLHcmB44m9FVHsIItvhVVJ6I1DWyP08vsgcbKZ/V4QPJ0mFGOVFS4/K2qJoNHalgB16tJa0POzqfqMSDI6eHmXcbf1gE+filJ1Dmwx26Q+4/+j7Kr18Dv4AE0R9po5MJ1/wBXvqDP2/z0ZPN39h1pcKXUndLMiPuF7uNk2z+tWsZ0paKLv1SeIfsqccbr1ktG2fzKuY+M9wH5mOuUmu4R8K9YFjJcZnTQ4tH1NMLPMHxaeZHjdSy/fkMTnTUQyGqHFQx4TpcejPCKiZrukfKnnhx8CYOnfE4CejxlLjXFR6T62O8ezOzOgvDY34glmuMvd7dVtZeViZGHMY543RvoGnClrS9fcxjWYrXRHtljj3Cb2srMzJ86YyTyue/Qsro4/P8AI5ORR6KwAo7UsHEEG9qIEUdKWCiQK2rVolOzpevOa+fA4yOfUbL9uqVrKgmmewN7pAkcL7H2VX6jEeNPgvdE9je00n3LJWd1Prb5ct34SadkHLk1rn7BqiuKYdJYO35FJoCLDxWtM+TI3Ubq7Qs72op+sw4sYOHLzeJH6fEK4n5WA/IfI4l7nO+BZtRBw4lXXD/RGuf9GlmdbycqFrHuYAGBlNaBoLPe+yNrwSOPjaCRrSrMKdEKtvYzXLykKs7RY5eEAizpMKNpNHSmxybbpQtujtSwEgtsillaGnZ0P1YA0YfFsI9lv7Ztc24nn4XQ/VcrH/hAyaCSoR+0Kr/q503z8hS4PoU5diBPI6SBPE6TF8jtIXxO1YiBJ4DSCTY0g3w+yDdjaDAs8vCYJs6S3y8pi7O0AIDR2j+F2vKPhaBI43XqSI9fleE/lYbkYHqO0Aek7Xn5R8LTD0R6fKCNja8/CEAeq9XlAGzteflAQB//2Q==',
  players: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABELDA8MChEPDg8TEhEUGSobGRcXGTMkJh4qPDU/Pjs1OjlDS2BRQ0daSDk6U3FUWmNma2xrQFB2fnRofWBpa2f/2wBDARITExkWGTEbGzFnRTpFZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2f/wAARCABaAEsDASIAAhEBAxEB/8QAGgAAAgMBAQAAAAAAAAAAAAAAAAECBAYDBf/EACwQAAEEAgICAAUEAgMAAAAAAAEAAgMRBCESMQVBEyIyQlEGUmFxFJEzU7H/xAAZAQADAQEBAAAAAAAAAAAAAAAAAQMEAgX/xAAgEQACAgICAgMAAAAAAAAAAAAAAQIRAyESMQRhEzNB/9oADAMBAAIRAxEAPwDC+xpH50jdjaN72kAehpHs/KjdDae7O0AL7RpMD5vpQAeI37V3x2A/Nyms5cWEgOkokNv8pSkkrZ1GLbpHCLEmnjLooXvDastF0uTmlkhDmEEaIK1olg8fCzHgdGLDRLI17gLD+ysznEOzpS14cC4kEG72pwyOTeis8airK3rr2ke+k/XftBu+1YgGrGka3pG7G0b3tIA1Q0mALPyoo0Nq547BkzstkMbmtLzVuNBJtJWzpK2Lx2C7MnjjFNDnAF7vpH9laAzQeNxTHj0H/DaZHMmI5ODu6pMzReKweGO5zTxY6UtlabIceln8rKmy5QC8lrb4A90Tazbyv0akliXseXnmVhaz4jeVh9uvlu1SNcul6cXhciWFr+cIDgCOUgB2aXDM8dNiFhe5hDwSC1wPulaMoLSIzjN7ZS1XSDV9J0a79oN32qEhasaTABvRRRsdK/4vxsufMWsfG3e+bq9JSkoq2dRi5OkcIcSSUNLInkEgWAe1ojmY3h8ZkUBdb2xyP4vDje7rWl0yMpvjYYIsV0jG3HJQlad0bWbl55E73C3WfZtZ/t76NFfGtdkcvLfklvOyG6br1a9P9OQwumdM4U+JzC08w2jf89qvD4TKlia8GMA8Tt4HZoL0/GY0/jY5i57be1pHCRvp1btGSUeNRYQhLnckcPIZZkkAJOjW3NH3n+F2xWuyMOaAyxgSMDW8pG6+dUMmWTILPiOvjofM39y5zcIsdzXcub2/JTgQPm9pcdUUcu2VMzFOJJwcWOPdsdYXA1fSZ5Ed+0G7WldbMbq9CHHkO1qvFyRT44kxg9r4+DXNEbSCaIvaytmx0pske3lRpcZIc0d48nBnrZGPNcfNj6PD7Wj0V6vifJQYwayRjo/+OyImnq9rPY3kZYIw3hE/5g4F7bOvX9K7i+VjllbHlQwsj+UF7IgXAC1GcG1TRdZIs0LMuLIZGI3vd9GvhsH3FcsjBOUGgNl5NaONNYO3/wBrypMB7YWTwlhjc1rh9IP1GvarNlma5tkar8fuUlD9iyt0etB4WZkjHubJbSD0z99flT8l4v8AyomtfHIJGtqOgwWS890rmHPG/BgLnw8uLbFNu+f9qDix0kdfDNV0GfvP8rjlKx0mqMTkQ/AlfG4EOa4grkav2rfkSTmTUBXxD/6qpu16MXaPPkqYtWNo1vaN2NI3vSZwGqG1NpAcdlQ3Q0mCeR0gZqv09lPnw+DmgiJ0bRTW9cvdr0mEnj8hOm/ZH+8rCtke1o46U/jyXVn/AGsssFu0ao50lTRty9/FgAeOumx/9ipZsskGNJMAbY0OFtYR9ZWU+PJx7P8AtJ0jyaP46tC8en2N+Qq0hTSfEe57jtxs0uZq+07Nde0G76WpGRuw9jaPztL8ITEP0No9n5lFCAJfaNo+76lFHtAEvt7R931KPpCAH679oPfaSEAf/9k=',
  schools: 'data:image/jpeg;base64,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',
  partners: 'data:image/jpeg;base64,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',
};
function Icon({ kind }: { kind: keyof typeof suppliedLedArt }) {
  return <img src={suppliedLedArt[kind]} width={34} height={34} alt="" aria-hidden="true" style={{ width: 34, height: 34, objectFit: 'contain', borderRadius: 0, flexShrink: 0 }} />;
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
        -webkit-mask-image:linear-gradient(to right, transparent 0, #000 78px, #000 calc(100% - 35px), transparent 100%);
        mask-image:linear-gradient(to right, transparent 0, #000 78px, #000 calc(100% - 35px), transparent 100%);
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
      .yat-clubhouse-copy {display:flex;align-items:center;flex:none;gap:2px;height:100%;padding:0 0 0 84px;}
      .yat-clubhouse-nav .yat-clubhouse-intro {
        display:inline-flex !important;flex-direction:row !important;align-items:center !important;justify-content:flex-start !important;flex:none !important;width:max-content !important;min-width:max-content !important;
        height:100%;padding:0 12px !important;white-space:nowrap;
        color:#ffb238 !important;text-decoration:none !important;
        font-size:22px !important;font-weight:900 !important;line-height:1 !important;
        letter-spacing:.05em !important;
        text-shadow:0 0 3px rgba(255,170,40,.8) !important;
      }
      .yat-clubhouse-intro .yat-clubhouse-single-line {display:block !important;white-space:nowrap !important;flex:none !important;font:inherit !important;line-height:1 !important;}
      .yat-clubhouse-nav .yat-clubhouse-copy > a:not(.yat-clubhouse-intro) {
        display:flex !important;flex:none !important;flex-direction:column !important;
        align-items:center !important;justify-content:center !important;gap:4px;
        width:60px !important;min-width:60px !important;height:100% !important;
        background:transparent !important;text-decoration:none !important;
      }
      .yat-clubhouse-nav .yat-clubhouse-copy svg {
        color:#ffb238 !important;
        filter:drop-shadow(0 0 2px rgba(255,170,40,.48));
      }
      .yat-clubhouse-nav .yat-clubhouse-copy small {
        display:block !important;
        font-family:inherit !important;font-size:10px !important;
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
            <span className="yat-clubhouse-single-line">WELCOME TO YAT?STATS — NEW HERE? START HERE FOR A GUIDED TOUR. EXPLORE THE PLATFORM AS A FAN, PLAYER, COACH OR PARTNER.</span>
          </a>
        </div>)}
      </div>
      </div>
    </nav>
  </div>;
}
