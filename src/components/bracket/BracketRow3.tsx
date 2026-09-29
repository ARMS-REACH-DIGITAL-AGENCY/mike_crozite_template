'use client';

// src/components/bracket/BracketRow3.tsx
// Row 3 on the Fantasy Bracket Tourney tab: in place of the alumni
// headshots, the Round filter (top line) and the Region filter (bottom
// line) for the tournament results below.

import { useEffect, useState } from 'react';
import { type Index, type Stage, REGIONS, fmtRange, loadIndex, stageKey, stageWeeks } from './gallery';
import { setBracketNav, useBracketNav } from './bracketNav';

const STAGES: { stage: Stage; label: string }[] = [
  { stage: { kind: 'boards' }, label: 'Leaderboards' },
  ...Array.from({ length: 10 }, (_, i) => ({
    stage: { kind: 'round', r: i + 1 } as Stage,
    label: ['R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'Regional Final', 'Elite 8', 'Final 4', 'Championship'][i],
  })),
  { stage: { kind: 'lbt' }, label: 'Leaderboard 8' },
  { stage: { kind: 'gf' }, label: 'Grand Final' },
];

export default function BracketRow3() {
  const nav = useBracketNav();
  const [index, setIndex] = useState<Index | null>(null);
  useEffect(() => {
    loadIndex().then(setIndex).catch(() => {});
  }, []);

  const current = nav.current ? stageKey(nav.current) : null;
  const picked = nav.stage ? stageKey(nav.stage) : current;
  const region = nav.region ?? nav.homeRegion;
  const dates = (s: Stage) => {
    if (!index) return '';
    const [a, b] = stageWeeks(s);
    const first = index.weeks[a - 1], last = index.weeks[b - 1];
    return first && last ? fmtRange(first[0], last[1]) : '';
  };

  return (
    <div className="ybr3" aria-label="Fantasy bracket filters">
      <div className="ybr3-line" role="group" aria-label="Round">
        {STAGES.map(({ stage, label }) => {
          const key = stageKey(stage);
          // Stages that haven't started yet on the preview date are locked.
          const locked = !!nav.current && stageWeeks(stage)[0] > Math.max(nav.currentWeek, 1);
          return (
            <button key={key} type="button" disabled={locked}
              className={`ybr3-chip${picked === key ? ' on' : ''}${current === key ? ' now' : ''}`}
              onClick={() => setBracketNav({ stage })}>
              <b>{label}</b><span>{current === key ? 'Now' : dates(stage)}</span>
            </button>
          );
        })}
      </div>
      <div className="ybr3-line" role="group" aria-label="Region">
        <button type="button" className={`ybr3-chip sm${region === 0 ? ' on' : ''}`} onClick={() => setBracketNav({ region: 0 })}>
          <b>All regions</b>
        </button>
        {Object.entries(REGIONS).map(([k, v]) => {
          const r = Number(k);
          return (
            <button key={k} type="button" className={`ybr3-chip sm${region === r ? ' on' : ''}${nav.homeRegion === r ? ' home' : ''}`}
              onClick={() => setBracketNav({ region: r })}>
              <b>Region {r}</b><span>{v}</span>
            </button>
          );
        })}
      </div>
      <style jsx>{`
        .ybr3 { min-height:var(--row3-h, 100px); background:var(--header-bg); display:flex; flex-direction:column; justify-content:center; gap:6px; padding:6px 16px; }
        .ybr3-line { display:flex; gap:6px; overflow-x:auto; scrollbar-width:none; }
        .ybr3-line::-webkit-scrollbar { display:none; }
        .ybr3-chip { flex:none; display:flex; flex-direction:column; align-items:flex-start; justify-content:center; gap:1px; min-height:40px; padding:4px 10px;
          border:1px solid var(--line); border-radius:8px; background:var(--card-bg); color:var(--fg); cursor:pointer; text-align:left; }
        .ybr3-chip b { font:600 12.5px/1.1 Oswald, sans-serif; letter-spacing:.04em; text-transform:uppercase; white-space:nowrap; }
        .ybr3-chip span { font:400 10.5px/1.1 Oswald, sans-serif; letter-spacing:.03em; color:var(--muted); white-space:nowrap; }
        .ybr3-chip.sm { min-height:34px; }
        .ybr3-chip.now span { color:var(--gold); }
        .ybr3-chip.home b::after { content:' ★'; color:var(--gold); }
        .ybr3-chip.on { background:var(--gold); border-color:var(--gold); color:#000; }
        .ybr3-chip.on span { color:rgba(0,0,0,.7); }
        .ybr3-chip:disabled { opacity:.35; cursor:default; }
      `}</style>
    </div>
  );
}
