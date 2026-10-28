/* Offline connection-boundary checks. No database or network is contacted. */
/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS isolates the pg driver and process environment. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const source = ts.transpileModule(fs.readFileSync(path.resolve(__dirname, '../src/lib/tribune/db.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText;
const dedicated = 'postgresql://tribune_role:fixture-password@private.example.invalid/fixture_database?sslmode=verify-full';
const shared = 'postgresql://shared_role:shared-password@shared.example.invalid/shared_database';

function isolated(env = {}) {
  const pools = [], calls = [], logs = [];
  let queryError;
  class OfflinePool {
    constructor(options) { this.options = options; this.listeners = {}; pools.push(this); }
    on(event, handler) { this.listeners[event] = handler; return this; }
    async query(...args) { calls.push(args); if (queryError) throw queryError; return { rows: [{ ok: true }], rowCount: 1 }; }
  }
  const mod = { exports: {} };
  const req = (id) => {
    if (id === 'server-only') return {};
    if (id === 'pg') return { Pool: OfflinePool };
    throw new Error('Unexpected dependency in private database helper: ' + id);
  };
  new Function('require', 'module', 'exports', 'process', 'console', source)(req, mod, mod.exports, { env }, { error: (...args) => logs.push(args) });
  return { ...mod.exports, env, pools, calls, logs, failWith: (error) => { queryError = error; } };
}
let passed = 0;
async function test(name, fn) { await fn(); passed++; console.log('PASS', name); }
async function main() {
  await test('importing private helper does not create a pool or need build-time credentials', () => {
    const db = isolated(); assert.equal(db.pools.length, 0); assert.equal(db.calls.length, 0);
  });
  await test('missing dedicated URL refuses shared URLs and ambient pg defaults', async () => {
    const db = isolated({ DATABASE_URL: shared, PLAYERS_DATABASE_URL: shared, PGHOST: 'shared.example.invalid', PGUSER: 'shared_role', PGPASSWORD: 'shared-password', PGDATABASE: 'shared_database' });
    await assert.rejects(db.query('SELECT secret'), { code: 'TRIBUNE_DATABASE_UNCONFIGURED' });
    assert.equal(db.pools.length, 0); assert.equal(db.calls.length, 0); assert.deepEqual(db.logs, []);
  });
  await test('blank, malformed and incomplete dedicated URLs fail before pg can inherit defaults', async () => {
    for (const value of ['', '   ', 'invalid credential', 'https://user:password@private.example.invalid/database',
      'postgresql://private.example.invalid/database', 'postgresql://user@private.example.invalid/database',
      'postgresql://user:@private.example.invalid/database', 'postgresql://:password@private.example.invalid/database',
      'postgresql://user:password@private.example.invalid/']) {
      const db = isolated({ TRIBUNE_DATABASE_URL: value, DATABASE_URL: shared, PGUSER: 'ambient', PGPASSWORD: 'ambient', PGDATABASE: 'ambient' });
      await assert.rejects(db.query('SELECT 1'), { code: 'TRIBUNE_DATABASE_UNCONFIGURED' });
      assert.equal(db.pools.length, 0); assert.deepEqual(db.logs, []);
    }
  });
  await test('valid complete credential creates only the dedicated bounded pool', async () => {
    const db = isolated({ TRIBUNE_DATABASE_URL: '  ' + dedicated + '  ', DATABASE_URL: shared, PLAYERS_DATABASE_URL: shared });
    assert.deepEqual(await db.query('SELECT 1'), { rows: [{ ok: true }], rowCount: 1 });
    assert.equal(db.pools.length, 1); assert.equal(db.pools[0].options.connectionString, dedicated);
    assert.equal(db.pools[0].options.max, 3); assert.equal(db.pools[0].options.application_name, 'yatstats-tribune-server');
    assert.equal(db.pools[0].options.ssl.rejectUnauthorized, true);
    assert.equal(typeof db.pools[0].listeners.error, 'function');
  });
  await test('parallel calls reuse one pool and preserve parameterized statements', async () => {
    const db = isolated({ TRIBUNE_DATABASE_URL: dedicated });
    const parameters = ['private-recipient@example.invalid', { internal: 'payload' }];
    await Promise.all([db.query('INSERT INTO private_fixture VALUES ($1,$2)', parameters), db.query('SELECT $1', ['second'])]);
    assert.equal(db.pools.length, 1); assert.equal(db.calls.length, 2);
    assert.equal(db.calls[0][0], 'INSERT INTO private_fixture VALUES ($1,$2)'); assert.equal(db.calls[0][1], parameters);
    assert.deepEqual(db.calls[1], ['SELECT $1', ['second']]); assert.deepEqual(db.logs, []);
  });
  await test('failed mutation is never replayed and no SQL, values or database error is logged', async () => {
    const db = isolated({ TRIBUNE_DATABASE_URL: dedicated });
    const failure = Object.assign(new Error('private database detail and fixture-password'), { code: '08006' });
    db.failWith(failure);
    await assert.rejects(db.query('UPDATE private_fixture SET secret=$1', ['private-value']), (error) => error === failure);
    assert.equal(db.calls.length, 1); assert.deepEqual(db.logs, []);
  });
  await test('idle disconnect listener logs only a fixed message without error details', async () => {
    const db = isolated({ TRIBUNE_DATABASE_URL: dedicated }); await db.query('SELECT 1');
    db.pools[0].listeners.error(Object.assign(new Error('fixture-password private SQL'), { detail: 'private-recipient@example.invalid' }));
    assert.deepEqual(db.logs, [['[tribune-db] idle connection lost']]);
  });
  await test('removing dedicated configuration closes access even after a pool exists', async () => {
    const db = isolated({ TRIBUNE_DATABASE_URL: dedicated, DATABASE_URL: shared }); await db.query('SELECT 1');
    delete db.env.TRIBUNE_DATABASE_URL;
    await assert.rejects(db.query('SELECT private_data'), { code: 'TRIBUNE_DATABASE_UNCONFIGURED' });
    assert.equal(db.pools.length, 1); assert.equal(db.calls.length, 1);
  });
  console.log(`\n${passed} private database isolation checks passed. All driver calls were mocked.`);
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
