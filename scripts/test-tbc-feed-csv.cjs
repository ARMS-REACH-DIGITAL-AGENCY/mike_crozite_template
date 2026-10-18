// Run with: node scripts/test-tbc-feed-csv.cjs
// No network or database connections; the route uses local transport fixtures.
/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS harness for compiled TypeScript route fixtures. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const csvFilename = path.join(root, 'src/lib/tbcFeedCsv.ts');
const compile = source => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 },
}).outputText;
const csv = {};
new Function('exports', compile(fs.readFileSync(csvFilename, 'utf8')))(csv);
const { parseCsv, parseTbcFeedCsv, assertTbcCsvRowWidths } = csv;
const plain = value => JSON.parse(JSON.stringify(value));

function routeFixture(body, contentType = 'text/plain') {
  const filename = path.join(root, 'src/app/api/cron/tbc-safe-ingest/route.ts');
  const source = fs.readFileSync(filename, 'utf8') +
    '\nexport const __test = { fetchCsvRows, insertLandingRows, syncOneFeed, recordIngestSuccess };';
  const exported = {};
  const warnings = [];
  let fetches = 0;
  vm.runInNewContext(compile(source), {
    exports: exported,
    process: { env: {} },
    console: { ...console, warn: (...args) => warnings.push(args) },
    fetch: async () => {
      fetches++;
      return { ok: true, status: 200, headers: { get: () => contentType }, text: async () => body };
    },
    require(name) {
      if (name === '@/lib/tbcFeedCsv') return csv;
      if (name === '@/lib/tbcStatRouting') return { routeTbcStatFeed: async () => ({ targetRows: 2, state: 'healthy' }) };
      if (name === 'pg') return { Pool: class {} };
      if (name === 'next/server') return {};
      if (name === '@/lib/ingestAlerts') return {};
      if (name === '@/lib/playerMetadataEnrichment') return {};
      throw new Error('Unexpected test dependency: ' + name);
    },
  }, { filename });
  return { ...exported.__test, warnings, get fetches() { return fetches; } };
}

test('literal quotes inside unquoted values retain subsequent player records', () => {
  const parsed = parseTbcFeedCsv('playerid,name,wt\n1,First,6"2\n2,Second,190\n3,Third,6"1\n');
  assert.deepEqual(parsed.rows, [
    ['1', 'First', '6"2'], ['2', 'Second', '190'], ['3', 'Third', '6"1'],
  ]);
  assert.equal(parsed.validation.skippedRows, 0);
});

test('quoted commas, escaped quotes, and multiline fields remain valid CSV', () => {
  const rows = parseCsv('playerid,name,note\n1,"A ""Ace""","line one\nline two"\n2,"B, Jr.",safe');
  assert.deepEqual(rows, [
    ['playerid', 'name', 'note'],
    ['1', 'A "Ace"', 'line one\nline two'],
    ['2', 'B, Jr.', 'safe'],
  ]);
});

test('BOM, quoted headers, CRLF, lone CR, and final empty cells are preserved', () => {
  assert.deepEqual(parseCsv('\ufeff"playerid",name,team\r\n1,"Line\r\nBreak",\r2,Two,\r'), [
    ['playerid', 'name', 'team'], ['1', 'Line\r\nBreak', ''], ['2', 'Two', ''],
  ]);
  assert.deepEqual(parseCsv('""'), [['']]);
  assert.deepEqual(parseCsv(''), []);
});

test('TBC headers retain stat aliases and normalized names', () => {
  const parsed = parseTbcFeedCsv('\ufeffPLAYERID,2b,3b, Current Team \n1,3,2,Example');
  assert.deepEqual(parsed.headers, ['playerid', 'dbl', 'tpl', 'current_team']);
  assert.deepEqual(parsed.rows, [['1', '3', '2', 'Example']]);
});

test('blank records are ignored without changing the rejected-record count', () => {
  const parsed = parseTbcFeedCsv('playerid,name,team\n\n1,Valid,\n, ,\n');
  assert.equal(parsed.downloadedRows, 1);
  assert.equal(parsed.validation.skippedRows, 0);
  assert.equal(parsed.rows.length, 1);
});

test('short and long records are skipped individually while surrounding valid rows survive', () => {
  const parsed = parseTbcFeedCsv([
    'playerid,name,team',
    'PRIVATE_BAD_1,short',
    '1,First,Team',
    'PRIVATE_BAD_2,long,Team,extra',
    '2,Second,Team',
    'PRIVATE_BAD_3,short',
  ].join('\n'));
  assert.equal(parsed.downloadedRows, 5);
  assert.deepEqual(parsed.rows, [['1', 'First', 'Team'], ['2', 'Second', 'Team']]);
  assert.deepEqual(parsed.validation, {
    skippedRows: 3,
    skippedByReason: { column_count_mismatch: 3 },
    skippedRowSamples: [
      { recordNumber: 2, reason: 'column_count_mismatch', expectedColumns: 3, actualColumns: 2 },
      { recordNumber: 4, reason: 'column_count_mismatch', expectedColumns: 3, actualColumns: 4 },
      { recordNumber: 6, reason: 'column_count_mismatch', expectedColumns: 3, actualColumns: 2 },
    ],
    omittedSkippedRowSamples: 0,
  });
  assert.ok(!JSON.stringify(parsed.validation).includes('PRIVATE'));
});

