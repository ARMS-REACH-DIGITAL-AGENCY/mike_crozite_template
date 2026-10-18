const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = process.env.SEARCH_TEST_ROOT || path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'src/app/api/schools/search/route.ts'), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
function compile(code, mocks = {}) {
  const exports = {};
  const js = ts.transpileModule(code, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021,
  } }).outputText;
  vm.runInNewContext(js, { exports, URL, Map, Set, console: { warn: () => {} },
    require: name => { assert.ok(name in mocks, `Unexpected dependency: ${name}`); return mocks[name]; },
  }, { filename: 'school-search-contract.js' });
  return exports;
}
const routingSource = fs.readFileSync(process.env.SEARCH_ROUTING_SOURCE ||
  path.join(root, 'src/lib/schoolDirectoryRouting.ts'), 'utf8');
const { PLAYER_LINKED_SCHOOLS_CTE } = compile(routingSource);
assert.ok(PLAYER_LINKED_SCHOOLS_CTE, 'Search and hostname routing must share player-linked eligibility.');
const { ACTIVE_GALLERY_STATUSES } = compile(fs.readFileSync(path.join(root, 'src/lib/galleryStatuses.ts'), 'utf8'));
assert.ok(ACTIVE_GALLERY_STATUSES.includes('UNKNOWN'), 'Preserve the gallery count definition.');

function loadRoute(rows = [], { matches = [], failUrls = false } = {}) {
  const calls = [], urlCalls = [];
  class NextResponse {
    constructor(body, init = {}) { Object.assign(this, { body }, init); }
    static json(body, init = {}) { return { body, ...init }; }
  }
  const route = compile(source, {
    'next/server': { NextResponse },
    '@/lib/db': { query: async (sql, params = []) => {
      calls.push({ sql, params: plain(params) });
      return { rows: structuredClone(sql.includes('lower(trim(hsname)) = ANY') ? matches : rows) };
    } },
    '@/lib/galleryStatuses': { ACTIVE_GALLERY_STATUSES },
    '@/lib/schoolDirectoryRouting': { PLAYER_LINKED_SCHOOLS_CTE,
      canonicalSchoolUrls: async ids => {
        urlCalls.push(plain(ids));
        if (failUrls) throw new Error('Simulated URL lookup failure');
        return new Map([...ids.filter(id => /^\d+$/.test(id)).map(id => [id, `https://canonical-${id}.az.yatstats.com`]),
          ['999999', 'https://not-a-search-result.az.yatstats.com']]);
      } },
  });
  return { ...route, calls, urlCalls };
}
const request = suffix => ({ url: `https://preview.example/api/schools/search?${suffix}`,
  headers: new Headers({ origin: 'https://yatstats.com' }) });
const compact = sql => sql.replace(/--[^\n]*/g, '').replace(/\s+/g, ' ').trim();
const literal = value => value === null ? 'NULL' : Array.isArray(value) ? `ARRAY[${value.map(literal).join(',')}]`
  : typeof value === 'number' ? String(value) : `'${String(value).replace(/'/g, "''")}'`;

