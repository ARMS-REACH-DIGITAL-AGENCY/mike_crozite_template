import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Pool } from 'pg';
import { runBracketResultsJob } from '../src/lib/bracket/resultsJob';
import { SQL_SEASONS, type Season } from './master-bracket-results';

const season = { season_key: '2027' } as Season;

function setup() {
  const calls: string[] = [];
  const pool = { query: async (sql: string, values?: unknown[]) => {
    if (sql.includes('stat_lines_reland_held')) { calls.push('reland'); return { rows: [{ n: 3 }] }; }
    assert.equal(sql, SQL_SEASONS);
    calls.push('seasons');
    assert.deepEqual(values, ['2027', '2026-03-27']);
    return { rows: [season] };
  } } as unknown as Pool;
  const services = {
    checkTeams: async (_pool: Pool, options?: { asof?: string; request?: typeof fetch }) => {
      calls.push('teams');
      assert.equal(options?.asof, '2026-03-27');
      assert.equal(options?.request, undefined, 'A bracket-only transport must not handle team catalog requests');
    },
    runSeason: async (...args: unknown[]) => {
      calls.push('score');
      assert.equal(args[1], season);
      return [];
    },
  };
  return { calls, pool, services };
}

test('scheduled and rehearsal callers run held-line and team checks before the same writer', async () => {
  const { calls, pool, services } = setup();
  const result = await runBracketResultsJob(pool, {
    base: 'https://example.invalid/', seasonKey: '2027',
    asof: '2026-03-27', effectiveAt: '2026-03-27T11:00:00Z',
    request: async () => { throw new Error('Bracket transport is not a team transport'); },
  }, services);
  assert.deepEqual(calls, ['reland', 'teams', 'seasons', 'score']);
  assert.equal(result.relanded, 3);
  assert.equal(result.base, 'https://example.invalid');
  assert.equal(result.seasons[0].season, '2027');
});

test('team catalog transport is separately selectable from bracket input', async () => {
  const { calls, pool, services } = setup();
  const teamRequest: typeof fetch = async () => new Response('{}');
  const bracketRequest: typeof fetch = async () => new Response('{}');
  services.checkTeams = async (_pool, options) => {
    calls.push('teams');
    assert.equal(options?.request, teamRequest);
    assert.equal(options?.asof, '2026-03-27');
  };
  await runBracketResultsJob(pool, {
    base: 'https://example.invalid', seasonKey: '2027', asof: '2026-03-27',
    request: bracketRequest, teamRequest,
  }, services);
  assert.deepEqual(calls, ['reland', 'teams', 'seasons', 'score']);
});

test('dry and legacy region jobs preserve the existing no-relanding behavior', async () => {
  for (const extra of [{ dryRun: true }, { region: 1 }]) {
    const { calls, pool, services } = setup();
    await runBracketResultsJob(pool, {
      base: 'https://example.invalid', seasonKey: '2027', asof: '2026-03-27', ...extra,
    }, services);
    assert.deepEqual(calls, ['seasons', 'score']);
  }
});

test('bad replay clock fails before relanding or other writes', async () => {
  for (const effectiveAt of ['2026-03-27T10:59:59Z', '2026-03-27T11:00:00', 'invalid']) {
    const { calls, pool, services } = setup();
    await assert.rejects(runBracketResultsJob(pool, {
      base: 'https://example.invalid', seasonKey: '2027', asof: '2026-03-27', effectiveAt,
    }, services), /clock|timezone/);
    assert.deepEqual(calls, []);
  }
});

test('failed landing never reaches scoring', async () => {
  const { pool, services, calls } = setup();
  pool.query = (async () => { throw new Error('landing failed'); }) as typeof pool.query;
  await assert.rejects(runBracketResultsJob(pool, {
    base: 'https://example.invalid', seasonKey: '2027', asof: '2026-03-27',
  }, services), /landing failed/);
  assert.deepEqual(calls, []);
});
