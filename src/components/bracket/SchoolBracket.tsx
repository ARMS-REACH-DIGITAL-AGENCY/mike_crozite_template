'use client';

// src/components/bracket/SchoolBracket.tsx
// The Fantasy Bracket Tourney tab (the 2026 simulation). Every school's
// page is the same page: the tournament in sections, the round in progress
// on top and each finished round underneath (the history). Row 3's school
// tile swaps it for this school's whole season, newest round first (its
// bracket series, or its weekly region leaderboard games once it's out). Each series is one row: game 1, game 2, game 3. The single
// games (Leaderboard 8, Grand Final) pack three to a row. Row 3's tiles
// (BracketRow3) also filter by region, or show the regional leaderboards.
//
// "Current" follows the calendar. ?asof=YYYY-MM-DD previews any date: only
// games final by then show.

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  type Index, type LbGame, type Row, type Stage,
  LAST_WEEK, REGIONS, Leaderboards, SeriesRowView, Styles,
  buildRows, fmtRange, lastFinalWeek, loadIndex, loadLb, previewDate, schoolStageRows, shortName, stageOfWeek, stageWeeks, useReveal, weekOfDate,
} from './gallery';
import { useBracketNav } from './bracketNav';
import BracketRules from './BracketRules';

const STAGE_NAME = (s: Stage) =>
  s.kind === 'round' ? ['Round 1', 'Round 2', 'Round 3', 'Round 4', 'Round 5', 'Round 6', 'Regional Final', 'Elite Eight', 'Final Four', 'Championship'][s.r - 1]
    : s.kind === 'lbt' ? 'Leaderboard 8' : s.kind === 'gf' ? 'Grand Final' : 'Leaderboards';

// The page is a list: a heading per round, then its rows.
type Item = { kind: 'head'; key: string; title: string; dates: string } | { kind: 'row'; key: string; row: Row };

function stageDates(index: Index, s: Stage) {
  const [a, b] = stageWeeks(s);
  const first = index.weeks[a - 1], last = index.weeks[b - 1];
  return first && last ? fmtRange(first[0], last[1]) : '';
}

// Row 3's school tile: this school's whole season, newest round first - its
// Leaderboard 8 / Grand Final games, then each round's three games (its
// bracket series while it's alive, its weekly region leaderboard games once
// it's out).
function teamItems(index: Index, lb: LbGame[], h: number, final: number): Item[] {
  if (!index.schools[h]) return [];
  const items: Item[] = [];
  const singles = [
    ...schoolStageRows(index, lb, h, { kind: 'gf' }, final),
    ...schoolStageRows(index, lb, h, { kind: 'lbt' }, final).sort((a, b) => b.week - a.week),
  ];
  if (singles.length) {
    const hasGf = singles.some((r) => r.roundLabel === 'Grand Final');
    items.push({ kind: 'head', key: 'h-t-singles', title: hasGf ? 'Grand Final · Leaderboard 8' : 'Leaderboard 8', dates: '' });
    items.push({ kind: 'row', key: 't-singles', row: { ...singles[0], key: 't-singles', bare: true, games: singles.flatMap((r) => r.games), files: singles.flatMap((r) => r.files), gameLabels: singles.flatMap((r) => r.gameLabels) } });
  }
  for (let r = 10; r >= 1; r--) {
    const s: Stage = { kind: 'round', r };
    const rows = schoolStageRows(index, lb, h, s, final);
    if (!rows.length) continue;
    items.push({ kind: 'head', key: `h-t-r${r}`, title: STAGE_NAME(s), dates: stageDates(index, s) });
    for (const row of rows) items.push({ kind: 'row', key: `t-${row.key}`, row });
  }
  return items;
}

function tournamentItems(index: Index, lb: LbGame[], final: number, region: number): Item[] {
  const regionOf = (h: number) => index.schools[h]?.[1];
  const keep = (r: Row) => !region || r.region === region || (!r.region && (regionOf(r.home) === region || regionOf(r.away) === region));
  const dates = (s: Stage) => stageDates(index, s);
  const items: Item[] = [];
  // The single games: the Grand Final, then the Leaderboard 8 (final first),
  // packed three to a row.
  const singles = [
    ...buildRows(index, lb, { kind: 'gf' }, final),
    ...buildRows(index, lb, { kind: 'lbt' }, final).sort((a, b) => b.week - a.week),
  ].filter(keep);
  if (singles.length) {
    const hasGf = singles.some((r) => r.roundLabel === 'Grand Final');
    const a = stageWeeks({ kind: 'lbt' })[0], b = stageWeeks(hasGf ? { kind: 'gf' } : { kind: 'lbt' })[1];
    items.push({
      kind: 'head', key: 'h-singles',
      title: hasGf ? 'Grand Final · Leaderboard 8' : 'Leaderboard 8',
      dates: index.weeks[a - 1] && index.weeks[b - 1] ? fmtRange(index.weeks[a - 1][0], index.weeks[b - 1][1]) : '',
    });
    for (let i = 0; i < singles.length; i += 3) {
      const chunk = singles.slice(i, i + 3);
      items.push({
        kind: 'row',
        key: `singles-${i}`,
        row: {
          ...chunk[0],
          key: `singles-${i}`,
          bare: true,
          games: chunk.flatMap((r) => r.games),
          files: chunk.flatMap((r) => r.files),
          gameLabels: chunk.flatMap((r) => r.gameLabels),
        },
      });
    }
  }
  // The bracket rounds, newest first: the round in progress on top.
  for (let r = 10; r >= 1; r--) {
    const s: Stage = { kind: 'round', r };
    const rows = buildRows(index, lb, s, final).filter(keep);
    if (!rows.length) continue;
    items.push({ kind: 'head', key: `h-r${r}`, title: STAGE_NAME(s), dates: dates(s) });
    for (const row of rows) items.push({ kind: 'row', key: row.key, row });
  }
  return items;
}

