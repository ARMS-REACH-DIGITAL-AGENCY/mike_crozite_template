'use client';

// src/components/bracket/gallery.tsx
// Shared pieces of the bracket gallery (the private /bracket-lab page and
// each school's Fantasy Bracket Tourney tab).
//
// The 2026 National Alumni Bracket as a gallery of flip cards. One card is
// one game (one week): the front is one school's box score, the back the
// other's, both under the same 9-inning line score. A row of three cards is
// a series; rounds stack down the page. Filters: round, region, a school
// search and favorite schools (kept in this browser).
//
// Leaderboards: the 8 regional leaderboards (every school, weeks 1-30, most
// runs then run differential), standings through any week, and each
// school's whole season as flip cards.
//
// Data: /bracket-lab/2026/index.json (every series and line score), lb.json
// (the eliminated schools' weekly regional games) and one box-score file
// per round + region (d-lb-<week>-<region> for leaderboard games), fetched
// when its cards come on screen.

import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { useBracketNav } from './bracketNav';

export type SchoolRow = [name: string, region: number, seed: number];
export type GameRow = [id: number, week: number, home: number, away: number, decidedBy: string, innings: number[], winner: number | null];
export type SeriesRow = [region: number, home: number, away: number, homeSeed: number, awaySeed: number, winner: number, wins: [number, number], games: GameRow[]];
export type Round = { r: number; name: string; start: string; end: string; series: SeriesRow[] };
export type Index = {
  season: number;
  weeks: [string, string][];
  schools: Record<string, SchoolRow>;
  rounds: Round[];
  lbt: { seeds: [number, number]; game: GameRow }[];
  gf: GameRow[];
  champion: number;
  lbLeaders: number[]; // the Season Championship Tournament's 8, seed order
  // The postseason schools' alumni [name, level], best level first: each
  // nominates one fan for the World Series Tickets Raffle.
  alumni?: Record<string, [string, string][]>;
  lbChampion: number;
  grandChampion: number;
};
// A leaderboard game: the same as a GameRow plus the region.
export type LbGame = [id: number, week: number, home: number, away: number, decidedBy: string, innings: number[], winner: number | null, region: number];
// [playerid, name, level, simulated, bat [PA AB H 2B 3B HR BB HBP SF] | 0, pit [outs HR BB HBP K] | 0, OPS+, FIP-]
export type PlayerRow = [string, string, string, 0 | 1, number[] | 0, number[] | 0, number | null, number | null];
export type SideBox = { p: PlayerRow[]; wl: [number, number] };
export type GameBox = { d: (number | null)[][]; h: SideBox; a: SideBox };

export const BASE = '/bracket-lab/2026';
export const FAV_KEY = 'yat-bracket-lab-favs';
export const REGIONS: Record<number, string> = {
  // By geography (the states in each region's field).
  1: 'Pacific', 2: 'West', 3: 'Southwest', 4: 'Central', 5: 'Midwest', 6: 'Northeast', 7: 'Atlantic', 8: 'Southeast',
};
// The Season Championship Tournament (weeks 31-33): the 8 region leaders,
// single elimination.
export const LBT_ROUNDS: Record<number, string> = { 31: 'Round 1', 32: 'Round 2', 33: 'Season Championship Game' };
export const SCT = 'Season Championship Tournament';
// Week 34: the bracket champ vs the season champ.
export const WORLD_SERIES = 'Fantasy World Series';
export const WORLD_SERIES_FULL = 'YAT?STATS High School Alumni Fantasy World Series';
export const TIE_NOTE: Record<string, string> = {
  coin: "Tied after 9 · won on the commissioner's coin flip",
};
// 'players-2': the tie went down to each school's #2 hitter and #2 pitcher
export function tieNote(decidedBy: string) {
  const m = /^players-(\d+)$/.exec(decidedBy);
  if (!m) return TIE_NOTE[decidedBy];
  return m[1] === '1'
    ? 'Tied after 9 · won on the best hitter (OPS+) and best pitcher (FIP-) matchups'
    : `Tied after 9 · won on the #${m[1]} hitter (OPS+) and #${m[1]} pitcher (FIP-) matchups`;
}

// Box scores are shared by every card of a round + region: one fetch each.
export const boxCache = new Map<string, Promise<Record<string, GameBox>>>();
export function loadBoxes(file: string) {
  if (!boxCache.has(file)) {
    boxCache.set(file, fetch(`${BASE}/${file}.json`).then((r) => (r.ok ? r.json() : {})).catch(() => ({})));
  }
  return boxCache.get(file)!;
}

export const shortName = (name: string) => name.split(' (')[0];
export const LEVEL: Record<string, string> = {
  MLB: 'MLB', 'TRIPLE-A': 'AAA', 'DOUBLE-A': 'AA', 'HIGH-A': 'A+', 'LOW-A': 'A', ROOKIE: 'RK', SPRING: 'ST',
  'NCAA-D1': 'D1', 'NCAA-D2': 'D2', 'NCAA-D3': 'D3', NAIA: 'NAIA', JUCO: 'JUCO',
};
export const lvl = (l: string) => l.split('/').map((x) => LEVEL[x] || x).join('/');
export const place = (name: string) => (name.includes(' (') ? name.split(' (')[1].replace(/\)$/, '').replace(',', ', ') : '');
export function fmtDate(iso: string) {
  const d = new Date(`${iso}T12:00:00Z`);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}
export const fmtRange = (a: string, b: string) => `${fmtDate(a)} – ${fmtDate(b)}`;
export const LAST_WEEK = 30; // the bracket and the leaderboards end with week 30
export const ROUND_SHORT = ['R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7', 'R8', 'R9', 'R10'];
// Round 1 has 512 series (1,024 schools) ... Round 10 has 1.
export const seriesInRound = (r: number) => 512 >> (r - 1);
export const runsOf = (inn: number[]) => {
  let h = 0, a = 0;
  inn.forEach((v, i) => { if (i % 2 === 0) h += v; else a += v; });
  return [h, a];
};

// Leaderboard standings through a week: every school's runs for and
// against, W-L-T and games, from its bracket games and leaderboard games.
export type Stand = { h: number; rf: number; ra: number; w: number; l: number; t: number; g: number };
export function standings(index: Index, lb: LbGame[], week: number) {
  const st = new Map<number, Stand>();
  for (const k of Object.keys(index.schools)) st.set(Number(k), { h: Number(k), rf: 0, ra: 0, w: 0, l: 0, t: 0, g: 0 });
  const add = (g: GameRow | LbGame) => {
    if (g[1] > week) return;
    const [hr, ar] = runsOf(g[5]);
    for (const [h, rf, ra] of [[g[2], hr, ar], [g[3], ar, hr]]) {
      const s = st.get(h);
      if (!s) continue;
      s.g++; s.rf += rf; s.ra += ra;
      if (g[6] === h) s.w++; else if (g[6] === null) s.t++; else s.l++;
    }
  };
  for (const r of index.rounds) for (const s of r.series) for (const g of s[7]) add(g);
  for (const g of lb) add(g);
  return st;
}
// Most runs, then run differential, wins, seed (same order as the simulator).
export function rankRegion(index: Index, st: Map<number, Stand>, region: number) {
  const seed = (h: number) => index.schools[h]?.[2] ?? 999;
  return [...st.values()]
    .filter((s) => index.schools[s.h]?.[1] === region)
    .sort((x, y) => y.rf - x.rf || (y.rf - y.ra) - (x.rf - x.ra) || y.w - x.w || seed(x.h) - seed(y.h));
}
// When each school went out of the bracket (round, week of its last game).
export function eliminations(index: Index) {
  const out = new Map<number, { round: number; week: number }>();
  for (const r of index.rounds) {
    for (const s of r.series) {
      const loser = s[5] === s[1] ? s[2] : s[1];
      out.set(loser, { round: r.r, week: s[7][s[7].length - 1][1] });
    }
  }
  return out;
}
export const ip = (outs: number) => `${Math.floor(outs / 3)}.${outs % 3}`;
export const rate = (v: number) => (v >= 1 ? v.toFixed(3) : v.toFixed(3).replace(/^0/, ''));

export function useFavorites() {
  const [favs, setFavs] = useState<Set<number>>(() => {
    try {
      const raw = localStorage.getItem(FAV_KEY);
      return new Set<number>(raw ? JSON.parse(raw) : []);
    } catch {
      return new Set<number>();
    }
  });
  const toggle = (h: number) => {
    setFavs((cur) => {
      const next = new Set(cur);
      if (next.has(h)) next.delete(h); else next.add(h);
      try { localStorage.setItem(FAV_KEY, JSON.stringify([...next])); } catch {}
      return next;
    });
  };
  return { favs, toggle };
}

// Rows that appear as the page scrolls (Round 1 alone is 512 rows).
export function useReveal(total: number, step = 12) {
  // A new list (other round or filter) starts again from the top.
  const [state, setState] = useState({ total, shown: step });
  const shown = state.total === total ? state.shown : step;
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        setState((s) => ({ total, shown: Math.min(total, (s.total === total ? s.shown : step) + step) }));
      }
    }, { rootMargin: '1200px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [total, step, shown]);
  return { shown, sentinel: ref };
}

