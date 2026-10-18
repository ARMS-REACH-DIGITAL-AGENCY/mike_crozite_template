const assert = require('node:assert/strict');
const path = require('node:path');

// Node 24 (the routing workflow's runtime) can load this pure TypeScript module
// directly; these regression tests need no database credentials or npm install.
const root = process.env.SCHOOL_ROUTING_TEST_ROOT || path.resolve(__dirname, '..');
const routing = require(path.join(root, 'src/lib/schoolDirectoryRouting.ts'));

function fixtureQuery(masters, directory, linkedIds = masters.map(s => String(s.hsid))) {
  const linked = new Set(linkedIds.map(String));
  const calls = [];
  const slug = value => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'school';
  const citySlug = value => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const region = school => String(school.regionid).trim().toUpperCase();
  // Model the legacy-host SQL's strict syntax, separately from the helper.
  const storedHost = value => {
    const host = String(value || '').trim().replace(/^https?:\/\//i, '').replace(/\/+$/g, '').toLowerCase();
    return /^[a-z0-9]+(-[a-z0-9]+)*\.[a-z]{2}(\.[a-z0-9]+(-[a-z0-9]+)*)?\.yatstats\.com$/.test(host) &&
      host.split('.')[0].length <= 63 && host.split('.')[2].length <= 63 ? host : '';
  };
  const legacy = directory.map(s => ({ hsid: String(s.hsid), hostname: storedHost(s.microsite_url) }))
    .filter(s => s.hostname);
  const run = async (sql, params = []) => {
    calls.push({ sql, params });
    if (sql.includes('/* school-canonical-candidates */')) {
      return { rows: masters.filter(s => linked.has(String(s.hsid)) && params[0].includes(String(s.hsid))).map(s => {
        const entry = directory.find(d => String(d.hsid) === String(s.hsid));
        const hostname = storedHost(entry?.microsite_url);
        return {
          hsid: String(s.hsid), regionid: s.regionid, cityname: s.cityname,
          name_slug: slug(s.hsname), city_slug: citySlug(s.cityname),
          existing: entry?.microsite_url || null,
          same_state_name_count: masters.filter(other => region(other) === region(s) && slug(other.hsname) === slug(s.hsname)).length,
          same_state_city_count: masters.filter(other => region(other) === region(s) &&
            slug(other.hsname) === slug(s.hsname) && citySlug(other.cityname) === citySlug(s.cityname)).length,
          existing_host_count: hostname ? new Set(legacy.filter(d => d.hostname === hostname).map(d => d.hsid)).size : 0,
        };
      }) };
    }
    if (sql.includes('/* school-reserved-hosts */')) {
      return { rows: [
        ...legacy.map(s => ({ hostname: s.hostname, source: 'legacy' })),
        ...masters.map(s => ({ hostname: `${slug(s.hsname)}.${region(s).toLowerCase()}.yatstats.com`, source: 'master' })),
        ...masters.filter(s => citySlug(s.cityname)).map(s => ({
          hostname: `${slug(s.hsname)}.${region(s).toLowerCase()}.${citySlug(s.cityname)}.yatstats.com`, source: 'master',
        })),
      ].filter(s => params[0].includes(s.hostname)) };
    }
    if (sql.includes('/* school-numeric-host */')) {
      return { rows: masters.filter(s => String(s.hsid) === params[0] && linked.has(String(s.hsid))).map(s => ({ hsid: String(s.hsid) })) };
    }
    if (sql.includes('/* school-legacy-host */')) {
      return { rows: [...new Set(legacy.filter(s => s.hostname === params[0]).map(s => s.hsid))].map(hsid => ({ hsid })) };
    }
    if (sql.includes('/* school-named-host-candidates */')) {
      return { rows: masters.filter(s => region(s) === params[0] &&
        (slug(s.hsname) === params[1] || String(s.hsid) === params[2]) &&
        (!params[3] || citySlug(s.cityname) === params[3]))
        .map(s => ({ hsid: String(s.hsid) })) };
    }
    throw new Error(`Unexpected query: ${sql.slice(0, 100)}`);
  };
  run.calls = calls;
  return run;
}

async function main() {
  let checked = 0;
  const duplicateGroups = [
    ['Centennial', 'CA', ['1309', '1310'], 'centennial.ca.yatstats.com'],
    ['Foothill', 'CA', ['20', '48'], 'foothill.ca.yatstats.com'],
    ['Mount Carmel', 'IL', ['2703', '13046'], 'mount-carmel.il.yatstats.com'],
    ['Redwood', 'CA', ['1306', '1307'], 'redwood.ca.yatstats.com'],
    ['St. Francis', 'CA', ['2122', '2123'], 'st-francis.ca.yatstats.com'],
  ];
  const duplicateCities = {
    '1309': 'Corona', '1310': 'Bakersfield',
    '20': 'Santa Ana', '48': 'Pleasanton',
    '2703': 'Chicago', '13046': 'Mount Carmel',
    '1306': 'Larkspur', '1307': 'Visalia',
    '2122': 'Mountain View', '2123': 'La Canada',
  };
  const masters = [{ hsid: '5004', hsname: 'Hamilton', regionid: 'AZ', cityname: 'Chandler' }];
  const directory = [{ hsid: '5004', microsite_url: 'https://hamilton.az.yatstats.com/' }];
  for (const [hsname, regionid, ids, host] of duplicateGroups) {
    for (const hsid of ids) {
      masters.push({ hsid, hsname, regionid, cityname: duplicateCities[hsid] });
      directory.push({ hsid, microsite_url: `https://${host}` });
    }
  }
  const malformed = [
    ['803', 'St. Thomas More', 'LA', 'st.-thomas-more.la.yatstats.com', 'st-thomas-more.la.yatstats.com'],
    ['5063', 'Hartselle', 'AL', 'hartselle-.al.yatstats.com', 'hartselle.al.yatstats.com'],
    ['7831', 'St. Raymonds', 'NY', 'st.-raymonds.ny.yatstats.com', 'st-raymonds.ny.yatstats.com'],
  ];
  for (const [hsid, hsname, regionid, host] of malformed) {
    masters.push({ hsid, hsname, regionid });
    directory.push({ hsid, microsite_url: `https://${host}` });
  }
  const run = fixtureQuery(masters, directory);
  const urls = await routing.canonicalSchoolUrls(masters.map(s => s.hsid), run);
  assert.equal(urls.size, 14);
  assert.equal(new Set(urls.values()).size, 14, 'All 13 repaired schools plus the control need unique addresses.');
  assert.equal(urls.get('5004'), 'https://hamilton.az.yatstats.com', 'Preserve the good curated Hamilton address.');
  checked += 3;
  for (const [hsname, regionid, ids, oldHost] of duplicateGroups) {
    assert.equal(await routing.resolveSchoolHsidFromHost(oldHost, run), null, 'An ambiguous old host must never choose one of its schools.');
    checked++;
    for (const id of ids) {
      const expected = `https://${routing.schoolNameSlug(hsname)}.${regionid.toLowerCase()}.${routing.schoolNameSlug(duplicateCities[id])}.yatstats.com`;
      assert.equal(urls.get(id), expected);
      assert.equal(await routing.resolveSchoolHsidFromHost(expected, run), id);
      checked += 2;
    }
  }
  for (const [id, , , oldHost, newHost] of malformed) {
    assert.equal(routing.schoolHostnamePattern(oldHost), null);
    assert.equal(urls.get(id), `https://${newHost}`);
    assert.equal(await routing.resolveSchoolHsidFromHost(newHost, run), id);
    checked += 3;
  }
  for (const school of masters) {
    assert.equal(await routing.resolveSchoolHsidFromHost(`${school.hsid}.yatstats.com`, run), school.hsid, 'Numeric aliases remain live for repaired schools.');
    const alone = await routing.canonicalSchoolUrls([school.hsid], run);
    assert.equal(alone.get(school.hsid), urls.get(school.hsid), 'A URL must not depend on which other search results share the batch.');
    checked += 2;
  }

  const collisionMasters = [
    { hsid: '111', hsname: 'Lincoln', regionid: 'CA', cityname: 'Springfield' },
    { hsid: '112', hsname: 'Lincoln', regionid: 'CA', cityname: 'Springfield' },
    { hsid: '222', hsname: 'Lincoln-111', regionid: 'CA', cityname: 'Springfield' },
    { hsid: '333', hsname: 'Different School', regionid: 'CA', cityname: 'Sacramento' },
    { hsid: '334', hsname: 'Another School', regionid: 'CA', cityname: 'Long Beach' },
    { hsid: '444', hsname: 'Unique School', regionid: 'TX', cityname: 'Austin' },
    { hsid: '555', hsname: 'Old School A', regionid: 'TX', cityname: 'Austin' },
    { hsid: '556', hsname: 'Old School B', regionid: 'TX', cityname: 'Dallas' },
    { hsid: '557', hsname: 'Inactive Reference', regionid: 'TX', cityname: 'Tyler' },
    { hsid: '558', hsname: 'Inactive Reference', regionid: 'TX', cityname: 'Houston' },
    { hsid: '559', hsname: 'School with a very long descriptive name '.repeat(3), regionid: 'CA', cityname: 'Sacramento' },
    { hsid: '560', hsname: 'Unknown City School', regionid: 'CA', cityname: '' },
    { hsid: '561', hsname: 'Unknown City School', regionid: 'CA', cityname: '' },
  ];
  const collisionDirectory = [
    { hsid: '333', microsite_url: 'https://lincoln-1-111.ca.springfield.yatstats.com' },
    { hsid: '334', microsite_url: 'https://unique-school.tx.yatstats.com' },
    { hsid: '555', microsite_url: ' HTTPS://SHARED.TX.YATSTATS.COM/// ' },
    { hsid: '556', microsite_url: 'https://shared.tx.yatstats.com' },
  ];
  const linked = collisionMasters.map(s => s.hsid).filter(id => id !== '558');
  const collisionRun = fixtureQuery(collisionMasters, collisionDirectory, linked);
  const collisionUrls = await routing.canonicalSchoolUrls(linked, collisionRun);
  assert.equal(collisionUrls.get('111'), 'https://lincoln-2-111.ca.springfield.yatstats.com', 'An ambiguous city needs the HSID fallback; skip both natural and curated suffix collisions.');
  assert.equal(collisionUrls.get('222'), 'https://lincoln-111.ca.yatstats.com', 'Keep the unique literal school name usable.');
  assert.equal(collisionUrls.get('333'), 'https://lincoln-1-111.ca.springfield.yatstats.com', 'Preserve a valid curated hostname even when it resembles a generated one.');
  assert.equal(collisionUrls.get('444'), 'https://unique-school.tx.austin.yatstats.com', 'A claimed base host uses the school.state.city format.');
  assert.equal(collisionUrls.get('555'), 'https://old-school-a.tx.austin.yatstats.com');
  assert.equal(collisionUrls.get('556'), 'https://old-school-b.tx.dallas.yatstats.com');
  assert.equal(await routing.resolveSchoolHsidFromHost('shared.tx.yatstats.com', collisionRun), null, 'Equivalent normalized stored hosts are still ambiguous.');
  assert.equal(collisionUrls.get('557'), 'https://inactive-reference.tx.tyler.yatstats.com', 'Inactive master schools still reserve name/state collisions.');
  assert.ok(routing.schoolHostnamePattern(collisionUrls.get('559')), 'Long names must produce a valid DNS label.');
  assert.equal(new URL(collisionUrls.get('559')).hostname.split('.')[0].length <= 63, true);
  assert.equal(new Set(collisionUrls.values()).size, collisionUrls.size);
  checked += 11;
  assert.equal(collisionUrls.get('560'), 'https://unknown-city-school-560.ca.yatstats.com', 'Missing city data must not produce a fake city label.');
  assert.equal(collisionUrls.get('561'), 'https://unknown-city-school-561.ca.yatstats.com');
  assert.deepEqual(routing.schoolHostnamePattern('mount-carmel.ca.san-diego.yatstats.com'),
    { type: 'named', slug: 'mount-carmel', state: 'CA', city: 'san-diego' });
  checked += 3;
  for (const [id, url] of collisionUrls) {
    assert.equal(await routing.resolveSchoolHsidFromHost(url, collisionRun), id, 'Every generated fallback must resolve back to exactly its owner.');
    checked++;
  }
  assert.equal(await routing.resolveSchoolHsidFromHost('558.yatstats.com', collisionRun), null);
  assert.equal((await routing.canonicalSchoolUrls(['558', '999999', 'bad', 0], collisionRun)).size, 0);
  assert.equal(await routing.resolveSchoolHsidFromHost('arbitrary.ca.yatstats.com', collisionRun), null);
  assert.equal(await routing.resolveSchoolHsidFromHost('admin.yatstats.com', collisionRun), null);
  assert.equal(await routing.resolveSchoolHsidFromHost('lincoln-112.tx.yatstats.com', collisionRun), null, 'An HSID suffix cannot override the school region.');
  assert.equal(await routing.resolveSchoolHsidFromHost('lincoln-112.ca.wrong-city.yatstats.com', collisionRun), null, 'An HSID suffix cannot override the school city.');
  checked += 6;
  assert.ok(run.calls.filter(c => c.sql.includes('school-canonical-candidates')).every(c =>
    c.sql.includes('routing_school_text_counts') && !c.sql.includes('FROM public.player_hsids')),
    'Use the exact grouped membership relation, not the timing-out correlated view.');
  checked++;
  console.log(`PASS ${checked} canonical-host checks: 13 legacy-defect fixtures, school.state.city URLs, stable curated URLs, numeric aliases, ambiguous cities, final collisions and exact-owner resolution.`);
}

main().catch(error => { console.error(error); process.exitCode = 1; });

