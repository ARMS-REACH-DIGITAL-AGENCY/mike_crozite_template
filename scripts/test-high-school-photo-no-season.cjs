// Exercise the real POST handler without DB, storage, moderation or email side effects.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const compile = (file, imports = {}, globals = {}) => {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(read(file), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, {
    exports, require: (name) => {
      assert.ok(Object.hasOwn(imports, name), `Unexpected dependency: ${name}`);
      return imports[name];
    }, Date, console, ...globals,
  }, { filename: file });
  return exports;
};
const contribute = compile('src/lib/contribute.ts');
const thisYear = 2026;
class FixedDate extends Date {
  constructor(...args) { super(...(args.length ? args : ['2026-11-04T12:00:00Z'])); }
}
let signedIn = true;
let staged = [];
let published = [];
let inserts = [];
const route = compile('src/app/api/contribute/photo/route.ts', {
  'next/server': { NextResponse: { json: (body, init) => Response.json(body, init) } },
  crypto: require('node:crypto'),
  '@/lib/contribute': contribute,
  '@/lib/db': { query: async (sql, params = []) => {
    if (sql.includes('FROM flip_card_front_stage'))
      return { rows: [{ hsid: '5004', name: 'Test Player' }] };
    if (sql.includes('INSERT INTO media_upload')) inserts.push(params);
    if (sql.includes('UPDATE media_upload')) return { rows: [{ id: params[0] }] };
    return { rows: [] };
  } },
  '@/lib/contributeServer': {
    CONTRIBUTE_DAILY_LIMIT: 100,
    NotAnImageError: class NotAnImageError extends Error {},
    identifyContributor: async () => signedIn ? { uid: 'test', name: 'Test Fan' } : null,
    contributionsToday: async () => 0,
    isReviewer: () => false,
    canPublishFor: () => false,
    logContribution: async () => {},
    notifyContributor: async () => {},
    photoLinkPath: () => '/test-player',
    assetUrl: () => 'https://example.invalid/photo.jpg',
    uploadCategory: () => 'highschool',
    stagePhoto: async (...args) => {
      staged.push(args);
      return { key: 'test.jpg', mime: 'image/jpeg', bytes: 3, sha256: 'test' };
    },
    promoteUpload: async (upload) => { published.push(upload); return ['test-published.jpg']; },
  },
  '@/lib/contributeModeration': {
    CONTRIBUTE_MODERATION_POLICY_VERSION: 'test',
    moderatePhoto: async () => ({ decision: 'approve' }),
  },
  '@/lib/gohighlevel': { findOrCreateGhlContact: async () => null, sendGHLEmail: async () => {} },
  '@/lib/realTimelineSnapshotQueue': { refreshRealTimelineSnapshot: async () => {} },
}, { File, Buffer, Date: FixedDate });

async function send(purpose, year) {
  staged = []; published = []; inserts = [];
  const form = new FormData();
  form.set('photo', new File(['img'], 'test.jpg', { type: 'image/jpeg' }));
  form.set('purpose', purpose);
  form.set('playerId', '123456');
  form.set('hsid', '5004');
  if (year !== undefined) form.set('year', String(year));
  const response = await route.POST({ formData: async () => form });
  return { status: response.status, body: await response.json() };
}

(async () => {
  // A 2028 graduate caused the reported error in 2026. Cached clients may
  // keep sending graduation years; new clients omit the year altogether.
  for (const year of [undefined, 2028, 2030, 'invalid', 0, 1899, 2005]) {
    const result = await send('flip_card', year);
    assert.equal(result.status, 201, `High school front must accept year=${year}`);
    assert.equal(result.body.status, 'approved');
    assert.equal(staged.length, 1);
    assert.equal(published[0].purpose, 'flip_card');
    assert.equal(published[0].date_taken, `${thisYear}-01-01`);
    assert.equal(inserts[0][5], `${thisYear}-01-01`);
  }
  assert.equal((await send('back_hero', 2030)).body.status, 'approved');
  for (const purpose of ['headshot', 'timeline_hero']) {
    for (const year of [undefined, 2028, 'invalid', 1899]) {
      const result = await send(purpose, year);
      assert.equal(result.status, 400, `${purpose} must still require a valid season`);
      assert.equal(result.body.error, 'Pick the season.');
      assert.equal(staged.length, 0);
    }
    assert.equal((await send(purpose, 2025)).body.status, 'approved');
    assert.equal(published[0].date_taken, '2025-01-01');
  }
  signedIn = false;
  assert.equal((await send('flip_card')).status, 401);
  assert.equal(staged.length, 0);
  assert.equal(contribute.PHOTO_TYPES.find((type) => type.id === 'flip_card').asks, undefined);
  const flow = read('src/components/yatstats/ContributePhotoFlow.tsx');
  assert.match(flow, /if \(type\.id === 'flip_card'\) return null;/);
  assert.match(flow, /if \(type\.id !== 'flip_card'\) form\.set\('year'/);
  console.log('PASS: HS photos need no year, cached future graduation years are accepted, season photos and sign-in remain validated.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
