'use client';

// src/components/bracket/BracketTicker.tsx
// Row 4 on the Fantasy Bracket Tourney tab: a scoreboard ticker (dot-matrix
// light bulbs) scrolling every game of the current round with its running
// score - the day innings through yesterday's stats, or FINAL once the week
// is over. Same date as the tab (today, or ?asof=YYYY-MM-DD).

import { useEffect, useMemo, useState } from 'react';
import { Doto } from 'next/font/google';
import { type GameRow, type Index, LBT_ROUNDS, loadIndex, previewDate, shortName, weekOfDate } from './gallery';

const dots = Doto({ subsets: ['latin'], weight: ['700', '900'], display: 'swap' });
const ROUND_TAG = ['R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'REG FINAL', 'ELITE 8', 'FINAL 4', 'CHAMPIONSHIP'];
const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

type Item = { key: string; tag: string; home: string; away: string; h: number; a: number; status: string; lead: 0 | 1 | 2 };

function tickerItems(index: Index, asof: string): Item[] {
  const week = weekOfDate(index, asof);
  if (week === 0) return [];
  const last = index.weeks.length;
  const w = Math.min(week, last); // after the season: the Grand Final
  // Days of the week with stats in: those before today (all 7 once it's over).
  const done = week > last ? 7 : Array.from({ length: 7 }, (_, d) => {
    const t = Date.parse(`${index.weeks[w - 1][0]}T00:00:00Z`) + d * 86400000;
    return new Date(t).toISOString().slice(0, 10);
  }).filter((d) => d < asof).length;
  const out: Item[] = [];
  const add = (g: GameRow, tag: string) => {
    let h = 0, a = 0;
    g[5].forEach((v, i) => {
      const inning = Math.floor(i / 2);
      if (done === 7 || inning < done) { if (i % 2 === 0) h += v; else a += v; }
    });
    const final = done === 7;
    out.push({
      key: `t${g[0]}`,
      tag,
      home: shortName(index.schools[g[2]]?.[0] || '').toUpperCase(),
      away: shortName(index.schools[g[3]]?.[0] || '').toUpperCase(),
      h, a,
      status: final ? 'FINAL' : done === 0 ? 'STARTS MON' : `THRU ${DAYS[done - 1]}`,
      lead: h > a ? 1 : a > h ? 2 : 0,
    });
  };
  for (const r of index.rounds) {
    for (const s of r.series) {
      s[7].forEach((g, i) => { if (g[1] === w) add(g, `${ROUND_TAG[r.r - 1]}${s[0] ? ` · REG ${s[0]}` : ''} · G${i + 1}`); });
    }
  }
  for (const { game } of index.lbt) if (game[1] === w) add(game, `LB8 ${(LBT_ROUNDS[game[1]] || '').toUpperCase()}`);
  for (const g of index.gf) if (g[1] === w) add(g, 'GRAND FINAL');
  return out;
}

export default function BracketTicker() {
  const [index, setIndex] = useState<Index | null>(null);
  const [asof, setAsof] = useState('');
  useEffect(() => {
    loadIndex().then((i) => { setAsof(previewDate()); setIndex(i); }).catch(() => {});
  }, []);
  const items = useMemo(() => (index && asof ? tickerItems(index, asof) : []), [index, asof]);

  const line = (copy: number) => items.map((it) => (
    <span key={`${copy}-${it.key}`} className="ybt-item" aria-hidden={copy ? true : undefined}>
      <span className="ybt-tag">{it.tag}</span>
      <span className={it.lead === 1 ? 'ybt-lead' : ''}>{it.home} {it.h}</span>
      <span className="ybt-dash">-</span>
      <span className={it.lead === 2 ? 'ybt-lead' : ''}>{it.a} {it.away}</span>
      <span className="ybt-status">{it.status}</span>
    </span>
  ));

  return (
    <div className={`ybt ${dots.className}`} role="marquee" aria-label="Current round scores">
      {!index && <span className="ybt-msg">LOADING SCORES...</span>}
      {index && !items.length && <span className="ybt-msg">THE 2026 BRACKET STARTS {index.weeks[0][0]}</span>}
      {items.length > 0 && (
        <div className="ybt-track" style={{ animationDuration: `${Math.max(30, items.length * 6)}s` }}>
          {line(0)}{line(1)}
        </div>
      )}
      {/* Global: the items are built outside the render tree styled-jsx scopes; every class is ybt-prefixed. */}
      <style jsx global>{`
        .ybt { position:relative; height:var(--row4-h, 56px); overflow:hidden; display:flex; align-items:center;
          background-color:#070503;
          background-image:radial-gradient(rgba(255,160,40,.07) 1px, transparent 1.4px);
          background-size:4px 4px;
          border-top:1px solid #1d1408; border-bottom:1px solid #1d1408; }
        .ybt-track { display:inline-flex; flex:none; white-space:nowrap; animation:ybt-scroll linear infinite; will-change:transform; }
        .ybt:hover .ybt-track { animation-play-state:paused; }
        .ybt-item, .ybt-msg { display:inline-flex; align-items:baseline; gap:10px; padding:0 28px; font-size:22px; font-weight:900; letter-spacing:.06em;
          color:#ffb238; text-shadow:0 0 3px rgba(255,170,40,.9), 0 0 10px rgba(255,120,0,.55); }
        .ybt-msg { padding:0 16px; }
        .ybt-item + .ybt-item { border-left:2px dotted rgba(255,160,40,.35); }
        .ybt-tag { font-size:14px; font-weight:700; color:#ff7a1a; text-shadow:0 0 3px rgba(255,110,20,.9); }
        .ybt-lead { color:#fff3c4; text-shadow:0 0 3px rgba(255,230,160,.95), 0 0 12px rgba(255,190,60,.7); }
        .ybt-dash { opacity:.7; }
        .ybt-status { font-size:14px; font-weight:700; color:#ff7a1a; text-shadow:0 0 3px rgba(255,110,20,.9); }
        @keyframes ybt-scroll { from { transform:translateX(0); } to { transform:translateX(-50%); } }
        @media (prefers-reduced-motion: reduce) {
          .ybt { overflow-x:auto; }
          .ybt-track { animation:none; }
        }
      `}</style>
    </div>
  );
}
