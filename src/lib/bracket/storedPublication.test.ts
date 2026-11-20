import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { GameBox } from '@/components/bracket/gallery';
import { dailyFromStored, weeklyFromStored, type StoredBracketGame } from './storedPublication';

function fixture(): StoredBracketGame {
  const box: GameBox = {
    d: Array.from({ length: 8 }, () => [100, 100, 100, 100]),
    f: Array.from({ length: 9 }, () => [true, true]),
    h: { p: [], wl: [4, 2], days: Array.from({ length: 7 }, () => []) },
    a: { p: [], wl: [2, 4], days: Array.from({ length: 7 }, () => []) },
  };
  // Home 1 in Monday, away 2 on Tuesday, home 3 Wednesday, home 1 in the ninth.
  const innings = [1, 0, 0, 2, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0];
  return {
    stage: 'bracket', region: 3, game_id: 42, week: 4,
    home_hsid: 5004, away_hsid: 2992, status: 'final',
    innings, home_runs: 5, away_runs: 2,
    winner_hsid: 5004, decided_by: 'runs', locked_at: '2026-05-04T11:00:00Z', box,
  };
}

test('daily score is a projection of only the saved, settled innings', () => {
  const row = fixture();
  const mon = dailyFromStored(row, 0);
  const tue = dailyFromStored(row, 1);
  assert.deepEqual(mon.homeInnings, [1]);
  assert.deepEqual(tue.awayInnings, [0, 2]);
  assert.equal(mon.homeRuns, 1);
  assert.equal(tue.awayRuns, 2);
  assert.equal(tue.throughInning, 2);
  assert.equal(tue.isFinal, false);
  assert.equal(tue.game[0], 42);
});

test('Sunday Daily shares the stored official final nine-inning result', () => {
  const row = fixture();
  const sun = dailyFromStored(row, 6);
  const weekly = weeklyFromStored(row);
  assert.equal(sun.homeRuns, weekly.homeRuns);
  assert.equal(sun.awayRuns, weekly.awayRuns);
  assert.equal(sun.storyInning, 8);
  assert.equal(sun.throughInning, 9);
  assert.equal(sun.isFinal, true);
  assert.equal(weekly.winnerHsid, row.winner_hsid);
});

test('total-runs games use the same saved projection', () => {
  const row = fixture();
  row.stage = 'total_runs';
  assert.equal(dailyFromStored(row, 2).homeRuns, 4);
  assert.equal(weeklyFromStored(row).homeRuns, 5);
});

test('fails closed if daily player ledger or posting is absent', () => {
  const row = fixture();
  row.box!.f![1][0] = false;
  assert.throws(() => dailyFromStored(row, 1), /not settled/);
  row.box!.f![1][0] = true;
  row.box!.h.days = undefined;
  assert.throws(() => dailyFromStored(row, 1), /Missing stored/);
});

test('fails closed on mismatched final scores, missing locks or missing boxes', () => {
  const row = fixture();
  row.home_runs = 99;
  assert.throws(() => weeklyFromStored(row), /disagree/);
  row.home_runs = 5;
  row.locked_at = null;
  assert.throws(() => dailyFromStored(row, 6), /final locked/);
  row.locked_at = '2026-05-04T11:00:00Z';
  row.box = null;
  assert.throws(() => weeklyFromStored(row), /Missing stored/);
});

test('the stored score is authoritative; no fantasy result is inferred', () => {
  const row = fixture();
  row.winner_hsid = null;
  assert.throws(() => weeklyFromStored(row), /final locked/);
  assert.throws(() => dailyFromStored(row, 6), /final locked/);
});

test('extra innings are included in final Daily and Weekly results', () => {
  const row = fixture();
  row.innings = [...(row.innings as number[]), 0, 2];
  row.away_runs = 4;
  const sunday = dailyFromStored(row, 6);
  const weekly = weeklyFromStored(row);
  assert.equal(sunday.throughInning, 10);
  assert.equal(sunday.awayRuns, 4);
  assert.equal(weekly.awayRuns, 4);
  assert.equal(weekly.awayInnings.length, 10);
  assert.equal(dailyFromStored(row, 0).awayInnings.length, 1);
});

test('invalid single extra-inning score cannot be read as a completed game', () => {
  const row = fixture();
  row.innings = [...(row.innings as number[]), 1];
  assert.throws(() => weeklyFromStored(row), /invalid stored fantasy innings/);
});
