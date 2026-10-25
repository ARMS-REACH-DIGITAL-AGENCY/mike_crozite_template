'use strict';

// Pure offline contract tests for publisher splash assignments. No Neon,
// Firebase, S3, email sender, or production identity is contacted.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const cache = new Map();
const calls = [];
const state = { brand: null, school: null, duplicate: null, order: null, conflict: null };
class AccessError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
function load(filename) {
  filename = path.resolve(filename);
  if (cache.has(filename)) return cache.get(filename).exports;
  const mod = { exports: {} }; cache.set(filename, mod);
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  function localRequire(name) {
    if (name === 'server-only') return {};
    if (name === '@/lib/tribune/db') return { query: async (sql, params) => {
      calls.push({ sql, params });
      if (sql.includes('FROM public.sponsor_brands WHERE id=$1::bigint')) return { rows: state.brand ? [state.brand] : [] };
      if (sql.includes('SELECT hsname FROM public.school_success')) return { rows: state.school ? [state.school] : [] };
      if (sql.includes("AND status<>'cancelled' AND id<>")) return { rows: state.duplicate ? [{ id: '42' }] : [] };
      if (sql.includes('SELECT id,hsid,status FROM public.sponsor_orders')) return { rows: state.order ? [state.order] : [] };
      if (sql.includes('FROM tribune_private.partner_sponsor_order_claims WHERE order_id')) return { rows: state.conflict ? [{ id: '1' }] : [] };
      if (sql.includes('FROM public.school_splash_sponsorships WHERE id=$1::bigint')) return { rows: [{ id: params[0], sponsor_id: '41' }] };
      if (sql.includes('INSERT INTO public.school_splash_sponsorships') || sql.includes('UPDATE public.school_splash_sponsorships')) {
        return { rows: [{ id: '42', sponsor_id: '41', hsid: '5004', starts_at: '2026-10-25T17:00:00Z', ends_at: null,
          status: 'active', priority: 0, sponsor_order_id: state.order?.id || null }] };
      }
      throw Error('Unexpected splash contract query: ' + sql.slice(0, 140));
    } };
    if (name === './access') return {
      PartnerAccessError: AccessError,
      assertPublisherAccess: a => { if (!a.publisher) throw new AccessError(403, 'Publisher access is required.'); },
      assertSponsorAccess: (a, id) => { if (!a.publisher && !a.sponsorIds.includes(id)) throw new AccessError(403, 'No access'); return id; },
    };
    if (name === './validation') return load('src/lib/partners/validation.ts');
    return require(name);
  }
  new Function('require', 'module', 'exports', '__filename', '__dirname', code)(
    localRequire, mod, mod.exports, filename, path.dirname(filename),
  );
  return mod.exports;
}
const service = load('src/lib/partners/service.ts');
const access = { uid: 'publisher-fixture', email: 'publisher@example.invalid', publisher: true, sponsorIds: [] };
const payload = { sponsorId: '41', hsid: '5004', startsAt: '2026-10-25T17:00:00Z',
  endsAt: null, priority: 0, status: 'active', sponsorOrderId: null };
function reset() {
  calls.length = 0;
  state.brand = { id: '41', is_active: true, logo_url: 'https://images.example.invalid/logo.png' };
  state.school = { hsname: 'Hamilton' };
  state.duplicate = state.order = state.conflict = null;
}
async function expects(status, fn) {
  await assert.rejects(fn, err => err.status === status);
}
(async () => {
  reset();
  await expects(403, () => service.saveSplashPlacement({ ...access, publisher: false, sponsorIds: ['41'] }, payload));
  assert.equal(calls.length, 0, 'unauthorized actor must never query the database');

  reset(); state.brand.is_active = false;
  await expects(409, () => service.saveSplashPlacement(access, payload));

  reset(); state.brand.logo_url = 'https://yatstats.com/img/sponsor-logo-pending.svg';
  await expects(409, () => service.saveSplashPlacement(access, payload));

  reset(); state.duplicate = true;
  await expects(409, () => service.saveSplashPlacement(access, payload));

  reset(); state.order = { id: '99', hsid: '5004', status: 'pending' };
  await expects(409, () => service.saveSplashPlacement(access, { ...payload, sponsorOrderId: '99' }));

  reset(); state.order = { id: '99', hsid: '5005', status: 'paid' };
  await expects(400, () => service.saveSplashPlacement(access, { ...payload, sponsorOrderId: '99' }));

  reset(); state.order = { id: '99', hsid: '5004', status: 'paid' }; state.conflict = true;
  await expects(409, () => service.saveSplashPlacement(access, { ...payload, sponsorOrderId: '99' }));

  reset();
  const saved = await service.saveSplashPlacement(access, payload);
  assert.equal(saved.splashPlacement.hsid, '5004');
  assert.ok(calls.some(c => c.sql.includes('INSERT INTO tribune_private.partner_portal_audit')),
    'write and audit must be one atomic CTE');
  assert.ok(calls.some(c => c.sql.includes('partner_sponsor_order_claims')),
    'order claims must be made in the same transaction');

  reset(); state.order = { id: '99', hsid: '5004', status: 'paid' };
  await service.saveSplashPlacement(access, { ...payload, sponsorOrderId: '99' });
  assert.ok(calls.some(c => c.sql.includes('ON CONFLICT(order_id) DO UPDATE SET sponsor_id=EXCLUDED.sponsor_id')),
    'linked orders must retain their original brand claim');

  reset();
  await service.saveSplashPlacement(access, { ...payload, id: '42' });
  assert.ok(calls.some(c => c.sql.includes('UPDATE public.school_splash_sponsorships') &&
    c.sql.includes("source='publisher-desk'")), 'existing assignment update stays scoped and audited');

  console.log('[partner splash] authorization, logo, duplicate, payment, order-claim, audit and updates passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