export type View = { kind: 'round'; r: number } | { kind: 'lbt' } | { kind: 'gf' } | { kind: 'season' } | { kind: 'boards' } | { kind: 'school'; h: number };

// One row in the gallery: a series (three cards), a single game, or up to
// three of one school's leaderboard games ('plain': no single opponent).
export type Row = {
  key: string;
  roundLabel: string;
  title: string;
  plain?: boolean;
  week: number;
  region: number;
  home: number;
  away: number;
  homeSeed: number;
  awaySeed: number;
  result: string;
  files: string[]; // the box-score file of each game
  games: GameRow[];
  gameLabels: string[];
  // On a school's page every card opens on that school's box score.
  school?: number;
  // Cards only, no heading (single games packed three across).
  bare?: boolean;
  // Each game card's front side (default: the home school, or row.school's).
  fronts?: ('h' | 'a')[];
  // The Fantasy World Series: each card's back is its school's raffle fans
  // instead of the other school's box score.
  fansBack?: boolean;
  // Cards after the games: the raffle fan card, the Bracket Champ waiting
  // for week 34, a card still to come.
  extras?: Extra[];
};
export type Extra = { kind: 'fans'; games: GameRow[] } | { kind: 'wait'; h: number } | { kind: 'tbd' };

// Builders for the gallery's rows.
export function rowMakers(index: Index) {
  const S = index.schools;
  const name = (h: number) => S[h]?.[0] || String(h);
  // A best-of-3 series; games after maxWeek aren't played yet.
  const seriesRow = (round: Round, s: SeriesRow, maxWeek = Infinity): Row => {
    const [reg, home, away, hs, as, winner] = s;
    const games = s[7].filter((g) => g[1] <= maxWeek);
    const hw = games.filter((g) => g[6] === home).length;
    const aw = games.filter((g) => g[6] === away).length;
    let result: string;
    if (games.length === s[7].length) {
      const w = winner === home ? home : away;
      result = `${shortName(name(w))} wins the series ${Math.max(hw, aw)}–${Math.min(hw, aw)}`;
    } else if (!games.length) {
      result = 'Game 1 this week';
    } else {
      result = hw === aw ? `Series tied ${hw}–${aw}` : `${shortName(name(hw > aw ? home : away))} leads ${Math.max(hw, aw)}–${Math.min(hw, aw)}`;
    }
    return {
      key: `r${round.r}-${home}-${away}`,
      roundLabel: `Round ${round.r}${reg ? ` · Region ${reg}` : ''}`,
      title: `#${hs} ${shortName(name(home))} vs #${as} ${shortName(name(away))}`,
      week: s[7][0][1],
      region: reg,
      home, away, homeSeed: hs, awaySeed: as,
      result,
      files: games.map(() => `d-${round.r}-${reg}`),
      games,
      gameLabels: games.map((_, i) => `Game ${i + 1}`),
    };
  };
  const lbtRow = ({ seeds, game }: Index['lbt'][number]): Row => {
    const [, wk, home, away, , , winner] = game;
    return {
      key: `lbt-${game[0]}`,
      roundLabel: `${SCT} · ${LBT_ROUNDS[wk] || ''}`,
      title: `#${seeds[0]} ${shortName(name(home))} vs #${seeds[1]} ${shortName(name(away))}`,
      week: wk,
      region: 0,
      home, away, homeSeed: seeds[0], awaySeed: seeds[1],
      result: wk === LAST_WEEK + 3 ? `${shortName(name(winner!))} wins the Season Championship and advances to the ${WORLD_SERIES}` : `${shortName(name(winner!))} advances`,
      files: ['d-lbt'],
      games: [game],
      gameLabels: [wk === LAST_WEEK + 3 ? 'Season Championship Game' : `Season Championship ${LBT_ROUNDS[wk] || ''}`],
    };
  };
  const gfRow = (game: GameRow): Row => {
    const [, wk, home, away, , , winner] = game;
    return {
      key: `gf-${game[0]}`,
      roundLabel: WORLD_SERIES_FULL,
      title: `${shortName(name(home))} (Bracket Champ) vs ${shortName(name(away))} (Season Champ)`,
      week: wk,
      region: 0,
      home, away, homeSeed: 1, awaySeed: 2,
      result: winner ? `${shortName(name(winner))} wins the ${WORLD_SERIES}` : 'Tied',
      files: ['d-gf'],
      games: [game],
      gameLabels: [WORLD_SERIES],
    };
  };
  // Up to three of one school's weekly leaderboard games in one row.
  const lbRow = (h: number, chunk: LbGame[]): Row => {
    let runs = 0, w = 0, l = 0, t = 0;
    for (const g of chunk) {
      const [hr, ar] = runsOf(g[5]);
      runs += g[2] === h ? hr : ar;
      if (g[6] === h) w++; else if (g[6] === null) t++; else l++;
    }
    const reg = chunk[0][7];
    const first = chunk[0][1], last = chunk[chunk.length - 1][1];
    return {
      key: `lb-${h}-${chunk[0][0]}`,
      roundLabel: `Region ${reg} leaderboard · ${first === last ? `week ${first}` : `weeks ${first}–${last}`}`,
      title: `${shortName(name(h))}'s leaderboard games`,
      plain: true,
      week: first,
      region: reg,
      home: h, away: h, homeSeed: 0, awaySeed: 0,
      result: `${runs} runs · ${w}–${l}${t ? `–${t}` : ''}`,
      files: chunk.map((g) => `d-lb-${g[1]}-${g[7]}`),
      games: chunk.map((g) => g.slice(0, 7) as GameRow),
      gameLabels: chunk.map((g) => `vs ${shortName(name(g[2] === h ? g[3] : g[2]))}`),
      school: h,
    };
  };
  return { name, seriesRow, lbtRow, gfRow, lbRow };
}

// Gallery rows for a view, unfiltered (a school's season needs lb).
export function buildRows(index: Index, lb: LbGame[] | null, view: View, maxWeek = Infinity): Row[] {
  const { seriesRow, lbtRow, gfRow, lbRow } = rowMakers(index);
  const out: Row[] = [];
  // One school's whole season: its bracket series, its leaderboard games
  // (three weeks to a row), then the Season Championship Tournament and the
  // Fantasy World Series.
  if (view.kind === 'school') {
    const h = view.h;
    for (const round of index.rounds) for (const s of round.series) if (s[1] === h || s[2] === h) out.push(seriesRow(round, s));
    const mine = (lb || []).filter((g) => g[2] === h || g[3] === h).sort((a, b) => a[1] - b[1]);
    for (let i = 0; i < mine.length; i += 3) out.push(lbRow(h, mine.slice(i, i + 3)));
    for (const x of index.lbt) if (x.game[2] === h || x.game[3] === h) out.push(lbtRow(x));
    for (const g of index.gf) if (g[2] === h || g[3] === h) out.push(gfRow(g));
    return out.map((r) => ({ ...r, school: h })).sort((a, b) => a.week - b.week);
  }
  if (view.kind === 'round') for (const s of index.rounds[view.r - 1].series) out.push(seriesRow(index.rounds[view.r - 1], s, maxWeek));
  if (view.kind === 'season') for (const round of index.rounds) for (const s of round.series) out.push(seriesRow(round, s, maxWeek));
  if (view.kind === 'lbt' || view.kind === 'season') for (const x of index.lbt) if (x.game[1] <= maxWeek) out.push(lbtRow(x));
  if (view.kind === 'gf' || view.kind === 'season') for (const g of index.gf) if (g[1] <= maxWeek) out.push(gfRow(g));
  // (series not started by maxWeek drop out)
  return out.filter((r) => r.games.length);
}

// ---------------------------------------------------------------------------
// The calendar: stages (a bracket round, the leaderboards, the Season
// Championship Tournament, the Fantasy World Series) and which one a date falls in.
// ---------------------------------------------------------------------------
export type Stage = { kind: 'round'; r: number } | { kind: 'boards' } | { kind: 'lbt' } | { kind: 'gf' };
export const stageKey = (s: Stage) => (s.kind === 'round' ? `r${s.r}` : s.kind);
export function stageWeeks(s: Stage): [number, number] {
  if (s.kind === 'round') return [(s.r - 1) * 3 + 1, s.r * 3];
  if (s.kind === 'lbt') return [LAST_WEEK + 1, LAST_WEEK + 3];
  if (s.kind === 'gf') return [LAST_WEEK + 4, LAST_WEEK + 4];
  return [1, LAST_WEEK];
}
export function stageOfWeek(w: number): Stage {
  if (w <= LAST_WEEK) return { kind: 'round', r: Math.max(1, Math.ceil(w / 3)) };
  if (w <= LAST_WEEK + 3) return { kind: 'lbt' };
  return { kind: 'gf' };
}
// The week a date falls in: 0 before week 1, weeks.length + 1 after the end.
export function weekOfDate(index: Index, iso: string) {
  if (iso < index.weeks[0][0]) return 0;
  const i = index.weeks.findIndex(([a, b]) => iso >= a && iso <= b);
  return i === -1 ? index.weeks.length + 1 : i + 1;
}
// The last week whose games are final on a date.
export function lastFinalWeek(index: Index, iso: string) {
  let w = 0;
  index.weeks.forEach(([, end], i) => { if (end < iso) w = i + 1; });
  return w;
}

