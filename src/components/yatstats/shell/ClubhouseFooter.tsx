'use client';

import { Doto } from 'next/font/google';

const tickerDateFont = Doto({ subsets: ['latin'], weight: ['700', '900'], display: 'swap' });

import { useContext, useEffect, useRef, useState } from 'react';
import { SchoolContext } from '@/context/SchoolContext';

type Message = { text: string; kind: 'clubhouse' | 'player' | 'sponsor' | 'tournament'; image?: string };
const messages: Message[] = [
  { kind: 'clubhouse', text: "Explore the stories behind your school's active alumni." },
  { kind: 'player', text: 'Follow your favorite alumni from high school to the big leagues.', image: '/img/player-silhouette.png' },
  { kind: 'tournament', text: 'Follow your school in the YAT?STATS World Series.', image: '/img/world-series-trophy-cta.png' },
  { kind: 'sponsor', text: 'Local partners help keep your baseball community connected.' },
];
// The images below are compressed copies of the four user-supplied LED artworks.
const suppliedLedArt = {
  fans: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAwICQsJCAwLCgsODQwOEh4UEhEREiUbHBYeLCcuLisnKyoxN0Y7MTRCNCorPVM+QkhKTk9OLztWXFVMW0ZNTkv/2wBDAQ0ODhIQEiQUFCRLMisyS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0v/wAARCABAADgDASIAAhEBAxEB/8QAGwAAAgMBAQEAAAAAAAAAAAAAAAYBAgUEBwP/xAAwEAABAgUDAgMGBwAAAAAAAAABAAIDBBEhMQUSIjJBE1FhBhYjYnGRFCYzQlKBsf/EABcBAQEBAQAAAAAAAAAAAAAAAAMEAAL/xAAfEQACAgICAwEAAAAAAAAAAAAAAQIDERIhMQQycSL/2gAMAwEAAhEDEQA/APLRgcu6ttJDyCpZhuMp50eJo0LRIgibi07DG3MYXbuXTW9MILbNFnGR6q9xE/d1dlHZvJaep6dGk5ja5rCHMDwWkOFCKjHdZ200bhJGSkso4lBxeGUODy7qSbnl2UkGjsZQa1OMLo4IB6eSECvHCFjFmiw4901aWH+6OpAQXlpiw6uBbQfXv9kqilBnKatKdDHsnqYI5+LDpUD1/tT39L6imjtmvNzEaDIwGlsSLBdD5sNQCNrK32rJiSWmajCYIEuJOJ3e5z3A2cfL0C69UjQfwMvtY4fDIPwx/FnqsWXiQhs66jPG2Heqmrj+crgtnhvDLznstMw4ZfKkTQqf0mOtQD09VjTMnGlorocaA6G8WLXChCaYUwWMcYBcHVPl8nzLRl2smYxdOy0s8E3fE216n5q5dq+UfbkKXjRl6nn23p4oW5rUppECCwyU3Gix6jcwsAaBtvcHzshVxnsskM4avBiNNhyGU06U8+6ept8XMWHxqb57YSs2tBYZTXpbB7o6o/wwS2LDvtrTPetvsiv6X1C0ds15qBNTMrLta6LsEOhcTEoOLPRcTTJSJAjaize3LQX2s4eXnT7pf1HWZmbiNDfgsawN8Nj3bbACucmiy3Pe7aTc1yTlFCh45ZRPykvVDPM+1gENwk4T4MQk8jFLuzexHyrFn9YnJ+IXTMy59voMk/6VwEmjrDKDWpsMKiNMI9IlndOXbJ3ElvJCqK8bBCUHJLaUHE5TXpjfybqjvDsIsO+wGme9ahKQIoORyvoIzhDewRHbTkVsUdkN0JXPUHU39JwqWo2xUkjd1HCrUUbyKQNgaUNjlTQVPE4UVFDyOVNRU8jhYwCnHiUKARx5FCxj/9k=',
  players: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABELDA8MChEPDg8TEhEUGSobGRcXGTMkJh4qPDU/Pjs1OjlDS2BRQ0daSDk6U3FUWmNma2xrQFB2fnRofWBpa2f/2wBDARITExkWGTEbGzFnRTpFZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2f/wAARCABaAEsDASIAAhEBAxEB/8QAGgAAAgMBAQAAAAAAAAAAAAAAAAECBAYDBf/EACwQAAEEAgICAAUEAgMAAAAAAAEAAgMRBCESMQVBEyIyQlEGUmFxFJEzU7H/xAAZAQADAQEBAAAAAAAAAAAAAAAAAQMEAgX/xAAgEQACAgICAgMAAAAAAAAAAAAAAQIRAyESMQRhEzNB/9oADAMBAAIRAxEAPwDC+xpH50jdjaN72kAehpHs/KjdDae7O0AL7RpMD5vpQAeI37V3x2A/Nyms5cWEgOkokNv8pSkkrZ1GLbpHCLEmnjLooXvDastF0uTmlkhDmEEaIK1olg8fCzHgdGLDRLI17gLD+ysznEOzpS14cC4kEG72pwyOTeis8airK3rr2ke+k/XftBu+1YgGrGka3pG7G0b3tIA1Q0mALPyoo0Nq547BkzstkMbmtLzVuNBJtJWzpK2Lx2C7MnjjFNDnAF7vpH9laAzQeNxTHj0H/DaZHMmI5ODu6pMzReKweGO5zTxY6UtlabIceln8rKmy5QC8lrb4A90Tazbyv0akliXseXnmVhaz4jeVh9uvlu1SNcul6cXhciWFr+cIDgCOUgB2aXDM8dNiFhe5hDwSC1wPulaMoLSIzjN7ZS1XSDV9J0a79oN32qEhasaTABvRRRsdK/4vxsufMWsfG3e+bq9JSkoq2dRi5OkcIcSSUNLInkEgWAe1ojmY3h8ZkUBdb2xyP4vDje7rWl0yMpvjYYIsV0jG3HJQlad0bWbl55E73C3WfZtZ/t76NFfGtdkcvLfklvOyG6br1a9P9OQwumdM4U+JzC08w2jf89qvD4TKlia8GMA8Tt4HZoL0/GY0/jY5i57be1pHCRvp1btGSUeNRYQhLnckcPIZZkkAJOjW3NH3n+F2xWuyMOaAyxgSMDW8pG6+dUMmWTILPiOvjofM39y5zcIsdzXcub2/JTgQPm9pcdUUcu2VMzFOJJwcWOPdsdYXA1fSZ5Ed+0G7WldbMbq9CHHkO1qvFyRT44kxg9r4+DXNEbSCaIvaytmx0pske3lRpcZIc0d48nBnrZGPNcfNj6PD7Wj0V6vifJQYwayRjo/+OyImnq9rPY3kZYIw3hE/5g4F7bOvX9K7i+VjllbHlQwsj+UF7IgXAC1GcG1TRdZIs0LMuLIZGI3vd9GvhsH3FcsjBOUGgNl5NaONNYO3/wBrypMB7YWTwlhjc1rh9IP1GvarNlma5tkar8fuUlD9iyt0etB4WZkjHubJbSD0z99flT8l4v8AyomtfHIJGtqOgwWS890rmHPG/BgLnw8uLbFNu+f9qDix0kdfDNV0GfvP8rjlKx0mqMTkQ/AlfG4EOa4grkav2rfkSTmTUBXxD/6qpu16MXaPPkqYtWNo1vaN2NI3vSZwGqG1NpAcdlQ3Q0mCeR0gZqv09lPnw+DmgiJ0bRTW9cvdr0mEnj8hOm/ZH+8rCtke1o46U/jyXVn/AGsssFu0ao50lTRty9/FgAeOumx/9ipZsskGNJMAbY0OFtYR9ZWU+PJx7P8AtJ0jyaP46tC8en2N+Qq0hTSfEe57jtxs0uZq+07Nde0G76WpGRuw9jaPztL8ITEP0No9n5lFCAJfaNo+76lFHtAEvt7R931KPpCAH679oPfaSEAf/9k=',
  schools: 'data:image/jpeg;base64,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',
  partners: 'data:image/jpeg;base64,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',
};
function Icon({ kind }: { kind: keyof typeof suppliedLedArt }) {
  return <img src={suppliedLedArt[kind]} width={34} height={34} alt="" aria-hidden="true" style={{ width: 34, height: 34, objectFit: 'contain', borderRadius: 0, flexShrink: 0 }} />;
}
export default function ClubhouseFooter({ activeAlumni }: { activeAlumni: number | null }) {
  const school = useContext(SchoolContext);
  const schoolName = school?.hsName?.trim() || 'YOUR SCHOOL';
  const schoolLocation = school?.hsLocation?.trim() || 'YOUR COMMUNITY';
  const [showWelcome, setShowWelcome] = useState(true);
  useEffect(() => { const timer = setTimeout(() => setShowWelcome(false), 6000); return () => clearTimeout(timer); }, []);
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
        animation:yat-clubhouse-crawl 165s linear 6s infinite !important;
        will-change:transform;
      }
      .yat-clubhouse-marquee[data-welcome='true'] {animation-play-state:paused !important;opacity:0 !important;}
      .yat-clubhouse-welcome {position:absolute;inset:0;z-index:2;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:12px 16px 12px 85px;text-align:center;background:#070503;color:#ffb238;font-size:clamp(12px,3vw,20px);font-weight:900;line-height:1.2;transition:opacity .7s ease;pointer-events:none;}
      .yat-clubhouse-welcome[data-visible='false'] {opacity:0;}
      .yat-clubhouse-inline-icon {display:inline-flex !important;align-items:center !important;vertical-align:middle;flex:none !important;gap:6px;margin:0 18px;color:#ffb238;text-decoration:none !important;white-space:nowrap !important;}
      .yat-clubhouse-inline-icon img {width:38px !important;height:38px !important;object-fit:contain !important;}
      .yat-clubhouse-inline-icon b {font-size:19px;font-weight:900;}
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
      <div className="yat-clubhouse-welcome" data-visible={showWelcome} aria-hidden={!showWelcome}>
        <span>WELCOME TO THE {schoolName.toUpperCase()} ALUMNI COMMUNITY HUB ON YAT?STATS...</span>
        <span>IT&apos;S FREE TO BROWSE AS A VISITOR... OR REGISTER FOR FREE TO BECOME A FAN OF THE PROGRAM.</span>
      </div>
      <div className={`yat-clubhouse-marquee ${tickerDateFont.className}`} data-paused={tickerPaused} data-welcome={showWelcome}>
        {[0,1].map(copy => <div className="yat-clubhouse-copy" key={copy} aria-hidden={copy === 1 ? true : undefined}>
          <span className="yat-clubhouse-intro">
            <span className="yat-clubhouse-single-line">FOR A GUIDED TOUR TO HELP YOU NAVIGATE ALL OF THE 1024 YAT?STATS BASEBALL COMMUNITY HUBS AND EXPERIENCE ACTIVE ALUMNI FROM OTHER TOP PROGRAMS IN THE COUNTRY AS WELL... CLICK THE TICKER ICON THAT YOU RELATE TO MOST....</span>
            <a className="yat-clubhouse-inline-icon" href="https://yatstats.com/" tabIndex={copy === 1 ? -1 : undefined}><Icon kind="fans"/><b>FANS</b></a>
            <span className="yat-clubhouse-single-line">YOU WILL THEN BE DIRECTED TO THE YAT?STATS HOME PAGE TO EXPERIENCE FIRST HAND WHAT OUR PLATFORM HAS TO OFFER THE FANS OF {schoolName.toUpperCase()} AND THE COMMUNITY OF {schoolLocation.toUpperCase()}... IF YOU WANT TO KNOW &quot;WHERE THEY YAT? AND WHAT&apos;S THEIR STATS&quot;... YOU&apos;RE IN THE RIGHT PLACE! TO THE CURRENT COACHING STAFF OR THE PROGRAM&apos;S BOOSTER CLUB.... YOU WILL LEARN HOW YAT?STATS CAN HELP</span>
            <a className="yat-clubhouse-inline-icon" href="https://yatstats.com/" tabIndex={copy === 1 ? -1 : undefined}><Icon kind="schools"/><b>SCHOOLS</b></a>
            <span className="yat-clubhouse-single-line">COMMUNICATE BETTER WITH THEIR ALUMNI AND LOCAL COMMUNITY... THERE IS ALSO A SPECIFIC TOUR FOR THE {schoolName.toUpperCase()} ACTIVE ALUMNI WHO ARE STILL PLAYING BASEBALL COLLEGIATELY OR PROFESSIONALLY.. WITHOUT THE</span>
            <a className="yat-clubhouse-inline-icon" href="https://yatstats.com/" tabIndex={copy === 1 ? -1 : undefined}><Icon kind="players"/><b>PLAYERS</b></a>
            <span className="yat-clubhouse-single-line">THIS NOSTALGIC PLATFORM WOULDN&apos;T EXIST... MOST IMPORTANTLY WE WOULD LIKE TO THANK OUR LOCAL SPONSOR</span>
            <a className="yat-clubhouse-inline-icon" href="https://yatstats.com/" tabIndex={copy === 1 ? -1 : undefined}><Icon kind="partners"/><b>PARTNERS</b></a>
            <span className="yat-clubhouse-single-line">FOR MAKING THIS PLATFORM POSSIBLE FOR THE BASEBALL FANS AND ALUMNI OF {schoolName.toUpperCase()}...</span>
          </span>

          <a className="yat-clubhouse-intro" href="https://yatstats.com/" tabIndex={copy === 1 ? -1 : undefined}>
            <span className="yat-clubhouse-single-line">WELCOME TO YAT?STATS — NEW HERE? START HERE FOR A GUIDED TOUR. EXPLORE THE PLATFORM AS A FAN, PLAYER, COACH OR PARTNER.</span>
          </a>
        </div>)}
      </div>
      </div>
    </nav>
  </div>;
}
