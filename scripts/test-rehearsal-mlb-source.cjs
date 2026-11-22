'use strict';
// TEST-ONLY: prove the transport changes only the historical input window.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const ts = require('typescript');
const exportsForTest = {};
new Function('exports', 'require', ts.transpileModule(fs.readFileSync('scripts/lib/rehearsal-mlb-source.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText)(exportsForTest, id => { assert.equal(id, 'node:crypto'); return crypto; });
const { createHistoricalMlbSource } = exportsForTest;
const sha256 = body => crypto.createHash('sha256').update(body).digest('hex');

const past = { gamePk: 41, officialDate: '2026-03-25', status: { detailedState: 'Final' }, teams: { home: { score: 2 }, away: { score: 1 } } };
const current = { gamePk: 42, officialDate: '2026-03-26', gameDate: '2026-03-27T00:00:00Z', status: { detailedState: 'Final' }, teams: { home: { score: 3 }, away: { score: 4 } } };
const moved = { gamePk: 43, officialDate: '2026-03-27', status: { detailedState: 'Final' } };
const future = { gamePk: 44, officialDate: '2026-03-27', status: { detailedState: 'Final' }, teams: { home: { score: 9 } } };
const original = { dates: [
  { date: '2026-03-25', games: [past] },
  { date: '2026-03-26', games: [current, moved] },
  { date: '2026-03-27', games: [future] },
] };
const box = { teams: { home: { players: { ID1: { person: { id: 1 }, stats: { batting: { hits: 1 } } } } } } };
const url = 'https://statsapi.mlb.com/api/v1/schedule?sportId=1&startDate=2026-03-25&endDate=2026-03-27';

(async () => {
  const saved = [], upstream = [];
  const source = createHistoricalMlbSource({ reportDate: '2026-03-26', save: async record => { saved.push(record); }, request: async (input, init) => {
    upstream.push(String(input));
    assert.equal(init.redirect, 'error');
    return Response.json(String(input).includes('/schedule?') ? original : box);
  } });
  await assert.rejects(() => source.request('https://statsapi.mlb.com/api/v1/game/42/boxscore'), /previously captured/);
  const [a, b] = await Promise.all([source.request(url), source.request(url)]);
  const received = await a.json();
  assert.deepEqual(await b.json(), received);
  assert.equal(upstream.length, 1, 'Duplicate concurrent provider calls share one immutable capture');
  assert.equal(saved.length, 1);
  assert.deepEqual(received.dates.flatMap(day => day.games), [past, current], 'All retained game objects are unchanged');
  assert.deepEqual(JSON.parse(saved[0].providerBody), original, 'The complete authentic provider response is retained');
  assert.equal(saved[0].providerHash, sha256(saved[0].providerBody));
  assert.equal(saved[0].replayHash, sha256(saved[0].replayBody));
  assert.deepEqual(saved[0].omittedFutureDates, ['2026-03-27']);
  assert.deepEqual(saved[0].omittedFutureGameIds, [43, 44]);
  assert.ok(!saved[0].replayBody.includes('Scheduled'), 'No invented pending status replaces an actual future final');
  assert.deepEqual(await (await source.request('https://statsapi.mlb.com/api/v1/game/42/boxscore')).json(), box);
  assert.equal(saved[1].providerBody, saved[1].replayBody, 'Raw boxscore is passed through byte for byte');
  for (const id of [43, 44]) await assert.rejects(() => source.request(`https://statsapi.mlb.com/api/v1/game/${id}/boxscore`), /previously captured/);
  await assert.rejects(() => source.request('https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=2026-03-27'), /future/);
  await assert.rejects(() => source.request('https://other.invalid/api/v1/schedule?date=2026-03-26'), /read-only MLB/);
  await assert.rejects(() => source.request(url, { method: 'POST' }), /read-only MLB/);
  await assert.rejects(() => source.request('https://statsapi.mlb.com/api/v1/people/1/stats?season=2026'), /Unrecognized/);

  const restored = createHistoricalMlbSource({ reportDate: '2026-03-26', previous: saved, save: async () => { throw Error('No new record expected'); }, request: async () => { throw Error('No network expected'); } });
  assert.deepEqual(await (await restored.request(url)).json(), received);
  assert.deepEqual(await (await restored.request('https://statsapi.mlb.com/api/v1/game/42/boxscore')).json(), box);
  assert.equal(restored.records.length, 2, 'A resume reuses durable raw captures without a live provider change');
  assert.throws(() => createHistoricalMlbSource({ reportDate: '2026-03-27', previous: saved, save: async () => {} }), /this day/);
  assert.throws(() => createHistoricalMlbSource({ reportDate: '2026-03-26', previous: [{ ...saved[0], providerBody: '{}' }], save: async () => {} }), /saved hashes/);
  const bad = createHistoricalMlbSource({ reportDate: '2026-03-26', save: async () => {}, request: async () => Response.json({ dates: [{ date: 'bad', games: [current] }] }) });
  await assert.rejects(() => bad.request(url), /Invalid schedule date/);
  const storageFailure = createHistoricalMlbSource({ reportDate: '2026-03-26', save: async () => { throw Error('Durable capture unavailable'); }, request: async () => Response.json(original) });
  await assert.rejects(() => storageFailure.request(url), /Durable capture unavailable/);
  await assert.rejects(() => storageFailure.request('https://statsapi.mlb.com/api/v1/game/42/boxscore'), /previously captured/);

  const attempts = [];
  let fetchCount = 0;
  const recovery = createHistoricalMlbSource({ reportDate: '2026-03-26', save: async record => { attempts.push(record); }, request: async () => {
    fetchCount++;
    return fetchCount === 1 ? new Response('Provider temporarily unavailable', { status: 503 }) : Response.json(original);
  } });
  assert.equal((await recovery.request(url)).status, 503);
  assert.equal((await recovery.request(url)).status, 200, 'A failed HTTP response must not be cached forever');
  assert.equal(fetchCount, 2);
  assert.deepEqual(attempts.map(record => record.status), [503, 200], 'Failure evidence survives successful retry');
  const afterRecovery = createHistoricalMlbSource({ reportDate: '2026-03-26', previous: attempts, save: async () => { throw Error('Already saved'); }, request: async () => { throw Error('No network expected'); } });
  assert.equal((await afterRecovery.request(url)).status, 200, 'Resume selects the successful capture after a recorded failed attempt');
  const afterFailure = createHistoricalMlbSource({ reportDate: '2026-03-26', previous: attempts.slice(0, 1), save: async () => {}, request: async () => Response.json(original) });
  assert.equal((await afterFailure.request(url)).status, 200, 'A day interrupted by an outage can resume against the provider');
  console.log('PASS authentic historical MLB capture, future exclusion, immutable resume, no invented states and durable-save gate');
})().catch(error => { console.error(error); process.exitCode = 1; });
