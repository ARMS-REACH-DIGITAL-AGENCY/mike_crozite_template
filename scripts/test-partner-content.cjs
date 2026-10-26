/* PostgreSQL integration tests for the actual partner services.
 * Requires an explicitly supplied isolated PARTNER_TEST_DATABASE_URL.
 * Normal CI uses one transaction and rolls every fixture back.
 * Explicit --http mode uses individual committed queries and tracked cleanup.
 */
/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS loads the server TypeScript modules without a framework runtime. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const { Client } = require('pg');
const ts = require('typescript');

const connectionString = process.env.PARTNER_TEST_DATABASE_URL;
if (!connectionString) {
  console.error('Refusing to run: set PARTNER_TEST_DATABASE_URL to an isolated test database. DATABASE_URL is never used as a fallback.');
  process.exit(1);
}
const databaseUrl = new URL(connectionString);
if (!['postgres:', 'postgresql:'].includes(databaseUrl.protocol)) throw new Error('PARTNER_TEST_DATABASE_URL must be a PostgreSQL connection string.');
databaseUrl.searchParams.set('sslmode', 'verify-full');
const useHttp = process.argv.includes('--http');
if (useHttp && process.env.PARTNER_TEST_ALLOW_AUTOCOMMIT !== 'isolated-test-fixtures-only') {
  throw new Error('HTTP mode commits fixture queries. Explicit PARTNER_TEST_ALLOW_AUTOCOMMIT=isolated-test-fixtures-only is required.');
}
const serviceRole = process.env.PARTNER_TEST_SERVICE_ROLE;
if (serviceRole && !/^[a-z][a-z0-9_]{0,62}$/.test(serviceRole)) {
  throw new Error('PARTNER_TEST_SERVICE_ROLE must be a simple PostgreSQL role identifier.');
}
let expectedHttpEndpoint;

// Official driver configuration: https://github.com/neondatabase/serverless/blob/main/CONFIG.md
// Test-only curl fetch uses the executor HTTPS proxy. Credentials go over stdin,
// never command arguments, command logs, temporary header files, or test output.
function curlFetch(url, options) {
  const destination = new URL(String(url));
  if (!expectedHttpEndpoint || destination.toString() !== expectedHttpEndpoint || destination.protocol !== 'https:' ||
      !destination.hostname.endsWith('.neon.tech') || destination.pathname !== '/sql') {
    throw new Error('The test HTTP transport refuses an unexpected database endpoint.');
  }
  const quoted = (value) => '"' + String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r/g, '\\r').replace(/\n/g, '\\n') + '"';
  const config = ['silent', 'show-error', 'max-time = 30', `url = ${quoted(destination.toString())}`, `request = ${quoted(options?.method || 'POST')}`];
  for (const [name, value] of new Headers(options?.headers)) config.push(`header = ${quoted(name + ': ' + value)}`);
  if (options?.body != null) config.push(`data-binary = ${quoted(options.body)}`);
  config.push('write-out = "\\n%{http_code}"');
  return new Promise((resolve, reject) => {
    const child = spawn('curl', ['--config', '-'], { stdio: ['pipe', 'pipe', 'pipe'] });
    const output = [];
    child.stdout.on('data', (chunk) => output.push(chunk));
    child.stderr.on('data', () => {});
    child.once('error', reject);
    child.once('close', (code) => {
      if (code !== 0) return reject(new Error(`The isolated database HTTPS request failed (curl ${code}).`));
      const raw = Buffer.concat(output).toString('utf8');
      const boundary = raw.lastIndexOf('\n');
      const status = Number(raw.slice(boundary + 1));
      if (!Number.isInteger(status) || status < 100 || status > 599) return reject(new Error('The isolated database returned an invalid HTTP status.'));
      resolve(new Response(raw.slice(0, boundary), { status, headers: { 'content-type': 'application/json' } }));
    });
    child.stdin.end(config.join('\n') + '\n');
  });
}

function createTestClient() {
  if (!useHttp) return new Client({ connectionString: databaseUrl.toString(), connectionTimeoutMillis: 15000, application_name: 'yatstats-partner-integration-tests' });
  const { neon, neonConfig } = require(process.env.PARTNER_TEST_NEON_DRIVER_PATH || '@neondatabase/serverless');
  expectedHttpEndpoint = new URL(typeof neonConfig.fetchEndpoint === 'function'
    ? neonConfig.fetchEndpoint(databaseUrl.hostname, databaseUrl.port || 5432)
    : neonConfig.fetchEndpoint).toString();
  neonConfig.fetchFunction = curlFetch;
  const sql = neon(databaseUrl.toString(), { fullResults: true });
  return {
    connect: async () => { await sql.query('SELECT 1'); },
    query: (statement, params = []) => {
      if (/^\s*(BEGIN|COMMIT|ROLLBACK|SAVEPOINT|RELEASE|SET LOCAL)\b/i.test(statement)) throw new Error('HTTP mode has no interactive transaction or session.');
      return sql.query(statement, params);
    },
    batch: (specs) => sql.transaction(specs.map(([statement, params]) => sql.query(statement, params)), { fullResults: true }),
    end: async () => {},
  };
}
const client = createTestClient();
const root = path.resolve(__dirname, '..');
const runId = randomUUID().slice(0, 12);
const publisher = { uid: `test-publisher-${runId}`, email: 'publisher@example.invalid', publisher: true, sponsorIds: [] };
const sponsorA = { uid: `test-sponsor-a-${runId}`, email: 'sponsor-a@example.invalid', publisher: false, sponsorIds: [] };
const sponsorB = { uid: `test-sponsor-b-${runId}`, email: 'sponsor-b@example.invalid', publisher: false, sponsorIds: [] };
const loadedFiles = new Set();
const statements = [];
const cache = new Map();
let serviceQueue = Promise.resolve();

function serviceQuery(statement, params = []) {
  statements.push(statement);
  if (!serviceRole) return client.query(statement, params);
  // Only the actual application query switches role. Fixture setup and cleanup
  // retain the isolated test owner's connection and never run in production.
  const roleStatement = `SET LOCAL ROLE "${serviceRole}"`;
  if (useHttp) return client.batch([[roleStatement, []], [statement, params]]).then((results) => results[1]);
  // Dashboard queries use Promise.all. Serialize role changes on the single
  // transaction client so one concurrent call cannot reset another's role.
  const task = serviceQueue.then(async () => {
    await client.query('SAVEPOINT partner_service_query');
    try {
      await client.query(roleStatement);
      const result = await client.query(statement, params);
      await client.query('RESET ROLE');
      await client.query('RELEASE SAVEPOINT partner_service_query');
      return result;
    } catch (error) {
      await client.query('ROLLBACK TO SAVEPOINT partner_service_query');
      await client.query('RELEASE SAVEPOINT partner_service_query');
      throw error;
    }
  });
  serviceQueue = task.catch(() => {});
  return task;
}

function load(filename) {
  filename = path.resolve(root, filename);
  if (cache.has(filename)) return cache.get(filename).exports;
  loadedFiles.add(filename);
  const mod = { exports: {} }; cache.set(filename, mod);
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const req = (id) => {
    if (id === 'server-only') return {};
    if (id === '@/lib/db') throw new Error('Private partner operations must not use the shared database.');
    if (id === '@/lib/tribune/db') return { query: serviceQuery };
    if (id.startsWith('@/')) return load(path.join(root, 'src', id.slice(2)) + '.ts');
    if (id.startsWith('.')) return load(path.resolve(path.dirname(filename), id) + '.ts');
    return require(id);
  };
  new Function('require', 'module', 'exports', '__filename', '__dirname', source)(req, mod, mod.exports, filename, path.dirname(filename));
  return mod.exports;
}

