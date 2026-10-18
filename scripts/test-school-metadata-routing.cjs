const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
function compile(file, dependencies, extras = {}) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021,
    jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  const exports = {};
  vm.runInNewContext(compiled, { exports, URL, URLSearchParams, Map, Set,
    global: {}, process: { env: {}, on() {} }, console: { warn() {}, error() {} },
    require(name) {
      assert.ok(name in dependencies, `Unexpected dependency: ${name}`);
      return dependencies[name];
    }, ...extras,
  }, { filename: file });
  return exports;
}

function loadDatabase({ directory = {}, raw = {}, urls = {}, resolved = {}, eligibleRawIds = ['15563'], failUrls = false, failHost = false } = {}) {
  const calls = [];
  const api = compile('src/lib/db.ts', {
    react: { cache: fn => fn },
    'next/cache': { unstable_cache: fn => fn },
    '@/lib/galleryStatuses': { ACTIVE_GALLERY_STATUSES: ['ACTIVE', 'UNKNOWN'] },
    '@/lib/mlbFranchise': { currentFranchiseSql: column => column },
    'server-only': {},
    pg: { Pool: class {
      async query(sql, params) {
        calls.push({ sql, params });
        if (sql.includes('SELECT * FROM school_success WHERE hsid')) {
          return { rows: directory[params[0]] ? [directory[params[0]]] : [] };
        }
        if (sql.includes('FROM public.tbc_schools_raw t')) {
          assert.ok(sql.includes('JOIN player_linked_schools p ON p.hsid = t.hsid'),
            'Raw-only school metadata requires independently verified player eligibility.');
          return { rows: eligibleRawIds.includes(params[0]) && raw[params[0]] ? [raw[params[0]]] : [] };
        }
        throw new Error('Unexpected legacy URL lookup: ' + sql);
      }
    } },
    '@/lib/schoolDirectoryRouting': {
      PLAYER_LINKED_SCHOOLS_CTE: 'player_linked_schools AS (SELECT hsid FROM eligibility_fixture)',
      canonicalSchoolUrls: async ids => {
        if (failUrls) throw new Error('Temporary URL lookup failure');
        return new Map(ids.filter(id => urls[id]).map(id => [id, urls[id]]));
      },
      schoolHostnamePattern: host => /^[a-z0-9.-]+\.yatstats\.com$/.test(host) ? {} : null,
      resolveSchoolHsidFromHost: async host => {
        if (failHost) throw new Error('Temporary hostname lookup failure');
        return resolved[host] || null;
      },
    },
  });
  return { ...api, calls };
}

(async () => {
  const directory = {
    5004: { hsid: 5004, hsname: 'Hamilton', microsite_url: 'https://hamilton.az.yatstats.com' },
    1309: { hsid: 1309, hsname: 'Centennial', microsite_url: 'https://centennial.ca.yatstats.com' },
  };
  const raw = {
    15563: { hsid: 15563, hsname: 'TNXL Academy', microsite_url: null },
    999999: { hsid: 999999, hsname: 'Reference record without players', microsite_url: null },
  };
  const urls = {
    5004: 'https://hamilton.az.yatstats.com',
    1309: 'https://centennial.ca.corona.yatstats.com',
    15563: 'https://tnxl-academy.fl.yatstats.com',
  };
  const db = loadDatabase({ directory, raw, urls, resolved: {
    '5004.yatstats.com': '5004',
    'tnxl-academy.fl.yatstats.com': '15563',
  } });
  assert.equal((await db.getSchoolByHsid('1309')).microsite_url, urls[1309], 'Replace an ambiguous stored address in page metadata.');
  const newSchool = await db.getSchoolByHsid('15563');
  assert.equal(newSchool.microsite_url, urls[15563], 'Raw-only hubs share the official search URL.');
  assert.equal(await db.getSchoolByHsid('999999'), null, 'A reference record without linked players is not a hub.');
  assert.equal(await db.getSchoolByHsid('not-an-id'), null);
  assert.equal((await db.getSchoolByUrl('https://5004.yatstats.com')).hsid, 5004, 'Numeric hostname must use the HSID resolver, not legacy staging metadata.');
  assert.equal((await db.getSchoolByUrl('tnxl-academy.fl.yatstats.com')).hsid, 15563);
  assert.equal(await db.getSchoolByUrl('centennial.ca.yatstats.com'), null, 'Ambiguous named address must not choose an arbitrary directory row.');
  const failed = loadDatabase({ directory, raw, failUrls: true });
  assert.equal((await failed.getSchoolByHsid('5004')).hsid, 5004, 'A transient URL failure must not hide an existing school.');
  assert.equal((await failed.getSchoolByHsid('15563')).hsid, 15563, 'A transient URL failure must not hide an eligible raw-only numeric microsite.');
  assert.equal(await failed.getSchoolByHsid('999999'), null, 'Failure must not publish unverified raw-only schools.');
  const hostFailed = loadDatabase({ directory, failHost: true });
  assert.equal(await hostFailed.getSchoolByUrl('https://5004.yatstats.com'), null,
    'A hostname lookup error must not escape and discard a caller’s successful numeric lookup.');

  const { getCanonicalBaseUrl } = compile('src/lib/canonicalUrl.ts', {});
  assert.equal(getCanonicalBaseUrl(newSchool, '15563'), urls[15563]);
  assert.equal(getCanonicalBaseUrl(null, '15563'), 'https://15563.yatstats.com', 'Fallback must use the working numeric host.');

  const dependencies = { react: { useEffect() {} }, 'react/jsx-runtime': {}, '@/lib/analytics': { track() {} } };
  const preview = compile('src/components/yatstats/SearchDrawerTabs.tsx', dependencies,
    { window: { location: { hostname: 'review-build.vercel.app' } } });
  const production = compile('src/components/yatstats/SearchDrawerTabs.tsx', dependencies,
    { window: { location: { hostname: 'hamilton.az.yatstats.com' } } });
  const row = { hsid: '15563', hsname: 'TNXL Academy', microsite_url: urls[15563], current_aa: 98, bracket_eligible: false };
  const previewHtml = preview.renderSchoolRows([row], '', true);
  assert.ok(previewHtml.includes('href="/15563"'), 'Preview searches must stay on the reviewed build.');
  assert.ok(!previewHtml.includes('yat-search-school-bracket-link'), 'Activating a URL does not grant a tournament berth.');
  assert.ok(production.renderSchoolRows([row], '', true).includes(`href="${urls[15563]}"`), 'Production navigation uses the official hostname.');
  console.log('PASS: canonical metadata, raw-only eligibility, numeric identity, ambiguous-host rejection, URL failure handling, and preview/production navigation.');
})().catch(error => { console.error(error); process.exitCode = 1; });
