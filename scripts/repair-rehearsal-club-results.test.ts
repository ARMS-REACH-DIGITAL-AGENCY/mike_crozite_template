import { test } from 'node:test';
import assert from 'node:assert/strict';
import { removedClubGames, repairWriterPool, assertClubOnlyRepair } from './repair-rehearsal-club-results';
import { SQL_ROWS } from './master-bracket-results';
import type { Live } from '../src/components/bracket/liveSeason';

const original: Live = {
  asOf: '2026-03-26', roster: { '1': [['YAT000001', 'Player', 'MLB', 0, 'Club']] },
  lines: [['1','YAT000001',2,'b',[4,4,1,0,0,0,0,0,0],'regular','Club',1,'MLB']],
  clubs: { Club: [[0,'spring',0,-2],[2,'regular',1,7]] },
  games: { Club: [[0,'spring',1,1,1],[2,'regular',1,1,2]] },
};
const clean = () => ({ ...structuredClone(original), clubs: { Club: [original.clubs.Club[1]] }, games: { Club: [original.games!.Club[1]] } });
test('recapture only removes club games and rejects changed roster/stats/results', () => {
  assert.deepEqual(removedClubGames(original, clean()), ['spring']);
  const badStats = clean(); badStats.lines[0][4][0]++;
  assert.throws(() => removedClubGames(original, badStats), /player statistics/);
  const badResult = structuredClone(clean()); badResult.clubs.Club[0][2] = 0;
  assert.throws(() => removedClubGames(original, badResult), /retained club game/);
});

test('normal writer transactions use savepoints and only selected unlocked input is refreshed once', async () => {
  const calls: string[] = [];
  const rows = [
    { week: 1, locked_at: null, computed_at: 'cutoff', box_in_progress: { saved: true } },
    { week: 1, locked_at: 'locked', computed_at: 'cutoff', box_in_progress: { saved: true } },
    { week: 2, locked_at: null, computed_at: 'cutoff', box_in_progress: { saved: true } },
  ];
  const db = { async query(sql: string) { calls.push(sql); return { rows }; } };
  const adapter = repairWriterPool(db, 1);
  const first = await adapter.pool.query(SQL_ROWS);
  assert.equal(first.rows[0].computed_at, null);
  assert.equal(rows[0].computed_at, 'cutoff', 'original database row must not be mutated');
  assert.deepEqual(first.rows.slice(1), rows.slice(1));
  const writer = await adapter.pool.connect();
  await writer.query('BEGIN'); await writer.query('COMMIT');
  await writer.query('BEGIN'); await writer.query('ROLLBACK');
  assert.deepEqual(calls.slice(1), [
    'SAVEPOINT rehearsal_results_writer', 'RELEASE SAVEPOINT rehearsal_results_writer',
    'SAVEPOINT rehearsal_results_writer', 'ROLLBACK TO SAVEPOINT rehearsal_results_writer',
  ]);
  adapter.useNormalFrozenInput();
  assert.deepEqual((await adapter.pool.query(SQL_ROWS)).rows, rows);
});

function result(wl: [number, number], monday: [number, number]) {
  const player = (w: [number, number]) => ['YAT000001','Player','MLB',0,[0,0,0,0,0,0,0,0,0],0,null,null,w,0];
  const side = { p: [player(wl)], wl, rd: wl[0] - wl[1], days: Array.from({ length: 7 }, (_, d) => [player(d === 0 ? monday : d === 2 ? [1,0] : [0,0])]) };
  return [{ game_id: 1, week: 1, status: 'in_progress', computed_at: 'cutoff',
    box: { d: [], f: [], h: side, a: structuredClone(side) } }];
}
test('correction permits club-only changes while preserving daily publication, scores and all rosters', () => {
  const before = result([1,1], [0,1]), after = result([1,0], [0,0]);
  assert.doesNotThrow(() => assertClubOnlyRepair(before, after, 2));
  const badClock = structuredClone(after); badClock[0].computed_at = 'next day';
  assert.throws(() => assertClubOnlyRepair(before, badClock, 2), /score, clock/);
  const lostRoster = structuredClone(after); lostRoster[0].box.h.days[0] = [];
  assert.throws(() => assertClubOnlyRepair(before, lostRoster, 2), /score, clock/);
  const changedPublication = structuredClone(after); changedPublication[0].box.h.days[2][0][8] = [0,1];
  assert.throws(() => assertClubOnlyRepair(before, changedPublication, 2), /publication facts/);
  const future = structuredClone(after); future[0].box.h.days[3][0][8] = [1,0];
  assert.throws(() => assertClubOnlyRepair(before, future, 2), /future daily/);
});