const service = load('src/lib/partners/service.ts');
const validation = load('src/lib/partners/validation.ts');
const publication = load('src/lib/partners/publication.ts');
const preview = load('src/lib/partners/preview.ts');
const cards = load('src/lib/partners/sponsorCards.ts');
const cardValidation = load('src/lib/partners/sponsorCardValidation.ts');
const { PartnerAccessError } = load('src/lib/partners/access.ts');
let passed = 0, currentTest = 'connect to isolated database', inTransaction = false, rollbackVerified = false, httpCleanupNeeded = false;
let brandA, brandB, placementA, placementB, evergreenA, creativeB, draftClone, scheduledA, noteGlobal, noteSchool, publicationSettings;
let schoolA, schoolB, logoA, logoB, adA, adB, masthead, noteImage;
let frontA, frontB, bannerA, fullA, cardPlacementA, cardPlacementB, cardA, cardB, cardDraft;
const createdNoteIds = [];
const createdOrderIds = [];
const manifestPath = path.join(os.tmpdir(), `yatstats-partner-test-${runId}.json`);
let originalSettings;

function saveManifest() {
  if (useHttp) fs.writeFileSync(manifestPath, JSON.stringify({ runId, actorUids: [publisher.uid, sponsorA.uid, sponsorB.uid], brandIds: [brandA?.id, brandB?.id].filter(Boolean), noteIds: createdNoteIds, orderIds: createdOrderIds }, null, 2), { mode: 0o600 });
}

async function cleanHttpFixtures() {
  const actors = [publisher.uid, sponsorA.uid, sponsorB.uid];
  // The audit statement commits atomically with each service write, so it also
  // recovers IDs after a lost response. Only this run's synthetic actors match.
  const brands = (await client.query(`SELECT id::text FROM public.sponsor_brands WHERE id=ANY($1::bigint[])
    OR id::text IN (SELECT entity_id FROM tribune_private.partner_portal_audit WHERE actor_uid=ANY($2::text[]) AND entity_type='brand')`,
  [[brandA?.id, brandB?.id].filter(Boolean), actors])).rows.map((row) => row.id);
  const notes = (await client.query(`SELECT entity_id FROM tribune_private.partner_portal_audit
    WHERE actor_uid=ANY($1::text[]) AND entity_type='note'`, [actors])).rows.map((row) => row.entity_id);
  await client.batch([
    ['DELETE FROM tribune_private.partner_portal_memberships WHERE created_by=$1', [publisher.uid]],
    ['UPDATE tribune_private.sponsor_flip_cards SET previous_id=NULL WHERE sponsor_id=ANY($1::bigint[])', [brands]],
    ['DELETE FROM tribune_private.sponsor_flip_cards WHERE sponsor_id=ANY($1::bigint[])', [brands]],
    ['DELETE FROM tribune_private.school_sponsor_card_placements WHERE sponsor_id=ANY($1::bigint[])', [brands]],
    ['DELETE FROM public.school_splash_sponsorships WHERE sponsor_id=ANY($1::bigint[])', [brands]],
    ['DELETE FROM tribune_private.school_tribune_sponsorships WHERE sponsor_id=ANY($1::bigint[])', [brands]],
    ['DELETE FROM tribune_private.partner_sponsor_order_claims WHERE sponsor_id=ANY($1::bigint[]) OR created_by=ANY($2::text[])', [brands, actors]],
    ['UPDATE tribune_private.tribune_sponsor_creatives SET previous_id=NULL WHERE sponsor_id=ANY($1::bigint[])', [brands]],
    ['DELETE FROM tribune_private.tribune_sponsor_creatives WHERE sponsor_id=ANY($1::bigint[])', [brands]],
    ['DELETE FROM tribune_private.publisher_notes WHERE id=ANY($1::bigint[])', [[...new Set([...notes, ...createdNoteIds])]]],
    ['DELETE FROM tribune_private.tribune_publication_settings WHERE updated_by=$1', [publisher.uid]],
    ['DELETE FROM tribune_private.partner_portal_assets WHERE created_by=$1 OR sponsor_id=ANY($2::bigint[])', [publisher.uid, brands]],
    ['DELETE FROM public.sponsor_orders WHERE id=ANY($1::bigint[]) OR purchaser_email=$2', [createdOrderIds, `fixture-buyer-${runId}@example.invalid`]],
    ['DELETE FROM public.sponsor_brands WHERE id=ANY($1::bigint[])', [brands]],
    ['DELETE FROM tribune_private.partner_portal_audit WHERE actor_uid=ANY($1::text[])', [actors]],
  ]);
  httpCleanupNeeded = false;
}

async function test(name, fn) {
  currentTest = name;
  await fn();
  passed++;
  console.log('PASS', name);
}

async function rejectsStatus(fn, status) {
  // Expected database errors must not leave the shared test transaction aborted.
  if (!useHttp) await client.query('SAVEPOINT expected_failure');
  let caught;
  try { await fn(); } catch (error) { caught = error; }
  if (!useHttp) {
    await client.query('ROLLBACK TO SAVEPOINT expected_failure');
    await client.query('RELEASE SAVEPOINT expected_failure');
  }
  assert.ok(caught instanceof PartnerAccessError, `Expected a partner error with status ${status}`);
  assert.equal(caught.status, status);
}

async function asset(kind, sponsorId) {
  const id = randomUUID();
  const url = `https://assets.example.invalid/partner-tests/${runId}/${id}.png`;
  await client.query(`INSERT INTO tribune_private.partner_portal_assets(id,sponsor_id,kind,url,width,height,created_by)
    VALUES($1,$2,$3,$4,800,240,$5)`, [id, sponsorId, kind, url, publisher.uid]);
  return { id, url };
}

function creative(sponsorId, schoolIds, extra = {}) {
  return {
    sponsorId, headline: 'Fixture Grandstand Offer', body: 'Fixture sponsor message for hometown fans.',
    imageUrl: '', imageAlt: '', url: 'https://sponsor.example.invalid/offer', cta: 'See the offer',
    acknowledgment: 'Fixture sponsor support keeps the Tribune free for fans.',
    startsAt: '2020-01-01T00:00:00Z', endsAt: null, evergreen: true, schoolIds, cadence: 'both', ...extra,
  };
}

function placement(sponsorId, hsid, extra = {}) {
  return { sponsorId, hsid, sponsorOrderId: null, status: 'active', priority: 900,
    startsAt: '2020-01-01T00:00:00Z', endsAt: null, requiresApproval: true, ...extra };
}

function sponsorCard(sponsorId, schoolIds, extra = {}) {
  return {
    sponsorId, schoolIds, firstName: 'Fixture', lastName: 'Community Sponsor',
    currentTeam: 'Example hometown business', organization: 'Example company', level: 'SPONSOR',
    frontImageUrl: sponsorId === brandA.id ? frontA.url : frontB.url,
    frontImageAlt: 'Fixture sponsor card portrait', backTemplate: 'banner_text',
    headline: 'Fixture sponsor message', body: 'A fixture message supporting hometown baseball.',
    startsAt: null, endsAt: null, ...extra,
  };
}

async function publicCard(hsid, sponsorId, asOf = '2030-05-06T12:00:00Z') {
  return (await cards.getPublicSponsorCards(hsid, new Date(asOf))).find(card => card.sponsorId === sponsorId);
}

function resolve(hsid, asOf = '2030-05-06T12:00:00Z', cadence = 'weekly') {
  return publication.resolveTribunePublication({ hsid, cadence, periodStart: '2030-04-29', periodEnd: '2030-05-05', asOf: new Date(asOf) });
}

