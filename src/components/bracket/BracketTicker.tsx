'use client';

// src/components/bracket/BracketTicker.tsx
// Row 6 (the footer) on the Fantasy Bracket Tourney tab: a scoreboard ticker
// (dot-matrix light bulbs) crawling every game of the current round, one
// region at a time - each game stacked like a scoreboard (visitor over home,
// running score at the right): the day innings through yesterday's stats, or
// FINAL once the week is over. The games come out from under a REGION box
// pinned to the right and slide under a sponsor spot pinned to the left -
// "ROUND 1 brought to you by ..." - and both change with each region. Same
// date as the tab (today, or ?asof=YYYY-MM-DD).

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Doto } from 'next/font/google';
import { selectRegionSponsor } from '@/lib/sponsorCampaigns';
import { type GameRow, type Index, LBT_ROUNDS, loadIndex, previewDate, shortName, weekOfDate } from './gallery';

const dots = Doto({ subsets: ['latin'], weight: ['700', '900'], display: 'swap' });
// The crawl, in pixels per second.
const CRAWL_PX_PER_SEC = 38;

type Item = { key: string; tag: string; home: string; away: string; h: number; a: number; status: string; lead: 0 | 1 | 2 };
// One region's games (region 0: a postseason stage): the sponsor spot's
// label, and the right-hand box (small word over a big number/code).
type Group = { region: number; label: string; boxK: string; boxV: string; items: Item[] };

function tickerGroups(index: Index, asof: string): Group[] {
  const week = weekOfDate(index, asof);
  if (week === 0) return [];
  const last = index.weeks.length;
  const w = Math.min(week, last); // after the season: the Fantasy World Series
  // Days of the week with stats in: those before today (all 7 once it's over).
  const done = week > last ? 7 : Array.from({ length: 7 }, (_, d) => {
    const t = Date.parse(`${index.weeks[w - 1][0]}T00:00:00Z`) + d * 86400000;
    return new Date(t).toISOString().slice(0, 10);
  }).filter((d) => d < asof).length;
  const groups = new Map<string, Group>();
  const add = (g: GameRow, region: number, label: string, box: [string, string], tag: string) => {
    let h = 0, a = 0;
    g[5].forEach((v, i) => {
      const inning = Math.floor(i / 2);
      if (done === 7 || inning < done) { if (i % 2 === 0) h += v; else a += v; }
    });
    const k = `${region}:${label}`;
    if (!groups.has(k)) groups.set(k, { region, label, boxK: box[0], boxV: box[1], items: [] });
    groups.get(k)!.items.push({
      key: `t${g[0]}`,
      tag,
      home: shortName(index.schools[g[2]]?.[0] || '').toUpperCase(),
      away: shortName(index.schools[g[3]]?.[0] || '').toUpperCase(),
      h, a,
      status: done === 7 ? 'FINAL' : done === 0 ? 'STARTS MON' : 'LIVE',
      lead: h > a ? 1 : a > h ? 2 : 0,
    });
  };
  for (const r of index.rounds) {
    for (const s of r.series) {
      s[7].forEach((g, i) => {
        if (g[1] === w) add(g, s[0], `ROUND ${r.r}`, s[0] ? ['REGION', String(s[0])] : ['ROUND', String(r.r)], `G${i + 1}`);
      });
    }
  }
  for (const { game } of index.lbt) {
    if (game[1] === w) add(game, 0, game[1] === 33 ? 'THE CHAMPIONSHIP GAME' : `CHAMPIONSHIP ${(LBT_ROUNDS[game[1]] || '').toUpperCase()}`,
      ['STAGE', game[1] === 33 ? 'CG' : game[1] === 32 ? 'C2' : 'C1'], '');
  }
  for (const g of index.gf) if (g[1] === w) add(g, 0, 'THE FANTASY WORLD SERIES', ['STAGE', 'WS'], '');
  return [...groups.values()].sort((x, y) => (x.region || 99) - (y.region || 99));
}

