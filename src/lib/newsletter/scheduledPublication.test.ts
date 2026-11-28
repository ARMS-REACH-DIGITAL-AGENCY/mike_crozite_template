import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Pool } from 'pg';
import { assertPublicationTarget } from '../../../scripts/newsletter-publish';
import { newsletterPeriods, publishNewsletterDay, deliverNewsletterEdition } from './scheduledPublication';
import type { RenderedEdition } from './finishedPublication';
import { sendDailyPilotEmail } from '../alumniEmailSender';

const options = { day: '2026-03-25', season: '2027', base: 'http://localhost:3000',
  expectedBranch: 'br-isolated', expectedEndpoint: 'ep-isolated.example.invalid', historicalReplay: true };
const cutoff = '2026-03-26T11:00:00.000Z';
const ready = { cadence: 'daily', season_key: '2027', period_start: '2026-03-25', period_end: '2026-03-25',
  cutoff_at: cutoff, week: 1,
  row_counts: { daily_stat_lines: 0, daily_game_scores: 1, daily_game_stories: 2, expected_game_scores: 1, missing_game_scores: 0, missing_game_stories: 0 } };

test('daily publication requests include the Gazette only after the completed Sunday', () => {
  assert.deepEqual(newsletterPeriods('2026-03-26'), [{ cadence: 'daily', date: '2026-03-26' }]);
  assert.deepEqual(newsletterPeriods('2026-03-29'), [
    { cadence: 'daily', date: '2026-03-29' }, { cadence: 'weekly', date: '2026-03-23' },
  ]);
  assert.throws(() => newsletterPeriods('2026-02-30'), /valid/);
});

test('live publication cannot use historical bypasses, previews or a QA environment', () => {
  const previous = { env: process.env.VERCEL_ENV, branch: process.env.REHEARSAL_NEON_BRANCH };
  const live = { season: '2027', cutoffAt: cutoff, publicationTarget: 'live' as const, expectedEndpoint: 'ep-live.example.invalid' };
  try {
    delete process.env.REHEARSAL_NEON_BRANCH;
    process.env.VERCEL_ENV = 'preview';
    assert.throws(() => assertPublicationTarget(live), /production environment/);
    process.env.VERCEL_ENV = 'production';
    assert.doesNotThrow(() => assertPublicationTarget(live));
    assert.throws(() => assertPublicationTarget({ ...live, historicalReplay: true }), /without historical replay/);
    process.env.REHEARSAL_NEON_BRANCH = 'br-isolated';
    assert.throws(() => assertPublicationTarget(live), /production environment/);
    assert.throws(() => assertPublicationTarget({ ...options, cutoffAt: cutoff }), /isolated/);
  } finally {
    if (previous.env === undefined) delete process.env.VERCEL_ENV; else process.env.VERCEL_ENV = previous.env;
    if (previous.branch === undefined) delete process.env.REHEARSAL_NEON_BRANCH; else process.env.REHEARSAL_NEON_BRANCH = previous.branch;
  }
});

function publicationDatabase(config: { endpoint?: string; ready?: boolean; future?: number } = {}) {
  const calls: string[] = [];
  const db = { async query(sql: string) {
    calls.push(sql);
    if (sql.includes("current_setting('neon.endpoint_id'")) return { rows: [{ endpoint: config.endpoint || 'ep-isolated' }] };
    if (sql.startsWith('SELECT cadence,period_start')) return { rows: config.ready ? [ready] : [] };
    if (sql.startsWith('SELECT count(*)::int AS count')) return { rows: [{ count: config.future || 0 }] };
    if (sql.startsWith('SELECT season_key,period_start')) return { rows: config.ready ? [ready] : [] };
    if (sql.startsWith('SELECT (SELECT count')) return { rows: [{ daily_stat_lines: 0, daily_game_scores: 1, daily_game_stories: 2 }] };
    if (/^(BEGIN|COMMIT|ROLLBACK|SELECT pg_advisory_)/.test(sql)) return { rows: [] };
    assert.fail('Unexpected statement: ' + sql);
  }, release() {} };
  return { pool: { query: db.query, connect: async () => db } as unknown as Pool, calls };
}