// Today's date (YYYY-MM-DD), or ?asof=YYYY-MM-DD to preview any date.
export function previewDate() {
  const q = new URLSearchParams(window.location.search).get('asof') || '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(q)) return q;
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// One school's games in a stage, played through maxWeek: its bracket series,
// or its weekly leaderboard games once it's out, or its tournament games.
export function schoolStageRows(index: Index, lb: LbGame[], h: number, stage: Stage, maxWeek: number): Row[] {
  const { seriesRow, lbtRow, gfRow, lbRow } = rowMakers(index);
  const [a, b] = stageWeeks(stage);
  const out: Row[] = [];
  if (stage.kind === 'round') {
    const round = index.rounds[stage.r - 1];
    const s = round.series.find((x) => x[1] === h || x[2] === h);
    if (s && s[7][0][1] <= maxWeek) out.push(seriesRow(round, s, maxWeek));
    else {
      const mine = lb.filter((g) => (g[2] === h || g[3] === h) && g[1] >= a && g[1] <= Math.min(b, maxWeek)).sort((x, y) => x[1] - y[1]);
      if (mine.length) out.push(lbRow(h, mine));
    }
  }
  if (stage.kind === 'lbt') for (const x of index.lbt) if ((x.game[2] === h || x.game[3] === h) && x.game[1] <= maxWeek) out.push(lbtRow(x));
  if (stage.kind === 'gf') for (const g of index.gf) if ((g[2] === h || g[3] === h) && g[1] <= maxWeek) out.push(gfRow(g));
  return out.map((r) => ({ ...r, school: h }));
}

// index.json and lb.json, fetched once and shared (row 3 and row 5 of a
// school's page both use them).
let indexPromise: Promise<Index> | null = null;
export function loadIndex() {
  if (!indexPromise) {
    indexPromise = fetch(`${BASE}/index.json`).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))));
    indexPromise.catch(() => { indexPromise = null; });
  }
  return indexPromise;
}
let lbPromise: Promise<LbGame[]> | null = null;
export function loadLb() {
  if (!lbPromise) {
    lbPromise = fetch(`${BASE}/lb.json`).then((r) => (r.ok ? r.json() : { games: [] })).then((d: { games: LbGame[] }) => d.games).catch(() => []);
  }
  return lbPromise;
}

// A school's name: a button that opens its season where there is one
// (the lab), plain text elsewhere.
export function SchoolName({ h, onOpen, children }: { h: number; onOpen?: (h: number) => void; children: ReactNode }) {
  if (!onOpen) return <span className="bl-name">{children}</span>;
  return <button type="button" className="bl-link" onClick={() => onOpen(h)}>{children}</button>;
}

// No star where favorites aren't kept (a school's own page).
export function Star({ h, index, favs, onFav }: { h: number; index: Index; favs?: Set<number>; onFav?: (h: number) => void }) {
  if (!favs || !onFav) return null;
  const on = favs.has(h);
  return (
    <button type="button" className={`bl-star${on ? ' on' : ''}`} onClick={() => onFav(h)} aria-pressed={on} aria-label={`${on ? 'Unfollow' : 'Follow'} ${index.schools[h]?.[0]}`}>
      {on ? '★' : '☆'}
    </button>
  );
}

// The 8 regional leaderboards through a chosen week: every school, most runs
// first, then run differential. After week 30 each region's leader is in the
// Season Championship Tournament (the bracket champion sits out; its region sends the next).
export function Leaderboards({ index, lb, week, setWeek, region, query, onlyFavs, favs, onFav, onOpen, maxWeek = LAST_WEEK }: {
  index: Index; lb: LbGame[]; week: number; setWeek: (w: number) => void; region: number; query: string;
  onlyFavs: boolean; favs?: Set<number>; onFav?: (h: number) => void; onOpen?: (h: number) => void;
  maxWeek?: number; // the last week with results (a school's page, mid-season)
}) {
  const st = useMemo(() => standings(index, lb, week), [index, lb, week]);
  const elim = useMemo(() => eliminations(index), [index]);
  const top = Math.max(1, Math.min(LAST_WEEK, maxWeek));
  const final = week >= LAST_WEEK;
  const [ws, we] = index.weeks[week - 1] || ['', ''];
  const regions = region ? [region] : [1, 2, 3, 4, 5, 6, 7, 8];
  const status = (h: number) => {
    if (final && h === index.champion) return { text: 'Bracket champion', cls: 'champ' };
    const e = elim.get(h);
    if (e && e.week <= week) return { text: `Out · ${ROUND_SHORT[e.round - 1]}`, cls: 'out' };
    return { text: 'In the bracket', cls: 'alive' };
  };
  const name = (h: number) => index.schools[h]?.[0] || String(h);
  const lbSeed = new Map(index.lbLeaders.map((h, i) => [h, i + 1]));

  return (
    <section className="bl-boards">
      <div className="bl-weekbar">
        <button type="button" onClick={() => setWeek(Math.max(1, week - 1))} disabled={week <= 1} aria-label="Previous week">‹</button>
        <input type="range" min={1} max={top} value={week} onChange={(e) => setWeek(Number(e.target.value))} aria-label="Standings through week" />
        <button type="button" onClick={() => setWeek(Math.min(top, week + 1))} disabled={week >= top} aria-label="Next week">›</button>
        <div className="bl-weeklabel">Standings through <b>Week {week}</b>{ws ? ` · ${fmtRange(ws, we)}` : ''}{final ? ' · final' : ''}</div>
      </div>

      {final && (
        <div className="bl-announce">
          <div className="bl-announce-t">The Season Championship Tournament · announced before Week 31</div>
          <p>The top team in each region on the Most Runs Scored Leaderboard (run differential breaks ties) is reseeded into a 3-week single-elimination tournament, {fmtRange(index.weeks[LAST_WEEK][0], index.weeks[LAST_WEEK + 2][1])}. The winner, the Season Champ, plays Bracket Champ <b>{shortName(name(index.champion))}</b> in the YAT?STATS High School Alumni Fantasy World Series in week 34; the Bracket Champ has a bye until then.</p>
          <ol>
            {index.lbLeaders.map((h) => {
              const s = st.get(h)!;
              return (
                <li key={h}>
                  <span className="seed">#{lbSeed.get(h)}</span>
                  <SchoolName h={h} onOpen={onOpen}><b>{shortName(name(h))}</b></SchoolName>
                  <i>Region {index.schools[h][1]} · {REGIONS[index.schools[h][1]]}</i>
                  <span className="runs">{s.rf} R</span>
                </li>
              );
            })}
          </ol>
        </div>
      )}

      <div className="bl-grid">
        {regions.map((r) => (
          <RegionBoard key={r} region={r} ranked={rankRegion(index, st, r)} index={index} final={final} query={query}
            onlyFavs={onlyFavs} favs={favs} onFav={onFav} onOpen={onOpen} status={status} />
        ))}
      </div>
    </section>
  );
}

export function RegionBoard({ region, ranked, index, final, query, onlyFavs, favs, onFav, onOpen, status }: {
  region: number; ranked: Stand[]; index: Index; final: boolean; query: string; onlyFavs: boolean;
  favs?: Set<number>; onFav?: (h: number) => void; onOpen?: (h: number) => void; status: (h: number) => { text: string; cls: string };
}) {
  const [all, setAll] = useState(false);
  const TOP = 10;
  const name = (h: number) => index.schools[h]?.[0] || String(h);
  // The region's spot in the Season Championship Tournament: its leader, or the next school
  // when the leader is the bracket champion.
  const qualifier = ranked.find((s) => !final || s.h !== index.champion)?.h;
  const q = query.trim().toLowerCase();
  const rows = ranked
    .map((s, i) => ({ s, rank: i + 1 }))
    .filter(({ s, rank }) => {
      if (q) return name(s.h).toLowerCase().includes(q);
      if (onlyFavs) return !!favs?.has(s.h);
      return all || rank <= TOP || !!favs?.has(s.h);
    });

  return (
    <div className="bl-board">
      <div className="bl-board-h">
        <b>Region {region}</b> <span>{REGIONS[region]}</span>
      </div>
      <table>
        <thead>
          <tr><th className="rk">#</th><th className="nm">School</th><th>R</th><th>Diff</th><th>W-L</th><th className="st">Status</th></tr>
        </thead>
        <tbody>
          {rows.map(({ s, rank }) => {
            const diff = s.rf - s.ra;
            const st = status(s.h);
            const isQ = s.h === qualifier;
            return (
              <tr key={s.h} className={`${isQ ? 'lead' : ''}${rank > TOP && !all ? ' extra' : ''}`}>
                <td className="rk">{rank}</td>
                <td className="nm">
                  <Star h={s.h} index={index} favs={favs} onFav={onFav} />
                  <SchoolName h={s.h} onOpen={onOpen}>{shortName(name(s.h))}</SchoolName>
                  {isQ && <em className="q">{final ? 'Qualified' : 'Leads'}</em>}
                </td>
                <td className="r">{s.rf}</td>
                <td className={diff > 0 ? 'pos' : diff < 0 ? 'neg' : ''}>{diff > 0 ? `+${diff}` : diff}</td>
                <td>{s.w}–{s.l}{s.t ? `–${s.t}` : ''}</td>
                <td className={`st ${st.cls}`}>{st.text}</td>
              </tr>
            );
          })}
          {rows.length === 0 && <tr><td colSpan={6} className="none">{q ? 'No school matches.' : 'No followed schools in this region.'}</td></tr>}
        </tbody>
      </table>
      {!q && !onlyFavs && (
        <button type="button" className="bl-more" onClick={() => setAll((v) => !v)}>
          {all ? `Top ${TOP} only` : `All ${ranked.length} schools`}
        </button>
      )}
    </div>
  );
}

