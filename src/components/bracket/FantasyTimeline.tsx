'use client';

// src/components/bracket/FantasyTimeline.tsx
// Row 3 on a school's fantasy page (the Fantasy Bracket Tourney tab): its
// season as a hero timeline, the way a player profile's Career Path Timeline
// shows his career - there each slide is a year, here each slide is a week
// (the 30, and the postseason weeks once the school is in them).
//
// A slide: the Alumni of the Week's cutout on the left (the player who beat
// league average by the most that week) over the opponent's ghosted crest,
// and the week, the opponent, the score and W/L on the right. Swipe or use
// the arrows; the rail underneath jumps to a week. Tapping a slide brings
// that week's game card into view below. Opens on the current week.

import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { SchoolContext } from '@/context/SchoolContext';
import { CREST_FALLBACK_PATH, getSchoolCrestUrl } from '@/lib/schoolAssets';
import { type Index, type LbGame, LAST_WEEK, fmtDate, fmtRange, loadIndex, loadLb, previewDate, shortName } from './gallery';
import { type Star, type WeekCard, calendar, loadStars, runsThrough, schoolSeason, starLine } from './schoolSeason';
import { focusWeek } from './bracketNav';

const S3_BASE = 'https://yatstats-assets.s3.us-west-2.amazonaws.com';
const SILHOUETTE = '/img/player-silhouette.png';
// The same cutouts the Career Path Timeline uses: the trimmed WebP on S3,
// then /api/cutout (which trims one on the fly); his current photo first.
const cutouts = (id: string) => [
  `${S3_BASE}/players/now-web/${encodeURIComponent(id)}.webp`,
  `/api/cutout?kind=now&id=${encodeURIComponent(id)}`,
  `${S3_BASE}/players/back-web/${encodeURIComponent(id)}.webp`,
  `${S3_BASE}/players/then-web/${encodeURIComponent(id)}.webp`,
  `/api/cutout?kind=then&id=${encodeURIComponent(id)}`,
];

// An image that works down a list of sources until one loads.
function Fallback({ srcs, className, alt }: { srcs: string[]; className: string; alt: string }) {
  const [i, setI] = useState(0);
  if (i >= srcs.length) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return <img className={className} src={srcs[i]} alt={alt} loading="lazy" decoding="async" onError={() => setI(i + 1)} />;
}

function Slide({ index, card, me, star, onTap }: { index: Index; card: WeekCard; me: number; star?: Star; onTap: () => void }) {
  const S = index.schools;
  const g = card.game;
  const opp = g ? (g[2] === me ? g[3] : g[2]) : 0;
  const oppName = opp ? shortName(S[opp]?.[0] || '') : '';
  const [hr, ar] = g ? runsThrough(g, card.days) : [0, 0];
  const mine = g && g[2] === me ? hr : ar;
  const theirs = g && g[2] === me ? ar : hr;
  const res = g && card.state === 'final' ? (g[6] === null ? 'T' : g[6] === me ? 'W' : 'L') : '';
  const where = g ? (g[2] === me ? 'vs' : 'at') : '';
  const title = !g ? (card.state === 'bye' ? 'No game this week' : 'Opponent TBD')
    : card.state === 'final' ? `${res} ${mine}–${theirs} ${where} ${oppName}`
    : card.state === 'live' ? `${mine}–${theirs} ${where} ${oppName}`
    : `${where} ${oppName}`;
  const body = card.state === 'final' ? null
    : card.state === 'live' ? 'In progress · final Sunday night'
    : card.state === 'next' ? `Starts ${fmtDate(index.weeks[card.week - 1][0])}`
    : card.note || '';
  const dates = index.weeks[card.week - 1] ? fmtRange(index.weeks[card.week - 1][0], index.weeks[card.week - 1][1]) : '';
  return (
    <div className={`yft-slide ${card.state}`} role="button" tabIndex={0} onClick={onTap}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onTap(); } }}
      aria-label={`Week ${card.week}: ${title}. Show the game`}>
      {opp ? <Fallback className="yft-ghost" srcs={[getSchoolCrestUrl(opp), CREST_FALLBACK_PATH]} alt="" /> : null}
      <span className="yft-grad" aria-hidden="true" />
      {star
        ? <Fallback className="yft-person" srcs={[...cutouts(star[5]), SILHOUETTE]} alt={star[0]} />
        : <span className="yft-mark" aria-hidden="true">{opp ? <Fallback className="yft-mark-crest" srcs={[getSchoolCrestUrl(opp), CREST_FALLBACK_PATH]} alt="" /> : '?'}</span>}
      <span className="yft-copy">
        <span className="yft-kick">Week {card.week} · {card.stage} · {dates}</span>
        <span className={`yft-title ${res}`}>{title}</span>
        {star && card.state === 'final'
          ? <span className="yft-body"><b>★ Alumni of the Week</b>{starLine(star)}</span>
          : body ? <span className="yft-body">{body}</span> : null}
      </span>
    </div>
  );
}

