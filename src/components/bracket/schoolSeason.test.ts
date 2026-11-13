// src/components/bracket/schoolSeason.test.ts
// Run: npx tsx --test src/components/bracket/schoolSeason.test.ts
// Regression (Pete, Nov 13, 2026): a knocked-out school's leaderboard
// opponent is fixed for the whole three-game round, so Games 2 and 3 show
// that opponent too, not "TBD"; only the next round's opponent is unknown.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Index, LbGame, GameRow } from './gallery';
import { schoolSeason } from './schoolSeason';

const day = (n: number) => new Date(Date.UTC(2026, 2, 23) + n * 86400000).toISOString().slice(0, 10);
const weeks = Array.from({ length: 34 }, (_, i) => [day(i * 7), day(i * 7 + 6)] as [string, string]);
// School 1 (Campo Verde) loses Round 1 to school 2 (Hamilton) 0-3.
const r1: GameRow[] = [1, 2, 3].map((w) => [w, w, 2, 1, 'runs', [], 2]);
const index = {
  season: 2026, weeks, schools: { 1: ['Campo Verde', 3, 128], 2: ['Hamilton', 3, 1], 3: ['Mesquite', 3, 66] },
  rounds: [{ r: 1, name: 'Round 1', start: weeks[0][0], end: weeks[2][1], series: [[3, 2, 1, 1, 128, 2, [3, 0], r1]] }],
  lbt: [], gf: [], champion: 0, lbLeaders: [], lbChampion: 0, grandChampion: 0,
} as unknown as Index;
// Its Round 2 leaderboard series: Mesquite in weeks 4, 5 and 6.
const lb: LbGame[] = [4, 5, 6].map((w) => [100 + w, w, 3, 1, '', [], null, 3]);

test('week 4 under way: Games 1-3 of Round 2 all show Mesquite', () => {
  const cards = schoolSeason(index, lb, 1, day(3 * 7 + 1)).filter((c) => c.week >= 4 && c.week <= 6);
  assert.deepEqual(cards.map((c) => [c.week, c.state, c.game?.[2]]), [[4, 'live', 3], [5, 'next', 3], [6, 'next', 3]]);
});

test('Round 3 (not yet drawn) stays TBD', () => {
  const cards = schoolSeason(index, lb, 1, day(3 * 7 + 1)).filter((c) => c.week >= 7 && c.week <= 9);
  assert.ok(cards.every((c) => c.state === 'tbd' && !c.game));
});
