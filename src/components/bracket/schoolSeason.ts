// src/components/bracket/schoolSeason.ts
// One school's fantasy season, week by week, as of a date: what its page
// shows (row 3's timeline slides, row 5's game cards).
//
//   Weeks 1-30: its bracket series (Round 1's opponent is known from the
//   start; each later round's once the round before is final), then its
//   regional leaderboard series once it's out. One opponent is drawn at
//   the start of each three-week round and stays fixed for all three games.
//   Weeks 31-34: its Season Championship Tournament and Fantasy World Series
//   games, only once it's in them; the Bracket Champ's bye weeks.

import { type GameRow, type Index, type LbGame, LAST_WEEK, lvl, LBT_ROUNDS, REGIONS, WORLD_SERIES, eliminations, lastFinalWeek, weekOfDate } from './gallery';

export type WeekState = 'final' | 'live' | 'next' | 'tbd' | 'bye';
export type WeekCard = {
  week: number;
  stage: string; // "Round 2 · Game 1", "Region 4 leaderboard game" ...
  state: WeekState;
  game?: GameRow; // the matchup, once known
  file?: string; // its box-score file
  days: number; // days of stats in (0-7)
  note?: string; // a TBD or bye card's line
};

export const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// The calendar on a date: the current week (0 before week 1, past the end
// after it), the last final week, and the days of stats in this week.
export function calendar(index: Index, asof: string) {
  const week = weekOfDate(index, asof);
  const final = lastFinalWeek(index, asof);
  const days = week >= 1 && week <= index.weeks.length
    ? Array.from({ length: 7 }, (_, d) => new Date(Date.parse(`${index.weeks[week - 1][0]}T00:00:00Z`) + d * 86400000).toISOString().slice(0, 10)).filter((d) => d <= asof).length
    : 0;
  return { week, final, days };
}

export function schoolSeason(index: Index, lb: LbGame[], h: number, asof: string): WeekCard[] {
  const school = index.schools[h];
  if (!school) return [];
  const region = school[1];
  const { week, final, days } = calendar(index, asof);
  const state = (w: number): WeekState => (w <= final ? 'final' : w === week ? 'live' : 'next');
  const daysIn = (w: number) => (w <= final ? 7 : w === week ? days : 0);
  const out: WeekCard[] = [];

  const elim = eliminations(index).get(h);
  const outKnown = elim && final >= elim.week;
  const myLb = new Map(lb.filter((g) => g[2] === h || g[3] === h).map((g) => [g[1], g]));

  for (let r = 1; r <= 10; r++) {
    const round = index.rounds[r - 1];
    const s = round?.series.find((x) => x[1] === h || x[2] === h);
    const known = r === 1 || final >= (r - 1) * 3;
    for (let i = 0; i < 3; i++) {
      const w = (r - 1) * 3 + i + 1;
      if (s && known) {
        const g = s[7][i];
        out.push({ week: w, stage: `Round ${r} · Game ${i + 1}`, state: state(w), game: g, file: `d-${r}-${s[0]}`, days: daysIn(w) });
      } else if (!s && outKnown) {
        // Out of the bracket: the same regional opponent for all three
        // weeks in this round. A new opponent may be drawn next round.
        const g = myLb.get(w);
        const stage = `Region ${region} leaderboard game`;
        if (g && w <= Math.max(week, final)) out.push({ week: w, stage, state: state(w), game: g.slice(0, 7) as GameRow, file: `d-lb-${w}-${g[7]}`, days: daysIn(w) });
        else if (!g && w <= final) out.push({ week: w, stage, state: 'bye', days: 0, note: 'No game this week' });
        else out.push({ week: w, stage, state: 'tbd', days: 0, note: `Round opponent drawn from Region ${region} · ${REGIONS[region]} and fixed for all three games` });
      } else {
        out.push({ week: w, stage: `Round ${r} · Game ${i + 1}`, state: 'tbd', days: 0, note: r === 1 ? '' : `Opponent set when Round ${r - 1} ends` });
      }
    }
  }

  // The postseason, once it's known who's in it.
  if (final >= LAST_WEEK && h === index.champion) {
    for (let w = LAST_WEEK + 1; w <= LAST_WEEK + 3; w++) out.push({ week: w, stage: 'Bracket Champ · bye', state: 'bye', days: 0, note: 'Waiting for the Season Championship winner' });
  }
  for (const { game: g } of index.lbt) {
    if (g[2] !== h && g[3] !== h) continue;
    if (final < g[1] - 1) continue;
    const stage = g[1] === LAST_WEEK + 3 ? 'Season Championship Game' : `Season Championship ${LBT_ROUNDS[g[1]]}`;
    out.push({ week: g[1], stage, state: state(g[1]), game: g, file: 'd-lbt', days: daysIn(g[1]) });
  }
  for (const g of index.gf) {
    if (g[2] !== h && g[3] !== h) continue;
    if (final >= g[1] - 1) out.push({ week: g[1], stage: WORLD_SERIES, state: state(g[1]), game: g, file: 'd-gf', days: daysIn(g[1]) });
    else if (h === index.champion && final >= LAST_WEEK) out.push({ week: g[1], stage: WORLD_SERIES, state: 'tbd', days: 0, note: 'Plays the Season Champ' });
  }
  return out.sort((a, b) => a.week - b.week);
}

