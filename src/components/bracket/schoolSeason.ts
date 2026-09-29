// src/components/bracket/schoolSeason.ts
// One school's fantasy season, week by week, as of a date: what its page
// shows (row 3's timeline slides, row 5's game cards).
//
//   Weeks 1-30: its bracket series (Round 1's opponent is known from the
//   start; each later round's once the round before is final), then its
//   weekly region leaderboard games once it's out (each drawn that week).
//   Weeks 31-34: its Season Championship Tournament and Fantasy World Series
//   games, only once it's in them; the Bracket Champ's bye weeks.

import { type GameRow, type Index, type LbGame, LAST_WEEK, LBT_ROUNDS, REGIONS, WORLD_SERIES, eliminations, lastFinalWeek, weekOfDate } from './gallery';

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
    ? Array.from({ length: 7 }, (_, d) => new Date(Date.parse(`${index.weeks[week - 1][0]}T00:00:00Z`) + d * 86400000).toISOString().slice(0, 10)).filter((d) => d < asof).length
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
        // Out of the bracket: a weekly game against another school out of
        // its region, drawn when the week starts.
        const g = myLb.get(w);
        const stage = `Region ${region} leaderboard game`;
        if (g && w <= Math.max(week, final)) out.push({ week: w, stage, state: state(w), game: g.slice(0, 7) as GameRow, file: `d-lb-${w}-${g[7]}`, days: daysIn(w) });
        else if (!g && w <= final) out.push({ week: w, stage, state: 'bye', days: 0, note: 'No game this week' });
        else out.push({ week: w, stage, state: 'tbd', days: 0, note: `Opponent drawn from Region ${region} · ${REGIONS[region]} that week` });
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

// A game's runs through the days in (innings 1-7 are the days; 8 and 9 the
// week and W-L%, in once it's final). Home first.
export function runsThrough(g: GameRow, days: number): [number, number] {
  let hr = 0, ar = 0;
  g[5].forEach((v, i) => {
    if (days < 7 && Math.floor(i / 2) >= days) return;
    if (i % 2 === 0) hr += v; else ar += v;
  });
  return [hr, ar];
}