function isolatedPublicationTest(name: string, run: () => Promise<void>) {
  test(name, async () => {
    // Keep the mocked database target independent of preview/production build
    // variables while retaining the real publication environment checks.
    const previous = { env: process.env.VERCEL_ENV, branch: process.env.REHEARSAL_NEON_BRANCH };
    process.env.VERCEL_ENV = 'preview';
    process.env.REHEARSAL_NEON_BRANCH = options.expectedBranch;
    try {
      await run();
    } finally {
      if (previous.env === undefined) delete process.env.VERCEL_ENV; else process.env.VERCEL_ENV = previous.env;
      if (previous.branch === undefined) delete process.env.REHEARSAL_NEON_BRANCH; else process.env.REHEARSAL_NEON_BRANCH = previous.branch;
    }
  });
}

isolatedPublicationTest('an already published day is read without rescoring or any insert', async () => {
  const db = publicationDatabase({ ready: true });
  const result = await publishNewsletterDay(db.pool, options, async () => { assert.fail('Must not rewind scoring'); });
  assert.equal(result.publications[0].alreadyPublished, true);
  assert.equal(result.scoring, undefined);
  assert.ok(!db.calls.some(sql => /^(INSERT|UPDATE|DELETE)/.test(sql)));
});

isolatedPublicationTest('endpoint mismatch and later stored scores block before the scoring job', async () => {
  for (const config of [{ endpoint: 'ep-wrong' }, { future: 1 }]) {
    const db = publicationDatabase(config);
    await assert.rejects(publishNewsletterDay(db.pool, options, async () => { assert.fail('Unsafe score call'); }), /verified endpoint|cannot rewind/);
    assert.ok(!db.calls.some(sql => /^(INSERT|UPDATE|DELETE)/.test(sql)));
  }
});

isolatedPublicationTest('the normal scoring job receives the exact cutoff and a decision prevents publication', async () => {
  const db = publicationDatabase();
  let scored = 0;
  await assert.rejects(publishNewsletterDay(db.pool, options, async (pool, requested) => {
    scored++;
    assert.equal(pool, db.pool);
    assert.equal(requested.asof, '2026-03-26');
    assert.equal(requested.effectiveAt, cutoff);
    assert.equal(requested.seasonKey, '2027');
    assert.equal(requested.withBox, true);
    return { seasons: [{ passes: [{ decisions: ['unresolved'] }] }] };
  }), /Unresolved bracket decisions/);
  assert.equal(scored, 1);
  assert.ok(!db.calls.some(sql => /^(INSERT|UPDATE|DELETE)/.test(sql)));
});

test('a live call before 4 a.m. does not begin scoring or publication', async () => {
  const db = publicationDatabase();
  await assert.rejects(publishNewsletterDay(db.pool, { ...options, publicationTarget: 'live', historicalReplay: false,
    now: new Date('2026-03-26T10:59:59Z') }, async () => { assert.fail('Too early'); }), /has not reached/);
  assert.equal(db.calls.length, 0);
});

function edition(): RenderedEdition {
  return { subject: 'Daily Digest', html: '<p>Saved edition</p>', text: 'Saved edition', layoutVersion: 'daily-digest-phone8-v2',
    hashes: { facts: 'facts', subject: 'subject', html: 'html', text: 'text', content: 'content-hash' }, rowKeys: {}, notes: [],
    facts: { version: 'finished-publication-v1', ready: { cadence: 'daily', period_start: '2026-03-25' },
      recipient: { firebase_uid: 'fan', email: 'fan@example.invalid', home_hsid: '5004', home_school_name: 'Home' },
      control: {}, selection: { seasonKey: '2027', region: 1, favorites: ['YAT000001'], picks: [] },
      rows: { daily_stat_lines: [], daily_game_stories: [], daily_game_scores: [], weekly_box_scores: [], weekly_player_lines: [] } } };
}