export default function SchoolBracket({ hsid }: { hsid: string }) {
  const home = Number(hsid);
  const sentinel = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState<Index | null>(null);
  const [lb, setLb] = useState<LbGame[] | null>(null);
  const [error, setError] = useState('');
  const [asof, setAsof] = useState('');
  const [boardWeek, setBoardWeek] = useState<number | null>(null);
  const nav = useBracketNav();

  // Load only once the tab is on screen (the section is hidden until then).
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { io.disconnect(); setOpen(true); }
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    if (!open) return;
    Promise.all([loadIndex(), loadLb()])
      .then(([i, g]) => { setAsof(previewDate()); setIndex(i); setLb(g); })
      .catch((e) => setError(String(e)));
  }, [open]);

  const cal = useMemo(() => {
    if (!index || !asof) return null;
    const week = weekOfDate(index, asof);
    const final = lastFinalWeek(index, asof);
    const current = week === 0 ? ({ kind: 'round', r: 1 } as Stage) : stageOfWeek(Math.min(week, index.weeks.length));
    return { week, final, current };
  }, [index, asof]);

  // The tournament (the same on every school's page), or with row 3's
  // school tile this school's whole season.
  const region = nav.region;
  const items = useMemo(() => {
    if (!index || !lb || !cal || nav.boards || nav.rules) return [];
    return nav.team ? teamItems(index, lb, home, cal.final) : tournamentItems(index, lb, cal.final, region);
  }, [index, lb, cal, nav.boards, nav.rules, nav.team, home, region]);
  const { shown, sentinel: more } = useReveal(items.length, 16);

  return (
    <div className="bl bl-embed ysb">
      <div ref={sentinel} className="ysb-top" />
      {error && <p className="bl-empty">Could not load the bracket ({error}).</p>}
      {!error && (!index || !lb || !cal) && <p className="bl-empty">Loading the 2026 bracket…</p>}
      {index && lb && cal && (
        <>
          <div className="bl-kick ysb-kick">
            2026 National Alumni Bracket · simulation · as of {asof}{region ? ` · Region ${region} · ${REGIONS[region]}` : ''}
          </div>

          {nav.rules ? (
            // Row 3's Rules tile: how everything is figured.
            <section className="ysb-block">
              <h3>Rules · how it&apos;s scored</h3>
              <BracketRules />
            </section>
          ) : nav.boards ? (
            <section className="ysb-block">
              <h3>Regional leaderboards</h3>
              <Leaderboards index={index} lb={lb} week={boardWeek ?? Math.max(1, Math.min(cal.final, LAST_WEEK))} setWeek={setBoardWeek}
                region={region} query="" onlyFavs={false} maxWeek={cal.final} />
            </section>
          ) : (
            <div className="bl-rows ysb-list">
              {nav.team && (
                <h3 className="ysb-team">
                  {index.schools[home] ? `${shortName(index.schools[home][0])} · 2026 season` : 'This school isn\u2019t in the 2026 bracket field.'}
                </h3>
              )}
              {items.slice(0, shown).map((it) => (it.kind === 'head'
                ? <h3 key={it.key} className="ysb-sec">{it.title}<span>{it.dates}</span></h3>
                : <SeriesRowView key={it.key} row={it.row} index={index} />))}
              {items.length === 0 && index.schools[home] && <p className="bl-muted">{cal.week === 0 ? `The 2026 bracket starts ${index.weeks[0][0]}.` : 'No games final yet.'}</p>}
              <div ref={more} className="bl-sentinel" aria-hidden="true" />
            </div>
          )}
          <p className="ysb-foot">Tap a tile above for your school&apos;s season, the leaderboards or one region; tap it again to show everything. Simulated on 2026 stats: pros are real box scores; college lines marked * are simulated from season totals.</p>
        </>
      )}
      <Styles />
      <style jsx>{`
        .ysb-top { height:1px; }
        .ysb-kick { max-width:1180px; margin:0 auto 14px; }
        .ysb-block { max-width:1180px; margin:0 auto 28px; }
        .ysb-block h3, .ysb-sec, .ysb-team { margin:0 0 12px; font:500 14px/1.2 Oswald, sans-serif; letter-spacing:.12em; text-transform:uppercase; color:var(--gold); border-bottom:1px solid var(--line); padding-bottom:8px; }
        .ysb-list { margin-bottom:28px; }
        .ysb-sec { display:flex; justify-content:space-between; gap:12px; margin-top:12px; }
        .ysb-sec span { color:var(--muted); letter-spacing:.06em; }
        .ysb-foot { max-width:1180px; margin:0 auto; color:var(--muted); font-size:12px; }
      `}</style>
    </div>
  );
}
