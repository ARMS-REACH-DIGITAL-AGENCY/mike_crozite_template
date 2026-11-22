import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recordedRequest, validateRehearsalDay, type Snapshot } from './rehearsal-day';
import { setRehearsalDay, simulationAsOf } from '../src/components/bracket/simulationState';

test('a fresh rehearsal starts with one explicit March 25 day', () => {
  validateRehearsalDay('2026-03-25');
  for (const day of ['', '2026-02-30', '2026-99-01', '2026-03-26', '2026-11-16']) assert.throws(() => validateRehearsalDay(day));
});
test('unfinished publications, missing review, skipped dates and reverse dates cannot advance', () => {
  for (const phase of ['running', 'scored']) assert.throws(() => validateRehearsalDay('2026-03-26', { report_date: '2026-03-25', phase }, '2026-03-25'));
  const ready = { report_date: '2026-03-25', phase: 'awaiting_review' };
  assert.throws(() => validateRehearsalDay('2026-03-26', ready));
  assert.throws(() => validateRehearsalDay('2026-03-27', ready, '2026-03-25'));
  assert.throws(() => validateRehearsalDay('2026-03-24', ready, '2026-03-25'));
  validateRehearsalDay('2026-03-26', ready, '2026-03-25');
  validateRehearsalDay('2026-03-25', { ...ready, phase: 'scored' });
});

const snapshot: Snapshot = {
  start: '2026-03-23', weeks: 1, capturedAt: '2026-11-22T00:00:00Z', sourceBase: 'https://example.invalid',
  branch: 'isolated', endpoint: 'isolated.invalid', commit: 'example', fieldHash: 'example',
  live: { asOf: '2026-11-21', roster: { '1': [['YAT000001', 'Fixture batter', 'MLB', 0, 'Club']] },
    lines: [
      ['1', 'YAT000001', 2, 'b', [4,4,1,0,0,0,0,0,0], 'played', 'Club', 1, 'MLB'],
      ['1', 'YAT000001', 3, 'b', [5,5,5,0,0,5,0,0,0], 'future', 'Club', 1, 'MLB'],
    ],
    clubs: { Club: [[2, 'played', 1, 2], [3, 'future', 1, 20]] },
    games: { Club: [[2, 'played', 1, 1, 1774486800000], [3, 'future', 1, 1, 1774573200000]] },
  },
};
const url = 'https://example.invalid/api/bracket/live?start=2026-03-23&weeks=1&h=1';
test('4 a.m. boundary retains real reported-day inputs and hides every future result', async () => {
  const before = JSON.stringify(snapshot);
  const reply = await (await recordedRequest(snapshot, '2026-03-25')(url)).json();
  assert.deepEqual(reply.lines, [snapshot.live.lines[0]]);
  assert.deepEqual(reply.clubs.Club, [snapshot.live.clubs.Club[0]]);
  assert.deepEqual(reply.games.Club[0], snapshot.live.games!.Club[0]);
  assert.deepEqual(reply.games.Club[1], [3, 'future', 0, 0, 1774573200000]);
  assert.deepEqual(reply.roster, snapshot.live.roster);
  assert.equal(JSON.stringify(snapshot), before, 'immutable captured source changed');
});
test('unmasked source transport preserves captured fields for parity verification', async () => {
  const reply = await (await recordedRequest(snapshot)(url)).json();
  for (const key of ['roster', 'lines', 'clubs', 'games'] as const) assert.deepEqual(reply[key], snapshot.live[key]);
  await assert.rejects(recordedRequest(snapshot)(url.replace('weeks=1', 'weeks=2')));
  await assert.rejects(recordedRequest(snapshot)(url.replace('h=1', 'h=2')));
  await assert.rejects(recordedRequest(snapshot)(url.replace('/live?', '/replay?')));
});
test('the existing UI clock uses the prepared checkpoint and resets outside rehearsal', () => {
  const actual = simulationAsOf();
  setRehearsalDay('2026-03-26');
  assert.equal(simulationAsOf(), '2026-03-26');
  setRehearsalDay(undefined);
  assert.equal(simulationAsOf(), actual);
});
