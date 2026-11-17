// src/components/bracket/dayRoster.test.ts
// Run: npx tsx --test src/components/bracket/dayRoster.test.ts
// Regression (Pete, Nov 17, 2026): the stat drawer's M-Su tabs said "No
// batters on roster" before a game started. Every day tab must list the
// whole active roster: blank metrics on a day with no lines yet, the day's
// real lines plus zero lines for the rest on a played day.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dayRosterRows, type ActiveRosterPlayer, type PlayerRow } from './gallery';

const roster = [
  { playerid: '1', display_name: 'Batter One', level: 'MLB', is_pitcher: false, is_two_way_2026: false },
  { playerid: '2', display_name: 'Pitcher Two', level: 'TRIPLE-A', is_pitcher: true, is_two_way_2026: false },
  { playerid: '3', display_name: 'Batter Three', level: 'NCAA-D1', is_pitcher: false, is_two_way_2026: false },
] as unknown as ActiveRosterPlayer[];

test('a day with no stat lines lists every roster player, metrics blank', () => {
  const rows = dayRosterRows([], roster);
  assert.deepEqual(rows.map((r) => r[0]).sort(), ['1', '2', '3']);
  assert.ok(rows.filter((r) => r[4]).length >= 2, 'batters listed');
  assert.ok(rows.some((r) => r[5]), 'pitcher listed');
  for (const r of rows) assert.deepEqual([r[6], r[7], r[8]], [null, null, null]);
});

test('a played day keeps its lines and still lists everyone else', () => {
  const played = ['1', 'Batter One', 'MLB', 0, [4, 4, 2, 1, 0, 0, 0, 0, 0], 0, 150, null, null, 0] as unknown as PlayerRow;
  const rows = dayRosterRows([played], roster);
  assert.deepEqual(rows.map((r) => r[0]).sort(), ['1', '2', '3']);
  const one = rows.find((r) => r[0] === '1')!;
  assert.equal(one[6], 150);
  assert.deepEqual(one[4], [4, 4, 2, 1, 0, 0, 0, 0, 0]);
});
