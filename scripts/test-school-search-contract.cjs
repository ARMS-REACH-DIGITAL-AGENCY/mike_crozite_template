const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = process.env.SEARCH_TEST_ROOT || path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'src/app/api/schools/search/route.ts'), 'utf8');
// The user explicitly corrected Active membership to actual 2026 evidence.
// Keep the approved search matching/ranking/limits and independent URL
// enrichment contract while allowing the intended count/coverage change.
const helper = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root, 'src/lib/activeAlumni.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 },
}).outputText, { exports: helper.exports });

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
    '@/lib/activeAlumni': helper.exports,
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
    active_stats_pending: i === 3, current_aa: i === 3 ? 0 : 74 - i, mlb: i % 4, atnla: 90 - i, drafted_hs: i % 3,
    drafted: i % 7, bracket_seeding: i === 2 ? 12 : null,
    microsite_url: i === 0 ? 'https://existing.az.yatstats.com/' : '',
  }));
  const cases = ['Ar', 'Ari', 'Ariz', 'Arizo', 'Arizon', 'Arizona', 'AZ', 'Hamilton', ''];
  let passed = 0;
  for (const q of cases) {
    for (const failUrls of [false, true]) {
      const newRoute = loadRoute(source, rows, failUrls);
      const req = { url: `https://preview.example/api/schools/search?q=${encodeURIComponent(q)}&limit=30`, headers: new Headers() };
      const after = await newRoute.get(req);
      assert.equal(after.status, 200, q);
      assert.deepEqual(after.body.programs.map(row => row.hsid), rows.map(row => row.hsid), `Enrichment must not change result order for ${q}`);
      assert.deepEqual(after.body.programs.map(row => row.current_aa), rows.map(row => row.current_aa));
      assert.deepEqual(after.body.programs.map(row => row.active_stats_pending), rows.map(row => row.active_stats_pending === true));
      const sql = newRoute.calls[0].sql;
      if (q === 'Arizona' || q === 'AZ' || q === 'Ar') {
        assert.deepEqual(plain(newRoute.calls[0].params), [q === 'Ar' ? 'AR' : 'AZ', `${q}%`]);
        assert.match(sql, /regionid = \$1 OR hsname ILIKE \$2 OR high_school ILIKE \$2/);
        assert.match(sql, /LIMIT 2000/);
        assert.match(sql, /ORDER BY \(s\.hsname ILIKE \$2 OR s\.high_school ILIKE \$2\) DESC,[\s\S]*current_aa[\s\S]*all_time[\s\S]*drafted_hs[\s\S]*drafted[\s\S]*hsname ASC/);
      } else {
        assert.deepEqual(plain(newRoute.calls[0].params), [q, `%${q}%`, '', '', '%%']);
        assert.match(sql, /LIMIT 30/);
        assert.match(sql, /ORDER BY regionid ASC NULLS LAST,[\s\S]*yatstats_national_rank ASC NULLS LAST,[\s\S]*hsname ASC NULLS LAST/);
      }
      assert.match(sql, /tbc_batting_2026_season_raw/);
      assert.match(sql, /player_game_logs/);
      assert.doesNotMatch(sql, /status_label[^]*?ANY\(\$/);
      assert.equal(after.body.programs.length, 65, 'Do not truncate or append result rows during URL activation.');
      assert.equal(after.body.programs[0].microsite_url, rows[0].microsite_url, 'Preserve existing URLs.');
      assert.equal(after.body.programs[2].bracket_eligible, true);
      assert.equal(after.body.programs[1].bracket_eligible, false, 'A new URL does not grant a tournament berth.');
      if (!failUrls) assert.equal(after.body.programs[1].microsite_url, 'https://test-101.az.yatstats.com');
      passed++;
    }
  }
  for (const suffix of ['state=AZ&city=Chandler', 'q=Arizona&state=AZ', 'hsid=5004']) {
    const newRoute = loadRoute(source, rows);
    const req = { url: `https://preview.example/api/schools/search?${suffix}`, headers: new Headers() };
    const after = await newRoute.get(req);
    assert.equal(after.body.programs.length, 65);
    assert.deepEqual(after.body.programs.map(row => row.hsid), rows.map(row => row.hsid));
    if (suffix === 'hsid=5004') {
      assert.match(newRoute.calls[0].sql, /FROM tbc_schools_raw WHERE hsid = \$1::integer LIMIT 1/);
    } else {
      assert.match(newRoute.calls[0].sql, /\$3::text = '' OR regionid = \$3/);
      assert.match(newRoute.calls[0].sql, /\$4::text = '' OR cityname ILIKE \$5/);
      assert.doesNotMatch(newRoute.calls[0].sql, /LIMIT 2000/);
    }
    passed++;
  }
  console.log(`PASS: ${passed} search-contract cases preserve matching, ranking, state limits, zero/pending schools, URLs and bracket eligibility with corrected 2026 membership.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
