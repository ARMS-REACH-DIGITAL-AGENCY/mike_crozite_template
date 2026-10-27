// src/lib/bracket/autoRuling.test.ts
// Run: npx tsx --test src/lib/bracket/autoRuling.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { autoRuling, type AutoRulingInput, type EarlierGame } from './autoRuling';

const H = 25, A = 265;
const game = (winner: number, runs: [number, number], decidedBy = 'runs'): EarlierGame => ({ home: H, away: A, winner, runs, decidedBy });
const base = (over: Partial<AutoRulingInput>): AutoRulingInput => ({
  week: 1, gameNo: 1, home: H, away: A, seeds: [1, 16], earlier: [], rosters: [['MLB'], ['MLB']], ...over,
});

test('Game 2: the school that lost Game 1 wins', () => {
  assert.equal(autoRuling(base({ gameNo: 2, earlier: [game(H, [1, 0])] })).winner, 'away');
  assert.equal(autoRuling(base({ gameNo: 2, earlier: [game(A, [0, 1])] })).winner, 'home');
  assert.equal(autoRuling(base({ gameNo: 2, earlier: [game(A, [0, 1])] })).rule, 'lost-game-1');
});

test('Game 3: series run differential over Games 1-2, tiebreak runs included', () => {
  // Home won 3-0, lost 0-1 to a commissioner's decision: +2.
  const r = autoRuling(base({ gameNo: 3, earlier: [game(H, [3, 0]), game(A, [0, 1], 'commissioner')] }));
  assert.deepEqual([r.winner, r.rule], ['home', 'series-run-diff']);
  // Seen from the away side when the schools swap home and away.
  const swapped: EarlierGame = { home: A, away: H, winner: A, runs: [4, 0], decidedBy: 'runs' };
  assert.equal(autoRuling(base({ gameNo: 3, earlier: [game(H, [1, 0]), swapped] })).winner, 'away');
});

test('Game 3: even run differential - the school that won a series game on the field', () => {
  // Home won Game 1 on the field (1-0); away won Game 2 by a decision (0-1).
  const r = autoRuling(base({ gameNo: 3, earlier: [game(H, [1, 0]), game(A, [0, 1], 'commissioner')] }));
  assert.deepEqual([r.winner, r.rule], ['home', 'won-on-field']);
});

test('Game 3: both won on the field, run differential even - the higher seed', () => {
  const r = autoRuling(base({ gameNo: 3, seeds: [10, 7], earlier: [game(H, [2, 1]), game(A, [1, 2])] }));
  assert.deepEqual([r.winner, r.rule], ['away', 'higher-seed']);
});

test('Game 3: equal seeds go on to the rosters', () => {
  const r = autoRuling(base({ gameNo: 3, seeds: [1, 1], earlier: [game(H, [2, 1]), game(A, [1, 2])], rosters: [['MLB'], ['MLB', 'NAIA']] }));
  assert.deepEqual([r.winner, r.rule], ['away', 'roster']);
});

test('Game 1: the bigger roster, never the seed', () => {
  const r = autoRuling(base({ seeds: [1, 16], rosters: [['MLB'], ['NCAA-D1', 'NCAA-D2']] }));
  assert.deepEqual([r.winner, r.rule], ['away', 'roster']);
});

test('Game 1: even rosters - the most MLB players, then down the levels', () => {
  assert.equal(autoRuling(base({ rosters: [['MLB', 'NAIA'], ['TRIPLE-A', 'TRIPLE-A']] })).winner, 'home');
  const r = autoRuling(base({ rosters: [['MLB', 'DOUBLE-A'], ['MLB', 'TRIPLE-A']] }));
  assert.deepEqual([r.winner, r.rule, r.detail], ['away', 'level', 'more TRIPLE-A players (1 to 0)']);
  // An alias counts at its official level.
  assert.equal(autoRuling(base({ rosters: [['AAA', 'NAIA'], ['DOUBLE-A', 'NAIA']] })).winner, 'home');
});

test('Everything even: a random draw, the same every time for the same game', () => {
  const even = base({ rosters: [['MLB', 'NAIA'], ['NAIA', 'MLB']] });
  const r = autoRuling(even);
  assert.equal(r.rule, 'draw');
  for (let i = 0; i < 5; i++) assert.equal(autoRuling(even).winner, r.winner);
  // Different games draw independently: both sides win some.
  const winners = new Set(Array.from({ length: 40 }, (_, w) => autoRuling({ ...even, week: w + 1 }).winner));
  assert.equal(winners.size, 2);
});
