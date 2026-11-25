// Run: npx tsx --test scripts/master-bracket-clock.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Pool, PoolClient } from 'pg';
import type { Live } from '../src/components/bracket/liveSeason';
import { bracketDay, runSeason, SQL_ROWS, SQL_RULINGS, writeSeason, type Row, type Season } from './master-bracket-results';

const season: Season = {
  season_key: '2027', is_test: false, opening_day: '2026-03-23', last_day: '2026-11-15',
  weeks: 34, regions: 8, schools_per_region: 128,
};
const initial: Row = {
  stage: 'bracket', region: 1, round: 1, series_no: 1, game_no: 1, game_id: 1, week: 1,
  home_hsid: 1, away_hsid: 2, home_seed: 1, away_seed: 128,
  home_school_name: 'Home', away_school_name: 'Away', status: 'scheduled', innings: null,
  winner_hsid: null, decided_by: null, locked_at: null,
};
const hot = [4, 4, 2, 0, 0, 1, 0, 0, 0];
const cold = [4, 4, 0, 0, 0, 0, 0, 0, 0];
function feed(): Live {
  return {
    asOf: '2026-03-25', clubs: {},
    roster: { '1': [['YAT000001', 'Home batter', 'MLB', 0, 'H']], '2': [['YAT000002', 'Away batter', 'MLB', 0, 'A']] },
    // Future-day rows intentionally arrive together: the real scorer must
    // reveal each day's contribution only when the replay clock reaches it.
    lines: [0, 1, 2].flatMap((day): Live['lines'] => [
      ['1', 'YAT000001', day, 'b', [...(day === 1 ? cold : hot)], `h${day}`, 'H', 1, 'MLB'],
      ['2', 'YAT000002', day, 'b', [...(day === 1 ? hot : cold)], `a${day}`, 'A', 1, 'MLB'],
    ]),
  };
}

// Only IO is replaced. runSeason, its production transport, scorer, frozen
// day handling and writer execute unchanged. Actual Postgres persistence is
// covered by the isolated full-season replay, not claimed by this unit test.
function database() {
  let row: Row = { ...initial };
  const writes: { sql: string; values: unknown[] }[] = [];
  const query = async (sql: string, values: unknown[] = []) => {
    if (sql === SQL_ROWS) return { rows: [row] };
    if (sql === SQL_RULINGS) return { rows: [] };
    if (sql.includes('computed_at =')) {
      writes.push({ sql, values });
      assert.match(sql, /computed_at = COALESCE\(\$4::timestamptz, now\(\)\)/);
      assert.match(sql, /locked_at = CASE WHEN x.lock THEN COALESCE\(\$4::timestamptz, now\(\)\)/);
      const [result] = JSON.parse(String(values[1]));
      if (result) row = {
        ...row, ...result, innings: result.innings.slice(1, -1).split(',').map(Number),
        computed_at: values[3] as string | null, locked_at: result.lock ? values[3] as string : null,
        box_in_progress: result.box,
      };
    }
    return { rows: [] };
  };
  const client = { query, release() {} } as unknown as PoolClient;
  return { pool: { query, connect: async () => client } as unknown as Pool, client, writes, row: () => row };
}

test('historical daily writes advance new innings and preserve closed-day precision', async () => {
  const live = feed();
  const request: typeof fetch = async () => new Response(JSON.stringify(live));
  const db = database();
  const run = (day: string, effectiveAt: string) => runSeason(db.pool, season, day, { base: 'https://replay.invalid', effectiveAt, request });

  await run('2026-03-23', '2026-03-24T10:59:59Z');
  assert.equal(db.row().computed_at, '2026-03-24T10:59:59.000Z');
  assert.deepEqual(db.row().innings?.slice(0, 6), [1, 0, 0, 0, 0, 0]);

  await run('2026-03-24', '2026-03-25T10:59:59Z');
  assert.deepEqual(db.row().innings?.slice(0, 6), [1, 0, 0, 1, 0, 0]);
  const frozen = structuredClone(db.row().box_in_progress!);
  assert.notEqual(frozen.x?.[0][0], frozen.d[0][0], 'fixture must exercise raw precision beyond rounded display');
  // A late correction to Monday must not change its now-closed inning or
  // its raw Stat Ledger values when Wednesday is scored.
  live.lines[0][4] = [...cold];
  live.lines[1][4] = [...hot];
  await run('2026-03-25', '2026-03-26T10:59:59Z');
  assert.deepEqual(db.row().innings?.slice(0, 6), [1, 0, 0, 1, 1, 0]);
  assert.deepEqual(db.row().box_in_progress?.x?.[0], frozen.x?.[0]);
  assert.deepEqual(db.row().box_in_progress?.d[0], frozen.d[0]);
  assert.deepEqual(db.row().box_in_progress?.h.days?.[0], frozen.h.days?.[0]);

  // Finalization still occurs on the next Monday's bracket day, and both
  // persisted timestamps use that run's historical scoring instant.
  await run('2026-03-30', '2026-03-31T10:59:59Z');
  assert.equal(db.row().status, 'final');
  assert.equal(db.row().locked_at, '2026-03-31T10:59:59.000Z');
  assert.equal(db.row().computed_at, db.row().locked_at);
});

