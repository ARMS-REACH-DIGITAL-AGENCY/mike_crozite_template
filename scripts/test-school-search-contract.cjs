const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');
const ts = require('typescript');

const root = process.env.SEARCH_TEST_ROOT || path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'src/app/api/schools/search/route.ts'), 'utf8');
// This is the production source approved by Pete, before URL activation.
// Removing ONLY the enumerated link metadata additions must recover it exactly.
const baseline = source
  .replace('import { canonicalSchoolUrls } from "@/lib/schoolDirectoryRouting";\n', '')
  .replace('s.microsite_url, s.bracket_seeding\n', 's.microsite_url\n')
  .replace('        microsite_url,\n        bracket_seeding\n', '        microsite_url\n')
  .replace(/    \/\/ URL-ONLY ENRICHMENT START\.[\s\S]*?    \/\/ URL-ONLY ENRICHMENT END\.\n/, '')
  .replace("      microsite_url: derivedUrls.get(String(r.hsid || '')) || r.microsite_url || null,", '      microsite_url: r.microsite_url ?? null,')
  .replace('      bracket_eligible: Boolean(r.bracket_seeding),\n', '');
const bytes = Buffer.from(baseline);
const blobSha = crypto.createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
assert.equal(blobSha, '97af0a3dda034bbadd7550cbc15d7fdf993a28d0',
  'Only URL/availability metadata may change: matching, ordering, limits and counts must remain production-exact.');

function loadRoute(code, rows, failUrls = false) {
  const calls = [];
  const out = { exports: {} };
  const compiled = ts.transpileModule(code, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021,
  } }).outputText;
  const mocks = {
    'next/server': { NextResponse: { json: (body, init = {}) => ({ body, ...init }) } },
    '@/lib/db': { query: async (sql, params) => {
      calls.push({ sql: sql.replace('s.microsite_url, s.bracket_seeding', 's.microsite_url')
        .replace('        microsite_url,\n        bracket_seeding', '        microsite_url'), params });
      return { rows: structuredClone(rows) };
    } },
    '@/lib/galleryStatuses': { ACTIVE_GALLERY_STATUSES: ['ACTIVE', 'INJURED'] },
    '@/lib/schoolDirectoryRouting': { canonicalSchoolUrls: async (ids) => {
      if (failUrls) throw new Error('Simulated URL lookup failure');
      return new Map([...ids.map(id => [id, `https://test-${id}.az.yatstats.com`]),
        ['999999', 'https://not-a-search-result.az.yatstats.com']]);
    } },
  };
  vm.runInNewContext(compiled, { exports: out.exports, URL, Map, Set,
    console: { warn: () => {} }, require: (name) => {
      assert.ok(name in mocks, `Unexpected dependency: ${name}`);
      return mocks[name];
    } }, { filename: 'school-search-route.js' });
  return { get: out.exports.GET, calls };
}
const plain = value => JSON.parse(JSON.stringify(value));
const withoutLinks = programs => plain(programs).map(({ microsite_url, bracket_eligible, ...row }) => row);

(async () => {
  const rows = Array.from({ length: 65 }, (_, i) => ({ hsid: 100 + i,
    hsname: `School ${i}`, hslocation: 'City,AZ', regionid: 'AZ',
    current_aa: 74 - i, mlb: i % 4, atnla: 90 - i, drafted_hs: i % 3,
    drafted: i % 7, bracket_seeding: i === 2 ? 12 : null,
    microsite_url: i === 0 ? 'https://existing.az.yatstats.com/' : '',
  }));
  const cases = ['Ar', 'Ari', 'Ariz', 'Arizo', 'Arizon', 'Arizona', 'AZ', 'Hamilton', ''];
  let passed = 0;
  for (const q of cases) {
    for (const failUrls of [false, true]) {
      const oldRoute = loadRoute(baseline, rows);
      const newRoute = loadRoute(source, rows, failUrls);
      const req = { url: `https://preview.example/api/schools/search?q=${encodeURIComponent(q)}&limit=30`, headers: new Headers() };
      const before = await oldRoute.get(req);
      const after = await newRoute.get(req);
      assert.equal(after.status, 200, q);
      assert.deepEqual(plain(newRoute.calls), plain(oldRoute.calls), `SQL/parameters changed for ${q}`);
      assert.deepEqual(withoutLinks(after.body.programs), withoutLinks(before.body.programs), `Results/counts/order changed for ${q}`);
      assert.equal(after.body.programs.length, 65, 'Do not truncate or append result rows during URL activation.');
      assert.equal(after.body.programs[0].microsite_url, rows[0].microsite_url, 'Preserve existing URLs.');
      assert.equal(after.body.programs[2].bracket_eligible, true);
      assert.equal(after.body.programs[1].bracket_eligible, false, 'A new URL does not grant a tournament berth.');
      if (!failUrls) assert.equal(after.body.programs[1].microsite_url, 'https://test-101.az.yatstats.com');
      passed++;
    }
  }
  for (const suffix of ['state=AZ&city=Chandler', 'q=Arizona&state=AZ', 'hsid=5004']) {
    const oldRoute = loadRoute(baseline, rows), newRoute = loadRoute(source, rows);
    const req = { url: `https://preview.example/api/schools/search?${suffix}`, headers: new Headers() };
    const before = await oldRoute.get(req), after = await newRoute.get(req);
    assert.deepEqual(plain(newRoute.calls), plain(oldRoute.calls));
    assert.deepEqual(withoutLinks(after.body.programs), withoutLinks(before.body.programs));
    passed++;
  }
  console.log(`PASS: production source hash and ${passed} search-contract cases; only links/availability differ.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