// The top of a school's season page: where it stands on its leaderboard
// and how its bracket run ended.
export function SchoolHead({ index, lb, h, favs, onFav, onBack }: { index: Index; lb: LbGame[]; h: number; favs: Set<number>; onFav: (h: number) => void; onBack: () => void }) {
  const st = useMemo(() => standings(index, lb, LAST_WEEK), [index, lb]);
  const elim = useMemo(() => eliminations(index), [index]);
  const [nm, region, seed] = index.schools[h] || [String(h), 0, 0];
  const ranked = rankRegion(index, st, region);
  const rank = ranked.findIndex((s) => s.h === h) + 1;
  const s = st.get(h)!;
  const e = elim.get(h);
  const bracket = h === index.champion ? 'Won the bracket' : e ? `Out of the bracket in Round ${e.round} (week ${e.week})` : '';
  const extra = [
    index.lbLeaders.includes(h) ? `In the ${SCT}` : '',
    h === index.lbChampion ? 'won the Season Championship' : '',
    h === index.grandChampion ? `won the ${WORLD_SERIES}` : '',
  ].filter(Boolean).join(' · ');
  return (
    <div className="bl-school">
      <button type="button" className="bl-backlink" onClick={onBack}>‹ Leaderboards</button>
      <div className="bl-school-t">
        <Star h={h} index={index} favs={favs} onFav={onFav} />
        <b>{shortName(nm)}</b> <i>{place(nm)}</i>
      </div>
      <div className="bl-school-s">
        Region {region} · {REGIONS[region]} · #{seed} seed · <b>{rank}{ordinal(rank)}</b> on the leaderboard with <b>{s.rf} runs</b> ({s.rf - s.ra >= 0 ? '+' : ''}{s.rf - s.ra}) · {s.w}–{s.l}{s.t ? `–${s.t}` : ''} in {s.g} games
      </div>
      <div className="bl-school-s">{bracket}{extra ? ` · ${extra}` : ''}</div>
    </div>
  );
}

export function ordinal(n: number) {
  const t = n % 100;
  if (t >= 11 && t <= 13) return 'th';
  return ['th', 'st', 'nd', 'rd'][n % 10] || 'th';
}

export function SeriesRowView({ row, index, favs, onFav, onOpen }: { row: Row; index: Index; favs?: Set<number>; onFav?: (h: number) => void; onOpen?: (h: number) => void }) {
  const S = index.schools;
  const [boxes, setBoxes] = useState<Record<string, GameBox> | null>(null);
  const ref = useRef<HTMLDivElement | null>(null);
  const filesKey = [...new Set(row.files)].join('|');
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let cancelled = false;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        io.disconnect();
        Promise.all(filesKey.split('|').map(loadBoxes)).then((list) => {
          if (!cancelled) setBoxes(Object.assign({}, ...list));
        });
      }
    }, { rootMargin: '800px 0px' });
    io.observe(el);
    return () => { cancelled = true; io.disconnect(); };
  }, [filesKey]);

  const team = (h: number, seed: number) => (
    <span>
      {seed ? `#${seed} ` : ''}
      <SchoolName h={h} onOpen={onOpen}><b>{shortName(S[h]?.[0] || '')}</b></SchoolName> <i>{place(S[h]?.[0] || '')}</i>
    </span>
  );

  return (
    <div className="bl-row" ref={ref}>
      {!row.bare && <div className="bl-rowhead">
        <div className="bl-round">{row.roundLabel}</div>
        <div className="bl-title">
          {row.plain ? (
            <><Star h={row.home} index={index} favs={favs} onFav={onFav} />{team(row.home, 0)}<span className="bl-vs">weekly regional games</span></>
          ) : (
            <>
              <Star h={row.home} index={index} favs={favs} onFav={onFav} />{team(row.home, row.homeSeed)}
              <span className="bl-vs">vs</span>
              <Star h={row.away} index={index} favs={favs} onFav={onFav} />{team(row.away, row.awaySeed)}
            </>
          )}
        </div>
        <div className="bl-result">{row.result}</div>
      </div>}
      <div className={`bl-cards n${row.games.length}`}>
        {row.games.map((g, i) => {
          const front = row.fronts?.[i] ?? (row.school !== undefined && g[3] === row.school ? 'a' : 'h');
          return (
            <FlipCard key={`${g[0]}-${i}`} game={g} label={row.gameLabels[i]} index={index} box={boxes ? boxes[String(g[0])] : undefined} loading={!boxes}
              front={front}
              back={row.fansBack ? <RaffleFans index={index} h={front === 'h' ? g[2] : g[3]} registered={(front === 'h' ? g[2] : g[3]) === index.champion} /> : undefined} />
          );
        })}
        {row.extras?.map((x, i) => <ExtraCard key={`x${i}`} extra={x} index={index} />)}
      </div>
    </div>
  );
}

// Row 2's flip-all sets every card; a tap then flips just this one.
function useFlip(): [boolean, () => void] {
  const nav = useBracketNav();
  const [own, setOwn] = useState<{ seq: number; flipped: boolean } | null>(null);
  const flipped = own && own.seq === nav.flipSeq ? own.flipped : nav.flipAll;
  return [flipped, () => setOwn({ seq: nav.flipSeq, flipped: !flipped })];
}

// A card that isn't a game: a tap anywhere flips it (if it has a back).
function Pane({ label, dates, onFlip, children }: { label: string; dates?: string; onFlip?: () => void; children: ReactNode }) {
  return (
    <div className="bl-f" role={onFlip ? 'button' : undefined} tabIndex={onFlip ? 0 : undefined} onClick={onFlip}
      onKeyDown={onFlip ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onFlip(); } } : undefined}>
      <div className="bl-top"><div className="bl-meta"><span>{label}</span><span>{dates}</span></div></div>
      {children}
    </div>
  );
}

function CardShell({ front, back, flipped }: { front: ReactNode; back?: ReactNode; flipped: boolean }) {
  return (
    <div className={`bl-card${flipped && back ? ' flipped' : ''}`}>
      <div className="bl-inner">
        <div className="bl-face bl-front">{front}</div>
        {back && <div className="bl-face bl-back">{back}</div>}
      </div>
    </div>
  );
}

// One school's fans in the World Series Tickets Raffle. The Bracket Champ's
// are its registered fans; the Season Championship Tournament schools' are
// the fans their alumni nominate (one each). No fans are in the simulation
// yet, so the slots are empty.
function RaffleFans({ index, h, registered }: { index: Index; h: number; registered: boolean }) {
  const alumni = index.alumni?.[h] || [];
  return (
    <div className="bl-fans">
      <div className="bl-fans-h"><b>{shortName(index.schools[h]?.[0] || '')}</b><span>{registered ? 'Registered fans' : `${alumni.length} alumni · 1 fan each`}</span></div>
      {registered ? (
        <p className="bl-fans-none">The Bracket Champ&apos;s registered fans are entered: one entry for each round they&apos;ve been registered, 3× for SuperFans. No fans are registered in the simulation.</p>
      ) : (
        <ol className="bl-fans-list">
          {alumni.map(([nm, lv]) => (
            <li key={nm}><span className="p">{nm} <small>{lvl(lv)}</small></span><span className="f">Fan not picked yet</span></li>
          ))}
          {alumni.length === 0 && <li className="none">No active alumni.</li>}
        </ol>
      )}
    </div>
  );
}