// Live scoring's settled days per game id: the days (from Monday) whose
// runs are final. A day that has begun but isn't over isn't shown yet.
const settled = new Map<number, number>();
export function setSettledDays(gameId: number, days: number) {
  settled.set(gameId, days);
}
// The days of game g to show, of the calendar's days in.
export function shownDays(g: GameRow, days: number) {
  const s = settled.get(g[0]);
  return s === undefined ? days : Math.min(days, s);
}

// A game's runs through the days in (innings 1-7 are the days; 8 and 9 the
// week and W-L%, in once it's final). Home first.
export function runsThrough(g: GameRow, days: number): [number, number] {
  days = shownDays(g, days);
  let hr = 0, ar = 0;
  g[5].forEach((v, i) => {
    if (days < 7 && Math.floor(i / 2) >= days) return;
    if (i % 2 === 0) hr += v; else ar += v;
  });
  return [hr, ar];
}

// Alumni of the Week (stars-<region>.json, from the simulator): each school's
// player who beat league average by the most that week.
export type Star = [name: string, level: string, kind: 'bat' | 'pit', value: number, simulated: 0 | 1, playerId: string];
export type CurrentPlayerIdentity = {
  currentTeamName: string;
  orgConferenceName: string;
  levelLabel: string;
  statusLabel: string;
  headshotUrl: string | null;
};
const starCache = new Map<number, Promise<Record<number, Record<number, Star>>>>();
export function loadStars(region: number) {
  if (!starCache.has(region)) {
    // Test branch: no practice-season stars.
    starCache.set(region, Promise.resolve({}));
  }
  return starCache.get(region)!;
}

// A star's *performance* is historical (the week being scored), but his
// displayed identity is current. Never infer current team/level/photo from
// the simulator's old stat row; hydrate it from flip_card_front_stage via
// /api/player-identities, the same truth used by flip cards and profiles.
const identityCache = new Map<string, Promise<Record<string, CurrentPlayerIdentity>>>();
export function loadCurrentPlayerIdentities(playerIds: string[]) {
  const ids = [...new Set(playerIds.map(String).filter(Boolean))].sort();
  if (!ids.length) return Promise.resolve({} as Record<string, CurrentPlayerIdentity>);
  const key = ids.join(',');
  if (!identityCache.has(key)) {
    identityCache.set(key, fetch(`/api/player-identities?playerIds=${encodeURIComponent(key)}`)
      .then((r) => (r.ok ? r.json() : {}))
      .catch(() => ({})));
  }
  return identityCache.get(key)!;
}
export const starLine = (s: Star, identity?: CurrentPlayerIdentity) => {
  // Prefer current reconciled level. If identity resolution fails, omit the
  // level rather than presenting the simulator's historical level as current.
  const currentLevel = identity?.levelLabel ? lvl(identity.levelLabel) : '';
  const level = currentLevel ? ` (${currentLevel})` : '';
  return `${s[0]}${s[4] ? '*' : ''}${level} · ${s[3]} ${s[2] === 'bat' ? 'OPS+' : 'FIP-'}`;
};
export const lastName = (name: string) => name.split(' ').slice(1).join(' ') || name;

// Each school's record (W-L, and ties) through a week, from every game it
// played: bracket, leaderboard and postseason.
export function records(index: Index, lb: LbGame[]) {
  const games = new Map<number, [number, number | null][]>(); // hsid -> [week, winner]
  const add = (g: GameRow | LbGame) => {
    for (const h of [g[2], g[3]]) {
      if (!games.has(h)) games.set(h, []);
      games.get(h)!.push([g[1], g[6]]);
    }
  };
  for (const r of index.rounds) for (const s of r.series) for (const g of s[7]) add(g);
  for (const g of lb) add(g);
  for (const { game } of index.lbt) add(game);
  for (const g of index.gf) add(g);
  return (h: number, week: number) => {
    let w = 0, l = 0, t = 0;
    for (const [wk, winner] of games.get(h) || []) {
      if (wk > week) continue;
      if (winner === null) t++; else if (winner === h) w++; else l++;
    }
    return `${w}-${l}${t ? `-${t}` : ''}`;
  };
}

// The whole tournament's bracket games by master game # - the numbering of
// master_bracket_schedule_2026: round by round, then game 1, 2, 3 of the
// series, then region 1-8, then bracket position (game 1 and 3 by the better
// seed, 1 v 128 first; game 2 by its home seed, the old visitor, #65 first).
// Rounds 8-10 have no region. #1-#3,069.
export type MasterGame = { no: number; round: number; gameNo: number; region: number; game: GameRow; seeds: [number, number] };
export function masterGames(index: Index): MasterGame[] {
  const out: MasterGame[] = [];
  let no = 0;
  for (const round of index.rounds) {
    for (let k = 0; k < 3; k++) {
      const list = round.series
        .map((s) => ({ s, top: Math.min(s[3], s[4]), low: Math.max(s[3], s[4]) }))
        .sort((a, b) => a.s[0] - b.s[0] || (k === 1 ? a.low - b.low : a.top - b.top));
      for (const { s } of list) {
        const g = s[7][k];
        if (!g) continue;
        out.push({ no: ++no, round: round.r, gameNo: k + 1, region: s[0], game: g, seeds: g[2] === s[1] ? [s[3], s[4]] : [s[4], s[3]] });
      }
    }
  }
  return out;
}