async function saveNote(input) {
  const result = await service.saveNote(publisher, input);
  if (!input.id) createdNoteIds.push(result.note.id);
  saveManifest();
  return result.note;
}

function safeError(error) {
  let message = error instanceof Error ? error.message : 'Unknown test failure';
  for (const value of [connectionString, databaseUrl.toString(), databaseUrl.hostname, databaseUrl.password, decodeURIComponent(databaseUrl.password)]) {
    if (value) message = message.split(value).join('[redacted test database]');
  }
  message = message.replace(/postgres(?:ql)?:\/\/\S+/g, '[redacted test database]');
  return { name: error?.name || 'Error', code: error?.code || undefined, message };
}

async function main() {
  await client.connect();
  if (!useHttp) {
    await client.query('BEGIN'); inTransaction = true;
    await client.query("SET LOCAL statement_timeout='15000ms'");
    await client.query("SET LOCAL lock_timeout='5000ms'");
  }
  if (serviceRole) {
    assert.equal((await serviceQuery('SELECT current_user AS role')).rows[0].role, serviceRole);
    console.log('Application SQL uses the explicitly configured restricted role; fixtures and cleanup use only the test owner.');
  }
  originalSettings = (await client.query('SELECT to_jsonb(settings) AS row FROM tribune_private.tribune_publication_settings settings ORDER BY id')).rows;
  if (useHttp) {
    const notes = (await client.query("SELECT count(*)::int AS total FROM tribune_private.publisher_notes WHERE page_key='tribune'")).rows[0];
    assert.equal(originalSettings.length, 0, 'HTTP mode requires an isolated branch with no publication settings; existing records will not be changed.');
    assert.equal(notes.total, 0, 'HTTP mode requires an isolated branch with no Tribune notes; existing records will not be changed.');
    httpCleanupNeeded = true; saveManifest();
    console.log('HTTP mode: individual committed test queries; tracked fixtures are removed in final cleanup.');
  } else {
    // Isolate singleton/global content only inside this rollback-only transaction.
    await client.query('DELETE FROM tribune_private.tribune_publication_settings');
    await client.query("UPDATE tribune_private.publisher_notes SET status='draft' WHERE page_key='tribune'");
  }
  const schools = (await client.query(`SELECT hsid::text AS hsid,hsname FROM public.school_success s
    WHERE hsid::text ~ '^[1-9][0-9]{0,11}$' AND hsname IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM tribune_private.school_tribune_sponsorships p WHERE p.hsid=s.hsid::text)
    ORDER BY hsid LIMIT 2`)).rows;
  assert.equal(schools.length, 2, 'The isolated database needs two real schools without existing Tribune placements.');
  [schoolA, schoolB] = schools.map((row) => row.hsid);

  await test('new brands remain inactive until an owned logo is supplied', async () => {
    brandA = (await service.saveBrand(publisher, { name: `Tribune test Alpha ${runId}`, websiteUrl: 'https://alpha.example.invalid/' })).brand;
    brandB = (await service.saveBrand(publisher, { name: `Tribune test Bravo ${runId}`, websiteUrl: 'https://bravo.example.invalid/' })).brand;
    saveManifest();
    assert.equal(brandA.isActive, false); assert.equal(brandB.isActive, false);
    assert.match(brandA.logoUrl, /sponsor-logo-pending\.svg$/);
    sponsorA.sponsorIds = [brandA.id]; sponsorB.sponsorIds = [brandB.id];
    [logoA, logoB, adA, adB, masthead, noteImage] = await Promise.all([
      asset('logo', brandA.id), asset('logo', brandB.id), asset('ad', brandA.id), asset('ad', brandB.id), asset('masthead', null), asset('notice', null),
    ]);
    brandA = (await service.saveBrand(publisher, { ...brandA, logoUrl: logoA.url, isActive: true })).brand;
    brandB = (await service.saveBrand(publisher, { ...brandB, logoUrl: logoB.url, isActive: true })).brand;
    assert.equal(brandA.isActive, true); assert.equal(brandB.isActive, true);
  });

  await test('sponsors can edit their own brand but cannot create, activate, or edit another brand', async () => {
    brandA = (await service.saveBrand(sponsorA, { ...brandA, websiteUrl: 'https://alpha.example.invalid/updated' })).brand;
    assert.equal(brandA.websiteUrl, 'https://alpha.example.invalid/updated');
    await rejectsStatus(() => service.saveBrand(sponsorA, { ...brandB, name: 'Cross-brand attempt' }), 403);
    await rejectsStatus(() => service.saveBrand(sponsorA, { ...brandA, isActive: false }), 403);
    await rejectsStatus(() => service.saveBrand(sponsorA, { name: 'Unauthorized new brand' }), 403);
  });

  await test('changed brand artwork requires an asset owned by that brand even for publishers', async () => {
    await rejectsStatus(() => service.saveBrand(sponsorA, { ...brandA, logoUrl: logoB.url }), 400);
    await rejectsStatus(() => service.saveBrand(publisher, { ...brandA, logoUrl: 'https://external.example.invalid/mutable.png' }), 400);
    await rejectsStatus(() => service.saveBrand(publisher, { name: 'New brand with preattached artwork', logoUrl: logoA.url }), 400);
  });

  await test('only publishers assign placements and searches respect sponsor scope', async () => {
    await rejectsStatus(() => service.savePlacement(sponsorA, placement(brandA.id, schoolA)), 403);
    placementA = (await service.savePlacement(publisher, placement(brandA.id, schoolA))).placement;
    placementB = (await service.savePlacement(publisher, placement(brandB.id, schoolB, { requiresApproval: false }))).placement;
    assert.deepEqual((await service.searchSponsors(sponsorA, runId)).sponsors.map((brand) => brand.id), [brandA.id]);
    assert.ok((await service.searchSponsors(publisher, runId)).sponsors.some((brand) => brand.id === brandB.id));
    assert.ok((await service.searchSchools(sponsorA, schoolA)).schools.some((school) => school.hsid === schoolA));
    assert.ok(!(await service.searchSchools(sponsorA, schoolB)).schools.some((school) => school.hsid === schoolB));
    assert.ok((await service.searchSchools(publisher, schoolB)).schools.some((school) => school.hsid === schoolB));
  });

  await test('creative reads, images, and school targeting cannot cross sponsor ownership', async () => {
    evergreenA = (await service.saveCreative(sponsorA, creative(brandA.id, [schoolA], { imageUrl: adA.url, imageAlt: 'Alpha fixture advertisement' }))).creative;
    creativeB = (await service.saveCreative(sponsorB, creative(brandB.id, [], { headline: 'Bravo self-service offer', imageUrl: adB.url, imageAlt: 'Bravo fixture advertisement', action: 'submit' }))).creative;
    assert.equal(evergreenA.status, 'draft'); assert.equal(creativeB.status, 'published');
    await rejectsStatus(() => service.getCreative(sponsorA, creativeB.id), 404);
    await rejectsStatus(() => service.saveCreative(sponsorA, { id: creativeB.id, revision: creativeB.revision, action: 'save' }), 404);
    await rejectsStatus(() => service.saveCreative(sponsorA, creative(brandB.id, [schoolB])), 403);
    await rejectsStatus(() => service.saveCreative(sponsorA, creative(brandA.id, [schoolB])), 403);
    await rejectsStatus(() => service.saveCreative(sponsorA, creative(brandA.id, [schoolA], { imageUrl: adB.url, imageAlt: 'Wrong account artwork' })), 400);
  });

  await test('a review-required submission stays pending and cannot appear until publisher approval', async () => {
    evergreenA = (await service.saveCreative(sponsorA, { id: evergreenA.id, revision: evergreenA.revision, action: 'submit' })).creative;
    assert.equal(evergreenA.status, 'pending');
    assert.equal((await resolve(schoolA)).sponsor, undefined);
    await rejectsStatus(() => service.saveCreative(sponsorA, { id: evergreenA.id, revision: evergreenA.revision, action: 'publish' }), 403);
    evergreenA = (await service.saveCreative(publisher, { id: evergreenA.id, revision: evergreenA.revision, action: 'publish' })).creative;
    assert.equal(evergreenA.status, 'published');
    assert.equal((await resolve(schoolA)).sponsor.creativeId, evergreenA.id);
    const saved = (await client.query('SELECT publisher_approved,approved_by FROM tribune_private.tribune_sponsor_creatives WHERE id=$1', [evergreenA.id])).rows[0];
    assert.equal(saved.publisher_approved, true); assert.equal(saved.approved_by, publisher.uid);
  });

  await test('published edits create immutable successor drafts and stale revisions fail with 409', async () => {
    draftClone = (await service.saveCreative(sponsorA, { id: evergreenA.id, revision: evergreenA.revision, action: 'save', headline: 'The next weekly draft' })).creative;
    assert.notEqual(draftClone.id, evergreenA.id); assert.equal(draftClone.previousId, evergreenA.id); assert.equal(draftClone.status, 'draft');
    assert.equal((await service.getCreative(publisher, evergreenA.id)).headline, evergreenA.headline);
    assert.equal((await resolve(schoolA)).sponsor.creativeId, evergreenA.id);
    const stale = draftClone.revision;
    draftClone = (await service.saveCreative(sponsorA, { id: draftClone.id, revision: stale, body: 'Updated draft copy for the next edition.' })).creative;
    await rejectsStatus(() => service.saveCreative(sponsorA, { id: draftClone.id, revision: stale, headline: 'Stale edit' }), 409);
    await rejectsStatus(() => service.saveCreative(publisher, { id: evergreenA.id, revision: evergreenA.revision - 1, action: 'save' }), 409);
    await rejectsStatus(() => service.saveCreative(sponsorA, { id: evergreenA.id, revision: evergreenA.revision, action: 'archive' }), 403);
    draftClone = (await service.saveCreative(sponsorA, { id: draftClone.id, revision: draftClone.revision, action: 'archive' })).creative;
    assert.equal(draftClone.status, 'archived');
  });

  await test('dashboards expose only the selected authorized sponsor and no publisher controls to sponsors', async () => {
    const dashboard = await service.dashboard(sponsorA, brandA.id);
    assert.deepEqual(dashboard.sponsors.map((brand) => brand.id), [brandA.id]);
    assert.ok(dashboard.creatives.every((item) => item.sponsorId === brandA.id));
    assert.ok(dashboard.placements.every((item) => item.sponsorId === brandA.id));
    assert.ok(dashboard.placements.some((item) => item.id === placementA.id));
    assert.ok(!dashboard.placements.some((item) => item.id === placementB.id));
    assert.deepEqual(dashboard.notes, []); assert.deepEqual(dashboard.memberships, []);
    assert.equal(dashboard.user.publisher, false);
    await rejectsStatus(() => service.dashboard(sponsorA, brandB.id), 403);
  });

  await test('scheduled offers start inclusively, end exclusively, and fall back to the standing ad', async () => {
    scheduledA = (await service.saveCreative(publisher, creative(brandA.id, [schoolA], {
      headline: 'Exact-window weekly offer', body: 'Only this publication window uses the weekly offer.', imageUrl: adA.url, imageAlt: 'Weekly offer fixture',
      startsAt: '2030-05-06T11:00:00Z', endsAt: '2030-05-13T11:00:00Z', evergreen: false, action: 'publish',
    }))).creative;
    assert.equal((await resolve(schoolA, '2030-05-06T10:59:59.999Z')).sponsor.creativeId, evergreenA.id);
    assert.equal((await resolve(schoolA, '2030-05-06T11:00:00Z')).sponsor.creativeId, scheduledA.id);
    assert.equal((await resolve(schoolA, '2030-05-13T10:59:59.999Z')).sponsor.creativeId, scheduledA.id);
    assert.equal((await resolve(schoolA, '2030-05-13T11:00:00Z')).sponsor.creativeId, evergreenA.id);
  });

  await test('daily-only offers do not replace the weekly edition advertisement', async () => {
    const daily = (await service.saveCreative(publisher, creative(brandA.id, [schoolA], {
      headline: 'Daily-edition special', startsAt: '2030-05-06T11:00:00Z', endsAt: '2030-05-13T11:00:00Z', evergreen: false, cadence: 'daily', action: 'publish',
    }))).creative;
    assert.equal((await resolve(schoolA, '2030-05-07T12:00:00Z', 'daily')).sponsor.creativeId, daily.id);
    assert.equal((await resolve(schoolA, '2030-05-07T12:00:00Z', 'weekly')).sponsor.creativeId, scheduledA.id);
  });

  await test('self-approved content cannot expand into a later placement requiring publisher review', async () => {
    assert.equal((await resolve(schoolB)).sponsor.creativeId, creativeB.id);
    const later = (await service.savePlacement(publisher, placement(brandB.id, schoolA, { priority: 1000, requiresApproval: true }))).placement;
    assert.notEqual((await resolve(schoolA)).sponsor.id, brandB.id);
    const row = (await client.query('SELECT publisher_approved FROM tribune_private.tribune_sponsor_creatives WHERE id=$1', [creativeB.id])).rows[0];
    assert.equal(row.publisher_approved, false);
    const approvedCopy = (await service.saveCreative(publisher, { id: creativeB.id, revision: creativeB.revision, action: 'publish' })).creative;
    assert.notEqual(approvedCopy.id, creativeB.id);
    assert.equal((await resolve(schoolA)).sponsor.creativeId, approvedCopy.id);
    await service.savePlacement(publisher, { ...later, status: 'paused' });
    assert.notEqual((await resolve(schoolA)).sponsor.id, brandB.id);
  });

  await test('publication settings support create, update, and optimistic conflict rejection', async () => {
    const settings = { revision: 0, masthead: { imageUrl: masthead.url, assetId: masthead.id, alt: 'Fixture Tribune masthead', includesTagline: true },
      officialRulesUrl: 'https://publisher.example.invalid/official-rules', sweepstakesReminder: 'Fixture sweepstakes reminder.', postalAddress: 'Fixture mailing address, Example City' };
    publicationSettings = (await service.savePublication(publisher, settings)).publication;
    assert.equal(publicationSettings.revision, 1);
    publicationSettings = (await service.savePublication(publisher, { ...publicationSettings, postalAddress: 'Updated fixture mailing address, Example City' })).publication;
    assert.equal(publicationSettings.revision, 2);
    await rejectsStatus(() => service.savePublication(publisher, { ...publicationSettings, revision: 1 }), 409);
    await rejectsStatus(() => service.savePublication(publisher, settings), 409);
    await rejectsStatus(() => service.savePublication(sponsorA, publicationSettings), 403);
    await rejectsStatus(() => service.savePublication(publisher, { ...publicationSettings, masthead: { imageUrl: logoA.url, alt: 'Wrong asset kind' } }), 400);
    const resolved = await resolve(schoolA);
    assert.equal(resolved.masthead.imageUrl, masthead.url); assert.equal(resolved.postalAddress, publicationSettings.postalAddress);
  });

  await test('publisher notes honor school, cadence, and the Phoenix publication date', async () => {
    noteGlobal = await saveNote({ title: 'Fixture global note', body: 'A fixture message for every school.', schoolIds: [], cadence: 'both', action: 'publish' });
    noteSchool = await saveNote({ title: 'Fixture school weekly note', body: 'A fixture message for this school.\n\nA second fixture paragraph.',
      byline: 'Fixture Publisher', imageUrl: noteImage.url, schoolIds: [schoolA], cadence: 'weekly', issueDate: '2030-05-06', action: 'publish' });
    assert.equal((await resolve(schoolA, '2030-05-07T06:59:59Z', 'weekly')).publisherNote.id, noteSchool.id);
    assert.equal((await resolve(schoolA, '2030-05-07T06:59:59Z', 'daily')).publisherNote.id, noteGlobal.id);
    assert.equal((await resolve(schoolB, '2030-05-07T06:59:59Z', 'weekly')).publisherNote.id, noteGlobal.id);
    assert.equal((await resolve(schoolA, '2030-05-07T07:00:00Z', 'weekly')).publisherNote.id, noteGlobal.id);
    await rejectsStatus(() => service.getNote(sponsorA, noteSchool.id), 403);
    await rejectsStatus(() => service.saveNote(sponsorA, { title: 'Unauthorized note', body: 'Fixture body' }), 403);
    await rejectsStatus(() => service.saveNote(publisher, { title: 'Wrong image owner', body: 'Fixture body', imageUrl: adA.url }), 400);
  });

  await test('note revisions reject stale edits and draft changes stay out of resolved editions', async () => {
    const oldRevision = noteSchool.revision;
    noteSchool = await saveNote({ id: noteSchool.id, revision: oldRevision, body: 'Revised school note, pending publication.', action: 'save' });
    assert.equal(noteSchool.status, 'draft');
    assert.equal((await resolve(schoolA, '2030-05-07T06:59:59Z', 'weekly')).publisherNote.id, noteGlobal.id);
    await rejectsStatus(() => service.saveNote(publisher, { id: noteSchool.id, revision: oldRevision, action: 'publish' }), 409);
    noteSchool = await saveNote({ id: noteSchool.id, revision: noteSchool.revision, action: 'publish' });
    assert.equal((await resolve(schoolA, '2030-05-07T06:59:59Z', 'weekly')).publisherNote.paragraphs[0], noteSchool.body);
  });

  await test('invalid timestamps and unsafe links fail before any database write', async () => {
    const before = statements.length;
    for (const invalid of ['2030-02-30T12:00:00Z', '2030-05-06T12:00:00', '2030-05-06T24:00:00Z', '2030-05-06T12:61:00Z']) {
      assert.equal(validation.creativeInput.safeParse(creative(brandA.id, [schoolA], { startsAt: invalid })).success, false);
    }
    for (const invalid of ['javascript:alert(1)', 'http://example.invalid/', 'https://user:password@example.invalid/', 'https://example.invalid/\nheader']) {
      assert.equal(validation.creativeInput.safeParse(creative(brandA.id, [schoolA], { url: invalid })).success, false);
    }
    assert.equal(validation.creativeInput.safeParse(creative(brandA.id, [schoolA], { evergreen: false, startsAt: '2030-05-06T11:00:00Z', endsAt: '2030-05-06T11:00:00Z' })).success, false);
    assert.equal(validation.noteInput.safeParse({ body: 'Fixture note', issueDate: '2030-02-30' }).success, false);
    assert.equal(validation.publicationInput.safeParse({ revision: 1, masthead: null, officialRulesUrl: 'data:text/html,bad' }).success, false);
    assert.equal(statements.length, before);
  });

  await test('preview HTML and text contain the same saved copy without writes or messaging dependencies', async () => {
    const before = statements.length;
    const rendered = await preview.publicationPreview(publisher, { hsid: schoolA, cadence: 'weekly', creativeId: scheduledA.id, noteId: noteSchool.id });
    for (const content of [scheduledA.headline, scheduledA.body, noteSchool.title, noteSchool.body, publicationSettings.postalAddress]) {
      assert.ok(rendered.html.includes(content)); assert.ok(rendered.text.includes(content));
    }
    assert.ok(rendered.html.includes(masthead.url)); assert.ok(rendered.html.includes(publicationSettings.officialRulesUrl));
    assert.ok(rendered.text.includes(publicationSettings.officialRulesUrl));
    assert.match(rendered.subject, /Tribune/);
    assert.ok(rendered.warnings.some((warning) => /preview/i.test(warning)));
    assert.ok(statements.slice(before).every((sql) => /^\s*SELECT\b/i.test(sql)), 'Preview must issue only SELECT statements.');
    assert.ok([...loadedFiles].every((file) => !/(alumniEmailSender|armsProfile|\/stripe\/|tribune\/story\.ts)/i.test(file)), 'Preview must not load delivery, payment, CRM, or AI story code.');
  });

  await test('preview does not reveal another sponsor draft or publisher-only settings', async () => {
    await rejectsStatus(() => preview.publicationPreview(sponsorA, { hsid: schoolA, cadence: 'daily', creativeId: creativeB.id }), 404);
    await rejectsStatus(() => preview.publicationPreview(sponsorA, { hsid: schoolB, cadence: 'daily' }), 403);
    await rejectsStatus(() => preview.publicationPreview(sponsorA, { hsid: schoolA, cadence: 'daily', noteId: noteSchool.id }), 403);
    await rejectsStatus(() => preview.publicationPreview(sponsorA, { hsid: schoolA, cadence: 'daily', publication: publicationSettings }), 403);
  });

  await test('orders require matching schools and confirmed payment before activation', async () => {
    const order = (await client.query(`INSERT INTO public.sponsor_orders(sponsorship_type,hsid,status,purchaser_email)
      VALUES('tribune-test',$1,'pending',$2) RETURNING id::text`, [schoolA, `fixture-buyer-${runId}@example.invalid`])).rows[0];
    createdOrderIds.push(order.id); saveManifest();
    await rejectsStatus(() => service.savePlacement(publisher, placement(brandA.id, schoolB, { sponsorOrderId: order.id })), 400);
    await rejectsStatus(() => service.savePlacement(publisher, placement(brandA.id, schoolA, { sponsorOrderId: order.id })), 409);
    const paused = (await service.savePlacement(publisher, placement(brandA.id, schoolA, { sponsorOrderId: order.id, status: 'paused' }))).placement;
    assert.equal(paused.status, 'paused');
    await client.query("UPDATE public.sponsor_orders SET status='paid' WHERE id=$1", [order.id]);
    const active = (await service.savePlacement(publisher, { ...paused, status: 'active' })).placement;
    assert.equal(active.sponsorOrderId, order.id); assert.equal(active.status, 'active');
    await rejectsStatus(() => service.savePlacement(publisher, placement(brandB.id, schoolA, { sponsorOrderId: order.id, status: 'paused' })), 409);
    const visible = await service.dashboard(sponsorA, brandA.id);
    assert.ok(visible.orders.some((item) => item.id === order.id));
    assert.ok(!(await service.dashboard(sponsorB, brandB.id)).orders.some((item) => item.id === order.id));
    // Removing an association must not erase who owns its paid order. This
    // reaches the atomic claim path after the earlier placement check is empty.
    await service.savePlacement(publisher, { ...active, sponsorOrderId: null });
    await rejectsStatus(() => service.savePlacement(publisher, placement(brandB.id, schoolA, { sponsorOrderId: order.id, status: 'paused' })), 409);
    const claim = (await client.query('SELECT sponsor_id::text FROM tribune_private.partner_sponsor_order_claims WHERE order_id=$1', [order.id])).rows[0];
    assert.equal(claim.sponsor_id, brandA.id);
    const reused = (await service.savePlacement(publisher, placement(brandA.id, schoolA, { sponsorOrderId: order.id, status: 'paused' }))).placement;
    assert.equal(reused.sponsorId, brandA.id); assert.equal(reused.sponsorOrderId, order.id);
  });

  await test('service writes produce audit records tied to the verified fixture actor', async () => {
    const actions = (await client.query('SELECT action,entity_type FROM tribune_private.partner_portal_audit WHERE actor_uid=$1', [publisher.uid])).rows;
    assert.ok(actions.some((item) => item.entity_type === 'creative' && item.action === 'publish'));
    assert.ok(actions.some((item) => item.entity_type === 'publication' && item.action === 'save'));
    assert.ok(actions.some((item) => item.entity_type === 'note' && item.action === 'publish'));
  });

  await test('editing a membership updates that exact grant and revokes the former tuple', async () => {
    const original = (await service.saveMembership(publisher, { uid: sponsorA.uid, sponsorId: brandA.id, role: 'sponsor', isActive: true })).membership;
    assert.equal(original.revision, 1);
    const changed = (await service.saveMembership(publisher, { ...original, uid: sponsorB.uid, sponsorId: brandB.id })).membership;
    assert.equal(changed.id, original.id); assert.equal(changed.revision, 2);
    assert.equal((await client.query('SELECT count(*)::int AS n FROM tribune_private.partner_portal_memberships WHERE firebase_uid=$1 AND sponsor_id=$2', [sponsorA.uid, brandA.id])).rows[0].n, 0);
    await rejectsStatus(() => service.saveMembership(publisher, { ...original, isActive: false }), 409);
    const latest = (await client.query('SELECT firebase_uid,sponsor_id::text,is_active,revision FROM tribune_private.partner_portal_memberships WHERE id=$1', [original.id])).rows[0];
    assert.deepEqual(latest, { firebase_uid: sponsorB.uid, sponsor_id: brandB.id, is_active: true, revision: 2 });
    await rejectsStatus(() => service.saveMembership(publisher, { uid: sponsorB.uid, sponsorId: brandB.id, role: 'sponsor', isActive: false }), 409);
    const elevated = (await service.saveMembership(publisher, { ...changed, role: 'publisher', sponsorId: null })).membership;
    assert.equal(elevated.id, original.id); assert.equal(elevated.revision, 3); assert.equal(elevated.sponsorId, null);
    await rejectsStatus(() => service.saveMembership(sponsorA, { ...elevated, isActive: false }), 403);
  });
  await test('membership edits cannot remove or reassign the acting publisher grant', async () => {
    const own = (await service.saveMembership(publisher, { uid: publisher.uid, role: 'publisher', sponsorId: null, isActive: true })).membership;
    for (const changes of [{ isActive: false }, { uid: 'different-fixture-uid' }, { role: 'sponsor', sponsorId: brandA.id }]) {
      await rejectsStatus(() => service.saveMembership(publisher, { ...own, ...changes }), 409);
    }
    await rejectsStatus(() => service.saveMembership(publisher, { ...own, id: '922337203685477580' }), 404);
    await rejectsStatus(() => service.saveMembership(publisher, { uid: sponsorA.uid, role: 'sponsor', sponsorId: '922337203685477580', isActive: true }), 404);
  });

  await test('sponsor card level and images enforce their independent ownership boundary', async () => {
    [frontA, frontB, bannerA, fullA] = await Promise.all([
      asset('card_front', brandA.id), asset('card_front', brandB.id), asset('card_banner', brandA.id), asset('card_full', brandA.id),
    ]);
    const before = statements.length;
    for (const level of ['MLB', 'COLLEGE', 'PLAYER', 'sponsor']) {
      assert.equal(cardValidation.sponsorCardInput.safeParse(sponsorCard(brandA.id, [], { level })).success, false);
      await assert.rejects(() => cards.saveSponsorCard(sponsorA, sponsorCard(brandA.id, [], { level })), error => error.name === 'ZodError');
    }
    assert.equal(statements.length, before, 'An invalid level must fail before a database statement.');
    await rejectsStatus(() => cards.saveSponsorCard(sponsorA, sponsorCard(brandB.id, [])), 403);
    await rejectsStatus(() => cards.saveSponsorCard(sponsorA, sponsorCard(brandA.id, [], { frontImageUrl: frontB.url })), 400);
    await rejectsStatus(() => cards.saveSponsorCard(publisher, sponsorCard(brandA.id, [], { frontImageUrl: adA.url })), 400);
    await rejectsStatus(() => cards.saveSponsorCard(publisher, sponsorCard(brandA.id, [], { fullImageUrl: frontA.url, fullImageAlt: 'Wrong asset kind' })), 400);
    await rejectsStatus(() => cards.saveSponsorCard(publisher, sponsorCard(brandA.id, [], { frontImageUrl: 'https://external.example.invalid/mutable.png' })), 400);
    cardA = (await cards.saveSponsorCard(sponsorA, sponsorCard(brandA.id, []))).card;
    assert.equal(cardA.level, 'SPONSOR'); assert.equal(cardA.status, 'draft');
    assert.equal((await client.query('SELECT level,content->>\'level\' AS content_level FROM tribune_private.sponsor_flip_cards WHERE id=$1', [cardA.id])).rows[0].content_level, 'SPONSOR');
  });

  await test('newsletter and splash sponsorships alone never entitle a title sponsor card', async () => {
    await client.query(`INSERT INTO public.school_splash_sponsorships(hsid,sponsor_id,status,starts_at,source)
      VALUES($1,$2,'active','2020-01-01T00:00:00Z','isolated-card-fixture')`, [schoolA, brandA.id]);
    assert.ok((await service.dashboard(sponsorA, brandA.id)).placements.length > 0);
    await rejectsStatus(() => cards.saveSponsorCard(sponsorA, { ...cardA, action: 'submit' }), 409);
    await rejectsStatus(() => cards.saveSponsorCard(sponsorA, { ...cardA, schoolIds: [schoolA] }), 403);
    await rejectsStatus(() => cards.sponsorCardPreview(sponsorA, { hsid: schoolA, cardId: cardA.id }), 403);
    assert.equal(await publicCard(schoolA, brandA.id), undefined);
  });

  await test('publishers assign separate card placements and sponsor dashboard reads stay scoped', async () => {
    await rejectsStatus(() => cards.saveSponsorCardPlacement(sponsorA, placement(brandA.id, schoolA)), 403);
    await rejectsStatus(() => cards.saveSponsorCardPlacement(publisher, placement('922337203685477580', schoolA)), 404);
    cardPlacementA = (await cards.saveSponsorCardPlacement(publisher, placement(brandA.id, schoolA))).placement;
    cardPlacementB = (await cards.saveSponsorCardPlacement(publisher, placement(brandB.id, schoolB, { requiresApproval: false }))).placement;
    cardA = (await cards.saveSponsorCard(sponsorA, { ...cardA, schoolIds: [schoolA], action: 'submit' })).card;
    assert.equal(cardA.status, 'pending'); assert.equal(await publicCard(schoolA, brandA.id), undefined);
    await rejectsStatus(() => cards.saveSponsorCard(sponsorA, { ...cardA, action: 'publish' }), 403);
    cardA = (await cards.saveSponsorCard(publisher, { ...cardA, action: 'publish' })).card;
    cardB = (await cards.saveSponsorCard(sponsorB, sponsorCard(brandB.id, [], { action: 'submit' }))).card;
    assert.equal(cardB.status, 'published');
    const scoped = await cards.sponsorCardDashboard(sponsorA, brandA.id);
    assert.deepEqual(scoped.cards.map(card => card.id), [cardA.id]);
    assert.deepEqual(scoped.cardPlacements.map(item => item.id), [cardPlacementA.id]);
    assert.deepEqual((await cards.sponsorCardDashboard(sponsorB, brandB.id)).cardPlacements.map(item => item.id), [cardPlacementB.id]);
    await rejectsStatus(() => cards.sponsorCardDashboard(sponsorA, brandB.id), 403);
    await rejectsStatus(() => cards.saveSponsorCard(sponsorA, { ...cardB, headline: 'Cross-sponsor edit' }), 404);
    await rejectsStatus(() => cards.sponsorCardPreview(sponsorA, { hsid: schoolB, cardId: cardB.id }), 404);
    assert.equal((await publicCard(schoolA, brandA.id)).id, cardA.id);
    assert.equal((await publicCard(schoolB, brandB.id)).id, cardB.id);
    assert.equal(await publicCard(schoolB, brandA.id), undefined);
  });

  await test('a later review-required placement cannot inherit a self-approved card', async () => {
    await cards.saveSponsorCardPlacement(publisher, placement(brandB.id, schoolA));
    assert.equal(await publicCard(schoolA, brandB.id), undefined);
    assert.equal((await publicCard(schoolB, brandB.id)).id, cardB.id);
    assert.ok((await service.searchSchools(sponsorB, schoolA)).schools.some(school => school.hsid === schoolA));
    const approved = (await cards.saveSponsorCard(publisher, { ...cardB, action: 'publish' })).card;
    assert.notEqual(approved.id, cardB.id); assert.equal(approved.previousId, cardB.id);
    assert.equal((await publicCard(schoolA, brandB.id)).id, approved.id);
    assert.equal((await publicCard(schoolB, brandB.id)).id, approved.id);
    cardB = approved;
  });

  await test('published card edits clone immutable copy and draft revisions reject stale saves', async () => {
    const original = cardA;
    cardDraft = (await cards.saveSponsorCard(sponsorA, { ...original, headline: 'Fixture revised card headline', action: 'save' })).card;
    assert.notEqual(cardDraft.id, original.id); assert.equal(cardDraft.previousId, original.id); assert.equal(cardDraft.status, 'draft');
    assert.equal((await publicCard(schoolA, brandA.id)).id, original.id);
    const oldRevision = cardDraft.revision;
    cardDraft = (await cards.saveSponsorCard(sponsorA, { ...cardDraft, body: 'A second fixture revision.' })).card;
    assert.equal(cardDraft.revision, oldRevision + 1);
    await rejectsStatus(() => cards.saveSponsorCard(sponsorA, { ...cardDraft, revision: oldRevision, action: 'submit' }), 409);
    const savedOriginal = (await client.query('SELECT status,revision,content FROM tribune_private.sponsor_flip_cards WHERE id=$1', [original.id])).rows[0];
    assert.equal(savedOriginal.status, 'published'); assert.equal(savedOriginal.revision, original.revision);
    assert.equal(savedOriginal.content.headline, original.headline);
    cardA = (await cards.saveSponsorCard(publisher, { ...cardDraft, action: 'publish' })).card;
    assert.equal((await publicCard(schoolA, brandA.id)).id, cardA.id);
    await rejectsStatus(() => cards.saveSponsorCard(sponsorA, { ...cardA, action: 'archive' }), 403);
  });

  await test('all three card backs enforce readiness and preserve their distinct saved content', async () => {
    for (const extra of [
      { firstName: '', lastName: '' }, { frontImageUrl: '', frontImageAlt: '' },
      { backTemplate: 'banner_text', headline: '' }, { backTemplate: 'share_promotion', body: '' },
      { backTemplate: 'full_image', fullImageUrl: '', fullImageAlt: '' },
    ]) await rejectsStatus(() => cards.saveSponsorCard(publisher, sponsorCard(brandA.id, [schoolA], { ...extra, action: 'publish' })), 400);
    const templates = [
      { backTemplate: 'banner_text', bannerImageUrl: bannerA.url, bannerImageAlt: 'Fixture banner', headline: 'Banner fixture headline', body: 'Banner fixture message.' },
      { backTemplate: 'share_promotion', headline: 'Share fixture headline', body: 'Invite fellow alumni to follow this program.', ctaLabel: 'Share our program', ctaUrl: '' },
      { backTemplate: 'full_image', fullImageUrl: fullA.url, fullImageAlt: 'Complete fixture card back', headline: '', body: '' },
    ];
    for (const template of templates) {
      const saved = (await cards.saveSponsorCard(publisher, sponsorCard(brandA.id, [schoolA], { ...template, action: 'publish' }))).card;
      const visible = await publicCard(schoolA, brandA.id);
      assert.equal(visible.id, saved.id); assert.equal(visible.backTemplate, template.backTemplate);
      assert.equal(visible.level, 'SPONSOR'); assert.equal('status' in visible, false); assert.equal('previousId' in visible, false);
      if (template.backTemplate === 'share_promotion') assert.equal(visible.ctaUrl, `https://${schoolA}.yatstats.com/`);
      if (template.backTemplate === 'full_image') assert.equal(visible.fullImageUrl, fullA.url);
      cardA = saved;
    }
  });

  await test('card version and placement dates use inclusive starts and exclusive ends', async () => {
    const scheduled = (await cards.saveSponsorCard(publisher, { ...cardA, startsAt: '2030-05-06T12:00:00Z', endsAt: '2030-05-06T13:00:00Z', action: 'publish' })).card;
    assert.equal((await publicCard(schoolA, brandA.id, '2030-05-06T11:59:59Z')).id, cardA.id);
    assert.equal((await publicCard(schoolA, brandA.id, '2030-05-06T12:00:00Z')).id, scheduled.id);
    assert.equal((await publicCard(schoolA, brandA.id, '2030-05-06T12:59:59Z')).id, scheduled.id);
    assert.equal((await publicCard(schoolA, brandA.id, '2030-05-06T13:00:00Z')).id, cardA.id);
    cardPlacementA = (await cards.saveSponsorCardPlacement(publisher, { ...cardPlacementA, startsAt: '2030-05-06T12:00:00Z', endsAt: '2030-05-06T13:00:00Z' })).placement;
    assert.equal(await publicCard(schoolA, brandA.id, '2030-05-06T11:59:59Z'), undefined);
    assert.equal((await publicCard(schoolA, brandA.id, '2030-05-06T12:00:00Z')).id, scheduled.id);
    assert.equal(await publicCard(schoolA, brandA.id, '2030-05-06T13:00:00Z'), undefined);
    cardPlacementA = (await cards.saveSponsorCardPlacement(publisher, { ...cardPlacementA, startsAt: '2020-01-01T00:00:00Z', endsAt: null })).placement;
  });

  await test('unpaid, refunded, expired, and inactive title placements stay out of the public gallery', async () => {
    const order = (await client.query(`INSERT INTO public.sponsor_orders(sponsorship_type,hsid,status,purchaser_email)
      VALUES('sponsor-card-test',$1,'pending',$2) RETURNING id::text`, [schoolA, `fixture-buyer-${runId}@example.invalid`])).rows[0];
    createdOrderIds.push(order.id); saveManifest();
    await rejectsStatus(() => cards.saveSponsorCardPlacement(publisher, placement(brandA.id, schoolA, { sponsorOrderId: order.id })), 409);
    await rejectsStatus(() => cards.saveSponsorCardPlacement(publisher, placement(brandA.id, schoolB, { sponsorOrderId: order.id })), 400);
    let paidPlacement = (await cards.saveSponsorCardPlacement(publisher, placement(brandA.id, schoolA, { sponsorOrderId: order.id, status: 'paused' }))).placement;
    cardPlacementA = (await cards.saveSponsorCardPlacement(publisher, { ...cardPlacementA, status: 'paused' })).placement;
    assert.equal(await publicCard(schoolA, brandA.id), undefined);
    await client.query("UPDATE public.sponsor_orders SET status='paid' WHERE id=$1", [order.id]);
    paidPlacement = (await cards.saveSponsorCardPlacement(publisher, { ...paidPlacement, status: 'active' })).placement;
    assert.ok(await publicCard(schoolA, brandA.id));
    await client.query("UPDATE public.sponsor_orders SET status='refunded' WHERE id=$1", [order.id]);
    assert.equal(await publicCard(schoolA, brandA.id), undefined);
    await client.query("UPDATE public.sponsor_orders SET status='paid' WHERE id=$1", [order.id]);
    paidPlacement = (await cards.saveSponsorCardPlacement(publisher, { ...paidPlacement, endsAt: '2030-05-06T12:00:00Z' })).placement;
    assert.equal(await publicCard(schoolA, brandA.id), undefined);
    paidPlacement = (await cards.saveSponsorCardPlacement(publisher, { ...paidPlacement, endsAt: null })).placement;
    brandA = (await service.saveBrand(publisher, { ...brandA, isActive: false })).brand;
    assert.equal(await publicCard(schoolA, brandA.id), undefined);
    brandA = (await service.saveBrand(publisher, { ...brandA, isActive: true })).brand;
    assert.ok(await publicCard(schoolA, brandA.id));
    // A saved claim survives detaching the order. Both card and newsletter
    // reassignment must continue to reject another sponsor atomically.
    paidPlacement = (await cards.saveSponsorCardPlacement(publisher, { ...paidPlacement, sponsorOrderId: null, status: 'paused' })).placement;
    await rejectsStatus(() => cards.saveSponsorCardPlacement(publisher, placement(brandB.id, schoolA, { sponsorOrderId: order.id, status: 'paused' })), 409);
    await rejectsStatus(() => service.savePlacement(publisher, placement(brandB.id, schoolA, { sponsorOrderId: order.id, status: 'paused' })), 409);
    assert.equal((await client.query('SELECT sponsor_id::text FROM tribune_private.partner_sponsor_order_claims WHERE order_id=$1', [order.id])).rows[0].sponsor_id, brandA.id);
    paidPlacement = (await cards.saveSponsorCardPlacement(publisher, { ...paidPlacement, sponsorOrderId: order.id })).placement;
    assert.equal(paidPlacement.sponsorOrderId, order.id);
    cardPlacementA = (await cards.saveSponsorCardPlacement(publisher, { ...cardPlacementA, status: 'active' })).placement;
  });

  await test('card preview reads saved versions without publishing, messaging, or cross-sponsor disclosure', async () => {
    cardDraft = (await cards.saveSponsorCard(sponsorA, { ...cardA, backTemplate: 'banner_text', headline: 'Unpublished preview fixture', body: 'Private review message.', action: 'save' })).card;
    const before = statements.length;
    const rendered = await cards.sponsorCardPreview(sponsorA, { hsid: schoolA, cardId: cardDraft.id });
    assert.equal(rendered.card.headline, cardDraft.headline); assert.equal(rendered.card.body, cardDraft.body);
    assert.ok(rendered.warnings.some(warning => /draft|review proof/i.test(warning)));
    assert.ok(rendered.warnings.some(warning => /publisher approval/i.test(warning)));
    assert.ok(statements.slice(before).every(sql => /^\s*SELECT\b/i.test(sql)), 'Card preview must issue only SELECT statements.');
    assert.equal((await client.query('SELECT status,revision FROM tribune_private.sponsor_flip_cards WHERE id=$1', [cardDraft.id])).rows[0].status, 'draft');
    await rejectsStatus(() => cards.sponsorCardPreview(sponsorB, { hsid: schoolA, cardId: cardDraft.id }), 404);
    await rejectsStatus(() => cards.sponsorCardPreview(sponsorA, { hsid: schoolB, cardId: cardDraft.id }), 403);
    assert.ok([...loadedFiles].every(file => !/(alumniEmailSender|armsProfile|\/stripe\/|tribune\/story\.ts)/i.test(file)));
    const audit = (await client.query("SELECT entity_type,action FROM tribune_private.partner_portal_audit WHERE actor_uid=$1 AND entity_type LIKE 'sponsor_card%'", [publisher.uid])).rows;
    assert.ok(audit.some(row => row.entity_type === 'sponsor_card' && row.action === 'publish'));
    assert.ok(audit.some(row => row.entity_type === 'sponsor_card_placement' && row.action === 'create'));
  });

  if (useHttp) await cleanHttpFixtures();
  else { await client.query('ROLLBACK'); inTransaction = false; }
  currentTest = 'verify cleanup removed all fixture rows';
  const remaining = (await client.query(`SELECT
    (SELECT count(*) FROM public.sponsor_brands WHERE id=ANY($1::bigint[])) +
    (SELECT count(*) FROM tribune_private.tribune_sponsor_creatives WHERE sponsor_id=ANY($1::bigint[])) +
    (SELECT count(*) FROM tribune_private.school_tribune_sponsorships WHERE sponsor_id=ANY($1::bigint[])) +
    (SELECT count(*) FROM tribune_private.sponsor_flip_cards WHERE sponsor_id=ANY($1::bigint[])) +
    (SELECT count(*) FROM tribune_private.school_sponsor_card_placements WHERE sponsor_id=ANY($1::bigint[])) +
    (SELECT count(*) FROM public.school_splash_sponsorships WHERE sponsor_id=ANY($1::bigint[])) +
    (SELECT count(*) FROM tribune_private.publisher_notes WHERE id=ANY($2::bigint[])) +
    (SELECT count(*) FROM tribune_private.partner_portal_assets WHERE created_by=$3) +
    (SELECT count(*) FROM tribune_private.partner_portal_audit WHERE actor_uid=ANY($4::text[])) +
    (SELECT count(*) FROM tribune_private.partner_sponsor_order_claims WHERE sponsor_id=ANY($1::bigint[])) +
    (SELECT count(*) FROM tribune_private.partner_portal_memberships WHERE created_by=$3) +
    (SELECT count(*) FROM public.sponsor_orders WHERE id=ANY($5::bigint[])) AS total`,
  [[brandA.id, brandB.id], createdNoteIds, publisher.uid, [publisher.uid, sponsorA.uid, sponsorB.uid], createdOrderIds])).rows[0];
  assert.equal(Number(remaining.total), 0);
  assert.deepEqual((await client.query('SELECT to_jsonb(settings) AS row FROM tribune_private.tribune_publication_settings settings ORDER BY id')).rows, originalSettings);
  rollbackVerified = true;
  if (useHttp) fs.rmSync(manifestPath, { force: true });
  console.log(`${passed} PostgreSQL partner service integration checks passed; ${useHttp ? 'autocommit fixture cleanup' : 'rollback'} verified, no fixture rows remain.`);
}

main().catch((error) => {
  console.error(`FAIL ${currentTest}`, safeError(error));
  process.exitCode = 1;
}).finally(async () => {
  if (inTransaction) {
    try { await client.query('ROLLBACK'); console.log('All integration-test changes rolled back after failure.'); }
    catch (error) { console.error('Rollback could not be acknowledged; closing the uncommitted connection.', safeError(error)); }
  }
  if (useHttp && httpCleanupNeeded) {
    try { await cleanHttpFixtures(); fs.rmSync(manifestPath, { force: true }); console.log('Tracked HTTP-mode fixture rows removed after failure.'); }
    catch (error) { console.error('HTTP fixture cleanup needs attention. Recovery manifest: ' + manifestPath, safeError(error)); }
  }
  await client.end().catch(() => {});
  if (!rollbackVerified && !process.exitCode) process.exitCode = 1;
});