function ExtraCard({ extra, index }: { extra: Extra; index: Index }) {
  const [flipped, flip] = useFlip();
  const S = index.schools;
  const dates = (w: number) => (index.weeks[w - 1] ? fmtRange(index.weeks[w - 1][0], index.weeks[w - 1][1]) : '');
  if (extra.kind === 'fans') {
    // One side per game in the row: both schools' fan picks.
    const side = (g: GameRow | undefined) => g && (
      <Pane label={`World Series Tickets Raffle · Week ${g[1]}`} dates={dates(g[1])} onFlip={extra.games.length > 1 ? flip : undefined}>
        <div className="bl-fans-kick">Fan picks · {shortName(S[g[2]]?.[0] || '')} vs {shortName(S[g[3]]?.[0] || '')}{extra.games.length > 1 ? ' ⟳' : ''}</div>
        <div className="bl-scroll-y">
          <RaffleFans index={index} h={g[2]} registered={false} />
          <RaffleFans index={index} h={g[3]} registered={false} />
        </div>
      </Pane>
    );
    return <CardShell flipped={flipped} front={side(extra.games[0])} back={side(extra.games[1])} />;
  }
  if (extra.kind === 'wait') {
    const [nm, region, seed] = S[extra.h] || ['', 0, 0];
    const w = LAST_WEEK + 4;
    return (
      <CardShell flipped={false} front={
        <Pane label={`${WORLD_SERIES} · Week ${w}`} dates={dates(w)}>
          <div className="bl-wait">
            <div className="k">Bracket Champ</div>
            <div className="n">{shortName(nm)}</div>
            <div className="s">{place(nm)} · Region {region} · {REGIONS[region]} · #{seed} seed</div>
            <p>Won the 10-round bracket. On a 3-week bye, waiting to play the winner of the Season Championship Game in week {w}.</p>
          </div>
        </Pane>
      } />
    );
  }
  return (
    <CardShell flipped={false} front={
      <Pane label={WORLD_SERIES}>
        <div className="bl-wait"><div className="k">Coming soon</div></div>
      </Pane>
    } />
  );
}

export function FlipCard({ game, label, index, box, loading, front = 'h', back }: { game: GameRow; label: string; index: Index; box?: GameBox; loading: boolean; front?: 'h' | 'a'; back?: ReactNode }) {
  const [flipped, flip] = useFlip();
  const [id, week, home, away, decidedBy, innings, winner] = game;
  const S = index.schools;
  const [ws, we] = index.weeks[week - 1] || ['', ''];
  const hr = innings.filter((_, i) => i % 2 === 0).reduce((a, b) => a + b, 0);
  const ar = innings.filter((_, i) => i % 2 === 1).reduce((a, b) => a + b, 0);
  const face = (side: 'h' | 'a') => (
    <Face
      side={side}
      label={label}
      week={week}
      dates={ws ? fmtRange(ws, we) : ''}
      home={home}
      away={away}
      names={[shortName(S[home]?.[0] || ''), shortName(S[away]?.[0] || '')]}
      score={[hr, ar]}
      innings={innings}
      winner={winner}
      decidedBy={decidedBy}
      box={box}
      loading={loading}
      flipTo={back ? 'Fans' : undefined}
      onFlip={flip}
    />
  );
  return (
    <div className={`bl-card${flipped ? ' flipped' : ''}`} data-game={id}>
      <div className="bl-inner">
        <div className="bl-face bl-front">{face(front)}</div>
        <div className="bl-face bl-back">
          {back ? (
            <Pane label={`World Series Tickets Raffle · Week ${week}`} dates={ws ? fmtRange(ws, we) : ''} onFlip={flip}>
              <div className="bl-fans-kick">Fans hoping to win a trip to the World Series ⟳</div>
              <div className="bl-scroll-y">{back}</div>
            </Pane>
          ) : face(front === 'h' ? 'a' : 'h')}
        </div>
      </div>
    </div>
  );
}