// SQL fixtures shadow all production tables with read-only VALUES CTEs. Run
// --emit-fixture-sql through a PostgreSQL read-only runner to test real SQL,
// including player-link exclusions, null-ID identities and actual ordering.
const fixtureTables = `
  school_success(hsid,hsname,high_school,cityname,hslocation,regionid,yatstats_national_rank,yatstats_state_rank,mlb,atnla,drafted_hs,drafted,microsite_url,bracket_seeding) AS (VALUES
    (1,'Arizona Academy','Arizona Academy','Alpha','Alpha,AZ','AZ',3,3,1,4,1,2,NULL::text,NULL::int),
    (2,'Hamilton','Hamilton High','Chandler','Chandler,AZ','AZ',1,1,2,2,2,3,'https://hamilton.az.yatstats.com',12),
    (3,'Canyon','Canyon','Delta','Delta,CA','CA',2,1,0,1,0,0,NULL,NULL),
    (4,'Arizona Outpost','Arizona Outpost','Other','Other,CA','CA',NULL,NULL,0,1,0,0,NULL,NULL),
    (NULL,'Legacy Match','Legacy Match','','Mesa,AZ','AZ',4,4,0,1,1,1,NULL,NULL)),
  tbc_schools_raw(hsid,hsname,cityname,hslocation,regionid,hs_lookup_key) AS (VALUES
    (1,'Arizona Academy','Alpha','Alpha,AZ','AZ','Arizona Academy Alpha AZ'),
    (2,'Hamilton','Chandler','Chandler,AZ','AZ','Hamilton Chandler AZ'),
    (3,'Canyon','Delta','Delta,CA','CA','Canyon Delta CA'),
    (4,'Arizona Outpost','Other','Other,CA','CA','Arizona Outpost Other CA'),
    (10,'TNXL Academy','Orlando','Orlando,fl','fl','TNXL Academy Orlando FL'),
    (11,'Arizona Newcomer','Phoenix','Phoenix,az','az','Arizona Newcomer Phoenix AZ'),
    (12,'Unlinked School','Mesa','Mesa,AZ','AZ','Unlinked School Mesa AZ'),
    (13,'Excluded School','Mesa','Mesa,AZ','AZ','Excluded School Mesa AZ'),
    (14,'Legacy Match','Mesa','Mesa,az','az','Legacy Match Mesa AZ'),
    (15,'Empty Stage School','Mesa','Mesa,AZ','AZ','Empty Stage School Mesa AZ')),
  tbc_players_raw(playerid,high_school) AS (
    SELECT hsid * 100, REPLACE(hs_lookup_key,' ','.') FROM tbc_schools_raw WHERE hsid <> 12),
  player_hsid_exclusion(playerid,hsid) AS (VALUES (1300,'13'::text)),
  flip_card_front_stage(hsid,playerid,status_label,level_label) AS (VALUES
    ('1',101,'ACTIVE','NCAA-D1'),('1',101,'ACTIVE','NCAA-D1'),('1',102,NULL,'NCAA-D1'),
    ('1',103,'RETIRED','MLB'),('1',104,'INJURED 7-DAY','MiLB'),
    ('2',201,'ACTIVE','MLB'),('2',202,'UNKNOWN','NCAA-D1'),('3',301,'ACTIVE','NCAA-D1'),('4',401,'ACTIVE','NCAA-D1'),
    ('10',1001,'','NCAA-D1'),('11',1101,'ACTIVE','NCAA-D1'),('11',1102,'INJURED 7-DAY','MiLB'),
    ('11',1103,'RETIRED','MLB'),('11',1104,'ACTIVE','HS'),('13',1301,'ACTIVE','NCAA-D1'),('14',1401,'ACTIVE','NCAA-D1'))`;
function fixtureQuery(call, expectedIds, expectedCounts) {
  const sql = call.sql.replace(/\bpublic\./g, '').replace(/;\s*$/, '')
    .replace(/\$(\d+)\b/g, (_, index) => literal(call.params[Number(index) - 1]));
  return `WITH ${fixtureTables}, result_rows AS (${sql}), result AS (
    SELECT jsonb_agg(hsid) AS actual_ids,jsonb_agg(current_aa) AS actual_counts,
      jsonb_agg(to_jsonb(result_rows)) AS programs FROM result_rows)
    SELECT ${literal(JSON.stringify(expectedIds))}::jsonb AS expected_ids,
      ${literal(JSON.stringify(expectedCounts))}::jsonb AS expected_counts, result.* FROM result`;
}