function deliveryDatabase() {
  const state = { pref: { subscribed: true, cadence: 'daily', format: 'html' } as { subscribed: boolean; cadence: string; format: string } | null,
    registered: true, recipientUids: ['fan'], additionalPrefs: [] as Array<{subscribed:boolean;cadence:string;format:string}>,
    control: { enabled: true, approved_layout_version: 'daily-digest-phone8-v2' }, claims: new Map<string, string>(), calls: [] as string[] };
  const query = async (sql: string, values: any[] = []) => {
    state.calls.push(sql);
    if (sql.includes('FROM public.newsletter_recipients')) return { rows: state.registered ? state.recipientUids.map(firebase_uid=>({firebase_uid})) : [] };
    if (sql.includes('FROM public.alumni_newsletter_preferences')) { assert.deepEqual(values[0],state.recipientUids); return { rows: [...(state.pref ? [state.pref] : []),...state.additionalPrefs] }; }
    if (sql.includes('FROM public.alumni_newsletter_control')) return { rows: [state.control] };
    const cadence = sql.includes('alumni_weekly_email_delivery') ? 'weekly' : 'daily';
    const key = cadence + '/' + values.slice(0, 2).join('/');
    if (sql.startsWith('INSERT INTO')) {
      assert.match(sql, /ON CONFLICT \(report_date,recipient_email\)/);
      assert.equal(values[7], 'content-hash');
      if (state.claims.has(key)) return { rows: [], rowCount: 0 };
      state.claims.set(key, 'sending');
      return { rows: [{ recipient_email: values[1] }], rowCount: 1 };
    }
    if (sql.startsWith('SELECT status')) return { rows: [{ status: state.claims.get(key) }] };
    if (sql.startsWith('UPDATE')) {
      state.claims.set(key, sql.includes("status='failed'") ? 'failed' : values[2]);
      return { rows: [], rowCount: 1 };
    }
    assert.fail('Unexpected delivery query: ' + sql);
  };
  return { state, pool: { query } as unknown as Pool };
}

test('unsubscribe, registration, layout approval and sending domain gate before any claim/send', async () => {
  for (const blocked of ['unsubscribe', 'unregistered', 'disabled', 'layout', 'domain']) {
    const db = deliveryDatabase();
    if (blocked === 'unsubscribe') db.state.pref!.subscribed = false;
    if (blocked === 'unregistered') db.state.registered = false;
    if (blocked === 'disabled') db.state.control.enabled = false;
    if (blocked === 'layout') db.state.control.approved_layout_version = 'different';
    const result = await deliverNewsletterEdition(db.pool, edition(), {
      domainVerified: blocked !== 'domain', lookupContact: async () => { assert.fail('Blocked lookup'); },
      send: async () => { assert.fail('Blocked send'); },
    });
    assert.notEqual(result.status, 'queued');
    assert.equal(db.state.claims.size, 0);
  }
});

test('two concurrent delivery attempts claim and send the immutable edition only once', async () => {
  const db = deliveryDatabase();
  db.state.pref!.format = 'text';
  let sends = 0;
  const delivery = { domainVerified: true, lookupContact: async () => 'exact-contact',
    send: async (contact: string, rendered: RenderedEdition, format: 'html' | 'text') => {
      sends++;
      assert.equal(contact, 'exact-contact'); assert.equal(format, 'text'); assert.equal(rendered.hashes.content, 'content-hash');
      return true;
    } };
  const result = await Promise.all([deliverNewsletterEdition(db.pool, edition(), delivery), deliverNewsletterEdition(db.pool, edition(), delivery)]);
  assert.equal(sends, 1);
  assert.equal(result.filter(row => row.status === 'queued').length, 1);
  assert.equal((await deliverNewsletterEdition(db.pool, edition(), delivery)).status, 'previously_queued');
  assert.equal(sends, 1);
});

test('ambiguous email outcome stays claimed and is not retried automatically', async () => {
  const db = deliveryDatabase(); let sends = 0;
  const delivery = { domainVerified: true, lookupContact: async () => 'exact-contact', send: async () => { sends++; throw new Error('network'); } };
  assert.equal((await deliverNewsletterEdition(db.pool, edition(), delivery)).status, 'send_outcome_unknown');
  assert.equal((await deliverNewsletterEdition(db.pool, edition(), delivery)).status, 'blocked_prior_attempt');
  assert.equal(sends, 1);
});

test('a Gazette claim does not collide with the same period-start Daily claim', async () => {
  const db = deliveryDatabase(); let sends = 0;
  const delivery = { domainVerified: true, lookupContact: async () => 'exact-contact', send: async () => { sends++; return true; } };
  const daily = edition();
  assert.equal((await deliverNewsletterEdition(db.pool, daily, delivery)).status, 'queued');
  const weekly = edition(); weekly.facts.ready.cadence = 'weekly';
  db.state.pref!.cadence = 'weekly';
  assert.equal((await deliverNewsletterEdition(db.pool, weekly, delivery)).status, 'queued');
  assert.equal(db.state.claims.size, 2);
  assert.equal(sends, 2);
});