export function Face({ side, label, week, dates, home, away, names, score, innings, winner, decidedBy, box, loading, onFlip, flipTo }: {
  side: 'h' | 'a'; label: string; week: number; dates: string; home: number; away: number; names: [string, string];
  score: [number, number]; innings: number[]; winner: number | null; decidedBy: string; box?: GameBox; loading: boolean; onFlip?: () => void;
  flipTo?: string; // the back isn't the other school's box score
}) {
  const me = side === 'h' ? 0 : 1;
  const them = 1 - me;
  const mine = box ? box[side] : undefined;
  const theirs = box ? box[side === 'h' ? 'a' : 'h'] : undefined;
  const weekVals = box?.d?.[7];
  const myName = names[me];
  const wonBy = winner === null ? 'tie' : winner === (me === 0 ? home : away) ? 'me' : 'them';

  const batters = (mine?.p || []).filter((p) => p[4]).sort((a, b) => (b[4] as number[])[0] - (a[4] as number[])[0]);
  const pitchers = (mine?.p || []).filter((p) => p[5]).sort((a, b) => (b[5] as number[])[0] - (a[5] as number[])[0]);
  const teamBat = batters.reduce((t, p) => (p[4] as number[]).map((v, i) => v + (t[i] || 0)), [] as number[]);
  const teamPit = pitchers.reduce((t, p) => (p[5] as number[]).map((v, i) => v + (t[i] || 0)), [] as number[]);
  const obpSlg = (b: number[]) => {
    const [, ab, h, d2, d3, hr, bb, hbp, sf] = b;
    const den = ab + bb + hbp + sf;
    const tb = h + d2 + 2 * d3 + 3 * hr;
    return (den ? (h + bb + hbp) / den : 0) + (ab ? tb / ab : 0);
  };
  const wl = mine?.wl || [0, 0];
  const owl = theirs?.wl || [0, 0];
  const pct = (w: number, l: number) => (w + l ? rate(w / (w + l)) : '—');
  const sim = (mine?.p || []).some((p) => p[3]);
  // Each name links to his profile (a tap there doesn't flip the card).
  const myHsid = me === 0 ? home : away;
  const player = (p: PlayerRow) => (
    <><a className="bl-plink" href={`/${myHsid}/player/${encodeURIComponent(p[0])}`} onClick={(e) => e.stopPropagation()}>{p[1]}{p[3] ? '*' : ''}</a> <small>{lvl(p[2])}</small></>
  );

  return (
    // A tap anywhere on the card flips it, like the player gallery.
    // (No onFlip: a drawer showing one school's week.)
    <div className={`bl-f${onFlip ? '' : ' still'}`} role={onFlip ? 'button' : undefined} tabIndex={onFlip ? 0 : undefined}
      aria-label={onFlip ? `${myName} box score · tap to flip to ${flipTo || names[them]}` : undefined} onClick={onFlip}
      onKeyDown={onFlip ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onFlip(); } } : undefined}>
      <div className="bl-top">
        <div className="bl-meta"><span>{label} · Week {week}</span><span>{dates}</span></div>
        <div className="bl-score">
          <div className={`bl-team${me === 0 ? ' me' : ''}`}><b>{names[0]}</b></div>
          <div className="bl-runs">{score[0]}</div>
          <div className="bl-final">FINAL</div>
          <div className="bl-runs">{score[1]}</div>
          <div className={`bl-team r${me === 1 ? ' me' : ''}`}><b>{names[1]}</b></div>
        </div>
      </div>

      <div className="bl-scroll">
        <table className="bl-ls">
          <thead>
            <tr><th />{[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => <th key={n}>{n}</th>)}<th className="sep">R</th><th>OPS+</th><th>FIP-</th></tr>
          </thead>
          <tbody>
            {[0, 1].map((s) => (
              <tr key={s} className={s === me ? 'me' : ''}>
                <th>{abbr(names[s])}</th>
                {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => {
                  const v = innings[i * 2 + s];
                  return <td key={i} className={v ? 'hit' : ''}>{v}</td>;
                })}
                <td className="sep r">{score[s]}</td>
                <td>{weekVals ? fmtStat(weekVals[s]) : ''}</td>
                <td>{weekVals ? fmtStat(weekVals[2 + s]) : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {tieNote(decidedBy) && <div className="bl-note">{tieNote(decidedBy)}</div>}
      {decidedBy === 'tie' && <div className="bl-note">Tie · half a win each</div>}

      <div className="bl-tabs">
        <span className="on">{myName}</span>
        {onFlip && <span className="flip">{flipTo || names[them]} ⟳</span>}
        <em className={wonBy}>{wonBy === 'me' ? 'W' : wonBy === 'them' ? 'L' : 'T'}</em>
      </div>

      {loading && <div className="bl-muted">Loading box score…</div>}
      {!loading && !mine && <div className="bl-muted">No box score.</div>}
      {mine && (
        <>
          <div className="bl-scroll">
            <table className="bl-box">
              <thead>
                <tr><th className="nm">Batters</th><th className="plus">OPS+</th><th>AB</th><th>H</th><th>2B</th><th>3B</th><th>HR</th><th>BB</th><th>HBP</th><th>SF</th><th>OPS</th></tr>
              </thead>
              <tbody>
                {batters.length === 0 && <tr><td className="nm none" colSpan={11}>No hitters played this week</td></tr>}
                {batters.map((p) => {
                  const b = p[4] as number[];
                  return (
                    <tr key={p[0]}>
                      <td className="nm">{player(p)}</td>
                      <td className="plus">{p[6] ?? '—'}</td>
                      {b.slice(1).map((v, i) => <td key={i}>{v}</td>)}
                      <td>{rate(obpSlg(b))}</td>
                    </tr>
                  );
                })}
                {batters.length > 0 && (
                  <tr className="tot">
                    <td className="nm">Team</td>
                    <td className="plus">{weekVals ? fmtStat(weekVals[me]) : '—'}</td>
                    {teamBat.slice(1).map((v, i) => <td key={i}>{v}</td>)}
                    <td>{rate(obpSlg(teamBat))}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="bl-scroll">
            <table className="bl-box">
              <thead>
                <tr><th className="nm">Pitchers</th><th className="plus">FIP-</th><th>IP</th><th>K</th><th>BB</th><th>HBP</th><th>HR</th></tr>
              </thead>
              <tbody>
                {pitchers.length === 0 && <tr><td className="nm none" colSpan={7}>No pitchers pitched this week</td></tr>}
                {pitchers.map((p) => {
                  const [outs, hr, bb, hbp, so] = p[5] as number[];
                  return (
                    <tr key={p[0]}>
                      <td className="nm">{player(p)}</td>
                      <td className="plus">{p[7] ?? '—'}</td>
                      <td>{ip(outs)}</td><td>{so}</td><td>{bb}</td><td>{hbp}</td><td>{hr}</td>
                    </tr>
                  );
                })}
                {pitchers.length > 0 && (
                  <tr className="tot">
                    <td className="nm">Team</td>
                    <td className="plus">{weekVals ? fmtStat(weekVals[2 + me]) : '—'}</td>
                    <td>{ip(teamPit[0])}</td><td>{teamPit[4]}</td><td>{teamPit[2]}</td><td>{teamPit[3]}</td><td>{teamPit[1]}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="bl-how">
            <div className="bl-howt">How the runs were scored</div>
            <div className="bl-scroll">
              <table className="bl-days">
                <thead><tr><th /><th>M</th><th>T</th><th>W</th><th>T</th><th>F</th><th>S</th><th>S</th><th>Wk</th></tr></thead>
                <tbody>
                  <tr><th>OPS+</th>{box!.d.map((d, i) => <td key={i} className={wonCell(d[me], d[them], true)}>{fmtStat(d[me])}</td>)}</tr>
                  <tr className="opp"><th>vs</th>{box!.d.map((d, i) => <td key={i}>{fmtStat(d[them])}</td>)}</tr>
                  <tr><th>FIP-</th>{box!.d.map((d, i) => <td key={i} className={wonCell(d[2 + me], d[2 + them], false)}>{fmtStat(d[2 + me])}</td>)}</tr>
                  <tr className="opp"><th>vs</th>{box!.d.map((d, i) => <td key={i}>{fmtStat(d[2 + them])}</td>)}</tr>
                </tbody>
              </table>
            </div>
            <div className="bl-wl">
              Inning 9 · alumni clubs&apos; W-L this week: <b>{wl[0]}–{wl[1]}</b> ({pct(wl[0], wl[1])}) vs {owl[0]}–{owl[1]} ({pct(owl[0], owl[1])})
              {innings[16 + me] ? <em> · 1 run</em> : null}
            </div>
            <div className="bl-legend">Gold = this school won that run. A run goes to the better OPS+ or FIP- (lower is better), and only for beating league average (100) when the other school had nobody play.</div>
          </div>
          {sim && <div className="bl-muted small">* simulated from his 2026 college season totals</div>}
        </>
      )}
    </div>
  );
}

export function fmtStat(v: number | null | undefined) {
  return v === null || v === undefined ? '–' : String(v);
}

// A day cell is gold when this school won that run: the better value
// against the other school, or - when the other school had nobody play -
// beating league average (100). Same rule as the engine ('hold').
export function wonCell(mine: number | null | undefined, theirs: number | null | undefined, higher: boolean) {
  if (mine === null || mine === undefined) return '';
  const other = theirs ?? 100;
  return (higher ? mine > other : mine < other) ? 'won' : '';
}

export function abbr(name: string) {
  const words = name.replace(/[^A-Za-z .'-]/g, '').split(/\s+/).filter(Boolean);
  if (words.length === 1) return words[0].slice(0, 4).toUpperCase();
  return words.slice(0, 3).map((w) => w[0]).join('').toUpperCase();
}

export function Styles() {
  return (
    <style jsx global>{`
      .bl { --bg:#0b0d10; --panel:#141820; --panel2:#1b2029; --line:#262c37; --text:#e9ecf1; --muted:#8b93a1; --gold:#ffd24a; --win:#7fd18b; --loss:#e2786a;
        --dim:#5d6573; --faint:#6a7280; --gold-bg:#2a2412; --tint:rgba(255,255,255,.08); --tint2:rgba(255,255,255,.02); --gold-tint:rgba(255,210,74,.08);
        min-height:100vh; background:var(--bg); color:var(--text); font:400 15px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; padding:24px 16px 80px; }
      .bl * { box-sizing:border-box; }
      .bl.bl-embed { min-height:0; padding:16px 16px 48px; }
      /* On a school's page the game cards follow the player gallery's rules
         (.yat-grid): each card is a player flip card's size (264px wide,
         1 : 1.4), as many across as fit (a round's three on a wide screen,
         stacked on a phone), centered; with a side drawer open the columns
         go fluid the same way. The card scrolls inside and flips between
         the two schools. */
      .bl.bl-embed .bl-row { width:100%; }
      .bl.bl-embed .bl-cards, .bl.bl-embed .bl-cards.n1 { display:grid; grid-template-columns:repeat(auto-fit, 264px); justify-content:center; gap:12px;
        overflow:visible; margin:0; padding:0; scroll-snap-type:none; }
      @media (min-width:780px) {
        body.drawer-left-open .bl.bl-embed .bl-cards, body.drawer-right-open .bl.bl-embed .bl-cards,
        body.drawer-account-open .bl.bl-embed .bl-cards, body.drawer-favorites-open .bl.bl-embed .bl-cards,
        body.yat-desktop-docked-drawers .bl.bl-embed .bl-cards { grid-template-columns:repeat(auto-fit, minmax(min(100%, 230px), 1fr)); }
        body.drawer-left-open.drawer-right-open .bl.bl-embed .bl-cards, body.drawer-left-open.drawer-account-open .bl.bl-embed .bl-cards,
        body.drawer-left-open.drawer-favorites-open .bl.bl-embed .bl-cards { grid-template-columns:repeat(auto-fit, minmax(min(100%, 220px), 1fr)); }
      }
      .bl.bl-embed .bl-cards > * { flex:none; }
      .bl.bl-embed .bl-card { position:relative; width:100%; }
      .bl.bl-embed .bl-card::before { content:""; display:block; padding-top:140%; }
      .bl.bl-embed .bl-inner { position:absolute; inset:0; display:block; }
      .bl.bl-embed .bl-face { position:absolute; inset:0; overflow-x:hidden; overflow-y:auto; overscroll-behavior:contain; border-radius:0; box-shadow:0 4px 8px rgba(0,0,0,.2); }
      .bl.bl-embed .bl-top { padding:8px 8px 9px; }
      .bl.bl-embed .bl-meta { font-size:9.5px; }
      .bl.bl-embed .bl-score { gap:6px; margin-top:6px; }
      .bl.bl-embed .bl-team { font-size:11px; overflow-wrap:normal; overflow:hidden; text-overflow:ellipsis; }
      .bl.bl-embed .bl-runs { font-size:30px; }
      .bl.bl-embed .bl-final { font-size:9px; }
      .bl.bl-embed .bl-ls { font-size:10.5px; }
      .bl.bl-embed .bl-ls th, .bl.bl-embed .bl-ls td { padding:5px 1px; }
      .bl.bl-embed .bl-ls thead th { font-size:9.5px; }
      .bl.bl-embed .bl-ls tbody th { padding-left:6px; }
      .bl.bl-embed .bl-ls td.r { font-size:12px; }
      .bl.bl-embed .bl-note { padding:5px 8px; font-size:10.5px; }
      .bl.bl-embed .bl-tabs { padding:8px 8px 4px; gap:8px; }
      .bl.bl-embed .bl-tabs span.on { font-size:13px; }
      .bl.bl-embed .bl-tabs .flip { font-size:11px; }
      .bl.bl-embed .bl-box { font-size:10px; }
      .bl.bl-embed .bl-box th, .bl.bl-embed .bl-box td { padding:4px 2px; }
      .bl.bl-embed .bl-box thead th { font-size:9px; }
      .bl.bl-embed .bl-box .nm { padding-left:8px; max-width:88px; }
      .bl.bl-embed .bl-box th:last-child, .bl.bl-embed .bl-box td:last-child { padding-right:12px; }
      .bl.bl-embed .bl-how { margin:8px; padding:6px 7px; }
      .bl.bl-embed .bl-days { font-size:9.5px; }
      .bl.bl-embed .bl-wl { font-size:10.5px; }
      .bl.bl-embed .bl-legend { font-size:9.5px; }
      .bl.bl-embed .bl-muted { padding:8px; font-size:11px; }
      /* On a school's page the cards follow the site's light / dark toggle. */
      body.light-theme .bl.bl-embed { --bg:#f4f4f4; --panel:#fff; --panel2:#f3f4f6; --line:#e1e4e8; --text:#121212; --muted:#5f6670; --gold:#b07d00;
        --win:#1e8e3e; --loss:#c62828; --dim:#a0a6ae; --faint:#80868e; --gold-bg:#fff4d6; --tint:rgba(0,0,0,.06); --tint2:rgba(0,0,0,.02); --gold-tint:rgba(255,193,7,.14); }
      body.light-theme .bl.bl-embed .bl-days td.won { color:#000; background:#ffc107; }
      body.light-theme .bl.bl-embed .bl-board em.q { background:#ffc107; }
      .bl-head { max-width:1180px; margin:0 auto 16px; display:flex; flex-direction:column; gap:6px; }
      .bl-kick { font:500 11px/1.3 Oswald, sans-serif; letter-spacing:.14em; text-transform:uppercase; color:var(--gold); }
      .bl-head h1 { margin:0; font:400 clamp(34px,6vw,56px)/1 "Bebas Neue", Oswald, sans-serif; letter-spacing:.02em; }
      .bl-sum { margin:0; color:var(--muted); }
      .bl-sum b { color:var(--text); }
      .bl-nav { position:sticky; top:0; z-index:5; background:rgba(11,13,16,.96); backdrop-filter:blur(6px); margin:0 -16px 16px; padding:10px 16px; border-bottom:1px solid var(--line); }
      .bl-nav > * { max-width:1180px; margin-left:auto; margin-right:auto; }
      .bl-pills { display:flex; gap:6px; overflow-x:auto; padding-bottom:6px; scrollbar-width:thin; }
      .bl-pills button { flex:none; display:flex; flex-direction:column; align-items:flex-start; gap:1px; padding:6px 10px; border:1px solid var(--line); border-radius:8px; background:var(--panel); color:var(--text); cursor:pointer; }
      .bl-pills button b { font:500 13px/1.1 Oswald, sans-serif; letter-spacing:.04em; }
      .bl-pills button span { font-size:11px; color:var(--muted); white-space:nowrap; }
      .bl-pills button.on { border-color:var(--gold); background:var(--gold-bg); }
      .bl-pills button.on b { color:var(--gold); }
      .bl-filters { display:flex; flex-wrap:wrap; gap:8px; margin-top:8px; }
      .bl-search { flex:1 1 220px; }
      .bl-search input, .bl-filters select { width:100%; height:38px; padding:0 12px; border-radius:8px; border:1px solid var(--line); background:var(--panel); color:var(--text); font-size:15px; }
      .bl-filters select { width:auto; flex:0 1 230px; }
      .bl-favbtn { height:38px; padding:0 14px; border-radius:8px; border:1px solid var(--line); background:var(--panel); color:var(--text); font:500 14px/1 Oswald, sans-serif; letter-spacing:.04em; cursor:pointer; }
      .bl-favbtn.on { border-color:var(--gold); color:var(--gold); }
      .bl-count { margin-top:6px; color:var(--muted); font-size:12.5px; }
      .sr { position:absolute; width:1px; height:1px; overflow:hidden; clip:rect(0 0 0 0); }
      .bl-rows { max-width:1180px; margin:0 auto; display:flex; flex-direction:column; gap:26px; }
      .bl-row { display:flex; flex-direction:column; gap:10px; min-width:0; }
      .bl-rowhead { display:flex; flex-wrap:wrap; align-items:baseline; gap:4px 14px; }
      .bl-round { font:500 11.5px/1.3 Oswald, sans-serif; letter-spacing:.12em; text-transform:uppercase; color:var(--gold); width:100%; }
      .bl-title { display:flex; flex-wrap:wrap; align-items:center; gap:4px 8px; font-size:15.5px; }
      .bl-title i { font-style:normal; color:var(--muted); font-size:12.5px; }
      .bl-vs { color:var(--muted); font-size:12px; }
      .bl-result { color:var(--win); font:500 13px/1.3 Oswald, sans-serif; letter-spacing:.04em; }
      .bl-star { border:0; background:none; color:var(--muted); font-size:18px; line-height:1; cursor:pointer; padding:0 2px; }
      .bl-star.on { color:var(--gold); }
      .bl-cards { display:grid; grid-template-columns:repeat(3, minmax(0, 1fr)); gap:12px; align-items:start; }
      .bl-cards.n1 { grid-template-columns:minmax(0, 380px); }
      @media (max-width:1000px) {
        .bl-cards { display:flex; overflow-x:auto; scroll-snap-type:x mandatory; gap:10px; padding-bottom:6px; margin:0 -16px; padding-left:16px; padding-right:16px; }
        .bl-cards > * { flex:0 0 min(360px, 88vw); scroll-snap-align:start; }
      }
      .bl-card { perspective:1600px; min-width:0; }
      .bl-inner { display:grid; transition:transform .55s cubic-bezier(.2,.7,.2,1); transform-style:preserve-3d; }
      .bl-card.flipped .bl-inner { transform:rotateY(180deg); }
      .bl-face { grid-area:1/1; backface-visibility:hidden; -webkit-backface-visibility:hidden; background:var(--panel); border:1px solid var(--line); border-radius:12px; overflow:hidden; min-width:0; }
      .bl-back { transform:rotateY(180deg); }
      @media (prefers-reduced-motion: reduce) { .bl-inner { transition:none; } }
      .bl-f { display:flex; flex-direction:column; min-width:0; cursor:pointer; }
      .bl-f.still, .bl-f.still .bl-top { cursor:default; }
      .bl-top { display:block; width:100%; border:0; padding:10px 12px 12px; background:var(--panel2); color:inherit; text-align:left; cursor:pointer; }
      .bl-meta { display:flex; justify-content:space-between; gap:8px; color:var(--muted); font:500 11px/1.2 Oswald, sans-serif; letter-spacing:.08em; text-transform:uppercase; }
      .bl-score { display:grid; grid-template-columns:1fr auto auto auto 1fr; align-items:center; gap:10px; margin-top:8px; }
      .bl-team { min-width:0; font-size:13.5px; line-height:1.15; color:var(--muted); overflow-wrap:anywhere; }
      .bl-team.r { text-align:right; }
      .bl-team.me { color:var(--text); }
      .bl-team.me b { color:var(--gold); }
      .bl-runs { font:400 40px/1 "Bebas Neue", Oswald, sans-serif; }
      .bl-final { font:600 11px/1 Oswald, sans-serif; letter-spacing:.12em; color:var(--muted); }
      .bl-scroll { overflow-x:auto; }
      .bl-ls { width:100%; border-collapse:collapse; font:500 13px/1 Oswald, sans-serif; font-variant-numeric:tabular-nums; }
      .bl-ls th, .bl-ls td { padding:7px 3px; text-align:center; border-bottom:1px solid var(--line); }
      .bl-ls thead th { color:var(--muted); font-weight:400; font-size:11.5px; }
      .bl-ls tbody th { text-align:left; padding-left:12px; font-weight:500; color:var(--muted); }
      .bl-ls tr.me th { color:var(--gold); }
      .bl-ls td { color:var(--dim); }
      .bl-ls td.hit { color:var(--text); }
      .bl-ls .sep { border-left:1px solid var(--line); }
      .bl-ls td.r { color:var(--text); font-size:15px; }
      .bl-note { padding:6px 12px; color:var(--gold); font-size:12px; border-bottom:1px solid var(--line); }
      .bl-tabs { display:flex; align-items:center; gap:14px; padding:10px 12px 6px; }
      .bl-tabs span.on { font:500 16px/1.1 Oswald, sans-serif; letter-spacing:.03em; }
      .bl-tabs .flip { color:var(--muted); font:500 13px/1.1 Oswald, sans-serif; }
      .bl-tabs em { margin-left:auto; font-style:normal; font:600 13px/1 Oswald, sans-serif; padding:3px 7px; border-radius:4px; }
      .bl-tabs em.me { background:rgba(127,209,139,.15); color:var(--win); }
      .bl-tabs em.them { background:rgba(226,120,106,.15); color:var(--loss); }
      .bl-tabs em.tie { background:var(--tint); color:var(--muted); }
      .bl-box { width:100%; border-collapse:collapse; font-size:12px; font-variant-numeric:tabular-nums; }
      .bl-box th, .bl-box td { padding:5px 3px; text-align:right; border-bottom:1px solid var(--line); white-space:nowrap; }
      .bl-box thead th { color:var(--muted); font:500 11px/1 Oswald, sans-serif; letter-spacing:.04em; }
      .bl-box .nm { text-align:left; padding-left:10px; max-width:118px; overflow:hidden; text-overflow:ellipsis; }
      .bl-box .nm small { color:var(--muted); font-size:10px; }
      .bl-box .none { color:var(--muted); font-style:italic; }
      /* OPS+ / FIP- first after the name; room after the last column so it isn't cut off. */
      .bl-box .plus { color:var(--gold); font-weight:700; padding-left:6px; padding-right:8px; text-align:center; }
      .bl-box th:last-child, .bl-box td:last-child { padding-right:14px; }
      .bl-plink { color:inherit; text-decoration:none; }
      .bl-plink:hover, .bl-plink:focus-visible { color:var(--gold); text-decoration:underline; }
      .bl-box tr.tot td { font-weight:700; border-bottom:0; }
      .bl-how { margin:10px 12px 12px; padding:8px 10px; border:1px solid var(--line); border-radius:8px; background:var(--tint2); }
      .bl-howt { font:500 11px/1.2 Oswald, sans-serif; letter-spacing:.1em; text-transform:uppercase; color:var(--muted); margin-bottom:4px; }
      .bl-days { width:100%; border-collapse:collapse; font-size:11.5px; font-variant-numeric:tabular-nums; }
      .bl-days th, .bl-days td { padding:3px 2px; text-align:center; }
      .bl-days thead th { color:var(--muted); font-weight:500; }
      .bl-days tbody th { text-align:left; color:var(--muted); font-weight:500; }
      .bl-days tr.opp td { color:var(--muted); }
      .bl-days td.won { color:#000; background:var(--gold); border-radius:4px; font-weight:700; }
      .bl-wl { margin-top:6px; font-size:12px; color:var(--muted); }
      .bl-wl b { color:var(--text); }
      .bl-wl em { color:var(--gold); font-style:normal; }
      .bl-legend { margin-top:4px; font-size:11px; color:var(--faint); }
      .bl-muted { padding:10px 12px; color:var(--muted); font-size:13px; }
      .bl-fans-kick { padding:8px 12px 2px; color:var(--gold); font:500 11px/1.3 Oswald, sans-serif; letter-spacing:.08em; text-transform:uppercase; }
      .bl-fans { padding:6px 12px 8px; }
      .bl-fans-h { display:flex; justify-content:space-between; align-items:baseline; gap:8px; border-bottom:1px solid var(--line); padding-bottom:4px; }
      .bl-fans-h b { font:500 14px/1.2 Oswald, sans-serif; letter-spacing:.03em; }
      .bl-fans-h span { color:var(--muted); font-size:11px; white-space:nowrap; }
      .bl-fans-list { list-style:none; margin:0; padding:0; font-size:12px; }
      .bl-fans-list li { display:flex; justify-content:space-between; gap:8px; padding:3px 0; border-bottom:1px solid var(--line); }
      .bl-fans-list .p { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .bl-fans-list .p small { color:var(--muted); font-size:10px; }
      .bl-fans-list .f { color:var(--faint, var(--muted)); font-style:italic; white-space:nowrap; font-size:11px; }
      .bl-fans-list .none, .bl-fans-none { color:var(--muted); font-size:12px; }
      .bl-fans-none { margin:6px 0 0; line-height:1.45; }
      .bl-wait { padding:18px 14px; text-align:center; }
      .bl-wait .k { color:var(--gold); font:500 12px/1.2 Oswald, sans-serif; letter-spacing:.12em; text-transform:uppercase; }
      .bl-wait .n { margin-top:10px; font:400 30px/1.05 "Bebas Neue", Oswald, sans-serif; letter-spacing:.02em; }
      .bl-wait .s { margin-top:6px; color:var(--muted); font-size:12px; }
      .bl-wait p { margin:14px 0 0; color:var(--text); font-size:13px; line-height:1.5; }
      .bl-muted.small { padding-top:0; font-size:11.5px; }
      .bl-empty { max-width:1180px; margin:40px auto; color:var(--muted); }
      .bl-sentinel { height:1px; }
      .bl-link { border:0; background:none; padding:0; color:inherit; font:inherit; cursor:pointer; text-align:left; }
      .bl-link:hover b, .bl-link:hover { text-decoration:underline; text-underline-offset:3px; }
      .bl-boards { max-width:1180px; margin:0 auto; display:flex; flex-direction:column; gap:16px; }
      .bl-weekbar { display:grid; grid-template-columns:auto 1fr auto; align-items:center; gap:8px 10px; }
      .bl-weekbar button { width:36px; height:36px; border-radius:8px; border:1px solid var(--line); background:var(--panel); color:var(--text); font-size:20px; line-height:1; cursor:pointer; }
      .bl-weekbar button:disabled { opacity:.35; cursor:default; }
      .bl-weekbar input { width:100%; accent-color:var(--gold); }
      .bl-weeklabel { grid-column:1 / -1; color:var(--muted); font-size:13.5px; }
      .bl-weeklabel b { color:var(--gold); font:500 15px/1 Oswald, sans-serif; letter-spacing:.04em; }
      .bl-announce { border:1px solid var(--gold); border-radius:12px; background:linear-gradient(180deg, var(--gold-bg), var(--panel)); padding:14px 16px; }
      .bl-announce-t { font:500 13px/1.2 Oswald, sans-serif; letter-spacing:.12em; text-transform:uppercase; color:var(--gold); }
      .bl-announce p { margin:6px 0 10px; color:var(--muted); font-size:13.5px; }
      .bl-announce p b { color:var(--text); }
      .bl-announce ol { list-style:none; margin:0; padding:0; display:grid; grid-template-columns:repeat(auto-fill, minmax(280px, 1fr)); gap:6px 16px; }
      .bl-announce li { display:flex; align-items:baseline; gap:8px; min-width:0; }
      .bl-announce li .seed { color:var(--gold); font:500 14px/1 Oswald, sans-serif; width:24px; flex:none; }
      .bl-announce li i { color:var(--muted); font-style:normal; font-size:12px; flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .bl-announce li .runs { font:500 13px/1 Oswald, sans-serif; flex:none; }
      .bl-grid { display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); gap:14px; align-items:start; }
      @media (max-width:900px) { .bl-grid { grid-template-columns:minmax(0, 1fr); } }
      .bl-board { background:var(--panel); border:1px solid var(--line); border-radius:12px; overflow:hidden; min-width:0; }
      .bl-board-h { padding:10px 12px; background:var(--panel2); border-bottom:1px solid var(--line); font:500 15px/1.2 Oswald, sans-serif; letter-spacing:.04em; }
      .bl-board-h span { color:var(--muted); font-size:13px; margin-left:6px; }
      .bl-board table { width:100%; border-collapse:collapse; font-size:13px; font-variant-numeric:tabular-nums; }
      .bl-board th, .bl-board td { padding:6px 6px; border-bottom:1px solid var(--line); text-align:right; white-space:nowrap; }
      .bl-board thead th { color:var(--muted); font:500 11px/1 Oswald, sans-serif; letter-spacing:.05em; }
      .bl-board .rk { width:28px; text-align:right; color:var(--muted); }
      .bl-board .nm { text-align:left; max-width:0; width:100%; overflow:hidden; text-overflow:ellipsis; }
      .bl-board .nm .bl-star { font-size:15px; margin-right:2px; }
      .bl-board td.r { color:var(--text); font-weight:700; }
      .bl-board td.pos { color:var(--win); }
      .bl-board td.neg { color:var(--loss); }
      .bl-board .st { text-align:left; font-size:11.5px; }
      .bl-board td.st.alive { color:var(--text); }
      .bl-board td.st.out { color:var(--muted); }
      .bl-board td.st.champ { color:var(--gold); }
      .bl-board tr.lead td { background:var(--gold-tint); }
      .bl-board tr.lead .nm .bl-link { color:var(--gold); font-weight:600; }
      .bl-board tr.extra td { border-top:1px dashed var(--line); }
      .bl-board em.q { margin-left:6px; font-style:normal; font:600 10px/1 Oswald, sans-serif; letter-spacing:.06em; text-transform:uppercase; color:#000; background:var(--gold); padding:2px 5px; border-radius:3px; }
      .bl-board td.none { text-align:left; color:var(--muted); font-style:italic; }
      @media (max-width:520px) { .bl-board .st { display:none; } }
      .bl-more { display:block; width:100%; padding:9px; border:0; background:none; color:var(--gold); font:500 13px/1 Oswald, sans-serif; letter-spacing:.05em; cursor:pointer; }
      .bl-school { max-width:1180px; margin:0 auto 18px; display:flex; flex-direction:column; gap:6px; }
      .bl-backlink { align-self:flex-start; border:0; background:none; color:var(--gold); font:500 13px/1 Oswald, sans-serif; letter-spacing:.05em; cursor:pointer; padding:0; }
      .bl-school-t { font:400 clamp(28px,5vw,40px)/1 "Bebas Neue", Oswald, sans-serif; letter-spacing:.02em; display:flex; align-items:baseline; gap:8px; flex-wrap:wrap; }
      .bl-school-t i { font:400 14px/1 system-ui, sans-serif; color:var(--muted); font-style:normal; }
      .bl-school-t .bl-star { font-size:22px; }
      .bl-school-s { color:var(--muted); font-size:13.5px; }
      .bl-school-s b { color:var(--text); }
      .bl-foot { max-width:1180px; margin:32px auto 0; color:var(--muted); font-size:12.5px; border-top:1px solid var(--line); padding-top:12px; }
    `}</style>
  );
}