(async () => {
  const queries = new Map();
  const cases = [
    ['', ['', '%%', '', '', '%%', ACTIVE_GALLERY_STATUSES], 25],
    ['q=Ar', ['AR', 'Ar%', ACTIVE_GALLERY_STATUSES], 2000],
    ...['Ari','Ariz','Arizo','Arizon'].map(q => [`q=${q}`, [q,`%${q}%`,'','','%%',ACTIVE_GALLERY_STATUSES],25]),
    ['q=Arizona', ['AZ','Arizona%',ACTIVE_GALLERY_STATUSES],2000],
    ['q=AZ&limit=2', ['AZ','AZ%',ACTIVE_GALLERY_STATUSES],2000],
    ['q=TNXL&limit=50', ['TNXL','%TNXL%','','','%%',ACTIVE_GALLERY_STATUSES],50],
    ['q=Arizona&state=AZ&limit=50', ['Arizona','%Arizona%','AZ','','%%',ACTIVE_GALLERY_STATUSES],50],
    ['state=AZ&city=Mesa&limit=50', ['','%%','AZ','Mesa','%Mesa%',ACTIVE_GALLERY_STATUSES],50],
    ['q=Academy&limit=50', ['Academy','%Academy%','','','%%',ACTIVE_GALLERY_STATUSES],50],
    ['limit=999', ['','%%','','','%%',ACTIVE_GALLERY_STATUSES],50],
    ['limit=0', ['','%%','','','%%',ACTIVE_GALLERY_STATUSES],1],
  ];
  for (const [suffix, expectedParams, limit] of cases) {
    const route = loadRoute();
    assert.equal((await route.GET(request(suffix))).status,200,suffix);
    assert.equal(route.calls.length,1,suffix);
    const call = route.calls[0], sql = compact(call.sql);
    assert.deepEqual(call.params,plain(expectedParams),`Matching parameters changed: ${suffix}`);
    assert.match(sql,new RegExp(`LIMIT ${limit};?$`));
    assert.match(sql,/UNION ALL SELECT t\.hsid/);
    assert.match(sql,/JOIN player_linked_schools p ON p\.hsid = t\.hsid/);
    assert.match(sql,/NOT EXISTS \(SELECT 1 FROM public\.school_success s WHERE s\.hsid = t\.hsid\)/);
    assert.match(sql,/FROM unassigned_directory_identities s WHERE s\.name_key/);
    assert.ok(!sql.includes('FROM public.player_hsids'),'No per-result player_hsids view scans.');
    if (expectedParams.length === 6) {
      assert.match(sql,/WHERE \(\$1::text = '' OR \( hsname ILIKE \$2 OR high_school ILIKE \$2 \)\) AND \(\$3::text = '' OR regionid = \$3\) AND \(\$4::text = '' OR cityname ILIKE \$5\)/);
      assert.match(sql,/ORDER BY regionid ASC NULLS LAST, yatstats_national_rank ASC NULLS LAST, hsname ASC NULLS LAST/);
      assert.match(sql,/COUNT\(DISTINCT f\.playerid\)::int FROM flip_card_front_stage f WHERE f\.hsid = school_success\.hsid::text AND COALESCE\(NULLIF\(UPPER\(TRIM\(f\.status_label\)\), ''\), 'UNKNOWN'\) = ANY\(\$6::text\[\]\)/);
    } else {
      assert.match(sql,/matching_schools AS MATERIALIZED \( SELECT \* FROM school_directory s WHERE s\.regionid = \$1 OR s\.hsname ILIKE \$2 OR s\.high_school ILIKE \$2 \)/);
      assert.match(sql,/ORDER BY \(s\.hsname ILIKE \$2 OR s\.high_school ILIKE \$2\) DESC, COALESCE\(c\.current_aa, 0\) DESC, COALESCE\(c\.all_time, 0\) DESC, s\.drafted_hs DESC NULLS LAST, s\.drafted DESC NULLS LAST, s\.hsname ASC NULLS LAST/);
      assert.match(sql,/NOT IN \('HIGH SCHOOL', 'HS'\)/);
    }
    queries.set(suffix,call);
  }
  const rows = [
    {hsid:5004,hsname:'Hamilton',cityname:'Chandler',regionid:'AZ',current_aa:42,microsite_url:'https://hamilton.az.yatstats.com',bracket_seeding:12},
    {hsid:600,hsname:'New school',cityname:'Town',regionid:'AZ',current_aa:0,microsite_url:'malformed-old-url',bracket_seeding:null},
    {hsid:null,hsname:'Resolved Legacy',cityname:'',hslocation:'Mesa,AZ',regionid:'AZ',current_aa:0},
    {hsid:null,hsname:'Ambiguous',cityname:'Town',regionid:'AZ',current_aa:0},
  ];
  const matches = [{hsid:701,hsname:'Resolved Legacy',cityname:'Mesa',regionid:'AZ'},
    {hsid:702,hsname:'Ambiguous',cityname:'Town',regionid:'AZ'}, {hsid:703,hsname:'Ambiguous',cityname:'Town',regionid:'AZ'}];
  for (const failUrls of [false,true]) {
    const route=loadRoute(rows,{matches,failUrls}),after=await route.GET(request('q=School'));
    const programs=plain(after.body.programs);
    assert.equal(programs.length,rows.length,'URL enrichment cannot append/truncate results.');
    assert.deepEqual(programs.map(p=>p.hsname),rows.map(r=>r.hsname),'URL enrichment cannot reorder.');
    assert.deepEqual(programs.map(p=>p.current_aa),[42,0,0,0],'Retain original gallery counts.');
    assert.deepEqual(programs.map(p=>p.hsid),[5004,600,'701',null],'Do not invent ambiguous IDs.');
    assert.deepEqual(route.urlCalls[0],['5004','600','701',''],'Revalidate stored URLs as well as missing ones.');
    assert.equal(programs[0].bracket_eligible,true);
    assert.equal(programs[1].bracket_eligible,false,'A new URL does not grant a tournament berth.');
    assert.equal(programs[1].microsite_url,failUrls?'malformed-old-url':'https://canonical-600.az.yatstats.com');
    assert.equal(programs[2].microsite_url,failUrls?null:'https://canonical-701.az.yatstats.com');
    assert.equal(programs[3].microsite_url,null);
    assert.equal(after.headers['Access-Control-Allow-Origin'],'https://yatstats.com');
    assert.equal(after.headers['Cache-Control'],'no-store');
  }
  const direct=loadRoute([{hsid:5004,hsname:'Hamilton'}]);
  await direct.GET(request('hsid=5004'));
  assert.match(compact(direct.calls[0].sql),/^SELECT hsid, hsname, hslocation, regionid, cityname FROM tbc_schools_raw WHERE hsid = \$1::integer LIMIT 1$/);
  assert.deepEqual(direct.calls[0].params,['5004']);
  assert.equal(direct.urlCalls.length,0,'Keep the contribution school-crest lookup contract.');
  assert.equal((await direct.OPTIONS(request(''))).status,204);

  // Expected order and counts are fixed independently of the implementation.
  // In all/state results, removing new IDs 10/11/15 reproduces the old directory.
  const fixtures = [
    ['limit=999',[2,1,null,11,15,3,4,10],[2,3,0,3,0,1,1,1]],
    ['q=Arizona',[1,11,4,2,null,15],[3,3,1,2,0,0]],
    ['q=TNXL&limit=50',[10],[1]],
    ['q=Arizona&state=AZ&limit=50',[1,11],[3,3]],
    ['state=AZ&city=Mesa&limit=50',[15],[0]],
    ['q=Academy&limit=50',[1,10],[3,1]],
  ];
  const sqlSuite=fixtures.map(([key,ids,counts])=>`SELECT ${literal(key)} AS test_case,r.* FROM (${fixtureQuery(queries.get(key),ids,counts)}) r`).join('\nUNION ALL\n');
  if(process.argv.includes('--emit-fixture-sql')) { process.stdout.write(`${sqlSuite};\n`); return; }
  if(process.env.SEARCH_TEST_DATABASE_URL) {
    const {Client}=require('pg'),client=new Client({connectionString:process.env.SEARCH_TEST_DATABASE_URL});
    await client.connect();
    try {
      const {rows:results}=await client.query(sqlSuite);
      for(const r of results) {
        assert.deepEqual(r.actual_ids,r.expected_ids,`${r.test_case}: matching/order/dedup`);
        assert.deepEqual(r.actual_counts,r.expected_counts,`${r.test_case}: distinct ACTIVE/injured/UNKNOWN counts`);
      }
      console.log(`PASS: ${fixtures.length} PostgreSQL fixture comparisons: original rows preserved, only eligible new schools, null-ID dedup, exclusions, sorting and zero-stage counts.`);
    } finally {await client.end();}
  } else console.log('PostgreSQL fixtures prepared; use --emit-fixture-sql or SEARCH_TEST_DATABASE_URL to execute them.');
  console.log(`PASS: ${cases.length} query contracts, ID resolution, legacy URL correction, failure fallback, bracket isolation, CORS and crest lookup.`);
})().catch(error=>{console.error(error);process.exitCode=1;});
