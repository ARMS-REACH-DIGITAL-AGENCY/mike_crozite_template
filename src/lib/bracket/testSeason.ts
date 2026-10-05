// TEST BRANCH ONLY: the live October test of the bracket.
// Opening day is Monday Oct 5, 2026 (Week 1 = Oct 5-11, Round 1 Game 1),
// and "today" is the real date in Arizona - no simulated season clock.
import { bracketOrder } from '@/lib/bracket/engine';
import { TEST_BRACKETS } from '@/lib/bracket/testBrackets';

export const TEST_OPENING_DAY = '2026-10-05';

// Today's date in Arizona (UTC-7 all year, no DST), YYYY-MM-DD.
export function arizonaToday(now = Date.now()) {
  return new Date(now - 7 * 3600000).toISOString().slice(0, 10);
}

// Which of the 6 test brackets (src/lib/bracket/testBrackets.ts) this
// branch runs. Bracket 1 is the one with Hamilton.
export const TEST_BRACKET = 1;


type IndexLike = {
  schools: Record<string, [string, number, number]>;
  rounds: { r: number; name: string; start: string; end: string; series: unknown[] }[];
  lbt: unknown[]; gf: unknown[]; lbLeaders: number[]; alumni?: Record<string, unknown>; rosters?: Record<string, unknown>;
  champion?: number; lbChampion?: number; grandChampion?: number;
};

// Replace the practice field with this branch's test bracket: its 16
// schools (one region, seeds 1-16) and Round 1's 8 series, every game
// still to be played. Nothing from the practice season survives - no
// later rounds, leaderboard games, tournaments or champions.
export function applyTestField(idx: IndexLike) {
  const field = TEST_BRACKETS[TEST_BRACKET - 1];
  const keep = new Set(field.map(([h]) => String(h)));
  idx.schools = Object.fromEntries(field.map(([h, name], i) => [String(h), [name, 1, i + 1]]));
  const order = bracketOrder(16);
  let id = 1;
  const series: unknown[] = [];
  for (let i = 0; i < order.length; i += 2) {
    const [hs, as] = [order[i], order[i + 1]];
    const home = field[hs - 1][0], away = field[as - 1][0];
    const games = [1, 2, 3].map((week) => [id++, week, home, away, '', [] as number[], null]);
    series.push([1, home, away, hs, as, 0, [0, 0], games]);
  }
  idx.rounds = idx.rounds.map((round) => ({ ...round, series: round.r === 1 ? series : [] }));
  idx.lbt = [];
  idx.gf = [];
  idx.lbLeaders = [];
  idx.champion = 0; idx.lbChampion = 0; idx.grandChampion = 0;
  for (const key of ['alumni', 'rosters'] as const) {
    const m = idx[key];
    if (m) idx[key] = Object.fromEntries(Object.entries(m).filter(([h]) => keep.has(h)));
  }
  return idx;
}
