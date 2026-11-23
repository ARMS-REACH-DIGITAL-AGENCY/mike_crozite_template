import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Pool } from 'pg';
import { bracketDay, checkTeams } from './master-bracket-results';

function database() {
  const calls: string[] = [];
  return {
    calls,
    pool: { query: async (sql: string) => {
      calls.push(sql);
      if (sql.includes('team_id_map')) return { rows: [{ id: 1 }] };
      if (sql.includes('stat_line_holds')) return { rows: [] };
      assert.fail('Unexpected team-check write: ' + sql);
    } } as unknown as Pool,
  };
}

test('team check requests the supplied historical season and its following season', async () => {
  const db = database();
  const seasons: string[] = [];
  const request: typeof fetch = async input => {
    const url = new URL(String(input));
    assert.equal(url.origin, 'https://statsapi.mlb.com');
    assert.equal(url.pathname, '/api/v1/teams');
    seasons.push(url.searchParams.get('season')!);
    return Response.json({ teams: [{ id: 1, name: 'Fixture club' }] });
  };
  await checkTeams(db.pool, { asof: '2026-03-26', request });
  assert.deepEqual(seasons, ['2026', '2027']);
  assert.equal(db.calls.length, 2, 'Existing mapping and held-line checks still execute');
});

test('ordinary team checks retain current bracket year and global fetch defaults', async () => {
  const db = database(), seasons: number[] = [];
  const original = globalThis.fetch;
  const before = Number(bracketDay().slice(0, 4));
  try {
    globalThis.fetch = async input => {
      seasons.push(Number(new URL(String(input)).searchParams.get('season')));
      return Response.json({ teams: [{ id: 1, name: 'Fixture club' }] });
    };
    await checkTeams(db.pool);
  } finally { globalThis.fetch = original; }
  const after = Number(bracketDay().slice(0, 4));
  assert.ok(seasons[0] === before || seasons[0] === after);
  assert.equal(seasons[1], seasons[0] + 1);
});

test('invalid team-check date fails before provider or database work', async () => {
  for (const asof of ['invalid', '2026-02-30', '2026-03-26T00:00:00Z']) {
    const db = database();
    await assert.rejects(checkTeams(db.pool, { asof, request: async () => assert.fail('Unexpected provider call') }), /valid asof/);
    assert.deepEqual(db.calls, []);
  }
});
