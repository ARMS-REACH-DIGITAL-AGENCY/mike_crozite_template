'use client';

// src/components/bracket/SchoolBracket.tsx
// A school's Fantasy Bracket Tourney tab (the 2026 simulation): first the
// school's own game cards for the current round - its bracket series, or
// its weekly leaderboard games once it's out - then the tournament results
// for the round and region picked in row 3 (BracketRow3).
//
// "Current" follows the calendar. ?asof=YYYY-MM-DD previews any date: only
// games final by then show, and later rounds are locked.

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  type Index, type LbGame, type Row, type Stage,
  LAST_WEEK, REGIONS, ROUND_SHORT, Leaderboards, SeriesRowView, Styles,
  buildRows, eliminations, lastFinalWeek, loadIndex, loadLb, ordinal, place, rankRegion,
  schoolStageRows, shortName, stageOfWeek, stageWeeks, standings, useReveal, weekOfDate,
} from './gallery';
import { setBracketNav, useBracketNav } from './bracketNav';

const STAGE_NAME = (s: Stage) =>
  s.kind === 'round' ? ['Round 1', 'Round 2', 'Round 3', 'Round 4', 'Round 5', 'Round 6', 'Regional Final', 'Elite Eight', 'Final Four', 'Championship'][s.r - 1]
    : s.kind === 'lbt' ? 'Leaderboard 8' : s.kind === 'gf' ? 'Grand Final' : 'Leaderboards';

// A school's own cards: the current stage, or its latest games when it has
// none there (out of the Leaderboard 8, say).
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
  const [focus, setFocus] = useState(home); // another school tapped in the results
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

  const school = index?.schools[focus];
  const homeRegion = index?.schools[home]?.[1] ?? 0;
  useEffect(() => {
    if (!cal) return;
    setBracketNav({ current: cal.current, currentWeek: cal.week, homeRegion });
  }, [cal, homeRegion]);

  const stage = nav.stage ?? cal?.current ?? null;
  const region = nav.region ?? homeRegion;

  const mine = useMemo(() => (index && lb && cal ? ownGames(index, lb, focus, cal.current, cal.final) : NO_GAMES), [index, lb, cal, focus]);

  // The tournament results for the picked round and region.
  const results = useMemo(() => {
    if (!index || !lb || !cal || !stage || stage.kind === 'boards') return [];
    return buildRows(index, lb, stage, cal.final).filter((r) => !region || !r.region || r.region === region);
  }, [index, lb, cal, stage, region]);
  const { shown, sentinel: more } = useReveal(results.length);

  const summary = useMemo(() => {
    if (!index || !lb || !cal || !school) return null;
    const through = Math.min(cal.final, LAST_WEEK);
    const st = standings(index, lb, through);
    const rank = rankRegion(index, st, school[1]).findIndex((s) => s.h === focus) + 1;
    const e = eliminations(index).get(focus);
    const s = st.get(focus)!;
    let bracket = 'Still alive in the bracket';
    if (e && e.week <= cal.final) bracket = `Out of the bracket in ${ROUND_SHORT[e.round - 1]} (week ${e.week})`;
    if (focus === index.champion && cal.final >= LAST_WEEK) bracket = 'Won the bracket';
    return { through, rank, s, bracket };
  }, [index, lb, cal, school, focus]);

  const openSchool = (h: number) => {
    setFocus(h);
    sentinel.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="bl bl-embed ysb">
      <div ref={sentinel} className="ysb-top" />
      {error && <p className="bl-empty">Could not load the bracket ({error}).</p>}
      {!error && (!index || !lb || !cal) && <p className="bl-empty">Loading the 2026 bracket…</p>}
      {index && lb && cal && !school && (
        <p className="bl-empty">This school isn&apos;t in the 2026 National Alumni Bracket field.</p>
      )}
      {index && lb && cal && school && summary && (
        <>
          <header className="ysb-head">
            <div className="bl-kick">2026 National Alumni Bracket · simulation · as of {asof}</div>
            {focus !== home && (
              <button type="button" className="bl-backlink" onClick={() => setFocus(home)}>‹ Back to {shortName(index.schools[home][0])}</button>
            )}
            <h2>{shortName(school[0])} <i>{place(school[0])}</i></h2>
            <p className="bl-sum">
              Region {school[1]} · {REGIONS[school[1]]} · #{school[2]} seed · <b>{summary.rank}{ordinal(summary.rank)}</b> on the region leaderboard with <b>{summary.s.rf} runs</b> ({summary.s.rf - summary.s.ra >= 0 ? '+' : ''}{summary.s.rf - summary.s.ra}) through week {summary.through} · {summary.bracket}
            </p>
          </header>

          <section className="ysb-block">
            <h3>
              {mine.stage
                ? `${mine.latest ? 'Latest games' : 'This round'} · ${STAGE_NAME(mine.stage)}${mine.rows.some((r) => r.plain) ? ' weeks · region leaderboard games' : ''}`
                : 'This round'}
            </h3>
            {cal.week === 0 && <p className="bl-muted">The 2026 bracket starts {index.weeks[0][0]}.</p>}
            {cal.week > 0 && !mine.rows.length && <p className="bl-muted">No games final yet this round.</p>}
            <div className="bl-rows">
              {mine.rows.map((row) => <SeriesRowView key={`mine-${row.key}`} row={row} index={index} onOpen={openSchool} />)}
            </div>
          </section>

          <section className="ysb-block">
            <h3>
              Tournament results · {stage ? STAGE_NAME(stage) : ''}
              {stage && stage.kind !== 'lbt' && stage.kind !== 'gf' && !(stage.kind === 'round' && stage.r >= 8) ? ` · ${region ? `Region ${region}` : 'All regions'}` : ''}
            </h3>
            {stage?.kind === 'boards' ? (
              <Leaderboards index={index} lb={lb} week={boardWeek ?? Math.max(1, Math.min(cal.final, LAST_WEEK))} setWeek={setBoardWeek}
                region={region} query="" onlyFavs={false} onOpen={openSchool} maxWeek={cal.final} />
            ) : (
              <div className="bl-rows">
                {results.slice(0, shown).map((row) => <SeriesRowView key={row.key} row={row} index={index} onOpen={openSchool} />)}
                {results.length === 0 && <p className="bl-muted">No games final in {stage ? STAGE_NAME(stage) : 'this round'} yet.</p>}
                <div ref={more} className="bl-sentinel" aria-hidden="true" />
              </div>
            )}
          </section>
          <p className="ysb-foot">Pick a round and a region in the row above. Simulated on 2026 stats: pros are real box scores; college lines marked * are simulated from season totals.</p>
        </>
      )}
      <Styles />
      <style jsx>{`
        .ysb-top { height:1px; scroll-margin-top:220px; }
        .ysb-head { max-width:1180px; margin:0 auto 18px; display:flex; flex-direction:column; gap:6px; }
        .ysb-head h2 { margin:0; font:400 clamp(30px,5vw,46px)/1 "Bebas Neue", Oswald, sans-serif; letter-spacing:.02em; }
        .ysb-head h2 i { font:400 14px/1 system-ui, sans-serif; color:var(--muted); font-style:normal; }
        .ysb-block { max-width:1180px; margin:0 auto 28px; }
        .ysb-block h3 { margin:0 0 12px; font:500 14px/1.2 Oswald, sans-serif; letter-spacing:.12em; text-transform:uppercase; color:var(--gold); border-bottom:1px solid var(--line); padding-bottom:8px; }
        .ysb-foot { max-width:1180px; margin:0 auto; color:var(--muted); font-size:12px; }
      `}</style>
    </div>
  );
}