export default function BracketTicker({ hsid }: { hsid: string }) {
  const [index, setIndex] = useState<Index | null>(null);
  const [asof, setAsof] = useState('');
  const [turn, setTurn] = useState(0);
  const trackRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    loadIndex().then((i) => { setAsof(previewDate()); setIndex(i); }).catch(() => {});
  }, []);
  const groups = useMemo(() => (index && asof ? tickerGroups(index, asof) : []), [index, asof]);
  const group = groups.length ? groups[turn % groups.length] : null;
  const sponsor = useMemo(() => (group ? selectRegionSponsor(hsid, group.region) : null), [hsid, group]);

  // A steady crawl whatever the region's length: the duration comes from
  // the track's width (the lane's width of lead-in plus its games).
  useLayoutEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    el.style.animationDuration = `${Math.max(8, el.offsetWidth / CRAWL_PX_PER_SEC)}s`;
    el.style.animationName = 'ybt-crawl';
  }, [turn, group]);

  const spot = group && (
    sponsor ? (
      <a className="ybt-spot" href={sponsor.destinationUrl} target="_blank" rel="noopener noreferrer sponsored"
        aria-label={`${group.label} brought to you by ${sponsor.sponsorName}`}
        data-sponsor-id={sponsor.id} data-sponsor-name={sponsor.sponsorName}>
        <span className="ybt-spot-line"><b className="ybt-spot-k">{group.label}</b> <span className="ybt-spot-by">brought to you by</span></span>
        {' '}<b className="ybt-spot-name">{sponsor.sponsorName}</b>
      </a>
    ) : (
      <div className="ybt-spot">
        <span className="ybt-spot-line"><b className="ybt-spot-k">{group.label}</b></span>
      </div>
    )
  );
  const box = group && (
    <div className="ybt-box" aria-label={`${group.boxK} ${group.boxV}`}>
      <span className="ybt-box-k">{group.boxK}</span>
      <b className="ybt-box-v">{group.boxV}</b>
    </div>
  );

  return (
    <div className={`ybt ${dots.className}`} role="marquee" aria-label="Current round scores">
      {spot}
      <div className="ybt-lane">
        {!index && <span className="ybt-msg">LOADING SCORES...</span>}
        {index && !groups.length && <span className="ybt-msg">THE 2026 BRACKET STARTS {index.weeks[0][0]}</span>}
        {group && (
          <div key={`${turn}`} ref={trackRef} className="ybt-track" onAnimationEnd={() => setTurn((t) => t + 1)}>
            {group.items.map((it) => (
              <span key={it.key} className="ybt-item">
                <span className="ybt-meta">
                  {it.tag && <span className="ybt-tag">{it.tag}</span>}
                  <span className="ybt-status">{it.status}</span>
                </span>
                <span className="ybt-board">
                  <span className={`ybt-team${it.lead === 2 ? ' ybt-lead' : ''}`}>{it.away}</span>
                  <span className={`ybt-run${it.lead === 2 ? ' ybt-lead' : ''}`}>{it.a}</span>
                  <span className={`ybt-team${it.lead === 1 ? ' ybt-lead' : ''}`}>{it.home}</span>
                  <span className={`ybt-run${it.lead === 1 ? ' ybt-lead' : ''}`}>{it.h}</span>
                </span>
              </span>
            ))}
          </div>
        )}
      </div>
      {box}
      {/* Global: the items are built outside the render tree styled-jsx scopes; every class is ybt-prefixed. */}
      <style jsx global>{`
        .ybt { position:relative; flex:1 1 auto; align-self:stretch; width:100%; height:100%; display:flex; overflow:hidden;
          background-color:#070503;
          background-image:radial-gradient(rgba(255,160,40,.07) 1px, transparent 1.4px);
          background-size:4px 4px;
          border-top:1px solid #1d1408; }
        .ybt-lane { position:relative; flex:1 1 auto; min-width:0; overflow:hidden; display:flex; align-items:center; }
        /* Starts just off the right edge (padding = the lane's width) and
           crawls left until its last game has gone under the sponsor spot. */
        .ybt-track { position:absolute; top:0; bottom:0; left:0; padding-left:100%; display:flex; align-items:center; white-space:nowrap;
          animation-timing-function:linear; animation-iteration-count:1; animation-fill-mode:both; will-change:transform; }
        .ybt:hover .ybt-track { animation-play-state:paused; }
        @keyframes ybt-crawl { from { transform:translateX(0); } to { transform:translateX(-100%); } }
        .ybt-item { display:inline-flex; align-items:center; gap:10px; padding:0 22px; color:#ffb238;
          text-shadow:0 0 3px rgba(255,170,40,.9), 0 0 10px rgba(255,120,0,.55); }
        .ybt-item + .ybt-item { border-left:2px dotted rgba(255,160,40,.35); }
        .ybt-meta { display:flex; flex-direction:column; align-items:flex-end; gap:3px; }
        .ybt-tag, .ybt-status { font-size:11px; font-weight:700; line-height:1; color:#ff7a1a; text-shadow:0 0 3px rgba(255,110,20,.9); }
        .ybt-board { display:grid; grid-template-columns:auto auto; column-gap:12px; row-gap:2px; align-items:baseline; }
        .ybt-team { font-size:17px; font-weight:900; line-height:1.05; letter-spacing:.05em; }
        .ybt-run { font-size:17px; font-weight:900; line-height:1.05; text-align:right; font-variant-numeric:tabular-nums; }
        .ybt-lead { color:#fff3c4; text-shadow:0 0 3px rgba(255,230,160,.95), 0 0 12px rgba(255,190,60,.7); }
        .ybt-msg { padding:0 16px; font-size:20px; font-weight:900; letter-spacing:.06em; color:#ffb238;
          text-shadow:0 0 3px rgba(255,170,40,.9), 0 0 10px rgba(255,120,0,.55); white-space:nowrap; }
        /* The sponsor spot: pinned left, above the crawl, wider on wider
           screens - one line when it fits, two when it doesn't. */
        .ybt-spot { position:relative; z-index:2; flex:none; width:clamp(240px, 27vw, 560px); display:flex; flex-wrap:wrap; align-content:center; align-items:baseline; column-gap:8px; row-gap:1px;
          padding:0 16px; background:#0b0805; border-right:2px solid rgba(255,160,40,.45); box-shadow:8px 0 14px rgba(0,0,0,.75);
          color:#ffb238; text-decoration:none; font-family:Oswald,sans-serif; }
        .ybt-spot-line { display:inline-flex; align-items:baseline; gap:7px; white-space:nowrap; }
        .ybt-spot-k { font-size:16px; font-weight:700; letter-spacing:.06em; line-height:1.1; color:#ffb238; text-transform:uppercase; }
        .ybt-spot-by { font-size:12px; font-weight:400; letter-spacing:.03em; line-height:1.1; color:rgba(255,255,255,.7); }
        .ybt-spot-name { font-size:16px; font-weight:700; letter-spacing:.03em; line-height:1.1; color:#fff; text-transform:uppercase; }
        a.ybt-spot:hover .ybt-spot-name, a.ybt-spot:focus-visible .ybt-spot-name { text-decoration:underline; }
        a.ybt-spot:focus-visible { outline:2px solid #ffb238; outline-offset:-2px; }
        /* The region box: pinned right, a fixed size; the games come out
           from under it. */
        .ybt-box { position:relative; z-index:2; flex:none; width:92px; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:1px;
          background:#0b0805; border-left:2px solid rgba(255,160,40,.45); box-shadow:-8px 0 14px rgba(0,0,0,.75); font-family:Oswald,sans-serif; }
        .ybt-box-k { font-size:10px; font-weight:700; letter-spacing:.16em; line-height:1; color:rgba(255,255,255,.7); }
        .ybt-box-v { font-size:36px; font-weight:700; line-height:.9; color:#ffb238; text-shadow:0 0 3px rgba(255,170,40,.8), 0 0 12px rgba(255,120,0,.45); }
        @media (max-width:640px) {
          .ybt-spot { width:150px; padding:0 8px; column-gap:5px; }
          .ybt-spot-line { gap:4px; }
          .ybt-spot-k { font-size:11px; }
          .ybt-spot-by { font-size:8.5px; }
          .ybt-spot-name { font-size:11px; white-space:normal; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
          .ybt-box { width:58px; }
          .ybt-box-k { font-size:7.5px; letter-spacing:.1em; }
          .ybt-box-v { font-size:26px; }
          .ybt-item { gap:7px; padding:0 14px; }
          .ybt-team, .ybt-run { font-size:14px; }
          .ybt-tag, .ybt-status { font-size:9px; }
          .ybt-msg { font-size:15px; }
        }
        @media (prefers-reduced-motion: reduce) {
          .ybt-lane { overflow-x:auto; }
          .ybt-track { position:relative; padding-left:0; animation:none !important; }
        }
      `}</style>
    </div>
  );
}
