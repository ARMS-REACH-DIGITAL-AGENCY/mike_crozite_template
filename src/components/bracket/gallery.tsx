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
import { simulationAsOf } from './simulationState';
import { tournamentWeeks } from '@/lib/bracket/tournamentCalendar';
import { TEST_OPENING_DAY, applyTestField } from '@/lib/bracket/testSeason';
import { applyLive, liveBoxes } from './liveSeason';

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
// [playerid, name, level, simulated, bat [PA AB H 2B 3B HR BB HBP SF] | 0,
//  pit [outs HR BB HBP K H R ER FIP] | 0, OPS+, FIP-]
// ... then his club's W-L that week (inning 9). The final optional flag marks
// a deterministic simulated W-L used only when the 2026 source record is absent.
export type PlayerRow = [string, string, string, 0 | 1, number[] | 0, number[] | 0, number | null, number | null, ([number, number] | null)?, (0 | 1)?];
// days: live boxes carry each day's real lines (the drawer's M-Su tabs).
export type SideBox = { p: PlayerRow[]; wl: [number, number]; days?: PlayerRow[][] };
// f (live boxes): is each inning's [offensive, pitching] run settled yet;
// 1-8, then the W-L inning. Unsettled cells show who leads, but no run.
export type GameBox = { d: (number | null)[][]; h: SideBox; a: SideBox; f?: [boolean, boolean][] };
export type ActiveRosterPlayer = {
  playerid: string | number;
  display_name?: string | null;
  firstname?: string | null;
  lastname?: string | null;
  level?: string | null;
  is_pitcher?: boolean | null;
  current_teamid?: string | number | null; // the team logo (teams-web/<id>.webp)
};

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
  coin: "Tied after 9 and after all available player tiebreakers · commissioner coin flip (+1 run)",
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
  // Live games: every round's boxes come from the live lines.
  if (!boxCache.has(file)) boxCache.set(file, liveBoxes());
  return boxCache.get(file)!;
}

// The signed-in fan's favorite players (Super Fan favorites), once per visit:
// their lines are bold in the stat drawers. Signed out: none.
let favoritePlayers: Promise<Set<string>> | null = null;
export function loadFavoritePlayers() {
  if (!favoritePlayers) {
    let uid = '';
    try { uid = String(JSON.parse(localStorage.getItem('yat-user') || 'null')?.uid || ''); } catch { uid = ''; }
    favoritePlayers = uid
      ? fetch(`/api/favorites?uid=${encodeURIComponent(uid)}&scope=button`, { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => new Set<string>(Array.isArray(d?.playerIds) ? d.playerIds.map(String) : []))
        .catch(() => new Set<string>())
      : Promise.resolve(new Set<string>());
  }
  return favoritePlayers;
}

const activeRosterCache = new Map<number, Promise<ActiveRosterPlayer[]>>();
// A school's active alumni for the Stat Ledgers. A failed load (the
// database busy, a dropped connection) is retried, and only a real answer
// is kept - a failure is never cached as an empty roster for the visit.
export function loadActiveRoster(hsid: number) {
  if (!activeRosterCache.has(hsid)) {
    const attempt = (n: number): Promise<ActiveRosterPlayer[]> =>
      fetch(`/api/players/${hsid}`, { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
        .then((rows) => (Array.isArray(rows) ? rows : Promise.reject(new Error('bad roster'))))
        .catch((e) => (n > 0 ? new Promise<ActiveRosterPlayer[]>((res) => setTimeout(() => res(attempt(n - 1)), 1200 * (4 - n))) : Promise.reject(e)));
    const p = attempt(3).catch(() => {
      activeRosterCache.delete(hsid); // try again next time the drawer opens
      return [] as ActiveRosterPlayer[];
    });
    activeRosterCache.set(hsid, p);
  }
  return activeRosterCache.get(hsid)!;
}

// A player's current team logo, by our (Baseball Cube) team id - college and
// pro alike: teams-web/<id>.webp, then teams/<id>.png. No logo: an empty slot
// of the same size, so the names stay lined up.
const TEAM_LOGO_BASE = 'https://yatstats-assets.s3.us-west-2.amazonaws.com';
function TeamLogo({ id }: { id?: string }) {
  const [step, setStep] = useState(0);
  const srcs = id && /^\d+$/.test(id) ? [`${TEAM_LOGO_BASE}/teams-web/${id}.webp`, `${TEAM_LOGO_BASE}/teams/${id}.png`] : [];
  if (step >= srcs.length) return <span className="bl-tlogo" aria-hidden="true" />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img className="bl-tlogo" src={srcs[step]} alt="" loading="lazy" onError={() => setStep((n) => n + 1)} />;
}

export const shortName = (name: string) => name
  .split(' (')[0]
  .replace(/\bPreparatory\b/gi, 'Prep')
  .replace(/\s+High School$/i, '')
  .replace(/\s+Prep School$/i, ' Prep')
  .trim();
export const LEVEL: Record<string, string> = {
  MLB: 'MLB', 'TRIPLE-A': 'AAA', 'DOUBLE-A': 'AA', 'HIGH-A': 'A+', 'LOW-A': 'A', ROOKIE: 'RK', SPRING: 'ST',
  'NCAA-D1': 'D1', 'NCAA-D2': 'D2', 'NCAA-D3': 'D3', NAIA: 'NAIA', JUCO: 'JUCO',
};
export const lvl = (l: string) => l.split('/').map((x) => LEVEL[x] || x).join('/');
export const place = (name: string) => (name.includes(' (') ? name.split(' (')[1].replace(/\)$/, '').replace(/,\s*/g, ', ').trim() : '');
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

// Progressive simulation date. ?asof=YYYY-MM-DD still overrides it for debugging.
export function previewDate() {
  const q = new URLSearchParams(window.location.search).get('asof') || '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(q)) return q;
  return simulationAsOf();
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
    indexPromise = fetch(`${BASE}/index.json`).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))).then((idx: any) => {
      // Test branch: the season opens Mon Oct 5, 2026 - Week 1 = Oct 5-11.
      if (idx && Array.isArray(idx.weeks)) {
        idx.weeks = tournamentWeeks(TEST_OPENING_DAY, idx.weeks.length);
      }
      if (idx) applyTestField(idx);
      return idx ? applyLive(idx, simulationAsOf()) : idx;
    });
    indexPromise.catch(() => { indexPromise = null; });
  }
  return indexPromise;
}
let lbPromise: Promise<LbGame[]> | null = null;
export function loadLb() {
  if (!lbPromise) {
    // Test branch: no practice-season leaderboard games.
    lbPromise = Promise.resolve([] as LbGame[]);
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
      locations={[place(S[home]?.[0] || ''), place(S[away]?.[0] || '')]}
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

// Box-score names: last name only, with the first initial when two players
// on the same side share it (B. Smith, R. Smith). Jr./Sr./II stay on.
export function shortNames(players: PlayerRow[]) {
  const last = (name: string) => {
    const parts = name.trim().split(/\s+/);
    const tail = parts[parts.length - 1];
    return parts.length > 2 && /^(jr\.?|sr\.?|ii|iii|iv)$/i.test(tail) ? `${parts[parts.length - 2]} ${tail}` : tail;
  };
  const count = new Map<string, number>();
  for (const p of players) count.set(last(p[1]), (count.get(last(p[1])) || 0) + 1);
  return new Map(players.map((p) => [p[0], (count.get(last(p[1])) || 0) > 1 ? `${p[1].trim()[0]}. ${last(p[1])}` : last(p[1])]));
}

type SortCol = { key: string; label: string; cls?: string; val: (p: PlayerRow) => number | null; show: (p: PlayerRow) => ReactNode };
// A box-score table whose headers sort it: a tap sorts high to low, a
// second tap low to high (the name sorts A-Z). The Team row stays last.
function SortTable({ title, rows, cols, player, labels, total, empty, favs }: {
  title: string; rows: PlayerRow[]; cols: SortCol[]; player: (p: PlayerRow) => ReactNode; labels: Map<string, string>; total: ReactNode[]; empty: string;
  favs?: Set<string>; // the fan's favorite players: their whole line in bold
}) {
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);
  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = cols.find((c) => c.key === sort.key);
    if (sort.key === 'name') return [...rows].sort((a, b) => sort.dir * (labels.get(a[0]) || '').localeCompare(labels.get(b[0]) || ''));
    if (!col) return rows;
    return [...rows].sort((a, b) => {
      const va = col.val(a), vb = col.val(b);
      if (va === null && vb === null) return 0;
      if (va === null) return 1;
      if (vb === null) return -1;
      return sort.dir * (vb - va);
    });
  }, [rows, cols, sort, labels]);
  const click = (key: string) => (e: React.MouseEvent) => {
    e.stopPropagation();
    setSort((s) => (s && s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: key === 'name' ? -1 : 1 }));
  };
  const arrow = (key: string) => (sort?.key === key ? (sort.dir === 1 ? (key === 'name' ? ' ▲' : ' ▼') : (key === 'name' ? ' ▼' : ' ▲')) : '');
  const blockClass = title === 'Batters' ? 'offense' : 'defense';
  return (
    <div className={`bl-stat-block ${blockClass}`}>
      <div className="bl-scroll">
      <table className="bl-box">
        <colgroup>
          <col style={{ width: 136 }} />
          {cols.map((c) => <col key={c.key} style={{ width: c.cls === 'plus' ? 58 : c.cls === 'wl' ? 56 : 44 }} />)}
        </colgroup>
        <thead>
          <tr>
            <th className="nm"><button type="button" className="bl-sort" onClick={click('name')}>{title}{arrow('name')}</button></th>
            {cols.map((c) => <th key={c.key} className={c.cls}><button type="button" className="bl-sort" onClick={click(c.key)}>{c.label}{arrow(c.key)}</button></th>)}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && empty && <tr><td className="nm none" colSpan={cols.length + 1}>{empty}</td></tr>}
          {sorted.map((p) => (
            <tr key={p[0]} className={favs?.has(String(p[0])) ? 'fav' : undefined}>
              <td className="nm">{player(p)}</td>
              {cols.map((c) => <td key={c.key} className={c.cls}>{c.show(p)}</td>)}
            </tr>
          ))}
          {rows.length > 0 && (
            <tr className="tot">
              <td className="nm">Team</td>
              {total.map((v, i) => <td key={i} className={cols[i]?.cls}>{v}</td>)}
            </tr>
          )}
        </tbody>
      </table>
      </div>
    </div>
  );
}

