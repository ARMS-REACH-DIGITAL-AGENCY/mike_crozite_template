/* Offline mapping tests plus optional read-only PostgreSQL boundary fixtures. */
/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS loader isolates server dependencies. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
let capturedSql, capturedParams, calls = 0, row = {}, failure;
const cache = new Map();
function load(filename) {
  filename = path.resolve(root, filename);
  if (cache.has(filename)) return cache.get(filename).exports;
  const mod = { exports: {} }; cache.set(filename, mod);
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const req = (id) => {
    if (id === 'server-only') return {};
    if (id === '@/lib/db') throw new Error('Private publication settings must not use the shared database.');
    if (id === '@/lib/tribune/db') return { query: async (sql, params) => {
      calls++; capturedSql = sql; capturedParams = params;
      if (failure) throw failure;
      return { rows: row ? [structuredClone(row)] : [] };
    } };
    if (id.startsWith('@/')) return load(path.join(root, 'src', id.slice(2)) + '.ts');
    if (id.startsWith('.')) return load(path.resolve(path.dirname(filename), id) + '.ts');
    return require(id);
  };
  new Function('require', 'module', 'exports', source)(req, mod, mod.exports);
  return mod.exports;
}
const publication = load('src/lib/partners/publication.ts');
const input = { hsid: '1', cadence: 'weekly', periodStart: '2027-02-01', periodEnd: '2027-02-07', asOf: new Date('2027-02-08T12:00:00Z') };
const saved = {
  masthead: { imageUrl: 'https://assets.example.invalid/masthead.png', alt: 'The YAT-A-BOY Tribune', includesTagline: true, assetId: 'masthead-v1' },
  official_rules_url: 'https://1.yatstats.com/rules', sweepstakes_reminder: 'Read the official rules.', postal_address: 'Approved address',
  sponsor_id: '9007199254740993', sponsor_name: 'Example Brand', sponsor_logo: '/img/brand.png',
  creative_id: '9007199254740995', creative_revision: 3, creative_headline: 'Weekly offer', creative_body: 'Approved offer details.',
  creative_image: 'https://assets.example.invalid/ad.png', creative_alt: 'The weekly offer',
  creative_destination: 'https://sponsor.example.invalid/offer', creative_cta: 'View offer', creative_acknowledgment: 'Thank you to Example Brand.',
  note_id: '42', note_revision: 2, note_text: 'First paragraph.\nA second line.\n\nAnother paragraph.',
  note_metadata: { title: 'A Publisher’s Note', byline: 'The Publisher' }, note_image: 'https://assets.example.invalid/note.png',
  note_cta_label: 'Read more', note_cta_url: 'https://1.yatstats.com/news',
};

