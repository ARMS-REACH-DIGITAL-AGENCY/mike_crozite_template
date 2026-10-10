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
  fans: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABUOEBIQDRUSERIYFhUZHzQiHx0dH0AuMCY0TENQT0tDSUhUXnlmVFlyWkhJaY9qcnyAh4iHUWWUn5ODnXmEh4L/2wBDARYYGB8cHz4iIj6CVklWgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoL/wAARCAAwACoDASIAAhEBAxEB/8QAGgAAAQUBAAAAAAAAAAAAAAAAAQADBAUGAv/EAC8QAAIBAgQEBAQHAAAAAAAAAAECAAMRBCExkQUSIkETUWHRFCNxgURiobHB4fD/xAAYAQADAQEAAAAAAAAAAAAAAAABAgMABP/EABsRAAMBAAMBAAAAAAAAAAAAAAABAjEDERIh/9oADAMBAAIRAxEAPwDIqpNgAY7iMLWw9vFRl5gCL94KFRqVVKiWDKbiX2KQYtmpV2FkpK6soHSSM+8lVuWViPSM6Rn31g3k+tw2ooZ6TJUS+Vm6tpDek6GzoV+uUdUngrlrTjfSHeC37Q7bwinSaj2miYoMRUz/AA6aD8v0mdTUazREkV6jMxQfDoCWJHaQ5S/CV61OWsxV+Xq7D+pLFYVAFqIta9xdluRr6RlsVhKDHqeq19V0karxbEMLU/lefJfODy6xFHczo/iOHYYUg/jCgbZhze+mlhKr7jaB3ZzdmYkjUxZ+stKa1nPVJv4hJqPeWXG2K4hQCQDRS4va+QlWDa2kexOJfEuHqFSQoXIWyEznukwKuk0NH+fOD/axbRbRhRe3nD9v1g20hy9JgH//2Q==',
  players: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABUOEBIQDRUSERIYFhUZHzQiHx0dH0AuMCY0TENQT0tDSUhUXnlmVFlyWkhJaY9qcnyAh4iHUWWUn5ODnXmEh4L/2wBDARYYGB8cHz4iIj6CVklWgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoL/wAARCAAwACgDASIAAhEBAxEB/8QAGQABAQEBAQEAAAAAAAAAAAAAAAQBBQYD/8QAJhAAAQUAAQQBBAMAAAAAAAAAAQACAwQREgUTIUExFCJSYbHB4f/EABgBAQADAQAAAAAAAAAAAAAAAAMAAgQB/8QAHREBAQACAgMBAAAAAAAAAAAAAQACEQNBEiExMv/aAAwDAQACEQMRAD8A8giLQNXKQDVeenFlMzSuLZM5NZnr9r61a0dSIWbQHLCWMP8AJUtqea04u4u4k74BR+SvqYxA20iLc8okigGldOCs2k0WLIDjxBbH70/GqfpssUVkOm0fi78Srm5PZE0gbOw59vLEWa/JuPE1uhlsSXLLTKTxLvjf2ujam7MzYojxY3xjP7VQs1A3gGdnAfBHwkNCN57/AHGyNPxuonI7JTFO7hX+z9S4xaNPlpGYUW9RritYLGuJaRoRaMflmy/TSe/8WgkLEVqt3KlitPVaLbm826NJ8lVtuVIou3FM0NHrV5jU1E8Q9zHMnVX1GcT2nOGEDwCPaKREoaNRLt3f/9k=',
  schools: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABUOEBIQDRUSERIYFhUZHzQiHx0dH0AuMCY0TENQT0tDSUhUXnlmVFlyWkhJaY9qcnyAh4iHUWWUn5ODnXmEh4L/2wBDARYYGB8cHz4iIj6CVklWgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoL/wAARCAApADADASIAAhEBAxEB/8QAGgAAAwEBAQEAAAAAAAAAAAAAAAEEBQIDBv/EACwQAAIBAwMCBQIHAAAAAAAAAAECAwAEERIhMUGRBSIyUWETcUJigaGx0fD/xAAXAQEBAQEAAAAAAAAAAAAAAAADAgAB/8QAHREAAgIDAQEBAAAAAAAAAAAAAAECERIhMWETQf/aAAwDAQACEQMRAD8A+QxVdtZNKNblUjyMknBx8e9KyhR9ckh8qDgDcnpVEsrO3AAB2UDYb9KOUnxDQgus6C2cICiITHPLHHt7GjFpKukwiL8ytk/uacNvrw8jLHHkAswPx8U5bcaS8DLJGDgsoJxz8Ud+i14SXNkY1+ohDx74IO4+46VIR/FaUUrRPwCOoI2O45qe9hRAskZ8rj0kbg0kZPjCnFdRza3DQOSN1IwykZBrXitIZnMsTuYsajgDbfj71g96ssL+S0cjdom2ZCdiK5OLe0aE60zuWSS/uUgiwqg4RcAd+1JGm8OuTE+GH4l5BH+NUNYyu63Hhut1Y58vqQ7ZB70hZTa2uPES6KvJflttgKi1VfhVO/Sue0gjRbl3IhYasYGehxWLdXBmbqqAeVRwK9b29e5YKMrEvoQHYCoz+vFXCLW2TOd6QU+1c0UoJs+DXUMY+lKQuZVbUSMYHI4o8Yu4pUSFCrFSW1LjGCBtxWQKDRfNZWLm8aDtxS/qlRShH//Z',
  partners: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABUOEBIQDRUSERIYFhUZHzQiHx0dH0AuMCY0TENQT0tDSUhUXnlmVFlyWkhJaY9qcnyAh4iHUWWUn5ODnXmEh4L/2wBDARYYGB8cHz4iIj6CVklWgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoL/wAARCAAwAC0DASIAAhEBAxEB/8QAGQABAAMBAQAAAAAAAAAAAAAABAABBQIG/8QALxAAAQMDAwIEAwkAAAAAAAAAAQIDEQAEEiExQSKRBRNRYVJx8CMyNUNygbLB8f/EABUBAQEAAAAAAAAAAAAAAAAAAAMC/8QAGxEBAQEBAAMBAAAAAAAAAAAAAQARAgMSQSH/2gAMAwEAAhEDEQA/APId6netG1sbdy1S8/ceVkvEAJn096PcWi2AlSsSlc4woGoOxcr9HNjcc7VO9dYmNuKvAztzVbTlx3qd60G7BpCQq7eDQUOnHqJ+eulHvWE29ytpKsgmNfWpOxcKnhDWWqT4Kzr+cePYVoK+xcShuMbdshWSQdSJoFlfWzVs22+04stuZiCIO1LtrlTlvPldSlQVK1z30+fFB0M/CXTT2TQuLny0oBJQA2ATtr777Uth5q4QopwkGClTaQRtxR7a3YelRzJbJBbUqQk6cRVXBaQ8pbRKXUmFngfqEa0bi5IRfEm4aaWSSpCy0TG4H+0Xxj8Sdkztx7Up2+b899u6YXiTolJEpM7/ADrPvX03F0t1AUEqiMjrT8Dv7D2kbtTLC9VaucFtR6knkRH90Orn6ilQTGEcdttJaUhDzLwCW/vOmAqPhCZ1GtHf8RCW0pt+k/wHwj1HNZkmP2qTUHjPtb5H5QmTxVdqlT62pI7/2Q==',
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
