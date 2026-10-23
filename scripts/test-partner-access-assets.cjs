/* Offline partner authorization and image regression checks. No external writes. */
/* eslint-disable @typescript-eslint/no-require-imports -- This is a CommonJS test harness. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const root = path.resolve(__dirname, '..');
const localRequire = createRequire(path.join(root, 'package.json'));
const ts = localRequire('typescript');
const sharp = localRequire('sharp');
let queries = [], writes = [], uploads = [], verifications = [];
let identity = { uid: 'fixture-sponsor', email: 'sponsor@example.invalid' };
let memberships = [{ sponsor_id: '41', role: 'sponsor', is_active: true }];
let databaseUnavailable = false, sponsorExists = true, failUpload = false, failAssetInsert = false;
const cache = new Map();
function load(filename) {
  filename = path.resolve(root, filename);
  if (cache.has(filename)) return cache.get(filename).exports;
  const mod = { exports: {} }; cache.set(filename, mod);
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const req = (id) => {
    if (id === 'server-only') return {};
    if (id === '@/lib/db') throw new Error('Private partner operations must not use the shared database.');
    if (id === '@/lib/tribune/db') return { query: async (sql, params) => {
      queries.push({ sql, params });
      if (databaseUnavailable) throw Error('offline database failure');
      if (/partner_portal_memberships/.test(sql)) return { rows: memberships };
      if (/SELECT id FROM public.sponsor_brands/.test(sql)) return { rows: sponsorExists ? [{ id: params[0] }] : [] };
      if (/INSERT INTO public.partner_portal_assets/.test(sql)) {
        if (failAssetInsert) throw Error('offline record failure');
        writes.push({ sql, params }); return { rows: [], rowCount: 1 };
      }
      throw Error('Unexpected query in offline test');
    } };
    if (id === '@/lib/firebaseIdToken') return { verifyFirebaseIdToken: async (token) => { verifications.push(token); return identity; } };
    if (id === '@/lib/stories') return { putPublicAsset: async (...args) => { if (failUpload) throw Error('offline upload failure'); uploads.push(args); } };
    if (id === 'next/server') return { NextResponse: { json: (body, opts = {}) => new Response(JSON.stringify(body), { ...opts, headers: { 'content-type': 'application/json', ...(opts.headers || {}) } }) } };
    if (id.startsWith('@/')) return load(path.join(root, 'src', id.slice(2)) + '.ts');
    if (id.startsWith('.')) return load(path.resolve(path.dirname(filename), id) + '.ts');
    return localRequire(id);
  };
  new Function('require', 'module', 'exports', '__filename', '__dirname', source)(req, mod, mod.exports, filename, path.dirname(filename));
  return mod.exports;
}
const access = load('src/lib/partners/access.ts');
const assets = load('src/lib/partners/assets.ts');
const config = load('src/app/api/partners/config/route.ts');
const upload = load('src/app/api/partners/upload/route.ts');
const originalEnv = { ...process.env };
let passed = 0;
function reset() {
  queries = []; writes = []; uploads = []; verifications = [];
  identity = { uid: 'fixture-sponsor', email: 'sponsor@example.invalid' };
  memberships = [{ sponsor_id: '41', role: 'sponsor', is_active: true }];
  databaseUnavailable = failUpload = failAssetInsert = false;
  sponsorExists = true;
  for (const key of Object.keys(process.env)) if (/^(NEXT_PUBLIC_FIREBASE_|FIREBASE_|PARTNER_PUBLISHER_UIDS)/.test(key)) delete process.env[key];
  process.env.FIREBASE_PROJECT_ID = 'fixture-project';
}
async function test(name, fn) { reset(); await fn(); passed++; console.log('PASS', name); }
const bearer = { authorization: 'Bearer header.payload.signature' };
const publisher = { uid: 'fixture-publisher', email: 'publisher@example.invalid', publisher: true, sponsorIds: [] };
const sponsor = { uid: 'fixture-sponsor', email: 'sponsor@example.invalid', publisher: false, sponsorIds: ['41'] };
function request(form, headers = bearer) {
  return new Request('https://portal.example.invalid/api/partners/upload', { method: 'POST', headers, body: form });
}
function imageForm(data, type, kind = 'logo', sponsorId = '41') {
  const form = new FormData();
  form.append('file', new Blob([data], { type }), 'original-private-name.png');
  form.append('kind', kind);
  if (sponsorId !== undefined) form.append('sponsorId', sponsorId);
  return form;
}
const hasStatus = (status) => (error) => error instanceof access.PartnerAccessError && error.status === status;

async function main() {
  await test('plain session cookies and profile-looking headers never authenticate', async () => {
    await assert.rejects(() => access.requirePartnerAccess({ headers: new Headers({ cookie: 'yat-platform-session={"role":"publisher","firebaseUid":"fixture-publisher"}', 'x-firebase-token': 'header.payload.signature' }) }), hasStatus(401));
    assert.equal(verifications.length, 0); assert.equal(queries.length, 0);
  });
  await test('invalid Firebase verification cannot read memberships', async () => {
    identity = null;
    await assert.rejects(() => access.requirePartnerAccess({ headers: new Headers(bearer) }), hasStatus(401));
    assert.equal(verifications.length, 1); assert.equal(queries.length, 0);
  });
  await test('verified UID is the sole membership lookup key', async () => {
    const result = await access.requirePartnerAccess({ headers: new Headers(bearer) });
    assert.deepEqual(result, sponsor); assert.deepEqual(queries[0].params, ['fixture-sponsor']);
    assert.match(queries[0].sql, /is_active = true/);
  });
  await test('verified account without an explicit grant is forbidden', async () => {
    memberships = [];
    identity = { uid: 'ungranted-uid', email: 'publisher@example.invalid' };
    await assert.rejects(() => access.requirePartnerAccess({ headers: new Headers(bearer) }), hasStatus(403));
  });
  await test('inactive grants and profile-like role strings do not authorize', () => {
    assert.throws(() => access.resolvePartnerAccess({ uid: 'fixture' }, [
      { sponsor_id: null, role: 'publisher', is_active: false },
      { sponsor_id: null, role: 'admin', is_active: true },
      { sponsor_id: '41', role: 'superfan', is_active: true },
    ]), hasStatus(403));
  });
  await test('publisher grants require the global scope and active flag', () => {
    assert.equal(access.resolvePartnerAccess({ uid: 'fixture' }, [{ sponsor_id: null, role: 'publisher', is_active: true }]).publisher, true);
    assert.throws(() => access.resolvePartnerAccess({ uid: 'fixture' }, [{ sponsor_id: '41', role: 'publisher', is_active: true }]), hasStatus(403));
  });
  await test('publisher bootstrap uses exact private UIDs and never email', () => {
    assert.deepEqual(access.parsePartnerPublisherUids(' fixture-publisher, fixture-publisher '), ['fixture-publisher']);
    assert.equal(access.resolvePartnerAccess({ uid: 'fixture-publisher' }, [], ['fixture-publisher']).publisher, true);
    assert.throws(() => access.resolvePartnerAccess({ uid: 'other', email: 'fixture-publisher' }, [], ['fixture-publisher']), hasStatus(403));
    assert.throws(() => access.parsePartnerPublisherUids('publisher@example.invalid'), hasStatus(503));
  });
  await test('missing authorization storage stays closed even for bootstrap', async () => {
    process.env.PARTNER_PUBLISHER_UIDS = identity.uid; databaseUnavailable = true;
    await assert.rejects(() => access.requirePartnerAccess({ headers: new Headers(bearer) }), hasStatus(503));
  });
  await test('sponsor isolation blocks other brands while publishers can manage them', () => {
    assert.equal(access.assertSponsorAccess(sponsor, '41'), '41');
    assert.throws(() => access.assertSponsorAccess(sponsor, '42'), hasStatus(403));
    assert.equal(access.assertSponsorAccess(publisher, '42'), '42');
  });
  await test('bigint IDs retain precision and invalid or overflowing IDs fail', () => {
    assert.equal(access.normalizeSponsorId('9223372036854775807'), '9223372036854775807');
    assert.equal(access.normalizeSponsorId('00041'), '41');
    for (const invalid of ['0', '-1', '1e2', '1.5', '9223372036854775808', {}, 9007199254740992]) {
      assert.throws(() => access.normalizeSponsorId(invalid), hasStatus(400));
    }
  });
  await test('mastheads and publisher notices are global publisher-only assets', () => {
    for (const kind of ['masthead', 'notice']) {
      assert.throws(() => assets.assertPartnerAssetAccess(sponsor, kind, null), hasStatus(403));
      assert.equal(assets.assertPartnerAssetAccess(publisher, kind, null), null);
      assert.throws(() => assets.assertPartnerAssetAccess(publisher, kind, '41'), hasStatus(400));
    }
    assert.throws(() => assets.assertPartnerAssetAccess(publisher, 'logo', null), hasStatus(400));
  });
  await test('public config contains only allowed Firebase browser fields and availability', async () => {
    process.env.FIREBASE_API_KEY = 'fixture-public-key'; process.env.FIREBASE_AUTH_DOMAIN = 'auth.example.invalid';
    process.env.PARTNER_PUBLISHER_UIDS = 'private-fixture-uid'; process.env.FIREBASE_PRIVATE_KEY = 'never-expose';
    const response = await config.GET(); const body = await response.json();
    assert.equal(body.enabled, true); assert.equal(body.authAvailable, true);
    assert.deepEqual(Object.keys(body).sort(), ['authAvailable', 'enabled', 'firebase']);
    assert.deepEqual(Object.keys(body.firebase).sort(), ['apiKey', 'appId', 'authDomain', 'messagingSenderId', 'projectId', 'storageBucket']);
    assert.doesNotMatch(JSON.stringify(body), /private-fixture|never-expose/); assert.equal(response.headers.get('cache-control'), 'no-store');
  });
  await test('missing or mismatched Firebase browser configuration is unavailable', async () => {
    assert.equal((await (await config.GET()).json()).enabled, false);
    process.env.FIREBASE_API_KEY = 'fixture'; process.env.FIREBASE_AUTH_DOMAIN = 'auth.example.invalid'; process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = 'other-project';
    assert.equal((await (await config.GET()).json()).enabled, false);
  });

  const transparentPng = await sharp({ create: { width: 80, height: 40, channels: 4, background: { r: 34, g: 56, b: 78, alpha: 0.4 } } })
    .withMetadata({ exif: { IFD0: { Artist: 'private fixture attribution' } } }).png().toBuffer();
  const opaqueJpeg = await sharp({ create: { width: 80, height: 40, channels: 3, background: '#264653' } }).withMetadata({ orientation: 6 }).jpeg().toBuffer();
  const transparentWebp = await sharp(transparentPng).webp().toBuffer();
  await test('transparent logo retains alpha/aspect ratio and strips embedded metadata', async () => {
    const output = await assets.normalizePartnerAsset(transparentPng, 'image/png', 'logo');
    const decoded = await sharp(output.body).metadata();
    assert.deepEqual([output.width, output.height, output.contentType], [80, 40, 'image/png']);
    assert.equal(decoded.hasAlpha, true); assert.equal(decoded.exif, undefined); assert.equal(decoded.icc, undefined); assert.equal(decoded.xmp, undefined);
    const raw = await sharp(output.body).raw().toBuffer({ resolveWithObject: true });
    assert.equal(raw.info.channels, 4); assert.ok(raw.data[3] > 0 && raw.data[3] < 255);
  });
  await test('orientation is applied to pixels before metadata is stripped', async () => {
    const output = await assets.normalizePartnerAsset(opaqueJpeg, 'image/jpeg', 'ad');
    assert.deepEqual([output.width, output.height, output.contentType], [40, 80, 'image/jpeg']);
    assert.equal((await sharp(output.body).metadata()).orientation, undefined);
  });
  await test('transparent WebP becomes an email-compatible PNG without losing alpha', async () => {
    const output = await assets.normalizePartnerAsset(transparentWebp, 'image/webp', 'masthead');
    assert.equal(output.contentType, 'image/png'); assert.equal((await sharp(output.body).metadata()).hasAlpha, true);
  });
  await test('SVG, disguised formats, malformed raster, and oversized input are rejected', async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>');
    await assert.rejects(() => assets.normalizePartnerAsset(svg, 'image/svg+xml', 'logo'), hasStatus(415));
    await assert.rejects(() => assets.normalizePartnerAsset(svg, 'image/png', 'logo'), hasStatus(415));
    await assert.rejects(() => assets.normalizePartnerAsset(opaqueJpeg, 'image/png', 'logo'), hasStatus(415));
    await assert.rejects(() => assets.normalizePartnerAsset(Buffer.from('not pixels'), 'image/png', 'logo'), hasStatus(400));
    await assert.rejects(() => assets.normalizePartnerAsset(Buffer.alloc(assets.PARTNER_ASSET_MAX_BYTES + 1), 'image/png', 'logo'), hasStatus(413));
  });
  await test('compressed raster beyond the pixel budget is rejected before publication', async () => {
    const enormous = await sharp({ create: { width: 5000, height: 5000, channels: 3, background: '#ffffff' } }).png().toBuffer();
    assert.ok(enormous.length < assets.PARTNER_ASSET_MAX_BYTES);
    await assert.rejects(() => assets.normalizePartnerAsset(enormous, 'image/png', 'logo'), hasStatus(400));
  });
  await test('animated WebP is rejected instead of silently publishing one frame', async () => {
    const pixels = Buffer.from([255, 0, 0, 255, 0, 255, 0, 255]);
    const animated = await sharp(pixels, { raw: { width: 1, height: 2, channels: 4, pageHeight: 1 } }).webp({ loop: 0, delay: [100, 100] }).toBuffer();
    assert.equal((await sharp(animated).metadata()).pages, 2);
    await assert.rejects(() => assets.normalizePartnerAsset(animated, 'image/webp', 'ad'), hasStatus(400));
  });
  await test('unauthorized image upload has no S3 or asset-record side effects', async () => {
    const response = await upload.POST(request(imageForm(transparentPng, 'image/png', 'logo', '42')));
    assert.equal(response.status, 403); assert.equal(uploads.length, 0); assert.equal(writes.length, 0);
    const masthead = await upload.POST(request(imageForm(transparentPng, 'image/png', 'masthead', undefined)));
    assert.equal(masthead.status, 403); assert.equal(uploads.length, 0);
  });
  await test('successful upload stores a normalized immutable asset with verified ownership', async () => {
    const response = await upload.POST(request(imageForm(transparentPng, 'image/png')));
    assert.equal(response.status, 201); const { asset } = await response.json();
    assert.deepEqual([asset.kind, asset.sponsorId, asset.width, asset.height], ['logo', '41', 80, 40]);
    assert.match(asset.id, /^[a-f0-9-]{36}$/); assert.match(uploads[0][0], /^partners\/sponsors\/41\/logo\/[a-f0-9-]{36}\.png$/);
    assert.equal(uploads[0][2], 'image/png'); assert.equal(writes[0].params[0], asset.id); assert.equal(writes[0].params[6], 'fixture-sponsor');
    assert.equal(writes[0].params[3], asset.url); assert.doesNotMatch(asset.url, /original-private-name/);
    const second = await upload.POST(request(imageForm(transparentPng, 'image/png')));
    assert.notEqual((await second.json()).asset.id, asset.id); assert.notEqual(uploads[1][0], uploads[0][0]);
  });
  await test('publisher notice stores a global asset owned by the verified publisher', async () => {
    identity = { uid: publisher.uid, email: publisher.email }; memberships = [{ sponsor_id: null, role: 'publisher', is_active: true }];
    const form = imageForm(transparentPng, 'image/png', 'notice'); form.delete('sponsorId');
    const response = await upload.POST(request(form)); assert.equal(response.status, 201);
    assert.equal((await response.json()).asset.sponsorId, null); assert.equal(writes[0].params[6], publisher.uid);
    assert.match(uploads[0][0], /^partners\/publication\/notice\//);
  });
  await test('missing sponsor and failed image storage cannot create an asset record', async () => {
    sponsorExists = false;
    assert.equal((await upload.POST(request(imageForm(transparentPng, 'image/png')))).status, 404);
    assert.equal(uploads.length, 0); sponsorExists = true; failUpload = true;
    assert.equal((await upload.POST(request(imageForm(transparentPng, 'image/png')))).status, 503); assert.equal(writes.length, 0);
  });
  await test('failed asset record is not returned as a usable upload', async () => {
    failAssetInsert = true;
    const response = await upload.POST(request(imageForm(transparentPng, 'image/png')));
    assert.equal(response.status, 503); assert.equal((await response.json()).asset, undefined); assert.equal(writes.length, 0);
  });
  await test('multipart field duplication and unknown fields are rejected', async () => {
    const duplicate = imageForm(transparentPng, 'image/png'); duplicate.append('kind', 'masthead');
    assert.equal((await upload.POST(request(duplicate))).status, 400);
    const unknown = imageForm(transparentPng, 'image/png'); unknown.append('firebaseUid', publisher.uid);
    assert.equal((await upload.POST(request(unknown))).status, 400); assert.equal(uploads.length, 0);
  });
  await test('body without content-length still stops at the multipart size limit', async () => {
    const body = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(assets.PARTNER_ASSET_MAX_BYTES + 65537)); controller.close(); } });
    const oversized = new Request('https://portal.example.invalid/api/partners/upload', { method: 'POST', headers: { ...bearer, 'content-type': 'multipart/form-data; boundary=fixture' }, body, duplex: 'half' });
    assert.equal((await upload.POST(oversized)).status, 413); assert.equal(uploads.length, 0); assert.equal(writes.length, 0);
  });
  await test('unauthenticated oversized upload is rejected before parsing', async () => {
    const response = await upload.POST(request('untrusted body', { 'content-type': 'multipart/form-data; boundary=fixture', 'content-length': '99999999' }));
    assert.equal(response.status, 401); assert.equal(queries.length, 0);
  });
  console.log(`${passed} partner access/assets checks passed; all storage and auth calls mocked.`);
}
main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => {
  for (const key of Object.keys(process.env)) if (!(key in originalEnv)) delete process.env[key];
  for (const [key, value] of Object.entries(originalEnv)) process.env[key] = value;
});