function hashRosterKey(value: string) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

function simulatedWeeklyWl(playerid: string, week: number, level: string): [number, number] {
  const college = /NCAA|NAIA|JUCO|NJCAA|CCCAA|NWAC|COLLEGE/i.test(level);
  const games = college ? 4 : 6;
  const seed = hashRosterKey(`yatstats-2026-wl:${playerid}:${week}:${level}`);
  // Keep the prototype plausible and deterministic; every player receives
  // a non-empty record, while real exported club results still win whenever present.
  const wins = seed % (games + 1);
  return [wins, games - wins];
}

function rosterName(p: ActiveRosterPlayer) {
  return String(p.display_name || `${p.firstname || ''} ${p.lastname || ''}`.trim() || `Player ${p.playerid}`);
}

function completeRosterRows(existing: PlayerRow[], roster: ActiveRosterPlayer[] | undefined, week: number): PlayerRow[] {
  const current = new Map(existing.map((p) => [String(p[0]), p] as const));
  const source = roster && roster.length
    ? roster.map((r) => ({
        id: String(r.playerid),
        name: rosterName(r),
        level: String(r.level || ''),
        isPitcher: Boolean(r.is_pitcher),
      }))
    : existing.map((p) => ({
        id: String(p[0]),
        name: String(p[1]),
        level: String(p[2] || ''),
        isPitcher: Boolean(p[5]) && !Boolean(p[4]),
      }));

  return source.map(({ id, name, level, isPitcher }) => {
    const row = current.get(id);
    const simulated = /NCAA|NAIA|JUCO|NJCAA|CCCAA|NWAC|COLLEGE/i.test(level) ? 1 : 0;
    const next = row
      ? [...row] as PlayerRow
      : [id, name, level, simulated, 0, 0, null, null, null, 0] as PlayerRow;

    // Older checked-in preview boxes only carried [outs, HR, BB, HBP, K].
    // Backfill H/R/ER/FIP deterministically so the expanded pitching table is
    // useful immediately; regenerated fixtures export the real/simulated fields.
    if (next[5] && (next[5] as number[]).length < 9) {
      const old = [...(next[5] as number[])];
      const outs = old[0] || 0, hr = old[1] || 0, bb = old[2] || 0, hbp = old[3] || 0, k = old[4] || 0;
      const innings = outs / 3;
      const h = outs ? Math.max(hr, Math.round(innings * 0.9)) : 0;
      const r = outs ? Math.max(hr, Math.round((h + bb + hbp) * 0.38)) : 0;
      const er = Math.max(0, r - (r > 2 ? 1 : 0));
      const fip = outs ? (13 * hr + 3 * (bb + hbp) - 2 * k) / innings + 3.1 : 0;
      next[5] = [outs, hr, bb, hbp, k, h, r, er, +fip.toFixed(2)];
    }

    // Every active alumnus always stays in one of the two roster groups.
    // If he did not play this week, keep him in his normal Batters/Pitchers
    // section with a true zero line rather than moving him to a third group.
    if (!next[4] && !next[5]) {
      if (isPitcher) {
        next[5] = [0, 0, 0, 0, 0, 0, 0, 0, 0];
        next[7] = 0;
      } else {
        next[4] = [0, 0, 0, 0, 0, 0, 0, 0, 0];
        next[6] = 0;
      }
    }

    if (!next[8]) {
      next[8] = simulatedWeeklyWl(id, week, String(next[2] || level));
      next[9] = 1;
    }
    return next;
  });
}

function sumRosterWl(players: PlayerRow[]): [number, number] {
  return players.reduce<[number, number]>((sum, p) => {
    if (p[8]) { sum[0] += p[8][0]; sum[1] += p[8][1]; }
    return sum;
  }, [0, 0]);
}

