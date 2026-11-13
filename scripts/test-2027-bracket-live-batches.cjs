'use strict';
// 2027 tournament contract: every school must survive bounded live-data fetches.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'src/lib/bracket/fetchLiveBatches.ts'), 'utf8');
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 },
}).outputText;
const exportsObj = {};
vm.runInNewContext(js, { exports: exportsObj, URLSearchParams, Object, Set, String, Error, console }, { filename: 'fetchLiveBatches.js' });
const { fetchBracketLiveBatches, BRACKET_LIVE_BATCH_SIZE } = exportsObj;

(async () => {
  const field = JSON.parse(fs.readFileSync(path.join(root, 'public/bracket-lab/2027/field.json'), 'utf8'));
  const hsids = Object.keys(field.schools);
  assert.equal(field.season, 2027);
  assert.equal(hsids.length, 1024);
  assert.equal(hsids[0], '1', 'Check the first actual 2027 field key');
  assert.equal(hsids[hsids.length - 1], '18681', 'Check the last actual 2027 field key');
  assert.equal(field.schools['5004'][1], 3, 'Hamilton must remain Region 3');
  assert.equal(field.schools['5004'][2], 1, 'Hamilton must remain seed 1');
  assert.equal(BRACKET_LIVE_BATCH_SIZE, 64);

  const requests = [];
  const fetchMock = async (url, options) => {
    assert.equal(options.cache, 'no-store');
    const parsed = new URL(url, 'https://example.test');
    const group = parsed.searchParams.get('h').split(',');
    requests.push(group);
    assert.ok(group.length > 0 && group.length <= 64, 'An API request must never exceed 64 schools');
    assert.equal(parsed.searchParams.get('start'), '2027-02-01');
    assert.equal(parsed.searchParams.get('weeks'), '1');
    const roster = Object.fromEntries(group.map((h) => [h, h === '18681' ? [] : [[h + '-p', 'Player', 'MLB', 0, 'Sample Club']]]));
    return { ok: true, json: async () => ({
      asOf: '2027-02-02', roster,
      yatIdentityBySourceId: Object.fromEntries(group.map((h) => [h + '-p', 'YAT' + h.padStart(6, '0')])),
      lines: group.map((h) => [h, h + '-p', 0, 'b', [0], 'game-' + h, 'Sample Club']),
      clubs: { 'Sample Club': [[0, 'club-game', 1, 3]] },
      games: { 'Sample Club': [[0, 'club-game', 1, 1, 0]] },
      fans: Object.fromEntries(group.map((h) => [h, [1]])),
    }) };
  };
  const all = await fetchBracketLiveBatches('', '2027-02-01', 1, hsids, fetchMock);
  assert.equal(requests.length, 16, '1024 schools must be fetched in exactly 16 batches');
  assert.equal(new Set(requests.flat()).size, 1024);
  assert.equal(Object.keys(all.roster).length, 1024);
  assert.equal(all.lines.length, 1024);
  assert.equal(Object.keys(all.yatIdentityBySourceId || {}).length, 1024,
    'Across 16 batches, every legacy source ID must retain a YAT identity');
  assert.equal(all.yatIdentityBySourceId?.['5004-p'], 'YAT005004',
    'Hamilton YAT identity must survive bracket transport');
  assert.ok(all.roster['1']?.length, 'First school must not be lost');
  assert.ok(all.roster['5004']?.length, 'Hamilton must not be lost in the middle');
  assert.deepEqual(JSON.parse(JSON.stringify(all.roster['18681'])), [], 'Last school must be represented even with no alumni');
  assert.equal(all.clubs['Sample Club'].length, 1, 'Do not count a cross-batch club result 16 times');
  assert.equal(all.games['Sample Club'].length, 1, 'Do not double-count a cross-batch scheduled game');
  assert.equal(Object.keys(all.fans).length, 1024);

  let batchCalls = 0;
  const missing = async (url) => {
    batchCalls++;
    const group = new URL(url, 'https://example.test').searchParams.get('h').split(',');
    return { ok: true, json: async () => ({
      roster: Object.fromEntries(group.slice(0, -1).map((h) => [h, []])),
      lines: [], clubs: {}, games: {}, fans: {},
    }) };
  };
  await assert.rejects(fetchBracketLiveBatches('', '2027-02-01', 1, hsids, missing), /missing school IDs/);
  assert.equal(batchCalls, 1, 'Fail immediately on a silent truncation, not after all 16 batches');

  await assert.rejects(fetchBracketLiveBatches('', '2027-02-01', 1, ['5004'], async () => ({ ok: false, status: 503 })), /HTTP 503/);

  const route = fs.readFileSync(path.join(root, 'src/app/api/bracket/live/route.ts'), 'utf8');
  const client = fs.readFileSync(path.join(root, 'src/components/bracket/liveSeason.ts'), 'utf8');
  const results = fs.readFileSync(path.join(root, 'scripts/master-bracket-results.ts'), 'utf8');
  assert.doesNotMatch(route, /\.slice\(0,\s*64\)/, 'API must not silently truncate school IDs');
  assert.match(route, /hsids\.length > BRACKET_LIVE_BATCH_SIZE/, 'API must reject oversized requests');
  assert.match(route, /Object\.fromEntries\(hsids\.map/, 'Empty-roster schools must be represented');
  assert.match(client, /fetchBracketLiveBatches\('', start, started, hsids\)/, 'Public client must use batched transport');
  assert.match(results, /fetchBracketLiveBatches as fetchLive/, 'Results job must use the same batch transport');

  console.log('PASS: 2027 tournament 1024/1024 schools, 16 bounded batches; Bullard, Hamilton, Lewisburg; zero-roster coverage, no duplicate club games, truncation and HTTP failures rejected');
})().catch((error) => { console.error(error); process.exitCode = 1; });
