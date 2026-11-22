'use strict';
// TEST-ONLY: a checkpoint lease must remain on one transaction-pooled backend.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const exportsForTest = {};
new Function('exports', ts.transpileModule(fs.readFileSync('scripts/lib/rehearsal-checkpoint-lock.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText)(exportsForTest);
const { acquireRehearsalCheckpointLock } = exportsForTest;
const lockSql = 'SELECT pg_try_advisory_xact_lock(hashtext($1),hashtext($2)) AS acquired';

function fixture({ shared = { locked: false }, fail = {} } = {}) {
  const calls = [], releases = [];
  let transaction = false, ownsLock = false;
  const client = {
    async query(sql, values) {
      calls.push({ sql, values });
      if (fail[sql]) throw fail[sql];
      if (sql === 'BEGIN') transaction = true;
      else if (sql === lockSql) {
        assert.equal(transaction, true, 'The backend is pinned before acquiring the transaction lock');
        assert.deepEqual(values, ['br-fixture', '2027']);
        if (shared.locked) return { rows: [{ acquired: false }] };
        shared.locked = ownsLock = true;
        return { rows: [{ acquired: true }] };
      } else if (sql === 'ROLLBACK') {
        if (ownsLock) shared.locked = false;
        transaction = ownsLock = false;
      } else assert.fail('Unexpected SQL: ' + sql);
      return { rows: [] };
    },
    release(error) {
      releases.push(error);
      if (error) { if (ownsLock) shared.locked = false; transaction = ownsLock = false; }
      else assert.equal(transaction, false, 'A live transaction cannot return to the pool');
    },
  };
  return { calls, releases, shared, pool: {
    connect: async () => { calls.push({ sql: 'CONNECT' }); return client; },
    query: async () => { assert.fail('The lock must use the reserved client, never pool.query'); },
  } };
}
const acquire = target => acquireRehearsalCheckpointLock(target.pool, 'br-fixture', '2027');
const statements = target => target.calls.map(call => call.sql);

(async () => {
  const first = fixture();
  const release = await acquire(first);
  assert.deepEqual(statements(first), ['CONNECT', 'BEGIN', lockSql]);
  assert.equal(first.shared.locked, true, 'The lease remains held throughout the caller work');
  assert.equal(first.releases.length, 0);

  const concurrent = fixture({ shared: first.shared });
  await assert.rejects(acquire(concurrent), /Another rehearsal run holds this season checkpoint/);
  assert.deepEqual(statements(concurrent), ['CONNECT', 'BEGIN', lockSql, 'ROLLBACK']);
  assert.deepEqual(concurrent.releases, [undefined]);
  assert.equal(first.shared.locked, true, 'A rejected contender cannot release the owner lock');
  await release();
  await release();
  assert.deepEqual(statements(first), ['CONNECT', 'BEGIN', lockSql, 'ROLLBACK']);
  assert.deepEqual(first.releases, [undefined], 'Cleanup is safe to call again');
  assert.equal(first.shared.locked, false);

  const retry = fixture({ shared: first.shared });
  const releaseRetry = await acquire(retry);
  await assert.rejects(async () => {
    try { throw new Error('Rehearsal work failed'); } finally { await releaseRetry(); }
  }, /Rehearsal work failed/);
  assert.equal(retry.shared.locked, false, 'Work errors release the transaction before a later retry');
  assert.deepEqual(retry.releases, [undefined]);

  for (const sql of ['BEGIN', lockSql]) {
    const error = new Error('Acquisition failed at ' + sql);
    const target = fixture({ fail: { [sql]: error } });
    await assert.rejects(acquire(target), caught => caught === error);
    assert.equal(statements(target).at(-1), 'ROLLBACK');
    assert.deepEqual(target.releases, [undefined], 'An acquisition error returns only a rolled-back client');
  }

  const rollbackError = new Error('Rollback connection lost');
  const broken = fixture({ fail: { ROLLBACK: rollbackError } });
  const releaseBroken = await acquire(broken);
  await assert.rejects(releaseBroken(), caught => caught === rollbackError);
  assert.deepEqual(broken.releases, [rollbackError], 'Failed rollback discards the client');
  await releaseBroken();
  assert.equal(broken.releases.length, 1);

  const acquisitionError = new Error('Lock request failed');
  const both = fixture({ fail: { [lockSql]: acquisitionError, ROLLBACK: rollbackError } });
  await assert.rejects(acquire(both), caught => caught === acquisitionError);
  assert.deepEqual(both.releases, [rollbackError], 'Acquisition failure also discards a client whose rollback fails');

  const connectionError = new Error('No connection');
  await assert.rejects(acquireRehearsalCheckpointLock({ connect: async () => { throw connectionError; } }, 'br-fixture', '2027'), caught => caught === connectionError);
  console.log('PASS transaction-scoped checkpoint lease, concurrent exclusion, retry after release, work/acquisition errors and failed-rollback disposal');
})().catch(error => { console.error(error); process.exitCode = 1; });