test('rejection reports are bounded and contain no player values or feed payload', () => {
  const invalid = Array.from({ length: 100 }, (_, i) => i + ',PRIVATE_VALUE');
  const parsed = parseTbcFeedCsv(['playerid,name,team', ...invalid, '101,Valid,Team'].join('\n'));
  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.validation.skippedRows, 100);
  assert.equal(parsed.validation.skippedRowSamples.length, 10);
  assert.equal(parsed.validation.omittedSkippedRowSamples, 90);
  assert.ok(!JSON.stringify(parsed.validation).includes('PRIVATE_VALUE'));
  assert.ok(JSON.stringify(parsed.validation).length < 2000);
});

test('distant literal quotes cannot collapse thousands of identities into one giant record', () => {
  const rows = Array.from({ length: 6000 }, (_, i) =>
    (i + 1) + ',Player,' + (i === 0 || i === 5999 ? '6"2' : '190'));
  const parsed = parseTbcFeedCsv(['playerid,name,wt', ...rows].join('\n'));
  assert.equal(parsed.rows.length, 6000);
  assert.equal(parsed.rows[5999][0], '6000');
  assert.ok(parsed.rows.every(row => row.length === 3));
  assert.equal(parsed.validation.skippedRows, 0);
});

test('an unterminated quoted field rejects the feed without exposing its value', () => {
  let error;
  try { parseTbcFeedCsv('playerid,name\n1,Valid\n2,"PRIVATE_UNCLOSED'); }
  catch (caught) { error = caught; }
  assert.match(error.message, /unterminated quoted field in record 3/);
  assert.ok(!error.message.includes('PRIVATE'));
});

test('invalid or conflicting headers are rejected before constructing landing columns', () => {
  assert.throws(() => parseTbcFeedCsv(''), /empty/);
  assert.throws(() => parseTbcFeedCsv('id,name\n1,Valid'), /missing playerid/);
  assert.throws(() => parseTbcFeedCsv('playerid,2b,dbl\n1,2,3'), /duplicate normalized/);
  const wide = ['playerid', ...Array.from({ length: 200 }, (_, i) => 'field_' + i)].join(',');
  assert.throws(() => parseTbcFeedCsv(wide), /maximum is 200/);
});

test('landing validation rejects either row-width mismatch', () => {
  assert.doesNotThrow(() => assertTbcCsvRowWidths(['playerid', 'name'], [['1', 'Valid']]));
  assert.throws(() => assertTbcCsvRowWidths(['playerid', 'name'], [['1']]), /expected 2 columns, got 1/);
  assert.throws(() => assertTbcCsvRowWidths(['playerid'], [['1', 'Extra']]), /expected 1 columns, got 2/);
});

test('the landing writer checks every record before sending even the first batch', async () => {
  const route = routeFixture('');
  let queries = 0;
  const client = { query: async () => { queries++; return { rows: [] }; } };
  const rows = Array.from({ length: 501 }, (_, i) => [String(i), 'Valid']);
  rows.push(['PRIVATE_BAD', 'Extra', 'Field']);
  await assert.rejects(
    route.insertLandingRows(client, 'public.fixture', ['playerid', 'name'], rows),
    /expected 2 columns, got 3/,
  );
  assert.equal(queries, 0);
});

test('the route unwraps TBC HTML before validating rows', async () => {
  const route = routeFixture(
    '<html><body>playerid,name,team<br>1,"Valid, Name",Team<br>PRIVATE_BAD,short<br>2,Next,Team</body></html>',
    'text/html',
  );
  const parsed = await route.fetchCsvRows('https://fixture.invalid/feed');
  assert.equal(route.fetches, 1);
  assert.equal(parsed.downloadedRows, 3);
  assert.equal(parsed.validation.skippedRows, 1);
  assert.deepEqual(parsed.rows, [['1', 'Valid, Name', 'Team'], ['2', 'Next', 'Team']]);
});

test('sync results retain skipped counts for health storage and insert only validated records', async () => {
  const route = routeFixture('playerid,name,team\n1,First,Team\nPRIVATE_BAD,short\n2,Second,Team');
  const calls = [];
  const client = {
    async query(sql, values) {
      calls.push({ sql, values });
      if (sql.includes('information_schema.columns')) {
        return { rows: ['playerid', 'name', 'team'].map(column_name => ({ column_name })) };
      }
      if (sql.includes('select count(*)::text')) return { rows: [{ count: '2' }] };
      return { rows: [] };
    },
  };
  const result = await route.syncOneFeed(client, 'batting');
  assert.equal(result.downloadedRows, 3);
  assert.equal(result.insertedRows, 2);
  assert.equal(result.targetRows, 2);
  assert.equal(result.skippedRows, 1);
  assert.deepEqual(plain(result.skippedByReason), { column_count_mismatch: 1 });
  const insert = calls.find(call => /insert into "public"\."tbc_batting_landing_latest"/.test(call.sql));
  assert.deepEqual(plain(insert.values), ['1', 'First', 'Team', '2', 'Second', 'Team']);
  assert.equal(route.warnings.length, 1);
  assert.ok(!JSON.stringify(route.warnings).includes('PRIVATE_BAD'));
  await route.recordIngestSuccess(client, { results: [result] });
  const health = calls.find(call => call.sql.includes('insert into public.ingest_job_health'));
  const storedResult = JSON.parse(health.values[1]).results[0];
  assert.equal(storedResult.skippedRows, 1);
  assert.deepEqual(storedResult.skippedByReason, { column_count_mismatch: 1 });
  assert.ok(!health.values[1].includes('PRIVATE_BAD'));
});
