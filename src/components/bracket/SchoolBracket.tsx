'use client';

// src/components/bracket/SchoolBracket.tsx
// The Fantasy Bracket Tourney tab (the 2026 simulation). Every school's
// page is the same page: the tournament in sections, the round in progress
// on top and each finished round underneath (the history). Row 3's school
// tile swaps it for this school's whole season, newest round first (its
// bracket series, or its weekly region leaderboard games once it's out). Each series is one row: game 1, game 2, game 3. The single
// games (Season Championship Tournament, Fantasy World Series) pack three to a row. Row 3's tiles
// (BracketRow3) also filter by region, or show the regional leaderboards.
//
// "Current" follows the calendar. ?asof=YYYY-MM-DD previews any date: only
// games final by then show.

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  type Index, type LbGame, type Row, type Stage,
  LAST_WEEK, LBT_ROUNDS, REGIONS, SCT, WORLD_SERIES, WORLD_SERIES_FULL, type GameRow, Leaderboards, SeriesRowView, Styles,
  buildRows, fmtRange, lastFinalWeek, loadIndex, loadLb, previewDate, schoolStageRows, seriesInRound, shortName, stageOfWeek, stageWeeks, useReveal, weekOfDate,
} from './gallery';
import { useBracketNav } from './bracketNav';
import BracketRules from './BracketRules';

// Round 1 · 512 series ... Round 10 · 1 series.
const STAGE_NAME = (s: Stage) =>
  s.kind === 'round' ? `Round ${s.r} · ${seriesInRound(s.r)} series` : s.kind === 'lbt' ? SCT : s.kind === 'gf' ? WORLD_SERIES : 'Leaderboards';


// The page is a list: a heading per round, then its rows.
type Item = { kind: 'head'; key: string; title: string; dates: string } | { kind: 'row'; key: string; row: Row };

function stageDates(index: Index, s: Stage) {
  const [a, b] = stageWeeks(s);
  const first = index.weeks[a - 1], last = index.weeks[b - 1];
  return first && last ? `${a === b ? `Week ${a}` : `Weeks ${a}–${b}`} · ${fmtRange(first[0], last[1])}` : '';
}

// Weeks 31-34, newest first, each week its own section:
//   Week 34 - the Fantasy World Series: a card per school (front its box
//             score, back its fans in the World Series Tickets Raffle), and
//             a card still to come.
//   Week 33 - the Season Championship Game, and the Bracket Champ waiting.
//   Week 32 - the 2 games and their fan picks card.
//   Week 31 - 2 rows: 2 games and their fan picks card.
// keep: whether a game shows (a region, a school).
function postseasonItems(index: Index, final: number, keep: (g: GameRow) => boolean): Item[] {
  const items: Item[] = [];
  const W = LAST_WEEK;
  const dates = (w: number) => (index.weeks[w - 1] ? `Week ${w} · ${fmtRange(index.weeks[w - 1][0], index.weeks[w - 1][1])}` : '');
  const row = (key: string, games: GameRow[], extra: Partial<Row> = {}): Item => ({
    kind: 'row', key,
    row: {
      key, roundLabel: '', title: '', week: games[0]?.[1] ?? 0, region: 0, home: 0, away: 0, homeSeed: 0, awaySeed: 0, result: '',
      bare: true, games, files: games.map((g) => (g[1] === W + 4 ? 'd-gf' : 'd-lbt')), gameLabels: games.map(label), ...extra,
    },
  });
  function label(g: GameRow) {
    return g[1] === W + 4 ? WORLD_SERIES : g[1] === W + 3 ? 'Season Championship Game' : `Season Championship ${LBT_ROUNDS[g[1]]}`;
  }
  const lbt = (w: number) => index.lbt.map((x) => x.game).filter((g) => g[1] === w);

  const ws = index.gf.filter((g) => g[1] <= final && keep(g));
  if (ws.length) {
    items.push({ kind: 'head', key: 'h-w34', title: WORLD_SERIES_FULL, dates: dates(W + 4) });
    const g = ws[0];
    items.push(row('w34', [g, g], { fronts: ['h', 'a'], fansBack: true, extras: [{ kind: 'tbd' }] }));
  }
  const champ = lbt(W + 3).filter((g) => g[1] <= final);
  // The Bracket Champ's own page shows it waiting here too.
  const champIn = keep([0, W + 3, index.champion, index.champion, '', [], null]);
  if (champ.length && (champ.some(keep) || champIn)) {
    items.push({ kind: 'head', key: 'h-w33', title: 'Season Championship Game', dates: dates(W + 3) });
    items.push(row('w33', champ, { extras: [{ kind: 'wait', h: index.champion }] }));
  }
  for (const [w, name] of [[W + 2, 'Round 2'], [W + 1, 'Round 1']] as const) {
    const games = lbt(w).filter((g) => g[1] <= final);
    const pairs: GameRow[][] = [];
    for (let i = 0; i < games.length; i += 2) pairs.push(games.slice(i, i + 2));
    const shown = pairs.filter((pair) => pair.some(keep));
    if (!shown.length) continue;
    items.push({ kind: 'head', key: `h-w${w}`, title: `${SCT} · ${name}`, dates: dates(w) });
    shown.forEach((pair, i) => items.push(row(`w${w}-${i}`, pair, { extras: [{ kind: 'fans', games: pair }] })));
  }
  return items;
}

// Row 3's school tile: this school's whole season, newest round first - its
// Fantasy World Series / Season Championship Tournament games, then each round's three games (its
// bracket series while it's alive, its weekly region leaderboard games once
// it's out).
function teamItems(index: Index, lb: LbGame[], h: number, final: number): Item[] {
  if (!index.schools[h]) return [];
  const items: Item[] = postseasonItems(index, final, (g) => g[2] === h || g[3] === h);
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
  // Weeks 31-34 on top, then the bracket rounds.
  const items: Item[] = postseasonItems(index, final, (g) => !region || regionOf(g[2]) === region || regionOf(g[3]) === region);
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