export default function FantasyTimeline() {
  const school = useContext(SchoolContext);
  const me = Number(school?.hsid || 0);
  const [data, setData] = useState<{ index: Index; lb: LbGame[]; asof: string } | null>(null);
  const [stars, setStars] = useState<Record<number, Star>>({});
  const [active, setActive] = useState(0);
  const trackRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([loadIndex(), loadLb()]).then(([index, lb]) => { if (!cancelled) setData({ index, lb, asof: previewDate() }); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);
  const cards = useMemo(() => (data ? schoolSeason(data.index, data.lb, me, data.asof) : []), [data, me]);
  const week = data ? calendar(data.index, data.asof).week : 0;
  const region = data?.index.schools[me]?.[1];
  useEffect(() => {
    if (!region) return;
    let cancelled = false;
    loadStars(region).then((all) => { if (!cancelled) setStars(all[me] || {}); });
    return () => { cancelled = true; };
  }, [region, me]);

  const go = useCallback((i: number, smooth = true) => {
    const el = trackRef.current;
    if (!el) return;
    el.scrollTo({ left: i * el.clientWidth, behavior: smooth ? 'smooth' : 'auto' });
  }, []);
  // Open on this week (the last week once the season's over).
  useEffect(() => {
    if (!cards.length) return;
    let i = cards.findIndex((c) => c.week === week);
    if (i < 0) i = week > (data?.index.weeks.length ?? 0) ? cards.length - 1 : 0;
    requestAnimationFrame(() => { go(i, false); setActive(i); });
  }, [cards, week, data, go]);
  const onScroll = () => {
    const el = trackRef.current;
    if (el) setActive(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)));
  };

  if (!data || !cards.length) return <section className="yft-hero" aria-label="The season, week by week" />;
  return (
    <section className="yft-hero" aria-label="The season, week by week">
      <div className="yft-track" ref={trackRef} onScroll={onScroll}>
        {cards.map((c) => (
          <Slide key={c.week} index={data.index} card={c} me={me} star={c.state === 'final' ? stars[c.week] : undefined} onTap={() => focusWeek(c.week)} />
        ))}
      </div>
      <button type="button" className="yft-nav prev" onClick={() => go(Math.max(0, active - 1))} disabled={active === 0} aria-label="Previous week">‹</button>
      <button type="button" className="yft-nav next" onClick={() => go(Math.min(cards.length - 1, active + 1))} disabled={active === cards.length - 1} aria-label="Next week">›</button>
      {/* The rail: a tick per week, a label at each round's first week. */}
      <div className="yft-rail">
        <span className="yft-rail-track" aria-hidden="true" />
        {cards.map((c, i) => {
          const res = c.state === 'final' && c.game ? (c.game[6] === null ? 'T' : c.game[6] === me ? 'W' : 'L') : '';
          const label = c.week > LAST_WEEK ? `P${c.week - LAST_WEEK}` : (c.week - 1) % 3 === 0 ? `R${Math.ceil(c.week / 3)}` : '';
          return (
            <button key={c.week} type="button" className={`yft-tick ${res}${i === active ? ' on' : ''}${c.week === week ? ' now' : ''}`}
              style={{ left: `${(i / Math.max(1, cards.length - 1)) * 100}%` }} onClick={() => go(i)} aria-label={`Week ${c.week}`}>
              {i === active ? <span className="yft-tick-chip">Wk {c.week}</span> : label ? <span className="yft-tick-label">{label}</span> : null}
            </button>
          );
        })}
      </div>
      <style jsx global>{`
        /* Row 3 takes the Career Path Timeline's height on this tab. */
        .yat-row3-shell:has(.yft-hero) { height: 200px; min-height: 200px; overflow: hidden; }
        body:has(.yft-hero) { --row3-h: 200px; }
        .yft-hero { position: relative; height: 200px; overflow: hidden; background: #040506; color: #fff; }
        .yft-track { display: flex; height: 100%; overflow-x: auto; scroll-snap-type: x mandatory; scrollbar-width: none; overscroll-behavior-x: contain; }
        .yft-track::-webkit-scrollbar { display: none; }
        .yft-slide { position: relative; flex: 0 0 100%; height: 100%; scroll-snap-align: start; overflow: hidden; cursor: pointer; }
        .yft-ghost { position: absolute; left: 4%; top: 50%; width: 46%; max-width: 420px; transform: translateY(-50%); opacity: .16; object-fit: contain; aspect-ratio: 1; pointer-events: none; }
        .yft-grad { position: absolute; inset: 0; pointer-events: none; background: linear-gradient(90deg, rgba(0,0,0,.05) 0%, rgba(0,0,0,.12) 20%, rgba(4,5,6,.82) 43%, rgba(4,5,6,.97) 72%, #040506 100%), linear-gradient(180deg, rgba(0,0,0,.12), transparent 55%, rgba(0,0,0,.48)); }
        .yft-person { position: absolute; left: max(2%, calc(34% - 300px)); bottom: 22px; height: calc(100% - 26px); max-width: 32%; object-fit: contain; object-position: bottom center; pointer-events: none; }
        .yft-mark { position: absolute; left: max(4%, calc(34% - 260px)); top: 50%; transform: translateY(-58%); width: 110px; height: 110px; display: grid; place-items: center; color: #6a7280; font: 400 64px/1 "Bebas Neue", Oswald, sans-serif; pointer-events: none; }
        .yft-mark-crest { width: 100%; height: 100%; object-fit: contain; }
        .yft-copy { position: absolute; left: min(34%, 476px); right: 5%; top: 0; bottom: 30px; display: flex; flex-direction: column; justify-content: center; gap: 4px; min-width: 0; }
        .yft-kick { color: var(--gold, #ffc107); font: 700 11px/1.2 Oswald, sans-serif; letter-spacing: .12em; text-transform: uppercase; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .yft-title { font: 700 30px/1.05 Oswald, sans-serif; text-transform: uppercase; color: #f7f7f5; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .yft-title.W { color: #7fd18b; }
        .yft-title.L { color: #e2786a; }
        .yft-body { color: rgba(255,255,255,.82); font: 500 14px/1.3 Oswald, sans-serif; letter-spacing: .02em; }
        .yft-body b { display: block; color: var(--gold, #ffc107); font-weight: 600; font-size: 11px; letter-spacing: .12em; text-transform: uppercase; }
        .yft-nav { position: absolute; top: calc(50% - 30px); width: 32px; height: 44px; border: 0; background: rgba(0,0,0,.35); color: #fff; font-size: 26px; line-height: 1; cursor: pointer; z-index: 3; }
        .yft-nav:disabled { opacity: .25; cursor: default; }
        .yft-nav.prev { left: 0; border-radius: 0 6px 6px 0; }
        .yft-nav.next { right: 0; border-radius: 6px 0 0 6px; }
        .yft-rail { position: absolute; left: min(34%, 476px); right: 48px; bottom: 9px; height: 16px; z-index: 3; }
        .yft-rail-track { position: absolute; left: 0; right: 0; top: 7px; height: 2px; background: rgba(255,255,255,.22); }
        .yft-tick { position: absolute; top: 2px; width: 12px; height: 12px; margin-left: -6px; padding: 0; border: 0; background: transparent; cursor: pointer; }
        .yft-tick::before { content: ''; position: absolute; left: 4px; top: 3px; width: 4px; height: 6px; border-radius: 1px; background: rgba(255,255,255,.45); }
        .yft-tick.W::before { background: #7fd18b; }
        .yft-tick.L::before { background: #e2786a; }
        .yft-tick.now::before { box-shadow: 0 0 0 2px rgba(255,193,7,.6); }
        .yft-tick-label { position: absolute; left: 50%; top: -12px; transform: translateX(-50%); color: rgba(255,255,255,.55); font: 600 8px/1 Oswald, sans-serif; letter-spacing: .06em; white-space: nowrap; }
        .yft-tick-chip { position: absolute; left: 50%; top: -15px; transform: translateX(-50%); padding: 2px 5px; border-radius: 3px; background: var(--gold, #ffc107); color: #000; font: 700 9px/1 Oswald, sans-serif; letter-spacing: .06em; text-transform: uppercase; white-space: nowrap; }
        @media (max-width: 760px) {
          .yat-row3-shell:has(.yft-hero) { height: 150px; min-height: 150px; }
          body:has(.yft-hero) { --row3-h: 150px; }
          .yft-hero { height: 150px; }
          .yft-person { left: 1%; max-width: 36%; bottom: 20px; height: calc(100% - 22px); }
          .yft-mark { left: 5%; width: 72px; height: 72px; font-size: 44px; }
          .yft-ghost { width: 56%; left: 0; }
          .yft-copy { left: 37%; right: 3%; bottom: 26px; gap: 2px; }
          .yft-kick { font-size: 9px; white-space: normal; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
          .yft-title { font-size: 20px; }
          .yft-body { font-size: 11.5px; }
          .yft-body b { font-size: 9px; }
          .yft-nav { display: none; }
          .yft-rail { left: 37%; right: 12px; }
          .yft-tick-label { display: none; }
        }
      `}</style>
    </section>
  );
}
