'use client';

// src/components/bracket/BracketRow3.tsx
// Row 3 on the Fantasy Bracket Tourney tab. It works like the News tab's
// headshot strip: the same tiles, but each one is a round or a region. A
// tile filters the tournament below; the same tile again shows everything.
// Rounds that haven't started on the preview date are locked.

import { useEffect, useRef, useState } from 'react';
import { type Stage, REGIONS, stageKey, stageWeeks } from './gallery';
import { setBracketNav, useBracketNav } from './bracketNav';

const ROUND_TILES: { stage: Stage; big: string; name: string }[] = [
  { stage: { kind: 'boards' }, big: 'LB', name: 'Leaderboards' },
  ...['R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'RF', 'E8', 'F4', 'CH'].map((big, i) => ({
    stage: { kind: 'round', r: i + 1 } as Stage,
    big,
    name: ['Round 1', 'Round 2', 'Round 3', 'Round 4', 'Round 5', 'Round 6', 'Reg. Final', 'Elite 8', 'Final 4', 'Champ.'][i],
  })),
  { stage: { kind: 'lbt' }, big: 'L8', name: 'LB 8' },
  { stage: { kind: 'gf' }, big: 'GF', name: 'Grand Final' },
];

export default function BracketRow3() {
  const nav = useBracketNav();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () => setEdges({ left: el.scrollLeft > 0, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 1 });
    update();
    el.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    return () => { el.removeEventListener('scroll', update); window.removeEventListener('resize', update); };
  }, []);

  const scroll = (dir: 1 | -1) => {
    const el = scrollRef.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: 'smooth' });
  };
  const picked = nav.stage ? stageKey(nav.stage) : '';
  const current = nav.current ? stageKey(nav.current) : '';

  return (
    <div className="gallery-strip ybr3" data-active-section="fantasy">
      <button type="button" className={`gallery-strip-arrow left ${edges.left ? '' : 'hidden'}`} onClick={() => scroll(-1)} aria-label="Scroll left">‹</button>
      <div ref={scrollRef} className="gallery-strip-inner" role="group" aria-label="Filter the tournament by round or region">
        {ROUND_TILES.map(({ stage, big, name }) => {
          const key = stageKey(stage);
          const locked = !!nav.current && stageWeeks(stage)[0] > Math.max(nav.currentWeek, 1);
          const on = picked === key;
          return (
            <button key={key} type="button" disabled={locked} title={name} aria-pressed={on}
              className={`gallery-slot ybr3-tile${on ? ' is-active on' : ''}${locked ? ' locked' : ''}`}
              onClick={() => setBracketNav({ stage: on ? null : stage })}>
              {current === key && <span className="ybr3-now">Now</span>}
              <span className="ybr3-big">{big}</span>
              <span className="ybr3-name">{name}</span>
            </button>
          );
        })}
        <span className="ybr3-gap" aria-hidden="true" />
        {Object.entries(REGIONS).map(([k, v]) => {
          const r = Number(k);
          const on = nav.region === r;
          return (
            <button key={k} type="button" title={`Region ${r} · ${v}`} aria-pressed={on}
              className={`gallery-slot ybr3-tile region${on ? ' is-active on' : ''}`}
              onClick={() => setBracketNav({ region: on ? 0 : r })}>
              <span className="ybr3-kick">Region</span>
              <span className="ybr3-big">{r}</span>
              <span className="ybr3-name">{v.replace(/^The /, '')}</span>
            </button>
          );
        })}
      </div>
      <button type="button" className={`gallery-strip-arrow right ${edges.right ? '' : 'hidden'}`} onClick={() => scroll(1)} aria-label="Scroll right">›</button>
      <style jsx>{`
        .ybr3-tile { position:relative; padding:0; border:0; cursor:pointer; color:#fff; background:#111;
          display:flex; flex-direction:column; align-items:center; justify-content:center; font:inherit; }
        .ybr3-tile::after { content:''; position:absolute; left:0; right:0; bottom:0; height:50%; pointer-events:none;
          background:linear-gradient(to top, rgba(0,0,0,.8) 0%, rgba(0,0,0,.45) 34%, rgba(0,0,0,0) 100%); }
        .ybr3-tile.region { background:#1a1d22; }
        .ybr3-big { font:400 34px/1 "Bebas Neue", Oswald, sans-serif; letter-spacing:.02em; margin-top:-6px; }
        .ybr3-kick { position:absolute; top:7px; left:0; right:0; text-align:center; font:700 8.5px/1 Oswald, sans-serif; letter-spacing:.12em; text-transform:uppercase; color:#9e9e9e; }
        .ybr3-now { position:absolute; top:6px; left:50%; transform:translateX(-50%); font:700 8.5px/1 Oswald, sans-serif; letter-spacing:.12em; text-transform:uppercase; color:#000; background:var(--gold, #ffc107); padding:2px 4px; border-radius:2px; }
        .ybr3-name { position:absolute; left:2px; right:2px; bottom:5px; z-index:2; text-align:center; font:700 9.5px/1.05 Oswald, sans-serif; letter-spacing:.06em; text-transform:uppercase; color:#fff; }
        .ybr3-tile.on { background:var(--gold, #ffc107); color:#000; }
        .ybr3-tile.on::after { display:none; }
        .ybr3-tile.on .ybr3-name, .ybr3-tile.on .ybr3-kick { color:#000; }
        .ybr3-tile.on .ybr3-now { background:#000; color:var(--gold, #ffc107); }
        .ybr3-tile.locked { opacity:.28; cursor:default; }
        .ybr3-gap { flex:0 0 10px; }
      `}</style>
    </div>
  );
}