test('normal writes retain database time and explicit offsets normalize to UTC', async () => {
  const db = database();
  const empty = { results: [], fills: [], decisions: [], boxFills: [] };
  await writeSeason(db.client, season.season_key, empty, true);
  assert.equal(db.writes[0].values[3], null, 'omitted effectiveAt must preserve database now()');
  await writeSeason(db.client, season.season_key, empty, true, { effectiveAt: '2026-03-24T03:59:59-07:00' });
  assert.equal(db.writes[1].values[3], '2026-03-24T10:59:59.000Z');
});

test('clock validation rejects a mismatched bracket day before any database work', async () => {
  const pool = { query: () => assert.fail('invalid clock reached the database') } as unknown as Pool;
  assert.equal(bracketDay(Date.parse('2026-03-24T10:59:59Z')), '2026-03-23');
  assert.equal(bracketDay(Date.parse('2026-03-24T11:00:00Z')), '2026-03-24');
  await assert.rejects(runSeason(pool, season, '2026-03-23', {
    base: 'https://replay.invalid', effectiveAt: '2026-03-24T11:00:00Z',
  }), /effectiveAt falls on bracket day 2026-03-24, not asof 2026-03-23/);
  for (const effectiveAt of ['2026-03-24T10:59:59', '2026-03-24', 'invalid']) {
    await assert.rejects(runSeason(pool, season, '2026-03-23', { base: 'https://replay.invalid', effectiveAt }), /explicit timezone/);
  }
});

// April 2026 regression: MLB's same gamePk moved from Tuesday to Thursday
// after Tuesday's result was frozen. The Thursday game is a separate loss.
test('a moved final club game is credited exactly once after the daily lock, including final ninth inning', async () => {
  const live = feed();
  live.lines = [];
  live.clubs = { H: [[1, '820363', 1, 3]], A: [[1, '820363', 0, -3]] };
  const request: typeof fetch = async () => new Response(JSON.stringify(live));
  const db = database();
  const run = (day: string, effectiveAt: string) => runSeason(db.pool, season, day, { base: 'https://replay.invalid', effectiveAt, request });
  await run('2026-03-25', '2026-03-25T11:00:00Z');
  const locked = structuredClone(db.row().box_in_progress!);
  assert.deepEqual(locked.h.days?.[1][0][8], [1, 0]);
  assert.deepEqual(locked.h.clubGames?.YAT000001[1], [['820363', 1, 3]]);
  live.clubs = { H: [[3, '820363', 1, 3], [3, '820369', 0, -1]], A: [[3, '820363', 0, -3], [3, '820369', 1, 1], [3, 'other', 0, -2]] };
  await run('2026-03-27', '2026-03-27T11:00:00Z');
  const box = db.row().box_in_progress!;
  assert.deepEqual(box.h.days?.[1], locked.h.days?.[1]);
  assert.deepEqual(box.h.days?.[3][0][8], [0, 1]);
  assert.deepEqual(box.h.p[0][8], [1, 1]);
  assert.deepEqual(box.h.wl, [1, 1]);
  assert.equal(box.h.rd, 2);
  assert.deepEqual(box.a.wl, [1, 2]);
  assert.equal(box.a.rd, -4);
  assert.deepEqual(box.h.clubGames?.YAT000001[3], [['820369', 0, -1]]);
  await run('2026-03-30', '2026-03-30T11:00:00Z');
  assert.deepEqual(db.row().box_in_progress?.h.wl, [1, 1]);
  assert.deepEqual(db.row().box_in_progress?.h.days?.[1][0][8], [1, 0]);
  assert.deepEqual(db.row().innings?.slice(16, 18), [1, 0]);
  assert.equal(db.row().winner_hsid, 1);
});