// Each table below is an in-query CTE. The optional database check never inserts,
// updates or reads application rows, even if given a connection to another DB.
const fixture = {
  settings: [],
  brands: [{ id: 1, name: 'Example Brand', logo_url: 'https://assets.example.invalid/logo.png', is_active: true }],
  placements: [{ id: 1, hsid: '1', sponsor_id: 1, status: 'active', priority: 0, starts_at: '2027-01-01T00:00:00Z', ends_at: null, requires_approval: true }],
  creatives: [{ id: 11, sponsor_id: 1, revision: 1, status: 'published', headline: 'Evergreen', body: 'Example offer', image_url: null, image_alt: '', destination_url: 'https://sponsor.example.invalid/', cta: 'Visit sponsor', acknowledgment: '', starts_at: null, ends_at: null, evergreen: true, school_ids: [], cadence: 'both', approved_by: 'fixture-publisher', approved_at: '2027-01-01T00:00:00Z', publisher_approved: true }],
  notes: [{ id: 101, revision: 1, page_key: 'tribune', status: 'published', school_hsid: null, starts_at: null, ends_at: null, display_order: 0, message_text: 'Global note', tribune_metadata: {}, image_url: null, cta_label: null, cta_url: null }],
};
const cases = [];
function scenario(name, alter, expected = {}, extra = {}) {
  const data = structuredClone(fixture); alter(data);
  cases.push({ name, hsid: '1', cadence: 'weekly', as_of: '2027-02-08T12:00:00Z', fixture: data,
    expected_sponsor: '1', expected_creative: '11', expected_note: '101', ...expected, ...extra });
}
function dated(data, overrides = {}) {
  return { ...data.creatives[0], id: 12, evergreen: false, starts_at: '2027-02-01T00:00:00Z', ends_at: '2027-02-15T00:00:00Z', ...overrides };
}
function note(data, overrides = {}) { return { ...data.notes[0], id: 102, school_hsid: '1', ...overrides }; }
scenario('evergreen and global defaults', () => {});
scenario('dated creative supersedes evergreen', d => d.creatives.push(dated(d)), { expected_creative: '12' });
scenario('creative start is inclusive', d => d.creatives.push(dated(d, { starts_at: '2027-02-08T12:00:00Z' })), { expected_creative: '12' });
scenario('creative end is exclusive', d => d.creatives.push(dated(d, { ends_at: '2027-02-08T12:00:00Z' })));
scenario('future creative cannot replace evergreen', d => d.creatives.push(dated(d, { starts_at: '2027-02-08T12:00:01Z' })));
scenario('draft creative cannot replace published', d => d.creatives.push(dated(d, { status: 'draft' })));
scenario('missing approval cannot publish a creative', d => d.creatives.push(dated(d, { approved_by: null, approved_at: null })));
scenario('review-required placement excludes a self-approved revision', d => d.creatives.push(dated(d, { publisher_approved: false })));
scenario('new review-required placement cannot inherit a self-approved ad', d => { d.creatives[0].publisher_approved = false; }, { expected_sponsor: null, expected_creative: null });
scenario('self-service placement permits its published sponsor-approved ad', d => { d.placements[0].requires_approval = false; d.creatives[0].publisher_approved = false; });
scenario('weekly excludes daily-only creative', d => d.creatives.push(dated(d, { cadence: 'daily' })));
scenario('daily selects daily-only creative', d => d.creatives.push(dated(d, { cadence: 'daily' })), { expected_creative: '12' }, { cadence: 'daily' });
scenario('another school creative is excluded', d => d.creatives.push(dated(d, { school_ids: ['2'] })));
scenario('scoped creative precedes later global creative', d => {
  d.creatives.push(dated(d, { starts_at: '2027-02-07T00:00:00Z' }), dated(d, { id: 13, school_ids: ['1'] }));
}, { expected_creative: '13' });
scenario('latest start then ID breaks equal-scope ties', d => {
  d.creatives.push(dated(d), dated(d, { id: 13, starts_at: '2027-02-02T00:00:00Z' }), dated(d, { id: 14, starts_at: '2027-02-02T00:00:00Z' }));
}, { expected_creative: '14' });
scenario('placement priority precedes creative specificity', d => {
  d.creatives.push(dated(d)); d.brands.push({ ...d.brands[0], id: 2 });
  d.placements.push({ ...d.placements[0], id: 2, sponsor_id: 2, priority: 1 });
  d.creatives.push({ ...d.creatives[0], id: 21, sponsor_id: 2 });
}, { expected_sponsor: '2', expected_creative: '21' });
scenario('inactive brand is excluded', d => { d.brands[0].is_active = false; }, { expected_sponsor: null, expected_creative: null });
scenario('paused placement is excluded', d => { d.placements[0].status = 'paused'; }, { expected_sponsor: null, expected_creative: null });
scenario('placement end is exclusive', d => { d.placements[0].ends_at = '2027-02-08T12:00:00Z'; }, { expected_sponsor: null, expected_creative: null });
scenario('future placement is excluded', d => { d.placements[0].starts_at = '2027-02-08T12:00:01Z'; }, { expected_sponsor: null, expected_creative: null });
scenario('school note precedes global display order', d => d.notes.push(note(d, { display_order: 50 })), { expected_note: '102' });
scenario('metadata audience is a school-specific note', d => d.notes.push(note(d, { school_hsid: null, display_order: 50, tribune_metadata: { schoolIds: ['1'] } })), { expected_note: '102' });
scenario('another metadata audience is excluded', d => d.notes.push(note(d, { school_hsid: null, tribune_metadata: { schoolIds: ['2'] } })));
scenario('wrong note cadence is excluded', d => d.notes.push(note(d, { tribune_metadata: { cadence: 'daily' } })));
scenario('note issue date uses Phoenix not UTC', d => d.notes.push(note(d, { tribune_metadata: { issueDate: '2027-02-07' } })), { expected_note: '102' }, { as_of: '2027-02-08T06:59:59Z' });
scenario('note issue date changes at Phoenix midnight', d => d.notes.push(note(d, { tribune_metadata: { issueDate: '2027-02-07' } })), {}, { as_of: '2027-02-08T07:00:00Z' });
scenario('note start is inclusive', d => d.notes.push(note(d, { starts_at: '2027-02-08T12:00:00Z' })), { expected_note: '102' });
scenario('note end is exclusive', d => d.notes.push(note(d, { ends_at: '2027-02-08T12:00:00Z' })));
scenario('unpublished note is excluded', d => d.notes.push(note(d, { status: 'draft' })));
scenario('other site-message placement is excluded', d => d.notes.push(note(d, { page_key: 'alumni' })));
scenario('note display order then ID is stable', d => {
  d.notes.push(note(d, { display_order: 5 }), note(d, { id: 103, display_order: 1 }), note(d, { id: 104, display_order: 1 }));
}, { expected_note: '103' });

