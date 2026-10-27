// The commissioner's rulings, automated (Pete, Oct 27, 2026: "I just want it
// all automated"). A game still tied after every tiebreaker - the player
// matchups, hitter vs pitcher, the clubs' run differential and the fan
// bases - is decided by these rules, in order. The decision is worth one run,
// like any commissioner's decision. A ruling recorded by hand
// (COMMISSIONER_DECISIONS, commissioner_rulings) still comes first.
//
//   Game 2 of a series: the school that lost Game 1 (the series goes 1-1).
//   Game 3: the better series run differential over Games 1-2 (every run,
//     tiebreak runs included); then the school that won a series game on the
//     field rather than by a commissioner's decision; then the higher seed.
//   Game 1, a single game, or any of the above still even: the bigger
//     roster; then the most MLB players, then the most TRIPLE-A players, and
//     on down the official levels; then a random draw.
//
// The draw is fixed by the game (week and schools): the same answer every
// time the game is scored, so a decided game never changes.
import { LEVEL_FIXES, OFFICIAL_LEVELS } from '@/lib/officialLevels';

export type Side = 'home' | 'away';

// One of the series' earlier games, as scored.
export type EarlierGame = {
  home: number;
  away: number;
  winner: number | null;
  runs: [home: number, away: number];
  decidedBy: string;
};

export type AutoRulingInput = {
  week: number;
  gameNo: number; // 1-3 in a series; 1 for a single game
  home: number;
  away: number;
  seeds?: [home: number | undefined, away: number | undefined]; // lower is better
  earlier: EarlierGame[]; // the series' games before this one, in order
  rosters: [home: string[], away: string[]]; // each school's roster: one level per player
};

export type AutoRuling = {
  winner: Side;
  rule: 'lost-game-1' | 'series-run-diff' | 'won-on-field' | 'higher-seed' | 'roster' | 'level' | 'draw';
  detail: string;
};

const LEVELS = OFFICIAL_LEVELS.filter((level) => level !== 'HIGH SCHOOL');

function officialLevel(label: string) {
  const l = label.trim().toUpperCase();
  return LEVEL_FIXES[l] ?? l;
}

// FNV-1a: a small, stable hash for the draw.
function hash(s: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// The higher number wins; null when even.
function more(h: number, a: number): Side | null {
  return h === a ? null : h > a ? 'home' : 'away';
}

export function autoRuling(x: AutoRulingInput): AutoRuling {
  const { home, away } = x;
  const series = x.earlier.slice(0, 2);

  if (x.gameNo === 2) {
    const lost = x.earlier[0]?.winner === home ? 'away' : x.earlier[0]?.winner === away ? 'home' : null;
    if (lost) return { winner: lost, rule: 'lost-game-1', detail: 'lost Game 1' };
  }

  if (x.gameNo === 3) {
    const diff = (school: number) => series.reduce((sum, g) => sum
      + (g.home === school ? g.runs[0] - g.runs[1] : g.away === school ? g.runs[1] - g.runs[0] : 0), 0);
    const [hd, ad] = [diff(home), diff(away)];
    const byDiff = more(hd, ad);
    if (byDiff) return { winner: byDiff, rule: 'series-run-diff', detail: `series run differential ${Math.max(hd, ad) > 0 ? '+' : ''}${Math.max(hd, ad)} (Games 1-2)` };
    const onField = (school: number) => series.some((g) => g.winner === school && !g.decidedBy.startsWith('commissioner'));
    const byField = more(+onField(home), +onField(away));
    if (byField) return { winner: byField, rule: 'won-on-field', detail: 'won a series game on the field' };
    const [hs, as] = x.seeds || [];
    if (hs != null && as != null && hs !== as) {
      return { winner: hs < as ? 'home' : 'away', rule: 'higher-seed', detail: `the higher seed (${Math.min(hs, as)} over ${Math.max(hs, as)})` };
    }
  }

  const [hr, ar] = x.rosters;
  const byRoster = more(hr.length, ar.length);
  if (byRoster) return { winner: byRoster, rule: 'roster', detail: `the bigger roster (${Math.max(hr.length, ar.length)} to ${Math.min(hr.length, ar.length)})` };
  const count = (roster: string[], level: string) => roster.filter((l) => officialLevel(l) === level).length;
  for (const level of LEVELS) {
    const [hn, an] = [count(hr, level), count(ar, level)];
    const byLevel = more(hn, an);
    if (byLevel) return { winner: byLevel, rule: 'level', detail: `more ${level} players (${Math.max(hn, an)} to ${Math.min(hn, an)})` };
  }
  return { winner: hash(`${x.week}:${home}:${away}`) % 2 ? 'home' : 'away', rule: 'draw', detail: 'a random draw' };
}