test('the existing email transport honors text format without adding an HTML body', async () => {
  const previous = { fetch: globalThis.fetch, key: process.env.GHL_API_KEY };
  const bodies: Record<string, unknown>[] = [];
  process.env.GHL_API_KEY = 'unit-test-not-a-real-key';
  globalThis.fetch = async (_input, init) => { bodies.push(JSON.parse(String(init?.body))); return new Response('{}'); };
  try {
    assert.equal(await sendDailyPilotEmail('contact', 'Subject', '<p>HTML</p>'), true);
    assert.equal(await sendDailyPilotEmail('contact', 'Subject', '<p>HTML</p>', { format: 'text', text: 'Plain text' }), true);
    assert.equal(bodies[0].html, '<p>HTML</p>');
    assert.equal(bodies[1].message, 'Plain text');
    assert.equal('html' in bodies[1], false);
  } finally {
    globalThis.fetch = previous.fetch;
    if (previous.key === undefined) delete process.env.GHL_API_KEY; else process.env.GHL_API_KEY = previous.key;
  }
});

test('every registered fan gets both the Digest and the Gazette unless unsubscribed (Pete, Nov 25 2026)', async () => {
  const weekly = (): RenderedEdition => { const e = edition(); return { ...e, layoutVersion: 'gazette-test3-v1', facts: { ...e.facts, ready: { cadence: 'weekly', period_start: '2026-03-23' } } }; };
  const delivery = { domainVerified: true, lookupContact: async () => 'contact', send: async () => true };
  // No preference row: both, as HTML; a row set to Daily still gets the Gazette too.
  for (const pref of [null, { subscribed: true, cadence: 'daily', format: 'html' }]) {
    const db = deliveryDatabase();
    db.state.pref = pref;
    db.state.control.approved_layout_version = 'daily-digest-phone8-v2, gazette-test3-v1';
    assert.equal((await deliverNewsletterEdition(db.pool, edition(), delivery)).status, 'queued');
    assert.equal((await deliverNewsletterEdition(db.pool, weekly(), delivery)).status, 'queued');
  }
  // The switch approves each layout by name: the Gazette is held until it is approved.
  const db = deliveryDatabase();
  db.state.pref = null;
  assert.equal((await deliverNewsletterEdition(db.pool, weekly(), delivery)).status, 'blocked_newsletter_control');
});


test('duplicate account mailbox receives one edition even under concurrent case-variant attempts; any opt-out wins',async()=>{
  const db=deliveryDatabase();db.state.recipientUids=['fan','superfan'];db.state.additionalPrefs=[{subscribed:true,cadence:'weekly',format:'text'}];
  let sends=0;
  const transport={domainVerified:true,lookupContact:async(email:string)=>{assert.equal(email,'fan@example.invalid');return 'contact';},send:async(_c:string,_e:RenderedEdition,format:'html'|'text')=>{assert.equal(format,'text');sends++;return true;}};
  const other=edition();other.facts.recipient.email=' FAN@EXAMPLE.INVALID ';
  const results=await Promise.all([deliverNewsletterEdition(db.pool,edition(),transport),deliverNewsletterEdition(db.pool,other,transport)]);
  assert.equal(sends,1);assert.equal(results.filter(r=>r.status==='queued').length,1);
  const opted=deliveryDatabase();opted.state.recipientUids=['fan','superfan'];opted.state.additionalPrefs=[{subscribed:false,cadence:'weekly',format:'html'}];
  assert.equal((await deliverNewsletterEdition(opted.pool,edition(),transport)).status,'not_subscribed');
  assert.equal(opted.state.claims.size,0);
});


test('isolated delivery reads current live opt-outs and controls; only the QA pool claims mail',async()=>{
  const qa=deliveryDatabase(),live=deliveryDatabase();
  qa.state.control.enabled=false; qa.state.pref!.subscribed=false;
  let sends=0;
  const transport={domainVerified:true,lookupContact:async()=> 'contact',send:async()=>{sends++;return true;}};
  live.state.pref!.subscribed=false;
  assert.equal((await deliverNewsletterEdition(qa.pool,edition(),transport,live.pool)).status,'not_subscribed');
  assert.equal(sends,0);
  live.state.pref!.subscribed=true;
  assert.equal((await deliverNewsletterEdition(qa.pool,edition(),transport,live.pool)).status,'queued');
  assert.equal(sends,1);assert.equal(qa.state.claims.size,1);assert.equal(live.state.claims.size,0);
  assert.ok(live.state.calls.every(sql=>sql.startsWith('SELECT')));
});