// Deterministic per-player daily RNG (mulberry32 seeded from the FNV hash).
function dailyRng(playerid: string, week: number, stat: string) {
  let a = hashRosterKey(`daily:${playerid}:${week}:${stat}`) >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Distribute `total` indistinguishable units across 7 days with probability
// proportional to `weights`. The result always sums to exactly `total`.
// When `caps` is given, no day receives more than its cap (used to keep the
// baseball hierarchy true per day: hits <= at-bats, extra-base hits <= hits,
// earned runs <= runs, ...). If the weekly source data already violates the
// hierarchy, the spillover distributes proportionally without caps.
function assignDailyCounts(total: number, weights: number[], rand: () => number, caps?: number[]): number[] {
  const n = Math.max(0, Math.round(Number(total || 0)));
  const out = [0, 0, 0, 0, 0, 0, 0];
  if (!n) return out;
  const w = weights.map((v) => Math.max(0, Number(v) || 0));
  const hasCap = Array.isArray(caps);
  const cap = hasCap ? (caps as number[]).map((v) => Math.max(0, Math.floor(Number(v) || 0))) : null;
  const pickDay = (respectCap: boolean): number => {
    const ew = [0, 0, 0, 0, 0, 0, 0];
    let wSum = 0;
    for (let d = 0; d < 7; d++) {
      let e = w[d];
      if (e <= 0 && !hasCap) e = 1; // uncapped mode with no signal: spread evenly
      if (respectCap && cap && out[d] >= cap[d]) e = 0;
      ew[d] = e; wSum += e;
    }
    if (wSum <= 0) return -1;
    let r = rand() * wSum;
    for (let d = 0; d < 7; d++) { if (r < ew[d]) return d; r -= ew[d]; }
    return 6;
  };
  for (let i = 0; i < n; i++) {
    let d = hasCap ? pickDay(true) : pickDay(false);
    if (d < 0) d = pickDay(false); // caps exhausted: spill proportionally
    if (d < 0) d = i % 7;          // fully degenerate: round-robin
    out[d]++;
  }
  return out;
}

function dailyRosterRows(players: PlayerRow[], week: number, day: number): PlayerRow[] {
  return players.map((p) => {
    const next = [...p] as PlayerRow;
    const pid = String(p[0]);
    if (Array.isArray(p[4])) {
      const src = p[4] as number[];
      const [wPa, wAb, wH, wD2, wD3, wHr, wBb, wHbp, wSf] = src.map((v) => Math.max(0, Math.round(Number(v || 0))));
      // Hierarchical split so the daily columns always add up to the weekly
      // total: at-bats first, hits as a subset of at-bat days, extra-base
      // hits as subsets of hit days. No post-hoc clamping, so no lost units.
      const dAb = assignDailyCounts(wAb, [1, 1, 1, 1, 1, 1, 1], dailyRng(pid, week, 'bat-ab'));
      const dH = assignDailyCounts(wH, dAb, dailyRng(pid, week, 'bat-h'), dAb);
      const dD2 = assignDailyCounts(wD2, dH, dailyRng(pid, week, 'bat-2b'), dH);
      const dD3 = assignDailyCounts(wD3, dH.map((v, i) => v - dD2[i]), dailyRng(pid, week, 'bat-3b'), dH.map((v, i) => v - dD2[i]));
      const dHr = assignDailyCounts(wHr, dH.map((v, i) => v - dD2[i] - dD3[i]), dailyRng(pid, week, 'bat-hr'), dH.map((v, i) => v - dD2[i] - dD3[i]));
      const dBb = assignDailyCounts(wBb, [1, 1, 1, 1, 1, 1, 1], dailyRng(pid, week, 'bat-bb'));
      const dHbp = assignDailyCounts(wHbp, [1, 1, 1, 1, 1, 1, 1], dailyRng(pid, week, 'bat-hbp'));
      const dSf = assignDailyCounts(wSf, [1, 1, 1, 1, 1, 1, 1], dailyRng(pid, week, 'bat-sf'));
      // Plate appearances follow the day's events; any weekly surplus beyond
      // AB+BB+HBP+SF rides along proportionally so the sum stays exact.
      const dPa = assignDailyCounts(wPa, dAb.map((v, i) => v + dBb[i] + dHbp[i] + dSf[i]), dailyRng(pid, week, 'bat-pa'));
      next[4] = [dPa[day], dAb[day], dH[day], dD2[day], dD3[day], dHr[day], dBb[day], dHbp[day], dSf[day]];
      next[6] = dPa[day] > 0 ? p[6] : null;
    }
    if (Array.isArray(p[5])) {
      const src = p[5] as number[];
      const [wOuts, wHr, wBb, wHbp, wK, wHits, wR, wEr] = src.map((v) => Math.max(0, Math.round(Number(v || 0))));
      const wFip = Number(src[8] || 0);
      const dOuts = assignDailyCounts(wOuts, [1, 1, 1, 1, 1, 1, 1], dailyRng(pid, week, 'pit-outs'));
      const dHits = assignDailyCounts(wHits, dOuts, dailyRng(pid, week, 'pit-h'), dOuts);
      const dHr = assignDailyCounts(wHr, dHits, dailyRng(pid, week, 'pit-hr'), dHits);
      const dBb = assignDailyCounts(wBb, dOuts, dailyRng(pid, week, 'pit-bb'));
      const dHbp = assignDailyCounts(wHbp, dOuts, dailyRng(pid, week, 'pit-hbp'));
      const dK = assignDailyCounts(wK, dOuts, dailyRng(pid, week, 'pit-k'), dOuts);
      const dR = assignDailyCounts(wR, dHits.map((v, i) => v + dBb[i] + dHbp[i]), dailyRng(pid, week, 'pit-r'), dHits.map((v, i) => v + dBb[i] + dHbp[i]));
      const dEr = assignDailyCounts(wEr, dR, dailyRng(pid, week, 'pit-er'), dR);
      next[5] = [dOuts[day], dHr[day], dBb[day], dHbp[day], dK[day], dHits[day], dR[day], dEr[day], wFip];
      const active = dOuts[day] > 0 || dHr[day] > 0 || dBb[day] > 0 || dK[day] > 0;
      next[7] = active ? p[7] : null;
    }
    next[8] = null;
    return next;
  });
}

export function correctedRosterGame(
  innings: number[],
  week: number,
  homeRows: PlayerRow[],
  awayRows: PlayerRow[],
  homeRoster?: ActiveRosterPlayer[],
  awayRoster?: ActiveRosterPlayer[],
) {
  const homePlayers = completeRosterRows(homeRows, homeRoster, week);
  const awayPlayers = completeRosterRows(awayRows, awayRoster, week);
  const homeWl = sumRosterWl(homePlayers);
  const awayWl = sumRosterWl(awayPlayers);
  const wp = ([w, l]: [number, number]) => w + l ? w / (w + l) : 0.5;
  const hw = wp(homeWl), aw = wp(awayWl);
  const corrected = [...innings];
  if (corrected.length >= 18) {
    corrected[16] = hw > aw ? 1 : 0;
    corrected[17] = aw > hw ? 1 : 0;
  }
  const score: [number, number] = [
    corrected.filter((_, i) => i % 2 === 0).reduce((s, v) => s + Number(v || 0), 0),
    corrected.filter((_, i) => i % 2 === 1).reduce((s, v) => s + Number(v || 0), 0),
  ];
  return { innings: corrected, score, homeWl, awayWl, homePlayers, awayPlayers };
}

export function Face({ side, label, week, dates, home, away, names, locations = ['', ''], score, innings, winner, decidedBy, box, loading, onFlip, flipTo, homeRoster, awayRoster, drawerMode = false, played = true, onSwitchSide, openDay = 'week' }: {
  side: 'h' | 'a'; label: string; week: number; dates: string; home: number; away: number; names: [string, string]; locations?: [string, string];
  score: [number, number]; innings: number[]; winner: number | null; decidedBy: string; box?: GameBox; loading: boolean; onFlip?: () => void;
  flipTo?: string; // the back isn't the other school's box score
  homeRoster?: ActiveRosterPlayer[];
  awayRoster?: ActiveRosterPlayer[];
  drawerMode?: boolean;
  played?: boolean; // false when this week's games haven't been played yet (staged simulation)
  onSwitchSide?: () => void; // one drawer at a time: the opponent's name opens his drawer instead
  openDay?: 'week' | number; // the drawer's first tab: today (0 = Monday) during the week, else the week
}) {
  const me = side === 'h' ? 0 : 1;
  const them = 1 - me;
  // Unplayed weeks: the box score doesn't exist yet. Withhold it so the
  // drawer renders the staged empty state instead of leaking sim results.
  const boxForView = played ? box : undefined;
  const rawMine = boxForView ? boxForView[side] : undefined;
  const rawTheirs = boxForView ? boxForView[side === 'h' ? 'a' : 'h'] : undefined;
  const mineRoster = me === 0 ? homeRoster : awayRoster;
  const theirsRoster = me === 0 ? awayRoster : homeRoster;
  const minePlayers = completeRosterRows(rawMine?.p || [], mineRoster, week);
  const theirPlayers = completeRosterRows(rawTheirs?.p || [], theirsRoster, week);
  // Unplayed drawer: the roster is known, but no metric can exist yet.
  // Blank the rate/metric cells so the drawer reads as empty, not zero-data.
  if (drawerMode && !played) {
    for (const p of minePlayers) { p[6] = null; p[7] = null; p[8] = null; }
    for (const p of theirPlayers) { p[6] = null; p[7] = null; p[8] = null; }
  }
  const mine = rawMine || mineRoster ? { p: minePlayers, wl: sumRosterWl(minePlayers) } as SideBox : undefined;
  const theirs = rawTheirs || theirsRoster ? { p: theirPlayers, wl: sumRosterWl(theirPlayers) } as SideBox : undefined;
  if (mine) mine.wl = sumRosterWl(minePlayers);
  if (theirs) theirs.wl = sumRosterWl(theirPlayers);
  const weekVals = boxForView?.d?.[7];
  const myName = names[me];
  const [statDay, setStatDay] = useState<'week' | number>(openDay);
  // Drawer: the scoreboards stay pinned under the header and the day tabs
  // pin right under them, so they never scroll away from the players.
  const boardsRef = useRef<HTMLDivElement | null>(null);
  const [boardsH, setBoardsH] = useState(0);
  useEffect(() => {
    const el = boardsRef.current;
    if (!drawerMode || !el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setBoardsH(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, [drawerMode]);
  const [favs, setFavs] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    if (!drawerMode) return;
    let live = true;
    loadFavoritePlayers().then((f) => { if (live) setFavs(f); });
    return () => { live = false; };
  }, [drawerMode]);
  const viewPlayers = statDay === 'week' ? (mine?.p || [])
    : rawMine?.days ? rawMine.days[statDay] || [] : dailyRosterRows(mine?.p || [], week, statDay);

  const batters = viewPlayers.filter((p) => p[4]).sort((a, b) => (b[4] as number[])[0] - (a[4] as number[])[0]);
  const pitchers = viewPlayers.filter((p) => p[5]).sort((a, b) => (b[5] as number[])[0] - (a[5] as number[])[0]);
  const teamBat = batters.reduce((t, p) => (p[4] as number[]).map((v, i) => v + (t[i] || 0)), [] as number[]);
  const teamPit = pitchers.reduce((t, p) => (p[5] as number[]).map((v, i) => v + (t[i] || 0)), [] as number[]);
  const obp = (b: number[]) => {
    const [, ab, h, , , , bb, hbp, sf] = b;
    const den = ab + bb + hbp + sf;
    return den ? (h + bb + hbp) / den : 0;
  };
  const slg = (b: number[]) => {
    const [, ab, h, d2, d3, hr] = b;
    const tb = h + d2 + 2 * d3 + 3 * hr;
    return ab ? tb / ab : 0;
  };
  const obpSlg = (b: number[]) => obp(b) + slg(b);
  const wl = mine?.wl || [0, 0];
  const owl = theirs?.wl || [0, 0];
  const pct = (w: number, l: number) => (w + l ? rate(w / (w + l)) : '.000');
  const pctNum = (w: number, l: number): number | null => (w + l ? w / (w + l) : null);
  // Last names only; an initial when two share one (B. Smith, R. Smith).
  const labels = shortNames(mine?.p || []);
  // Each name links to his profile (a tap there doesn't flip the card).
  const myHsid = me === 0 ? home : away;
  const teamOf = useMemo(() => new Map([...(homeRoster || []), ...(awayRoster || [])]
    .map((r) => [String(r.playerid), String(r.current_teamid ?? '')] as const)), [homeRoster, awayRoster]);
  const player = (p: PlayerRow) => (
    <><TeamLogo id={teamOf.get(String(p[0]))} /><a className="bl-plink" href={`/${myHsid}/player/${encodeURIComponent(p[0])}`} onClick={(e) => e.stopPropagation()} title={p[1]}>{labels.get(p[0])}</a></>
  );
  // A day's W-L shows when the box has one (live: the club's result that day).
  const wlCell = (p: PlayerRow) => p[8] ? `${p[8][0]}-${p[8][1]}` : statDay === 'week' ? '0-0' : '—';
  const dayWl = statDay !== 'week' && viewPlayers.some((p) => p[8]) ? sumRosterWl(viewPlayers) : null;
  const wlVal = (p: PlayerRow) => (p[8] && p[8][0] + p[8][1] ? p[8][0] / (p[8][0] + p[8][1]) + (p[8][0] + p[8][1]) / 1e4 : null);
  const bat = (p: PlayerRow) => p[4] as number[];
  const batCols: SortCol[] = [
    { key: 'ops+', label: 'OPS+', cls: 'plus', val: (p) => p[6] ?? null, show: (p) => p[6] ?? '—' },
    { key: 'wl', label: 'W-L', cls: 'wl', val: wlVal, show: wlCell },
    ...['AB', 'H', '2B', '3B', 'HR', 'BB', 'HBP', 'SF'].map((label, i): SortCol => ({ key: label, label, val: (p) => bat(p)[i + 1], show: (p) => bat(p)[i + 1] })),
    { key: 'obp', label: 'OBP', val: (p) => obp(bat(p)), show: (p) => rate(obp(bat(p))) },
    { key: 'slg', label: 'SLG', val: (p) => slg(bat(p)), show: (p) => rate(slg(bat(p))) },
    { key: 'ops', label: 'OPS', val: (p) => obpSlg(bat(p)), show: (p) => rate(obpSlg(bat(p))) },
  ];
  const pit = (p: PlayerRow) => p[5] as number[];
  const whip = (p: PlayerRow) => {
    const x = pit(p), outs = x[0] || 0;
    return outs ? ((x[5] || 0) + (x[2] || 0)) / (outs / 3) : 0;
  };
  const kbb = (p: PlayerRow) => {
    const x = pit(p), bb = x[2] || 0, k = x[4] || 0;
    return bb ? k / bb : k;
  };
  const fipRaw = (p: PlayerRow) => Number(pit(p)[8] || 0);
  const pitCols: SortCol[] = [
    { key: 'fip-', label: 'FIP-', cls: 'plus', val: (p) => p[7] ?? 0, show: (p) => p[7] ?? 0 },
    { key: 'wl', label: 'W-L', cls: 'wl', val: wlVal, show: wlCell },
    { key: 'ip', label: 'IP', val: (p) => pit(p)[0] || 0, show: (p) => ip(pit(p)[0] || 0) },
    { key: 'h', label: 'H', val: (p) => pit(p)[5] || 0, show: (p) => pit(p)[5] || 0 },
    { key: 'r', label: 'R', val: (p) => pit(p)[6] || 0, show: (p) => pit(p)[6] || 0 },
    { key: 'er', label: 'ER', val: (p) => pit(p)[7] || 0, show: (p) => pit(p)[7] || 0 },
    { key: 'hr', label: 'HR', val: (p) => pit(p)[1] || 0, show: (p) => pit(p)[1] || 0 },
    { key: 'bb', label: 'BB', val: (p) => pit(p)[2] || 0, show: (p) => pit(p)[2] || 0 },
    { key: 'hbp', label: 'HBP', val: (p) => pit(p)[3] || 0, show: (p) => pit(p)[3] || 0 },
    { key: 'k', label: 'K', val: (p) => pit(p)[4] || 0, show: (p) => pit(p)[4] || 0 },
    { key: 'whip', label: 'WHIP', val: whip, show: (p) => rate(whip(p)) },
    { key: 'kbb', label: 'K/BB', val: kbb, show: (p) => kbb(p).toFixed(2) },
    { key: 'fip', label: 'FIP', val: fipRaw, show: (p) => fipRaw(p).toFixed(2) },
  ];
  const teamWl = `${wl[0]}-${wl[1]}`;
  const shownTeamWl = statDay === 'week' ? teamWl : dayWl ? `${dayWl[0]}-${dayWl[1]}` : '—';
  const teamWhip = teamPit[0] ? ((teamPit[5] || 0) + (teamPit[2] || 0)) / (teamPit[0] / 3) : 0;
  const teamKbb = teamPit[2] ? (teamPit[4] || 0) / teamPit[2] : (teamPit[4] || 0);
  const teamFipWeight = pitchers.reduce((s, p) => s + (pit(p)[0] || 0), 0);
  const teamFip = teamFipWeight
    ? pitchers.reduce((s, p) => s + fipRaw(p) * (pit(p)[0] || 0), 0) / teamFipWeight
    : 0;
  // Team metric cell for the Team row: the authoritative daily team OPS+/FIP-
  // from the box, so the Team row ties out to the scoreboard above it.
  // (Weekly tab uses the week aggregate; daily tabs use that day's value.)
  const teamDayMetric = (idx: number): string => {
    if (statDay === 'week') return weekVals ? fmtStat(weekVals[idx]) : '—';
    const v = boxForView?.d?.[statDay]?.[idx];
    return v == null ? '—' : fmtStat(v);
  };
  const homeWl = me === 0 ? wl : owl;
  const awayWl = me === 0 ? owl : wl;
  const homeWp = pctNum(homeWl[0], homeWl[1]);
  const awayWp = pctNum(awayWl[0], awayWl[1]);
  // Live: a run counts only once settled; until then the cell shows the lead.
  const settledAt = (inning: number, idx: number) => !boxForView?.f || Boolean(boxForView.f[inning]?.[idx < 2 ? 0 : 1]);
  const cellClass = (inning: number, idx: number, mine: number | null | undefined, theirs: number | null | undefined, higher: boolean) => {
    const better = wonCell(mine, theirs, higher);
    return better ? (settledAt(inning, idx) ? 'won' : 'lead') : '';
  };
  const correctedInnings = [...innings];
  if (drawerMode && correctedInnings.length >= 18 && settledAt(8, 0)) {
    correctedInnings[16] = (homeWp ?? 0) > (awayWp ?? 0) ? 1 : 0;
    correctedInnings[17] = (awayWp ?? 0) > (homeWp ?? 0) ? 1 : 0;
  }
  const correctedScore: [number, number] = [
    correctedInnings.filter((_, i) => i % 2 === 0).reduce((s, v) => s + Number(v || 0), 0),
    correctedInnings.filter((_, i) => i % 2 === 1).reduce((s, v) => s + Number(v || 0), 0),
  ];
  const inningCount = Math.max(9, Math.floor(correctedInnings.length / 2));
  const extraInnings = Array.from({ length: Math.max(0, inningCount - 9) }, (_, i) => i + 9);
  // The stat drawer's scoreboards: one board per school (its own school
  // first) - a tick sheet of each day's numbers, not a tally (the main
  // scoreboard keeps the runs). The school's code and City, ST span both
  // rows; row 1 is OPS+ and row 2 FIP- (days 1-7, the week in 8). Inning 9
  // is one number, not two: the "W%" label on top, the clubs' winning
  // percentage in the box below. A cell that beat the other school's is
  // yellow - two yellows in an inning: both runs.
  const wpText = (wp: number | null) => (wp == null ? '–' : wp.toFixed(3).replace(/^0/, ''));
  const teamBoard = (side: 0 | 1) => {
    const name = names[side], location = locations[side];
    const wp = side === 0 ? homeWp : awayWp, oppWp = side === 0 ? awayWp : homeWp;
    const metricRow = (idx: number, opp: number, higher: boolean) => Array.from({ length: 8 }, (_, i) => {
      const d = boxForView?.d?.[i];
      return <span key={i} className={`bl-tb-cell ${cellClass(i, idx, d?.[idx], d?.[opp], higher)}`}>{fmtStat(d?.[idx])}</span>;
    });
    const nameCell = (
      <>
        <b>{abbr(name)}</b>
        {location ? <small>{location}</small> : null}
      </>
    );
    return (
      <div className="bl-metric-board bl-team-board" key={side} aria-label={`${name}: OPS+ and FIP- by inning`}>
        <span className="bl-tb-head" aria-hidden="true" />
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => <span key={n} className="bl-tb-head">{n}</span>)}
        <span className="bl-tb-head" aria-hidden="true" />
        {onSwitchSide && side !== me ? (
          <button type="button" className="bl-tb-name switch" onClick={(e) => { e.stopPropagation(); onSwitchSide(); }}
            title={`Show ${name}'s stats`} aria-label={`Show ${name}'s stats`}>{nameCell}</button>
        ) : (
          <span className="bl-tb-name" title={location ? `${name} (${location})` : name}>{nameCell}</span>
        )}
        {metricRow(side === 0 ? 0 : 1, side === 0 ? 1 : 0, true)}
        <span className="bl-tb-wlabel">W%</span>
        <span className="bl-tb-label">OPS+</span>
        {metricRow(side === 0 ? 2 : 3, side === 0 ? 3 : 2, false)}
        <span className={`bl-tb-cell wl-pct${wp != null && wp > (oppWp ?? -1) ? (settledAt(8, 0) ? ' won' : ' lead') : ''}`} title="Clubs' winning percentage">{wpText(wp)}</span>
        <span className="bl-tb-label">FIP-</span>
      </div>
    );
  };

  return (
    // A tap anywhere on the card flips it, like the player gallery.
    // (No onFlip: a drawer showing one school's week.)
    <div className={`bl-f${onFlip ? '' : ' still'}`} role={onFlip ? 'button' : undefined} tabIndex={onFlip ? 0 : undefined}
      aria-label={onFlip ? `${myName} box score · tap to flip to ${flipTo || names[them]}` : undefined} onClick={onFlip}
      onKeyDown={onFlip ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onFlip(); } } : undefined}
      style={drawerMode ? ({ '--bl-boards-h': `${boardsH}px` } as React.CSSProperties) : undefined}>
      {drawerMode ? (
          <div className="bl-metric-scoreboards" ref={boardsRef} aria-label="OPS+ and FIP- inning scoreboards">
            {teamBoard(me)}
            {teamBoard(me === 0 ? 1 : 0)}
            {extraInnings.length ? (
              <div className="bl-tiebreak-board" aria-label="Tiebreak innings">
                <div className="bl-tiebreak-line head" style={{gridTemplateColumns:`minmax(110px,1fr) repeat(${extraInnings.length},28px) 34px`}}>
                  <span>TIEBREAK</span>
                  {extraInnings.map((i) => <span key={i}>{i + 1}</span>)}
                  <span>R</span>
                </div>
                {[1, 0].map((sideIndex) => (
                  <div className="bl-tiebreak-line" key={sideIndex} style={{gridTemplateColumns:`minmax(110px,1fr) repeat(${extraInnings.length},28px) 34px`}}>
                    <span className="team">{names[sideIndex]}</span>
                    {extraInnings.map((i) => {
                      const v = correctedInnings[i * 2 + sideIndex] || 0;
                      return <span key={i} className={v ? 'won' : ''}>{v}</span>;
                    })}
                    <span className="total">{correctedScore[sideIndex]}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
      ) : (
        <>
          <div className="bl-top">
            <div className="bl-meta"><span>{label} · Week {week}</span><span>{dates}</span></div>
            <div className="bl-score">
              <div className={`bl-team${me === 0 ? ' me' : ''}`}><b>{names[0]}</b>{locations[0] ? <small>{locations[0]}</small> : null}</div>
              <div className="bl-runs">{score[0]}</div>
              <div className="bl-final">FINAL</div>
              <div className="bl-runs">{score[1]}</div>
              <div className={`bl-team r${me === 1 ? ' me' : ''}`}><b>{names[1]}</b>{locations[1] ? <small>{locations[1]}</small> : null}</div>
            </div>
          </div>

          <div className="bl-scroll">
            <table className="bl-ls">
              <thead>
                <tr><th />{Array.from({ length: inningCount }, (_, i) => i + 1).map((n) => <th key={n}>{n}</th>)}<th className="sep">R</th><th>OPS+</th><th>FIP-</th></tr>
              </thead>
              <tbody>
                {[0, 1].map((s) => (
                  <tr key={s} className={s === me ? 'me' : ''}>
                    <th>{abbr(names[s])}</th>
                    {Array.from({ length: inningCount }, (_, i) => i).map((i) => {
                      const v = correctedInnings[i * 2 + s] || 0;
                      return <td key={i} className={v ? 'hit' : ''}>{v}</td>;
                    })}
                    <td className="sep r">{correctedScore[s]}</td>
                    <td>{weekVals ? fmtStat(weekVals[s]) : ''}</td>
                    <td>{weekVals ? fmtStat(weekVals[2 + s]) : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {tieNote(decidedBy) && <div className="bl-note">{tieNote(decidedBy)}</div>}
      {decidedBy === 'tie' && <div className="bl-note">Tie · half a win each</div>}

      {/* No W / L / T badge: the scoreboard says who won. */}
      {!drawerMode && (
      <div className="bl-tabs">
        <span className="on">{myName}</span>
        {onFlip && <span className="flip">{flipTo || names[them]} ⟳</span>}
      </div>
      )}

      {loading && <div className="bl-muted">Loading box score…</div>}
      {!loading && !mine && <div className="bl-muted">No box score.</div>}
      {mine && (
        <>
          {drawerMode ? (
            // Each day's tab sits under its inning on the scoreboards above
            // (Monday = inning 1 ... Sunday = 7); the week spans 8, 9 and the total.
            <div className="bl-history-tabs bl-inning-tabs" role="tablist" aria-label="Player stat history">
              {[
                [0,'M'],[1,'Tu'],[2,'W'],[3,'Th'],[4,'F'],[5,'Sa'],[6,'Su'],['week','Week']
              ].map(([key,label]) => (
                <button key={String(key)} type="button" role="tab" style={{ gridColumn: key === 'week' ? '9 / 12' : Number(key) + 2 }}
                  className={statDay===key ? 'on' : ''}
                  aria-selected={statDay===key}
                  onClick={(e)=>{e.stopPropagation();setStatDay(key as 'week'|number);}}>
                  {label}
                </button>
              ))}
            </div>
          ) : null}
          <SortTable title="Batters" rows={batters} cols={batCols} player={player} labels={labels} favs={favs} empty="No batters on roster"
            total={[teamDayMetric(me), shownTeamWl, ...teamBat.slice(1), rate(obp(teamBat)), rate(slg(teamBat)), rate(obpSlg(teamBat))]} />
          <SortTable title="Pitchers" rows={pitchers} cols={pitCols} player={player} labels={labels} favs={favs} empty="No pitchers on roster"
            total={[
              teamDayMetric(2 + me),
              shownTeamWl,
              ip(teamPit[0] || 0),
              teamPit[5] || 0,
              teamPit[6] || 0,
              teamPit[7] || 0,
              teamPit[1] || 0,
              teamPit[2] || 0,
              teamPit[3] || 0,
              teamPit[4] || 0,
              rate(teamWhip),
              teamKbb.toFixed(2),
              teamFip.toFixed(2),
            ]} />

          {drawerMode ? (
            <div className="bl-drawer-explain">
              <div className="bl-scoring-title">SCORING</div>
              <p>For innings (days) 1–7, the run totals are based on a daily head-to-head team comparison between one alumni&apos;s team higher OPS+ (Offensive Stat) and lower FIP- (Defensive Stat). Each winning comparison is worth 1 run.</p>
              <p>The 8th inning is computed the same way, but uses the two teams&apos; weekly OPS+ and FIP- comparisons.</p>
              <p>The 9th inning does not use the OPS+/FIP- results. Instead the final frame is decided by the better weekly W-L% across all active alumni&apos;s real-world teams, whether each alumnus played or not.</p>
              <p><b>TIEBREAKERS:</b> If the score is tied after 9, inning 10 compares each school&apos;s #1 hitter (OPS+) and #1 pitcher (FIP-), worth one run each. If that inning is also tied, inning 11 uses the #2 hitter and #2 pitcher, inning 12 uses the #3 pair, and so on until one school leads. Only after both schools exhaust the next required hitter/pitcher pair while still tied does the commissioner&apos;s coin flip apply; the winner of the flip receives one final run, so a completed game never displays a tied final score.</p>
            </div>
          ) : (
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
          )}
        </>
      )}
    </div>
  );
}

// OPS+ / FIP- are whole numbers (100 = average); the week's values arrive
// unrounded (139.977).
export function fmtStat(v: number | null | undefined) {
  return v === null || v === undefined ? '–' : String(Math.round(v));
}

// A day cell is gold when this school won that run: the better value
// against the other school, or - when the other school had nobody play -
// beating league average (100). Same rule as the engine ('hold').
export function wonCell(mine: number | null | undefined, theirs: number | null | undefined, higher: boolean) {
  if (mine === null || mine === undefined) return '';
  const other = theirs ?? 100;
  return (higher ? mine > other : mine < other) ? 'won' : '';
}

// A school's 3-letter code, airport style: one word - its first three
// letters (Hamilton HAM); two - first letter, its next consonant, then the
// second word's initial (Mater Dei MTD, JSerra Catholic JSC); three or more
// - initials (Henry B. Plant HBP). Words like High, School, Prep are skipped.
const CODE_SKIP = /^(high|school|hs|academy|prep|preparatory|the|of|and|at)$/i;
export function abbr(name: string) {
  let words = name.split(' (')[0].replace(/[^A-Za-z .'-]/g, '').split(/[\s.-]+/).map((w) => w.replace(/'/g, '')).filter(Boolean);
  const kept = words.filter((w) => !CODE_SKIP.test(w));
  if (kept.length) words = kept;
  if (!words.length) return '';
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
  if (words.length === 2) {
    const [a, b] = words;
    const next = a.slice(1).replace(/[aeiou]/gi, '')[0] || a[1] || '';
    return (a[0] + next + b[0]).toUpperCase();
  }
  return words.slice(0, 3).map((w) => w[0]).join('').toUpperCase();
}

// The main scoreboard's daily-stats button: a small round stat icon to the
// right of each school's R column - the visible way into that school's stat
// drawer (the school name opens it too, but doesn't look like a link).
export function StatsDot({ name, onOpen }: { name: string; onOpen?: () => void }) {
  if (!onOpen) return <span className="yfp-green-stats-cell" aria-hidden="true" />;
  return (
    <button type="button" className="yfp-green-stats" onClick={onOpen}
      aria-label={`${name}: daily stats`} title={`${name}: daily stats`}>
      <svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2.5" y="8" width="2.6" height="5.5" rx=".6" /><rect x="6.7" y="3" width="2.6" height="10.5" rx=".6" /><rect x="10.9" y="5.8" width="2.6" height="7.7" rx=".6" /></svg>
    </button>
  );
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
      .bl-tiebreak-board { margin-top:6px; overflow-x:auto; border:1px solid var(--line); border-radius:5px; }
      .bl-tiebreak-line { min-width:max-content; display:grid; grid-template-columns:minmax(110px,1fr) repeat(var(--tb-count, 1),28px) 34px; align-items:center; gap:2px; padding:2px 4px; font:600 9px/1.15 Oswald,sans-serif; }
      .bl-tiebreak-line.head { color:var(--muted); font-size:8px; text-transform:uppercase; border-bottom:1px solid var(--line); }
      .bl-tiebreak-line > span:not(:first-child) { text-align:center; }
      .bl-tiebreak-line .team { color:var(--text); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .bl-tiebreak-line .won { color:var(--gold); font-weight:800; }
      .bl-tiebreak-line .total { color:var(--gold); font-weight:800; }
      .bl.bl-embed .bl-wl { font-size:10.5px; }
      .bl.bl-embed .bl-legend { font-size:9.5px; }
      .bl.bl-embed .bl-muted { padding:8px; font-size:11px; }
      .bl-history-tabs{position:sticky;top:0;z-index:4;display:grid;grid-template-columns:repeat(8,minmax(0,1fr));gap:3px;margin:6px 0 5px;padding:4px;background:var(--panel);border:1px solid var(--line);border-radius:6px}
      .bl-history-tabs button{min-width:0;padding:4px 2px;border:1px solid transparent;border-radius:4px;background:transparent;color:var(--muted);font:700 12px/1 Oswald,sans-serif;cursor:pointer}
      .bl-history-tabs button.on{border-color:var(--gold);background:var(--gold-bg);color:var(--gold)}
      /* In the Stat Ledgers the days are folder tabs, like the leaderboard's regions. */
      .bl.bl-embed.yfp-drawer .bl-history-tabs{position:sticky;top:var(--yfp-head-h,23px);display:flex;align-items:flex-end;gap:3px;margin:8px 0 6px;padding:0 8px;background:var(--bg,#0c0c0c);border:0;border-bottom:1px solid rgba(255,255,255,.2);border-radius:0}
      .bl.bl-embed.yfp-drawer .bl-history-tabs button{flex:1 1 0;position:relative;margin-bottom:-1px;padding:5px 2px 4px;border:1px solid rgba(255,255,255,.2);border-bottom-color:transparent;border-radius:7px 7px 0 0;background:rgba(255,255,255,.05);color:rgba(255,255,255,.55);font:700 12px/1 Oswald,sans-serif}
      .bl.bl-embed.yfp-drawer .bl-history-tabs button:hover{color:#fff}
      .bl.bl-embed.yfp-drawer .bl-metric-scoreboards{position:sticky;top:var(--yfp-head-h,23px);z-index:5;margin:0;padding:6px 8px 0;background:var(--bg,#0c0c0c)}
      .bl.bl-embed.yfp-drawer .bl-history-tabs.bl-inning-tabs{top:calc(var(--yfp-head-h,23px) + var(--bl-boards-h,0px));display:grid;grid-template-columns:minmax(68px,1.25fr) repeat(10,minmax(0,1fr));gap:2px;padding:0 12px;margin-top:4px}
      .bl.bl-embed.yfp-drawer .bl-history-tabs.bl-inning-tabs button{padding-left:0;padding-right:0;font-size:11px}
      .bl.bl-embed.yfp-drawer .bl-history-tabs button.on{padding-top:7px;background:var(--bg,#0c0c0c);border-color:rgba(255,255,255,.2);border-bottom-color:var(--bg,#0c0c0c);color:var(--gold,#d2b45c)}
      body.light-theme .bl.bl-embed.yfp-drawer .bl-history-tabs{border-bottom-color:rgba(0,0,0,.2)}
      body.light-theme .bl.bl-embed.yfp-drawer .bl-history-tabs button{border-color:rgba(0,0,0,.2);border-bottom-color:transparent;background:rgba(0,0,0,.04);color:rgba(0,0,0,.55)}
      body.light-theme .bl.bl-embed.yfp-drawer .bl-history-tabs button.on{border-bottom-color:var(--bg,#f4efe6);color:#8a6a10}
      @media(max-width:520px){.bl-history-tabs button{font-size:10px;padding:4px 1px}}
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
      .bl-team small { display:block; margin-top:2px; color:var(--muted); font:600 8px/1 Oswald,sans-serif; letter-spacing:.06em; text-transform:uppercase; }
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
      .bl-stat-block { min-width:0; }
      .bl-stat-block + .bl-stat-block { margin-top:18px; }
      .bl-box { width:auto; min-width:100%; table-layout:fixed; border-collapse:collapse; font-size:12px; font-variant-numeric:tabular-nums; }
      .bl-box th, .bl-box td { padding:5px 3px; text-align:right; border-bottom:1px solid var(--line); white-space:nowrap; }
      .bl-box thead th { color:var(--muted); font:600 11px/1 Oswald, sans-serif; letter-spacing:.04em; }
      .bl-stat-block.offense .bl-box thead th { background:#6c5317; color:#fff4c4; border-bottom-color:#8b6d20; }
      .bl-stat-block.defense .bl-box thead th { background:#174c35; color:#edf7ef; border-bottom-color:#256b4c; }
      .bl-stat-block .bl-box thead th:first-child { border-top-left-radius:4px; }
      .bl-stat-block .bl-box thead th:last-child { border-top-right-radius:4px; }
      .bl-box .nm { text-align:left; padding-left:10px; width:136px; max-width:136px; overflow:hidden; text-overflow:ellipsis; }
      .bl-box .nm small { color:var(--muted); font-size:10px; }
      .bl-box .none { color:var(--muted); font-style:italic; }
      /* OPS+ / FIP- first after the name; room after the last column so it isn't cut off. */
      .bl-box .plus { color:var(--gold); font-weight:700; padding-left:6px; padding-right:8px; text-align:center; }
      .bl-box th:last-child, .bl-box td:last-child { padding-right:14px; }
      .bl-plink { color:inherit; text-decoration:none; }
      .bl-tlogo { display:inline-block; box-sizing:border-box; width:17px; height:17px; margin-right:5px; padding:1px; border-radius:3px; object-fit:contain; vertical-align:-4px; }
      img.bl-tlogo { background:rgba(255,255,255,.9); }
      .bl-box .wl { color:var(--text); padding-left:4px; padding-right:6px; }
      .bl-sort { padding:0; border:0; background:transparent; color:inherit; font:inherit; letter-spacing:inherit; cursor:pointer; white-space:nowrap; }
      .bl-sort:hover { color:var(--gold); }
      .bl-plink:hover, .bl-plink:focus-visible { color:var(--gold); text-decoration:underline; }
      .bl-box tr.tot td { font-weight:700; border-bottom:0; }

      /* Drawer tables are dense enough to fit in normal use, but retain
         horizontal scrolling as a safety valve on very narrow screens. */
      /* Each stat column is as wide as its numbers (no even spreading), the
         name column is as wide as the names (no gap before OPS+), and the
         numbers keep a readable size;
         if a phone is too narrow for all 13, the table scrolls sideways with
         the names pinned. */
      .bl.bl-embed.yfp-drawer .bl-scroll { overflow-x:auto; }
      .bl.bl-embed.yfp-drawer .bl-box { width:auto; min-width:0; table-layout:auto; font-size:11px; }
      .bl.bl-embed.yfp-drawer .bl-box col { width:auto !important; }
      .bl.bl-embed.yfp-drawer .bl-box th,
      .bl.bl-embed.yfp-drawer .bl-box td { padding:4px 4px; overflow:visible; }
      .bl.bl-embed.yfp-drawer .bl-box thead th { font-size:9.5px; letter-spacing:0; }
      .bl.bl-embed.yfp-drawer .bl-box .nm { width:auto; min-width:74px; max-width:118px; padding-left:6px; padding-right:8px; overflow:hidden; text-overflow:ellipsis;
        position:sticky; left:0; z-index:1; background:var(--bg,#0c0c0c); }
      .bl.bl-embed.yfp-drawer .bl-stat-block.offense .bl-box thead th.nm { background:#6c5317; }
      .bl.bl-embed.yfp-drawer .bl-stat-block.defense .bl-box thead th.nm { background:#174c35; }
      .bl.bl-embed.yfp-drawer .bl-box .plus,
      .bl.bl-embed.yfp-drawer .bl-box .wl { padding-left:4px; padding-right:4px; }
      .bl.bl-embed.yfp-drawer .bl-box th:last-child,
      .bl.bl-embed.yfp-drawer .bl-box td:last-child { padding-right:8px; }
      .bl.bl-embed.yfp-drawer .bl-sort { width:auto; overflow:visible; }

      .bl-metric-scoreboards { margin:6px 8px 4px; display:grid; gap:4px; }
      .bl-metric-board { width:100%; box-sizing:border-box; margin:0; padding:3px; border:1px solid rgba(255,255,255,.12); border-radius:7px; background:#173b2c; box-shadow:inset 0 1px 8px rgba(0,0,0,.28); overflow:hidden; }
      /* One board per school: a single grid - the name cell spans the OPS+
         and FIP- rows; columns match the day tabs below (name, 1-9, label). */
      .bl-team-board { display:grid; grid-template-columns:minmax(68px,1.25fr) repeat(10,minmax(0,1fr)); gap:2px; align-items:stretch; }
      .bl-tb-head { display:grid; place-items:center; min-height:12px; margin-bottom:0; color:#e9f3ec; font:700 8px/1 Oswald,sans-serif; letter-spacing:.02em; }
      .bl-tb-name { grid-column:1; grid-row:2 / span 2; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:2px; min-width:0; padding:2px 4px; border:0; border-radius:3px; background:#0d2d20; color:#eef7ef; font:inherit; text-align:center; overflow:hidden; }
      .bl-tb-name b { display:block; color:#ffd34f; font:800 22px/1 Oswald,sans-serif; letter-spacing:.04em; }
      .bl-tb-name small { display:block; max-width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:#eef7ef; font:500 9px/1.1 "Roboto Condensed","Arial Narrow",Arial,sans-serif; }
      .bl-tb-name.switch { cursor:pointer; }
      .bl-tb-name.switch:hover { box-shadow:inset 0 0 0 1px rgba(255,211,79,.6); }
      .bl-tb-cell { display:grid; place-items:center; min-height:20px; padding:2px 1px; border-radius:3px; background:#0d2d20; color:#edf4ee; font:800 10px/1 Oswald,sans-serif; font-variant-numeric:tabular-nums; overflow:hidden; }
      .bl-tb-cell.won { background:#f3c735; color:#15251d; }
      .bl-tb-cell.lead { box-shadow: inset 0 0 0 2px #f3c735; color:#f3c735; }
      .bl-tb-cell.na { color:#718379; }
      .bl-tb-wlabel { display:grid; place-items:center; color:#fff; font:700 11px/1 Oswald,sans-serif; letter-spacing:.02em; }
      .bl-tb-label { display:grid; place-items:center; color:#ffd34f; font:700 10px/1 Oswald,sans-serif; white-space:nowrap; }
      table.bl-box tr.fav td { font-weight:800; color:#fff; }
      body.light-theme table.bl-box tr.fav td { color:#000; }
      @media (max-width:600px) {
        .bl.bl-embed.yfp-drawer .bl-box { font-size:10.5px; }
        .bl.bl-embed.yfp-drawer .bl-box thead th { font-size:9px; }
        .bl.bl-embed.yfp-drawer .bl-box th,
        .bl.bl-embed.yfp-drawer .bl-box td { padding:4px 3px; }
        .bl.bl-embed.yfp-drawer .bl-box .nm { min-width:64px; padding-left:5px; }
        .bl-metric-scoreboards { margin-left:5px; margin-right:5px; }
        .bl-tb-head { font-size:6.8px; }
        .bl-tb-cell { font-size:9px; min-height:19px; }
        .bl-tb-wlabel { font-size:9.5px; }
        .bl-tb-label { font-size:8px; }
        .bl-tb-name { padding:2px 3px; }
        .bl-tb-name b { font-size:18px; }
        .bl-tb-name small { font-size:7.5px; }
      }
      .bl-drawer-explain { margin:14px 12px 2px; padding-top:9px; border-top:1px solid var(--line); color:var(--muted); font-size:10px; line-height:1.42; }
      .bl-drawer-explain p { margin:0 0 7px; }
      .bl-scoring-title { margin-bottom:7px; color:var(--gold); font:800 11px/1 Oswald,sans-serif; letter-spacing:.11em; }
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
      @media (max-width:520px) {
        .bl-board .st { display:none; }
        .bl-metric-scoreboards { margin-left:8px; margin-right:8px; gap:4px; }
        .bl-drawer-explain { margin-left:8px; margin-right:8px; font-size:9px; }
      }
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
