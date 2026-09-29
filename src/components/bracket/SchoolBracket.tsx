'use client';

// src/components/bracket/SchoolBracket.tsx
// The Fantasy Bracket Tourney tab (the 2026 simulation). Every school's
// page is the same page: row one is this school's cards for the current
// round (its bracket series, or its weekly region leaderboard games once
// it's out); everything below is the whole tournament, newest round first,
// the same on every subdomain and filtered by the round and region tiles
// in row 3 (BracketRow3).
//
// "Current" follows the calendar. ?asof=YYYY-MM-DD previews any date: only
// games final by then show, and later rounds are locked.

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  type Index, type LbGame, type Row, type Stage,
  LAST_WEEK, REGIONS, Leaderboards, SeriesRowView, Styles,
  buildRows, lastFinalWeek, loadIndex, loadLb, schoolStageRows, shortName, stageOfWeek, stageWeeks, useReveal, weekOfDate,
} from './gallery';
import { setBracketNav, useBracketNav } from './bracketNav';

const STAGE_NAME = (s: Stage) =>
  s.kind === 'round' ? ['Round 1', 'Round 2', 'Round 3', 'Round 4', 'Round 5', 'Round 6', 'Regional Final', 'Elite Eight', 'Final Four', 'Championship'][s.r - 1]
    : s.kind === 'lbt' ? 'Leaderboard 8' : s.kind === 'gf' ? 'Grand Final' : 'Leaderboards';
// Newest first: the whole tournament, below row one.
const ALL_STAGES: Stage[] = [{ kind: 'gf' }, { kind: 'lbt' }, ...Array.from({ length: 10 }, (_, i) => ({ kind: 'round', r: 10 - i }) as Stage)];

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
  useEffect(() => {
    if (cal) setBracketNav({ current: cal.current, currentWeek: cal.week });
  }, [cal]);

  // Row one: this school's current round.
  const mine = useMemo(() => (index && lb && cal ? ownGames(index, lb, home, cal.current, cal.final) : NO_GAMES), [index, lb, cal, home]);

  // Everything below: the whole tournament (or the round picked in row 3),
  // newest first, the same on every school's page.
  const region = nav.region;
  const results = useMemo(() => {
    if (!index || !lb || !cal || nav.stage?.kind === 'boards') return [];
    const regionOf = (h: number) => index.schools[h]?.[1];
    const stages = nav.stage ? [nav.stage] : ALL_STAGES;
    return stages
      .flatMap((s) => buildRows(index, lb, s, cal.final))
      .filter((r) => !region || r.region === region || (!r.region && (regionOf(r.home) === region || regionOf(r.away) === region)));
  }, [index, lb, cal, nav.stage, region]);
  const { shown, sentinel: more } = useReveal(results.length);

  const title = `${nav.stage ? STAGE_NAME(nav.stage) : 'The whole tournament'}${region ? ` · Region ${region} · ${REGIONS[region]}` : ''}`;

  return (
    <div className="bl bl-embed ysb">
      <div ref={sentinel} className="ysb-top" />
      {error && <p className="bl-empty">Could not load the bracket ({error}).</p>}
      {!error && (!index || !lb || !cal) && <p className="bl-empty">Loading the 2026 bracket…</p>}
      {index && lb && cal && (
        <>
          <div className="bl-kick ysb-kick">2026 National Alumni Bracket · simulation · as of {asof}</div>

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

          <section className="ysb-block">
            <h3>{title}</h3>
            {nav.stage?.kind === 'boards' ? (
              <Leaderboards index={index} lb={lb} week={boardWeek ?? Math.max(1, Math.min(cal.final, LAST_WEEK))} setWeek={setBoardWeek}
                region={region} query="" onlyFavs={false} maxWeek={cal.final} />
            ) : (
              <div className="bl-rows">
                {results.slice(0, shown).map((row) => <SeriesRowView key={row.key} row={row} index={index} />)}
                {results.length === 0 && <p className="bl-muted">No games final here yet.</p>}
                <div ref={more} className="bl-sentinel" aria-hidden="true" />
              </div>
            )}
          </section>
          <p className="ysb-foot">Filter by round or region with the tiles above; tap a tile again to show everything. Simulated on 2026 stats: pros are real box scores; college lines marked * are simulated from season totals.</p>
        </>
      )}
      <Styles />
      <style jsx>{`
        .ysb-top { height:1px; }
        .ysb-kick { max-width:1180px; margin:0 auto 14px; }
        .ysb-block { max-width:1180px; margin:0 auto 28px; }
        .ysb-block h3 { margin:0 0 12px; font:500 14px/1.2 Oswald, sans-serif; letter-spacing:.12em; text-transform:uppercase; color:var(--gold); border-bottom:1px solid var(--line); padding-bottom:8px; }
        .ysb-foot { max-width:1180px; margin:0 auto; color:var(--muted); font-size:12px; }
      `}</style>
    </div>
  );
}
