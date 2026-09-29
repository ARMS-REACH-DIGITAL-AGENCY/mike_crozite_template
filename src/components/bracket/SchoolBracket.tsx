'use client';

// src/components/bracket/SchoolBracket.tsx
// The Fantasy Bracket Tourney tab (the 2026 simulation). Every school's
// page is the same page: row one is this school's cards for the current
// round (its bracket series, or its weekly region leaderboard games once
// it's out); below it the tournament in sections, the round in progress on
// top and each finished round underneath (the history), the same on every
// subdomain. Each series is one row: game 1, game 2, game 3. The single
// games (Leaderboard 8, Grand Final) pack three to a row. Row 3's tiles
// (BracketRow3) filter by region, or show the regional leaderboards.
//
// "Current" follows the calendar. ?asof=YYYY-MM-DD previews any date: only
// games final by then show.

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  type Index, type LbGame, type Row, type Stage,
  LAST_WEEK, REGIONS, Leaderboards, SeriesRowView, Styles,
  buildRows, fmtRange, lastFinalWeek, loadIndex, loadLb, schoolStageRows, shortName, stageOfWeek, stageWeeks, useReveal, weekOfDate,
} from './gallery';
import { useBracketNav } from './bracketNav';

const STAGE_NAME = (s: Stage) =>
  s.kind === 'round' ? ['Round 1', 'Round 2', 'Round 3', 'Round 4', 'Round 5', 'Round 6', 'Regional Final', 'Elite Eight', 'Final Four', 'Championship'][s.r - 1]
    : s.kind === 'lbt' ? 'Leaderboard 8' : s.kind === 'gf' ? 'Grand Final' : 'Leaderboards';

// A school's cards for the current stage, or its latest games when it has
// none there (not in the Leaderboard 8, say).
type OwnGames = { rows: Row[]; stage: Stage | null; latest: boolean };
const NO_GAMES: OwnGames = { rows: [], stage: null, latest: false };
function ownGames(index: Index, lb: LbGame[], h: number, current: Stage, final: number): OwnGames {
  if (!index.schools[h]) return NO_GAMES;
  const now = schoolStageRows(index, lb, h, current, final);
  if (now.length) return { rows: now, stage: current, latest: false };
  let w = Math.min(final, LAST_WEEK + 4);
  while (w >= 1) {
    const s = stageOfWeek(w);
    const rows = schoolStageRows(index, lb, h, s, final);
    if (rows.length) return { rows, stage: s, latest: true };
    w = stageWeeks(s)[0] - 1;
  }
  return NO_GAMES;
}

// The tournament below row one: a heading per section, then its rows.
type Item = { kind: 'head'; key: string; title: string; dates: string } | { kind: 'row'; key: string; row: Row };
function tournamentItems(index: Index, lb: LbGame[], final: number, region: number): Item[] {
  const regionOf = (h: number) => index.schools[h]?.[1];
  const keep = (r: Row) => !region || r.region === region || (!r.region && (regionOf(r.home) === region || regionOf(r.away) === region));
  const dates = (s: Stage) => {
    const [a, b] = stageWeeks(s);
    const first = index.weeks[a - 1], last = index.weeks[b - 1];
    return first && last ? fmtRange(first[0], last[1]) : '';
  };
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

function previewDate() {
  const q = new URLSearchParams(window.location.search).get('asof') || '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(q)) return q;
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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

  // Row one: this school's current round.
  const mine = useMemo(() => (index && lb && cal ? ownGames(index, lb, home, cal.current, cal.final) : NO_GAMES), [index, lb, cal, home]);

  // Everything below, the same on every school's page.
  const region = nav.region;
  const items = useMemo(() => (index && lb && cal && !nav.boards ? tournamentItems(index, lb, cal.final, region) : []), [index, lb, cal, nav.boards, region]);
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

          {index.schools[home] && (
            <section className="ysb-block">
              <h3>
                {shortName(index.schools[home][0])} · {mine.stage ? `${mine.latest ? 'latest games' : 'this round'} · ${STAGE_NAME(mine.stage)}` : 'this round'}
              </h3>
              {cal.week === 0 && <p className="bl-muted">The 2026 bracket starts {index.weeks[0][0]}.</p>}
              {cal.week > 0 && !mine.rows.length && <p className="bl-muted">No games final yet this round.</p>}
              <div className="bl-rows">
                {mine.rows.map((row) => <SeriesRowView key={`mine-${row.key}`} row={row} index={index} />)}
              </div>
            </section>
          )}

          {nav.boards ? (
            <section className="ysb-block">
              <h3>Regional leaderboards</h3>
              <Leaderboards index={index} lb={lb} week={boardWeek ?? Math.max(1, Math.min(cal.final, LAST_WEEK))} setWeek={setBoardWeek}
                region={region} query="" onlyFavs={false} maxWeek={cal.final} />
            </section>
          ) : (
            <div className="bl-rows ysb-list">
              {items.slice(0, shown).map((it) => (it.kind === 'head'
                ? <h3 key={it.key} className="ysb-sec">{it.title}<span>{it.dates}</span></h3>
                : <SeriesRowView key={it.key} row={it.row} index={index} />))}
              {items.length === 0 && <p className="bl-muted">No games final yet.</p>}
              <div ref={more} className="bl-sentinel" aria-hidden="true" />
            </div>
          )}
          <p className="ysb-foot">Filter by region with the tiles above (tap a tile again to show every region). Simulated on 2026 stats: pros are real box scores; college lines marked * are simulated from season totals.</p>
        </>
      )}
      <Styles />
      <style jsx>{`
        .ysb-top { height:1px; }
        .ysb-kick { max-width:1180px; margin:0 auto 14px; }
        .ysb-block { max-width:1180px; margin:0 auto 28px; }
        .ysb-block h3, .ysb-sec { margin:0 0 12px; font:500 14px/1.2 Oswald, sans-serif; letter-spacing:.12em; text-transform:uppercase; color:var(--gold); border-bottom:1px solid var(--line); padding-bottom:8px; }
        .ysb-list { margin-bottom:28px; }
        .ysb-sec { display:flex; justify-content:space-between; gap:12px; margin-top:12px; }
        .ysb-sec span { color:var(--muted); letter-spacing:.06em; }
        .ysb-foot { max-width:1180px; margin:0 auto; color:var(--muted); font-size:12px; }
      `}</style>
    </div>
  );
}
