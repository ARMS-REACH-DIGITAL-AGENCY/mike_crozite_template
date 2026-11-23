import { test } from 'node:test';
import assert from 'node:assert/strict';
import { battingLine, pitchingLine } from './statLine';

test('one game line for the card 7-day snapshot and the Daily Digest (Pete, Nov 23 2026)', () => {
  assert.equal(battingLine({ hits: 2, atBats: 4, homeRuns: 1, rbi: 2, baseOnBalls: 1 }), '2-4 | 1 HR, 2 RBI, 1 BB');
  assert.equal(battingLine({ hits: 0, atBats: 3 }), '0-3');
  assert.equal(battingLine({ hits: 3, atBats: 5, doubles: 1, triples: 1, runs: 2, stolenBases: 1 }), '3-5 | 1 2B, 1 3B, 2 R, 1 SB');
  assert.equal(pitchingLine({ inningsPitched: '1.0', earnedRuns: 0, strikeOuts: 2, baseOnBalls: 0 }), '1.0 IP | 0 ER, 2 K, 0 BB');
  assert.equal(pitchingLine({ inningsPitched: '6.2', earnedRuns: 1, strikeOuts: 8, baseOnBalls: 2, wins: 1 }), '6.2 IP | 1 ER, 8 K, 2 BB, W');
  assert.equal(pitchingLine({ inningsPitched: '1.0', saves: 1 }), '1.0 IP | 0 ER, 0 K, 0 BB, SV');
});
