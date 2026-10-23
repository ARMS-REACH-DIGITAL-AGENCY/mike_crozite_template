/* Offline regression tests: no network, messages, or database writes. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
let queryImpl = async () => ({ rows: [], rowCount: 0 });
const db = { query: (...args) => queryImpl(...args) };
function loader(extra = {}) {
  const cache = new Map();
  function load(filename) {
    filename = path.resolve(root, filename);
    if (cache.has(filename)) return cache.get(filename).exports;
    const mod = { exports: {} }; cache.set(filename, mod);
    const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
    const req = (id) => {
      if (id === '@/lib/db') throw new Error('Private delivery operations must not use the shared database.');
      if (id === '@/lib/tribune/db') return db;
      if (id in extra) return extra[id];
      if (id.startsWith('@/')) return load(path.join(root, 'src', id.slice(2)) + '.ts');
      if (id.startsWith('.')) return load(path.resolve(path.dirname(filename), id) + '.ts');
      return require(id);
    };
    new Function('require', 'module', 'exports', '__filename', '__dirname', source)(req, mod, mod.exports, filename, path.dirname(filename));
    return mod.exports;
  }
  return load;
}
let passed = 0;
async function test(name, fn) { await fn(); passed++; console.log('PASS', name); }
const initialSecret = process.env.TRIBUNE_PREFERENCES_SECRET;
const initialPilotEmails = process.env.TRIBUNE_PILOT_EMAILS;
const pilotEmails = Array.from({ length: 7 }, (_, index) => `pilot${index + 1}@example.invalid`);
process.env.TRIBUNE_PREFERENCES_SECRET = 'offline-test-secret-not-a-live-credential';
process.env.CRON_SECRET = 'offline-cron-secret';
process.env.TRIBUNE_PILOT_EMAILS = pilotEmails.join(',');
const load = loader();
const prefs = load('src/lib/tribune/preferences.ts');
const approval = load('src/lib/tribune/approval.ts');
const version = load('src/lib/tribune/types.ts').TRIBUNE_LAYOUT_VERSION;
const season = load('src/lib/bracket/tournamentCalendar.ts').TOURNAMENT_2027;
const next = {
  NextRequest: class extends Request { get nextUrl() { return new URL(this.url); } },
  NextResponse: { json: (body, opts = {}) => new Response(JSON.stringify(body), { ...opts, headers: { 'content-type': 'application/json' } }) },
};
const fixedNow = Date.parse('2026-10-26T11:00:00Z');
const token = prefs.createTribunePreferenceToken('pilot-uid', fixedNow);
const signed = (obj) => {
  const payload = Buffer.from(JSON.stringify(obj)).toString('base64url');
  return payload + '.' + crypto.createHmac('sha256', process.env.TRIBUNE_PREFERENCES_SECRET).update('tribune-preferences.' + payload).digest('base64url');
};
const goodEdition = {
  layoutVersion: version, preview: false, dataStatus: 'verified', generatedAt: new Date(fixedNow).toISOString(),
  school: { id: 'school-fixture', name: 'School', location: 'Arizona' }, recipientTier: 'fan',
  period: { cadence: 'daily', start: '2026-10-25', end: '2026-10-25', label: 'Oct 25, 2026' },
  homeRoster: { playerCount: 2, batting: { rows: [] }, pitching: { rows: [] } },
  links: { hub: 'https://school.example.invalid/', tournament: 'https://school.example.invalid/#sec-fantasy', share: 'https://school.example.invalid/#sec-fantasy',
    preferences: 'https://school.example.invalid/api/newsletter/preferences?token=example', unsubscribe: 'https://school.example.invalid/api/newsletter/preferences?token=example&action=unsubscribe',
    officialRules: 'https://school.example.invalid/approved-rules', web: 'https://school.example.invalid/edition/private', text: 'https://school.example.invalid/edition/private?format=text' },
  sender: { name: 'YAT?STATS', postalAddress: 'Test address, not a real send' }, story: {},
};
async function main() {
  await test('private pilot configuration normalizes and deduplicates validated addresses', () => {
    assert.deepEqual(prefs.parseTribunePilotEmails(' Pilot1@Example.Invalid , pilot1@example.invalid, pilot2@example.invalid '), { configured: true, emails: pilotEmails.slice(0, 2) });
    assert.deepEqual(prefs.getTribunePilotAudience().emails, pilotEmails);
  });
  await test('missing or empty pilot configuration has no fallback recipients', () => {
    for (const value of [undefined, '', '   ']) assert.deepEqual(prefs.parseTribunePilotEmails(value), { configured: false, emails: [], reason: 'pilot_recipients_unconfigured' });
  });
  await test('one malformed pilot address invalidates the whole audience', () => {
    for (const bad of ['not-an-email', 'person@@example.invalid', '.person@example.invalid', 'person..name@example.invalid', 'person@-example.invalid', 'person@example', '', 'person\r\n@example.invalid']) {
      const result = prefs.parseTribunePilotEmails(pilotEmails[0] + ',' + bad);
      assert.equal(result.configured, false); assert.equal(result.reason, 'pilot_recipients_invalid'); assert.deepEqual(result.emails, []);
    }
  });
  await test('private configuration cannot grow the pilot beyond seven recipients', () => {
    const result = prefs.parseTribunePilotEmails([...pilotEmails, 'eighth@example.invalid'].join(','));
    assert.equal(result.configured, false); assert.deepEqual(result.emails, []);
  });
  await test('signed preference token round-trips for its recipient', () => assert.equal(prefs.verifyTribunePreferenceToken(token, fixedNow), 'pilot-uid'));
  await test('signature tampering rejected', () => assert.equal(prefs.verifyTribunePreferenceToken(token.slice(0, -5) + 'abcde', fixedNow), null));
  await test('extra token segment rejected', () => assert.equal(prefs.verifyTribunePreferenceToken(token + '.extra', fixedNow), null));
  await test('expired token rejected', () => assert.equal(prefs.verifyTribunePreferenceToken(token, fixedNow + 367 * 86400000), null));
  await test('wrong purpose rejected even with valid signature', () => assert.equal(prefs.verifyTribunePreferenceToken(signed({ v: 1, purpose: 'archive', uid: 'pilot-uid', exp: Math.floor(fixedNow / 1000) + 300 }), fixedNow), null));
  await test('unbounded lifetime rejected even with valid signature', () => assert.equal(prefs.verifyTribunePreferenceToken(signed({ v: 1, purpose: 'tribune-preferences', uid: 'pilot-uid', exp: Math.floor(fixedNow / 1000) + 800 * 86400 }), fixedNow), null));
  await test('preferences links are HTTPS, purpose signed, unsubscribe is confirmation view', () => {
    const links = prefs.tribunePreferenceLinks('https://school.example.invalid/', 'pilot-uid');
    assert.equal(new URL(links.unsubscribe).searchParams.get('action'), 'unsubscribe');
    assert.equal(prefs.verifyTribunePreferenceToken(new URL(links.preferences).searchParams.get('token')), 'pilot-uid');
    assert.throws(() => prefs.tribunePreferenceLinks('http://school.example.invalid/', 'pilot-uid'));
  });
  await test('Phoenix reporting date does not roll at UTC midnight', () => assert.equal(prefs.phoenixDate(new Date('2026-10-26T01:00:00Z')), '2026-10-25'));
  await test('daily cron reports completed previous Phoenix day', () => assert.equal(prefs.dueTribunePeriod('daily', new Date(fixedNow)).end, '2026-10-25'));
  await test('Monday weekly covers completed Monday–Sunday', () => assert.deepEqual([prefs.dueTribunePeriod('weekly', new Date(fixedNow)).start, prefs.dueTribunePeriod('weekly', new Date(fixedNow)).end], ['2026-10-19', '2026-10-25']));
  await test('weekly recipient is not due on Tuesday', () => assert.equal(prefs.dueTribunePeriod('weekly', new Date('2026-10-27T11:00:00Z')), null));
  await test('weekly period handles year boundary', () => assert.equal(prefs.tribuneReportingPeriod('weekly', '2027-01-03').start, '2026-12-28'));
  await test('invalid calendar dates and non-Sunday weekly end rejected', () => {
    assert.equal(prefs.validReportDate('2026-02-30'), false); assert.equal(prefs.validReportDate('2028-02-29'), true);
    assert.throws(() => prefs.tribuneReportingPeriod('weekly', '2026-10-24'));
  });
  await test('missing approval row holds delivery', async () => { queryImpl = async () => ({ rows: [] }); assert.equal((await approval.getTribuneApproval()).approved, false); });
  await test('disabled approval holds delivery', async () => { queryImpl = async () => ({ rows: [{ enabled: false, approved_layout_version: version }] }); assert.equal((await approval.getTribuneApproval()).approved, false); });
  await test('wrong approved version holds delivery', async () => { queryImpl = async () => ({ rows: [{ enabled: true, approved_layout_version: 'older-version' }] }); assert.equal((await approval.getTribuneApproval()).reason, 'layout_version_mismatch'); });
  await test('unreadable control table holds delivery', async () => { queryImpl = async () => { throw Error('missing table'); }; assert.equal((await approval.getTribuneApproval()).reason, 'approval_unavailable'); });
  await test('matching enabled version is approved', async () => { queryImpl = async () => ({ rows: [{ enabled: true, approved_layout_version: version }] }); assert.equal((await approval.getTribuneApproval()).approved, true); });
  await test('send readiness rejects preview, missing rules, missing archive, unavailable stats', () => {
    assert.deepEqual(approval.tribuneReadinessProblems(goodEdition), []);
    assert.ok(approval.tribuneReadinessProblems({ ...goodEdition, preview: true }).includes('preview_edition'));
    assert.ok(approval.tribuneReadinessProblems({ ...goodEdition, dataStatus: 'unavailable' }).includes('stats_unavailable'));
    assert.ok(approval.tribuneReadinessProblems({ ...goodEdition, links: { ...goodEdition.links, officialRules: undefined } }).includes('missing_official_rules'));
    assert.ok(approval.tribuneReadinessProblems({ ...goodEdition, links: { ...goodEdition.links, web: undefined } }).includes('missing_edition_links'));
  });
  await test('in-season report cannot send without the current fantasy matchup', () => {
    const edition = { ...goodEdition, period: { ...goodEdition.period, start: season.start, end: season.start } };
    assert.ok(approval.tribuneReadinessProblems(edition).includes('missing_tournament_matchup'));
    assert.ok(approval.tribuneReadinessProblems({ ...edition, matchup: { status: 'unavailable' } }).includes('missing_tournament_matchup'));
    assert.equal(approval.tribuneReadinessProblems({ ...edition, matchup: { status: 'live' } }).includes('missing_tournament_matchup'), false);
  });
  await test('legitimate preseason upcoming matchup remains sendable', () => {
    const before = new Date(Date.parse(season.start + 'T12:00:00Z') - 86400000).toISOString().slice(0, 10);
    const edition = { ...goodEdition, period: { ...goodEdition.period, start: before, end: before }, matchup: { status: 'upcoming' } };
    assert.equal(approval.tribuneReadinessProblems(edition).includes('missing_tournament_matchup'), false);
  });
  await test('recap delivered after season end still requires final-week matchup', () => {
    const delivered = new Date(Date.parse(season.end + 'T12:00:00Z') + 86400000).toISOString();
    const edition = { ...goodEdition, generatedAt: delivered, period: { cadence: 'weekly', start: season.end, end: season.end, label: 'Final week' } };
    assert.ok(approval.tribuneReadinessProblems(edition).includes('missing_tournament_matchup'));
  });
  const page = loader({ 'next/server': next })('src/app/api/newsletter/preferences/route.ts');
  const freshToken = prefs.createTribunePreferenceToken('pilot-uid');
  let writes = 0;
  queryImpl = async (sql) => { if (/^INSERT/.test(sql)) writes++; return { rows: [{ cadence: 'weekly', format: 'text', subscribed: true }], rowCount: 1 }; };
  await test('GET unsubscribe link is only a confirmation page; scanner cannot unsubscribe', async () => {
    const response = await page.GET(new next.NextRequest('https://school.example.invalid/api/newsletter/preferences?token=' + freshToken + '&action=unsubscribe'));
    assert.equal(response.status, 200); assert.match(await response.text(), /Confirm unsubscribe/); assert.equal(writes, 0);
    assert.equal(response.headers.get('referrer-policy'), 'no-referrer'); assert.match(response.headers.get('cache-control'), /no-store/);
  });
  await test('POST explicit unsubscribe changes only subscription while preserving choices', async () => {
    let saved;
    queryImpl = async (sql, params) => { if (/^INSERT/.test(sql)) { writes++; saved = params; } return { rows: [{ cadence: 'weekly', format: 'text', subscribed: true }], rowCount: 1 }; };
    const request = new next.NextRequest('https://school.example.invalid/api/newsletter/preferences', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', origin: 'https://school.example.invalid' }, body: new URLSearchParams({ token: freshToken, action: 'unsubscribe' }).toString() });
    assert.equal((await page.POST(request)).status, 200); assert.deepEqual(saved, ['pilot-uid', 'weekly', 'text', false]);
  });
  await test('cross-origin preference POST rejected without a write', async () => {
    const before = writes;
    const request = new next.NextRequest('https://school.example.invalid/api/newsletter/preferences', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', origin: 'https://other.example' }, body: new URLSearchParams({ token: freshToken, action: 'unsubscribe' }).toString() });
    assert.equal((await page.POST(request)).status, 403); assert.equal(writes, before);
  });
  const sender = load('src/lib/alumniEmailSender.ts');
  const originalFetch = global.fetch; const originalKey = process.env.GHL_API_KEY;
  process.env.GHL_API_KEY = 'offline-key'; let sentBody;
  global.fetch = async (url, options) => { sentBody = JSON.parse(options.body); return new Response('{}', { status: 200 }); };
  await test('text preference sends curated text and omits HTML', async () => { assert.equal(await sender.sendDailyPilotEmail('pilot', 'subject', '<b>HTML</b>', 'Readable text', 'text'), true); assert.equal(sentBody.message, 'Readable text'); assert.equal('html' in sentBody, false); });
  await test('HTML preference supplies both authored contents', async () => { await sender.sendDailyPilotEmail('pilot', 'subject', '<b>HTML</b>', 'Readable text', 'html'); assert.equal(sentBody.html, '<b>HTML</b>'); assert.equal(sentBody.message, 'Readable text'); });
  await test('missing plain-text payload cannot silently send HTML', async () => assert.equal(await sender.sendDailyPilotEmail('pilot', 'subject', '<b>HTML</b>', undefined, 'text'), false));
  global.fetch = originalFetch; if (originalKey === undefined) delete process.env.GHL_API_KEY; else process.env.GHL_API_KEY = originalKey;

  const RealDate = Date;
  global.Date = class extends RealDate { constructor(...args) { super(...(args.length ? args : [fixedNow])); } static now() { return fixedNow; } };
  let approvalEnabled = false, subscribed = true, cadence = 'daily', claimCount = 1, built = 0, sends = 0, format = 'text', lastSend;
  queryImpl = async (sql) => {
    if (sql.includes('FROM public.alumni_newsletter_control')) return { rows: [{ enabled: approvalEnabled, approved_layout_version: version }] };
    if (sql.includes('FROM public.alumni_newsletter_preferences')) return { rows: [{ cadence, format, subscribed }] };
    if (sql.includes('INSERT INTO public.alumni_daily_email_delivery')) return { rows: claimCount ? [{}] : [], rowCount: claimCount };
    return { rows: [], rowCount: 1 };
  };
  const route = loader({
    'next/server': next,
    '@/lib/gohighlevel': { lookupGHLContactByEmail: async () => 'pilot-contact' },
    '@/lib/alumniEmailSender': { sendDailyPilotEmail: async (...args) => { sends++; lastSend = args; return true; } },
    '@/lib/tribune/build': { getTribuneFan: async () => ({ firebase_uid: 'pilot-uid', home_hsid: 'school-fixture' }), buildTribuneEdition: async ({ period, preview }) => { built++; return { edition: { ...goodEdition, period, preview }, statLineCount: 2 }; } },
    '@/lib/tribune/render': { renderTribuneHtml: () => '<html>issue</html>', renderTribuneText: () => 'complete text issue', tribuneSubject: () => 'Tribune' },
    '@/lib/tribune/archive': { storeTribuneEdition: async (edition) => edition },
  })('src/app/api/admin/fan-newsletter-pilot/route.ts');
  const post = async (body) => route.POST(new next.NextRequest('https://school.example.invalid/api/admin/fan-newsletter-pilot', { method: 'POST', headers: { authorization: 'Bearer offline-cron-secret', 'content-type': 'application/json' }, body: JSON.stringify(body) }));
  const sendRequest = { date: '2026-10-25', emails: [pilotEmails[0]], send: true };
  process.env.YATSTATS_SENDING_DOMAIN_VERIFIED = 'true';
  await test('missing private pilot configuration holds even an otherwise approved send', async () => {
    approvalEnabled = true;
    delete process.env.TRIBUNE_PILOT_EMAILS;
    try {
      const r = await (await post(sendRequest)).json();
      assert.equal(r.status, 'held_for_pilot_configuration'); assert.equal(r.reason, 'pilot_recipients_unconfigured');
      assert.equal(built, 0); assert.equal(sends, 0);
    } finally { process.env.TRIBUNE_PILOT_EMAILS = pilotEmails.join(','); approvalEnabled = false; }
  });
  await test('invalid private pilot configuration holds instead of sending its valid subset', async () => {
    process.env.TRIBUNE_PILOT_EMAILS = pilotEmails[0] + ',not-an-email';
    try {
      const r = await (await post(sendRequest)).json();
      assert.equal(r.status, 'held_for_pilot_configuration'); assert.equal(r.reason, 'pilot_recipients_invalid');
      assert.equal(built, 0); assert.equal(sends, 0);
    } finally { process.env.TRIBUNE_PILOT_EMAILS = pilotEmails.join(','); }
  });
  let cronDispatches = 0;
  const cron = loader({
    'next/server': next,
    '@/app/api/admin/fan-newsletter-pilot/route': { POST: async () => { cronDispatches++; return next.NextResponse.json({ result: [] }); } },
  })('src/app/api/cron/fan-daily-pilot/route.ts');
  await test('cron without private pilot configuration never invokes delivery', async () => {
    approvalEnabled = true;
    delete process.env.TRIBUNE_PILOT_EMAILS;
    try {
      const response = await cron.GET(new next.NextRequest('https://example.invalid/api/cron/fan-daily-pilot', { headers: { authorization: 'Bearer offline-cron-secret' } }));
      const r = await response.json();
      assert.equal(response.status, 200); assert.equal(r.status, 'held_for_pilot_configuration');
      assert.equal(cronDispatches, 0); assert.equal(sends, 0);
    } finally { process.env.TRIBUNE_PILOT_EMAILS = pilotEmails.join(','); approvalEnabled = false; }
  });
  await test('unapproved send is held before building or sending', async () => { const r = await (await post(sendRequest)).json(); assert.equal(r.result[0].status, 'held_for_approval'); assert.equal(built, 0); assert.equal(sends, 0); });
  await test('request cannot expand beyond the privately configured pilot recipients', async () => assert.equal((await post({ ...sendRequest, emails: ['someone@example.invalid'] })).status, 400));
  await test('preview remains available without approval and never sends', async () => { const r = await (await post({ ...sendRequest, send: false })).json(); assert.equal(r.result[0].status, 'preview'); assert.equal(r.result[0].text, 'complete text issue'); assert.equal(sends, 0); });
  approvalEnabled = true; subscribed = false;
  await test('unsubscribed recipient is excluded before issue construction', async () => { const before = built; const r = await (await post(sendRequest)).json(); assert.equal(r.result[0].status, 'unsubscribed'); assert.equal(built, before); assert.equal(sends, 0); });
  subscribed = true;
  await test('old report cannot be replayed as a current scheduled issue', async () => { const r = await (await post({ ...sendRequest, date: '2026-10-24' })).json(); assert.equal(r.result[0].status, 'not_due'); assert.equal(sends, 0); });
  claimCount = 0;
  await test('duplicate/declined claim never sends', async () => { const r = await (await post(sendRequest)).json(); assert.equal(r.result[0].status, 'previously_attempted'); assert.equal(sends, 0); });
  claimCount = 1;
  await test('approved complete daily issue uses recipient text preference', async () => { const r = await (await post(sendRequest)).json(); assert.equal(r.result[0].status, 'queued'); assert.equal(sends, 1); assert.equal(lastSend[4], 'text'); });
  cadence = 'weekly';
  await test('Monday pilot selects complete weekly period', async () => { const r = await (await post(sendRequest)).json(); assert.equal(r.result[0].period.start, '2026-10-19'); assert.equal(r.result[0].period.end, '2026-10-25'); });
  global.Date = RealDate;
  if (initialSecret === undefined) delete process.env.TRIBUNE_PREFERENCES_SECRET; else process.env.TRIBUNE_PREFERENCES_SECRET = initialSecret;
  if (initialPilotEmails === undefined) delete process.env.TRIBUNE_PILOT_EMAILS; else process.env.TRIBUNE_PILOT_EMAILS = initialPilotEmails;
  console.log(`\n${passed} Tribune delivery/security checks passed. All outbound work was mocked.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
