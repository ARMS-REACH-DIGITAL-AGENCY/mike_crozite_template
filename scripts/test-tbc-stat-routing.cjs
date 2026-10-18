// Run: node scripts/test-tbc-stat-routing.cjs
// Emit transactional PostgreSQL fixture statements: node scripts/test-tbc-stat-routing.cjs --emit-sql
/* eslint-disable @typescript-eslint/no-require-imports -- Standalone compiled-TypeScript test harness. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const ts = require('typescript');

const filename = path.resolve(__dirname, '../src/lib/tbcStatRouting.ts');
const api = {};
new Function('exports', ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 },
}).outputText)(api);

const columns = ['playerid', 'teamid', 'year', 'ab', 'l', 'playername'];
const options = {
  landingTable: 'pg_temp.stat_route_landing', currentTable: 'pg_temp.stat_route_current',
  historicalTable: 'pg_temp.stat_route_history', landingColumns: columns,
};
const inspect = (changes = {}) => ({ sourceRows: 2, seasonCounts: { 2026: 2 }, invalidRows: 0,
  invalidYearRows: 0, invalidCurrentIdentityRows: 0, unresolvedCurrentTeamRows: 0, futureRows: 0, unsafeNonCurrentRows: 0,
  currentRows: 2, currentUniqueRows: 2, conflictingCurrentKeys: 0, conflictingCurrentRows: 0,
  exactDuplicateCurrentRows: 0, ...changes });
const archive = (changes = {}) => ({ historicalRows: 0, distinctRows: 0, insertedRows: 0,
  existingRows: 0, duplicateKeys: 0, conflictingExistingRows: 0, heldRows: 0, examples: [], ...changes });

// The transport fixtures exercise transaction ownership and destructive-write
// guards. The emitted PostgreSQL fixtures below verify the actual SQL/data behavior.
function clientFixture(config = {}) {
  const calls = [];
  const incoming = inspect(config.incoming);
  const previous = inspect(config.previous);
  let count = config.existingRows ?? 2;
  let archives = 0;
  let locked = false;
  return { calls, async query(sql, values) {
    calls.push({ sql, values });
    if (sql.includes('information_schema.columns')) return { rows: columns.map(column_name => ({ column_name })) };
    if (sql.startsWith('LOCK TABLE')) {
      if (config.lockError) throw new Error('LOCK TABLE can only be used in transaction blocks');
      locked = true; return { rows: [] };
    }
    if (sql.includes('AS "sourceRows"')) return { rows: [sql.includes('"stat_route_landing"') ? incoming : previous] };
    if (sql.includes('AS "historicalRows"')) {
      assert(locked, 'Archive writes must be serialized first');
      return { rows: [archive(archives++ === 0 ? config.previousArchive : config.feedArchive)] };
    }
    if (sql.startsWith('TRUNCATE TABLE')) {
      assert.equal(archives, 2, 'Both historical sources must be handled before current replacement');
      count = 0; return { rows: [] };
    }
    if (sql.startsWith('INSERT INTO')) {
      count = config.wrongCount ?? incoming.currentRows; return { rows: [], rowCount: count };
    }
    if (sql.startsWith('SELECT count(*)')) return { rows: [{ count }] };
    throw new Error('Unexpected query in routing control fixture');
  } };
}

function postgresFixtures() {
  const q = value => `'${String(value).replace(/'/g, "''")}'`;
  const names = { landing: 'pg_temp.stat_route_landing', current: 'pg_temp.stat_route_current', history: 'pg_temp.stat_route_history' };
  const sqlOptions = { sourceTable: names.landing, columns, currentTable: names.current, historicalTable: names.history };
  const inspection = api.buildTbcStatInspectionSql(sqlOptions);
  const archiveOld = api.buildTbcHistoricalArchiveSql({ ...sqlOptions, sourceTable: names.current });
  const archiveFeed = api.buildTbcHistoricalArchiveSql(sqlOptions);
  const replace = api.buildTbcCurrentSeasonSql(sqlOptions);
  const insert = (name, rows) => `INSERT INTO ${name} (playerid,teamid,year,ab,l,playername) VALUES ${rows.map(row => '(' + row.map(v => v == null ? 'NULL' : q(v)).join(',') + ')').join(',')}`;
  const check = (condition, message) => `DO $check$ BEGIN IF NOT (${condition}) THEN RAISE EXCEPTION ${q(message)}; END IF; END $check$`;
  const inspectCheck = (condition, message, query = inspection) => `DO $check$ DECLARE r jsonb; BEGIN SELECT to_jsonb(result_record) INTO r FROM (${query}) result_record; IF NOT (${condition}) THEN RAISE EXCEPTION ${q(message)}, r; END IF; END $check$`;
  const statements = [
    ...Object.values(names).map(name => `CREATE TEMP TABLE ${name.split('.')[1]} (${columns.map(c => '"' + c + '" text').join(',')}) ON COMMIT DROP`),
    `LOCK TABLE ${names.history},${names.current},${names.landing} IN SHARE ROW EXCLUSIVE MODE`,
    insert(names.history, [['900000', '9400', '2025', '99', null, 'Existing history']]),
    insert(names.current, [['900003', '9401', '2024', '4', null, 'Misrouted history'], ['900002', '9301', '2026', '1', '0', 'Current player']]),
    insert(names.landing, [
      ['900000', '9400', '2025', '100', null, 'Existing history'],
      ['900001', '9201', '2025', '10', null, 'Two teams'], ['900001', '9202', '2025', '12', null, 'Two teams'],
      ['900004', '9402', '2025', '1', null, 'Conflicting history'], ['900004', '9402', '2025', '2', null, 'Conflicting history'],
      ['900005', '9403', '2025.0', '3', null, 'Exact duplicate'], ['900005', '9403', '2025', '3', null, 'Exact duplicate'],
      ['900002', '9301', '2026', '5', '0', 'Current player'], ['900002', '9301', '2026', '7', '1', 'Current player'],
      ['900002', '9301', '2026', '7', '1', 'Current player'], ['900002', '9302', '2026.00', '2', '0', 'Traded player'],
      ['296070', '0', '2026', '42', null, 'Landyn Vidourek'], ['299211', '0', '2026', '3', null, 'Brayden Smith'],
      ['900009', '9500', '2027', '8', null, 'Future season'],
    ]),
    inspectCheck("(r->>'currentRows')::int=6 AND (r->>'conflictingCurrentKeys')::int=1 AND (r->>'futureRows')::int=1 AND (r->>'invalidCurrentIdentityRows')::int=0 AND (r->>'invalidRows')::int=0 AND (r->>'unresolvedCurrentTeamRows')::int=2", 'Mixed feed inspection failed: %'),
    archiveOld, archiveFeed,
    check(`(SELECT count(*) FROM ${names.history})=5`, 'Historical promotion count failed'),
    check(`(SELECT ab FROM ${names.history} WHERE playerid='900000')='99'`, 'Known historical stats were overwritten'),
    check(`NOT EXISTS(SELECT 1 FROM ${names.history} WHERE playerid='900004')`, 'Conflicting historical rows were selected or aggregated'),
    check(`(SELECT count(*) FROM ${names.history} WHERE playerid='900005' AND year='2025')=1`, 'Equivalent historical rows were not idempotently collapsed'),
    check(`(SELECT count(*) FROM ${names.history} WHERE playerid='900001')=2`, 'Separate team stints were incorrectly held'),
    replace.remove, replace.insert,
    check(`(SELECT count(*) FROM ${names.current})=6 AND NOT EXISTS(SELECT 1 FROM ${names.current} WHERE year<>'2026')`, 'Current season filter or canonical year failed'),
    check(`(SELECT count(*) FROM ${names.current} WHERE playerid='900002' AND teamid='9301' AND ab='7' AND l='1')=2`, 'Current duplicate rows or statistical values changed'),
    check(`EXISTS(SELECT 1 FROM ${names.current} WHERE playerid='296070' AND teamid='0' AND ab='42') AND EXISTS(SELECT 1 FROM ${names.current} WHERE playerid='299211' AND teamid='0' AND ab='3')`, 'Current rows with an unresolved team were dropped or changed'),
    `CREATE TEMP VIEW stat_route_career_fixture AS SELECT playerid,teamid,year,ab FROM ${names.history} UNION ALL SELECT playerid,teamid,year,ab FROM ${names.current} WHERE year='2026'`,
    check(`EXISTS(SELECT 1 FROM stat_route_career_fixture WHERE playerid='900001' AND year='2025')`, 'Archived season is absent from the historical/current union'),
    `CREATE TEMP TABLE stat_route_history_checkpoint ON COMMIT DROP AS SELECT * FROM ${names.history}`,
    archiveOld, archiveFeed,
    check(`NOT EXISTS((SELECT * FROM ${names.history} EXCEPT ALL SELECT * FROM stat_route_history_checkpoint) UNION ALL (SELECT * FROM stat_route_history_checkpoint EXCEPT ALL SELECT * FROM ${names.history}))`, 'Archival repeat changed established history'),
    `TRUNCATE ${names.landing}`,
    insert(names.landing, [['900010', '9501', '2025', '13', null, 'History only']]),
    inspectCheck("(r->>'currentRows')::int=0 AND (r->'seasonCounts'->>'2025')::int=1", 'History-only hold classification failed: %'),
    archiveFeed,
    check(`(SELECT count(*) FROM ${names.current})=6 AND EXISTS(SELECT 1 FROM ${names.history} WHERE playerid='900010')`, 'History-only archival affected current stats'),
    `TRUNCATE ${names.landing}`,
    insert(names.landing, [['900002', '9301', '2026', '17', '0', 'Valid current'], ['900011', '9502', '2025/2026', '1', null, 'Invalid year'], ['bad-id', '9503', '2026', '1', null, 'Invalid current ID'], ['900012', '9504', '2027', '1', null, 'Future']]),
    inspectCheck("(r->>'invalidYearRows')::int=1 AND (r->>'invalidCurrentIdentityRows')::int=1 AND (r->>'futureRows')::int=1", 'Invalid and future years were misclassified: %'),
    archiveFeed,
    check(`(SELECT count(*) FROM ${names.current})=6`, 'Held invalid feed changed current stats'),
    insert(names.current, [['900021', '9601', '2025', '11', null, 'Old conflicting historical row']]),
    insert(names.history, [['900021', '9601', '2025', '9', null, 'Established historical row']]),
    archiveOld,
    check(`(SELECT ab FROM ${names.current} WHERE playerid='900021')='11' AND (SELECT ab FROM ${names.history} WHERE playerid='900021')='9'`, 'Unpreservable old history was changed'),
    `TRUNCATE ${names.landing}`,
    insert(names.landing, [['900022', '0', '2025', '3', null, 'Unresolved historical team']]),
    inspectCheck("(r->>'invalidRows')::int=1 AND (r->>'unsafeNonCurrentRows')::int=1 AND (r->>'currentRows')::int=0 AND (r->>'unresolvedCurrentTeamRows')::int=0", 'Historical team0 was accepted as a known team: %'),
    archiveFeed,
    check(`NOT EXISTS(SELECT 1 FROM ${names.history} WHERE playerid='900022')`, 'Unresolved historical team was archived'),
    insert(names.current, [['900023', '0', '2025', '5', null, 'Misrouted unresolved history']]),
    inspectCheck("(r->>'unsafeNonCurrentRows')::int=1 AND (r->>'unresolvedCurrentTeamRows')::int=2", 'Old unresolved historical team did not block replacement: %', api.buildTbcStatInspectionSql({ ...sqlOptions, sourceTable: names.current })),
    archiveOld,
    check(`EXISTS(SELECT 1 FROM ${names.current} WHERE playerid='900023' AND teamid='0' AND ab='5') AND NOT EXISTS(SELECT 1 FROM ${names.history} WHERE playerid='900023')`, 'Unarchivable old team0 row was lost or incorrectly archived'),
    `SELECT 'PASS' AS result, 'mixed, current duplicates, current team0, historical team0 held, old history, history-only, invalid/future years, canonical years, repeat' AS checks`,
  ];
  return { note: 'Execute all statements in one transaction on the isolated test branch; only temporary fixture tables/views are written.', statements };
}

if (process.argv.includes('--emit-sql')) {
  process.stdout.write(JSON.stringify(postgresFixtures(), null, 2) + '\n');
} else {
  test('current rows are copied in full, including conflicting duplicate keys and traded teams', async () => {
    const client = clientFixture({ incoming: { currentRows: 4, currentUniqueRows: 2, conflictingCurrentKeys: 1, conflictingCurrentRows: 2 } });
    const result = await api.routeTbcStatFeed(client, options);
    assert.equal(result.currentReplacement, 'replaced');
    assert.equal(result.currentRowsWritten, 4);
    assert.equal(result.state, 'degraded');
    assert.equal(client.calls.filter(c => c.sql.startsWith('TRUNCATE TABLE')).length, 1);
    assert(!client.calls.some(c => /^(BEGIN|COMMIT|ROLLBACK)\b/i.test(c.sql)));
  });

  test('legitimate current team0 rows are reported and copied without holding the normal snapshot', async () => {
    const client = clientFixture({ incoming: { sourceRows: 8997, seasonCounts: { 2026: 8997 }, currentRows: 8997,
      currentUniqueRows: 8969, conflictingCurrentKeys: 14, conflictingCurrentRows: 28, unresolvedCurrentTeamRows: 2 } });
    const result = await api.routeTbcStatFeed(client, options);
    assert.equal(result.currentReplacement, 'replaced');
    assert.equal(result.currentRowsWritten, 8997);
    assert.equal(result.unresolvedCurrentTeamRows, 2);
    assert.equal(result.invalidRows, 0);
    assert.deepEqual(result.holdReasons, []);
    assert.equal(result.state, 'degraded');
  });

  test('history-only feeds archive supplied history and retain existing current statistics', async () => {
    const client = clientFixture({ incoming: { sourceRows: 1, currentRows: 0, currentUniqueRows: 0, seasonCounts: { 2025: 1 } }, feedArchive: { insertedRows: 1 } });
    const result = await api.routeTbcStatFeed(client, options);
    assert.equal(result.feedArchive.insertedRows, 1);
    assert.equal(result.currentRowsRetained, 2);
    assert.deepEqual(result.holdReasons, ['no_current_season_rows']);
    assert(!client.calls.some(c => c.sql.startsWith('TRUNCATE TABLE')));
  });

  test('a skipped malformed CSV row preserves both old players A and B, even when A parsed successfully', async () => {
    const client = clientFixture({ existingRows: 2, incoming: { sourceRows: 1, currentRows: 1, currentUniqueRows: 1 } });
    const result = await api.routeTbcStatFeed(client, { ...options, skippedRows: 1 });
    assert.equal(result.targetRows, 2);
    assert.equal(result.currentRowsWritten, 0);
    assert.equal(result.skippedCsvRows, 1);
    assert(result.holdReasons.includes('malformed_csv_rows'));
    assert(!client.calls.some(c => c.sql.startsWith('TRUNCATE TABLE')));
  });

  test('invalid years or current identities hold replacement while valid history can archive', async () => {
    for (const invalid of [{ invalidYearRows: 1 }, { invalidCurrentIdentityRows: 1 }]) {
      const client = clientFixture({ incoming: { invalidRows: 1, ...invalid }, feedArchive: { insertedRows: 1 } });
      const result = await api.routeTbcStatFeed(client, options);
      assert(result.holdReasons.includes('invalid_current_season_or_year'));
      assert.equal(result.feedArchive.insertedRows, 1);
      assert.equal(result.targetRows, 2);
    }
  });

  test('unpreserved or unroutable old noncurrent rows block destructive replacement', async () => {
    for (const config of [{ previousArchive: { heldRows: 1 } }, { previous: { unsafeNonCurrentRows: 1 } }]) {
      const client = clientFixture(config);
      const result = await api.routeTbcStatFeed(client, options);
      assert.equal(result.currentReplacement, 'held');
      assert(!client.calls.some(c => c.sql.startsWith('TRUNCATE TABLE')));
    }
  });

  test('conflicting newly supplied historical rows do not freeze valid current rows', async () => {
    const client = clientFixture({ feedArchive: { heldRows: 2, duplicateKeys: 1 } });
    const result = await api.routeTbcStatFeed(client, options);
    assert.equal(result.currentReplacement, 'replaced');
    assert.equal(result.feedArchive.heldRows, 2);
    assert.equal(result.state, 'degraded');
  });

  test('missing keys or transaction lock failure prevents all data writes', async () => {
    const badColumns = clientFixture();
    await assert.rejects(api.routeTbcStatFeed(badColumns, { ...options, landingColumns: ['playerid', 'teamid'] }), /requires distinct/);
    assert.equal(badColumns.calls.length, 0);
    const noTransaction = clientFixture({ lockError: true });
    await assert.rejects(api.routeTbcStatFeed(noTransaction, options), /transaction blocks/);
    assert(!noTransaction.calls.some(c => c.sql.includes('AS "historicalRows"') || c.sql.startsWith('TRUNCATE TABLE')));
  });

  test('a replacement count mismatch throws for the caller to roll back', async () => {
    await assert.rejects(api.routeTbcStatFeed(clientFixture({ wrongCount: 1 }), options), /count did not match/);
  });

  test('SQL builders validate season/key inputs and escape table/column identifiers', () => {
    assert.throws(() => api.buildTbcStatInspectionSql({ sourceTable: 'public.safe', columns, currentSeason: 2026.5 }), /Invalid current/);
    assert.throws(() => api.buildTbcStatInspectionSql({ sourceTable: 'public.safe.extra', columns }), /schema-qualified/);
    const sql = api.buildTbcStatInspectionSql({ sourceTable: 'public.safe"table', columns: [...columns, 'odd"column'] });
    assert(sql.includes('"public"."safe""table"'));
    assert(sql.includes('"odd""column"'));
  });
}