function boundarySql(sql) {
  const tables = [
    ['tribune_publication_settings', 'settings', 'id boolean, masthead jsonb, official_rules_url text, sweepstakes_reminder text, postal_address text'],
    ['sponsor_brands', 'brands', 'id bigint, name text, logo_url text, is_active boolean'],
    ['school_tribune_sponsorships', 'placements', 'id bigint, hsid text, sponsor_id bigint, status text, priority integer, starts_at timestamptz, ends_at timestamptz, requires_approval boolean'],
    ['tribune_sponsor_creatives', 'creatives', 'id bigint, sponsor_id bigint, revision integer, status text, headline text, body text, image_url text, image_alt text, destination_url text, cta text, acknowledgment text, starts_at timestamptz, ends_at timestamptz, evergreen boolean, school_ids text[], cadence text, approved_by text, approved_at timestamptz, publisher_approved boolean'],
    ['publisher_notes', 'notes', 'id bigint, revision integer, page_key text, status text, school_hsid text, starts_at timestamptz, ends_at timestamptz, display_order integer, message_text text, tribune_metadata jsonb, image_url text, cta_label text, cta_url text'],
  ];
  let selector = sql.replace(/\$1\b/g, 'case_input.hsid').replace(/\$2\b/g, 'case_input.as_of')
    .replace(/\$3\b/g, 'case_input.cadence').replace(/\$4\b/g, "to_char(case_input.as_of AT TIME ZONE 'America/Phoenix','YYYY-MM-DD')");
  for (const [name] of tables) selector = selector.replaceAll((name === 'sponsor_brands' ? 'public.' : 'tribune_private.') + name, 'fixture_' + name);
  assert.equal(selector.includes('public.'), false);
  assert.equal(selector.includes('tribune_private.'), false);
  const sources = tables.map(([name, key, columns]) => `fixture_${name} AS (SELECT * FROM jsonb_to_recordset(case_input.fixture->'${key}') AS source(${columns}))`).join(',\n');
  const json = JSON.stringify(cases).replace(/'/g, "''");
  return `WITH cases AS (SELECT * FROM jsonb_to_recordset('${json}'::jsonb) AS source(name text, hsid text, cadence text, as_of timestamptz, fixture jsonb, expected_sponsor text, expected_creative text, expected_note text))
    SELECT case_input.name, selected.sponsor_id, selected.creative_id, selected.note_id,
      (selected.sponsor_id IS NOT DISTINCT FROM case_input.expected_sponsor
       AND selected.creative_id IS NOT DISTINCT FROM case_input.expected_creative
       AND selected.note_id IS NOT DISTINCT FROM case_input.expected_note) AS passed
    FROM cases case_input CROSS JOIN LATERAL (WITH ${sources} ${selector}) selected`;
}

let passed = 0;
async function test(name, fn) { await fn(); passed++; console.log('PASS', name); }
async function main() {
  await publication.resolveTribunePublication(input);
  if (process.argv.includes('--sql')) { process.stdout.write(JSON.stringify(boundarySql(capturedSql))); return; }
  await test('empty publication tables produce no invented ad, note or masthead', async () => {
    assert.deepEqual(await publication.resolveTribunePublication(input), { officialRulesUrl: undefined, sweepstakesReminder: undefined, postalAddress: undefined });
  });
  await test('resolver maps one selected revision with precise bigint IDs and canonical logo URL', async () => {
    row = structuredClone(saved); const result = await publication.resolveTribunePublication(input);
    assert.equal(result.sponsor.id, saved.sponsor_id); assert.equal(result.sponsor.creativeId, saved.creative_id);
    assert.equal(result.sponsor.creativeVersion, 3); assert.equal(result.sponsor.logoUrl, 'https://1.yatstats.com/img/brand.png');
    assert.equal(result.sponsor.acknowledgment, saved.creative_acknowledgment);
    assert.deepEqual(result.masthead, saved.masthead); assert.equal(result.publisherNote.revision, 2);
    assert.deepEqual(result.publisherNote.paragraphs, ['First paragraph.\nA second line.', 'Another paragraph.']);
    assert.deepEqual(capturedParams, ['1', '2027-02-08T12:00:00.000Z', 'weekly', '2027-02-08']);
  });
  await test('issueDate binding rolls at Phoenix midnight independently of the reporting week', async () => {
    await publication.resolveTribunePublication({ ...input, asOf: new Date('2027-02-08T06:59:59Z') }); assert.equal(capturedParams[3], '2027-02-07');
    await publication.resolveTribunePublication({ ...input, asOf: new Date('2027-02-08T07:00:00Z') }); assert.equal(capturedParams[3], '2027-02-08');
  });
  await test('portal preview mapping uses the same sponsor fields without querying', () => {
    const before = calls;
    const result = publication.mapCreativeToSponsor({ hsid: '2', brand: { id: saved.sponsor_id, name: saved.sponsor_name, logo_url: saved.sponsor_logo }, creative: {
      id: saved.creative_id, revision: 3, headline: saved.creative_headline, body: saved.creative_body,
      destination_url: saved.creative_destination, cta: saved.creative_cta, acknowledgment: saved.creative_acknowledgment,
    } });
    assert.equal(result.logoUrl, 'https://2.yatstats.com/img/brand.png'); assert.equal(result.creativeId, saved.creative_id); assert.equal(calls, before);
  });
  await test('invalid school, calendar, cadence or period fails before a database read', async () => {
    const before = calls;
    for (const invalid of [{ hsid: '1 OR 1=1' }, { cadence: 'monthly' }, { periodStart: '2027-02-30' }, { periodStart: '2027-02-08' }, { asOf: new Date('invalid') }]) {
      await assert.rejects(publication.resolveTribunePublication({ ...input, ...invalid }));
    }
    assert.equal(calls, before);
  });
  await test('unsafe saved URLs cannot be snapshotted into an issue', async () => {
    for (const [field, value] of [['official_rules_url', 'javascript:alert(1)'], ['creative_destination', 'http://example.invalid/offer'], ['note_image', 'data:image/png,invalid'], ['sponsor_logo', '//example.invalid/image']]) {
      row = { ...structuredClone(saved), [field]: value }; await assert.rejects(publication.resolveTribunePublication(input));
    }
    row = { ...structuredClone(saved), masthead: { ...saved.masthead, imageUrl: 'https://user:pass@example.invalid/image' } };
    await assert.rejects(publication.resolveTribunePublication(input));
  });
  await test('incomplete published creative and malformed masthead fail closed', async () => {
    for (const overrides of [{ creative_revision: 0 }, { creative_headline: '' }, { masthead: { ...saved.masthead, includesTagline: 'false' } }]) {
      row = { ...structuredClone(saved), ...overrides }; await assert.rejects(publication.resolveTribunePublication(input));
    }
  });
  await test('query failures and missing snapshot rows are not silently treated as unsponsored', async () => {
    failure = new Error('simulated unavailable publication database');
    await assert.rejects(publication.resolveTribunePublication(input), error => error === failure);
    failure = undefined; row = undefined; await assert.rejects(publication.resolveTribunePublication(input), /snapshot unavailable/);
  });
  if (process.env.TRIBUNE_TEST_DATABASE_URL) {
    const { Client } = require('pg');
    const client = new Client({ connectionString: process.env.TRIBUNE_TEST_DATABASE_URL });
    try {
      await client.connect();
      const result = await client.query(boundarySql(capturedSql));
      assert.equal(result.rows.length, cases.length);
      for (const resultCase of result.rows) await test('SQL: ' + resultCase.name, () => assert.equal(resultCase.passed, true));
    } finally { await client.end(); }
  }
  console.log(`\n${passed} publication resolver checks passed. Database calls were mocked unless TRIBUNE_TEST_DATABASE_URL was provided.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
