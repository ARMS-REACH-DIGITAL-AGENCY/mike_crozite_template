import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderFinishedEdition, stableJson, type FinishedEdition, type Row } from '../src/lib/newsletter/finishedPublication';
import { readRehearsalEdition } from '../src/lib/newsletter/rehearsalEditionArchive';
import { reviseRehearsalEdition, revisionArguments, type RevisionOptions } from './rehearsal-edition-revision';

const parentHash = 'a'.repeat(64);
const opts: RevisionOptions = { season: '2027', day: '2026-03-25', email: 'fixture@example.invalid', parentHash,
  expectedBranch: 'br-isolated', expectedEndpoint: 'ep-isolated.example.invalid' };
function facts(): FinishedEdition {
  return {
    version: 'finished-publication-v1',
    ready: { cadence: 'daily', period_start: '2026-03-25', period_end: '2026-03-25', season_key: '2027', week: 1,
      cutoff_at: '2026-03-26T11:00:00Z', row_counts: { daily_stat_lines: 0, daily_game_stories: 1, daily_game_scores: 1 } },
    recipient: { email: opts.email, firebase_uid: 'fixture-fan', first_name: 'Fixture', home_hsid: 5004, home_school_name: 'Hamilton' },
    control: { enabled: false, approved_layout_version: null, approved_by: null },
    selection: { seasonKey: '2027', region: 3, favorites: ['YAT000001'], picks: [] },
    presentation: { baseUrl: 'https://isolated.example.invalid/5004#sec-fantasy' },
    rows: { daily_stat_lines: [], weekly_player_lines: [], weekly_box_scores: [],
      daily_game_stories: [{ stats_date: '2026-03-25', season_key: '2027', region: 3, game_id: 385, hsid: 5004,
        title: 'SCORELESS THROUGH 3', story: 'Saved scoreless game.', series_note: 'Round 1, Game 1 of 3.', shout_outs: [] }],
      daily_game_scores: [{ stats_date: '2026-03-25', season_key: '2027', region: 3, game_id: 385,
        home_hsid: 5004, away_hsid: 14784, home_label: 'Hamilton', away_label: 'Clear Falls',
        home_innings: ['0','0','0'], away_innings: ['0','0','0'], home_runs: 0, away_runs: 0, is_final: false }],
    },
  };
}
function database() {
  const original = { recipient_email: opts.email, content_hash: parentHash, facts: facts() };
  const checkpoint = { report_date: opts.day, phase: 'awaiting_review' };
  const revisions = new Map<string, Row>(), calls: { sql: string; values: any[] }[] = [];
  return { original, checkpoint, revisions, calls, endpoint: 'ep-isolated', async query(sql: string, values: any[] = []) {
    calls.push({ sql, values });
    assert.doesNotMatch(sql, /(?:^|;)\s*(?:UPDATE|DELETE|DROP|TRUNCATE)\b/i, 'a layout revision must not alter existing rows');
    assert.doesNotMatch(sql, /\b(?:master_bracket|daily_stat_lines|daily_game_scores|daily_game_stories|edition_ready|alumni_newsletter_control|player_game_logs)\b/i, 'revision must only use archived facts');
    if (['BEGIN','COMMIT','ROLLBACK'].includes(sql)) return { rows: [] };
    if (sql.includes("current_setting('neon.endpoint_id'")) return { rows: [{ endpoint: this.endpoint }] };
    if (sql.includes('FROM public.bracket_rehearsal_days')) return { rows: [checkpoint] };
    if (sql.includes('FROM public.bracket_rehearsal_editions')) return { rows: [original] };
    if (sql.startsWith('CREATE TABLE IF NOT EXISTS public.bracket_rehearsal_edition_revisions')) return { rows: [] };
    if (sql.startsWith('INSERT INTO public.bracket_rehearsal_edition_revisions')) {
      const hash = values[10];
      if (revisions.has(hash)) return { rows: [] };
      revisions.set(hash, { parent_content_hash: values[3], source_facts_hash: values[4], layout_version: values[5],
        subject: values[6], html: values[7], plain_text: values[8], facts: JSON.parse(values[9]), content_hash: hash });
      return { rows: [{ content_hash: hash }] };
    }
    if (sql.includes('FROM public.bracket_rehearsal_edition_revisions')) return { rows: revisions.has(values[3]) ? [revisions.get(values[3])!] : [] };
    throw new Error('Unexpected revision query: ' + sql);
  } };
}

test('layout revision preserves the original facts, paused day and archive; identical retry is idempotent', async () => {
  const db = database(), original = stableJson(db.original), checkpoint = stableJson(db.checkpoint);
  const first = await reviseRehearsalEdition(db, { ...opts, presentation: { baseUrl: 'https://review.example.invalid/5004#sec-fantasy' } });
  assert.equal(first.created, true);
  assert.equal(db.revisions.size, 1);
  assert.equal(stableJson(db.original), original);
  assert.equal(stableJson(db.checkpoint), checkpoint);
  assert.deepEqual(first.rendered.facts.rows, db.original.facts.rows);
  assert.deepEqual(first.rendered.facts.selection, db.original.facts.selection);
  assert.equal(first.rendered.facts.presentation?.baseUrl, 'https://review.example.invalid/5004#sec-fantasy');
  assert.equal(first.parentHash, parentHash);
  const second = await reviseRehearsalEdition(db, { ...opts, presentation: { baseUrl: 'https://review.example.invalid/5004#sec-fantasy' } });
  assert.equal(second.created, false);
  assert.deepEqual(second.rendered, first.rendered);
  assert.equal(db.revisions.size, 1);
  assert.equal(stableJson(db.original), original);
});

test('wrong database, stale parent, wrong day and unpaused checkpoint cannot create a revision', async () => {
  const cases = [
    { options: { ...opts, expectedBranch: 'br-polished-lab-a4i35u5j' }, prepare: (_db: ReturnType<typeof database>) => {}, error: /isolated database/ },
    { options: { ...opts, expectedEndpoint: 'ep-isolated-pooler.example.invalid' }, prepare: (_db: ReturnType<typeof database>) => {}, error: /direct Neon/ },
    { options: opts, prepare: (db: ReturnType<typeof database>) => { db.endpoint = 'ep-wrong'; }, error: /Connected Neon/ },
    { options: { ...opts, parentHash: 'b'.repeat(64) }, prepare: (_db: ReturnType<typeof database>) => {}, error: /expected parent/ },
    { options: { ...opts, day: '2026-03-26' }, prepare: (_db: ReturnType<typeof database>) => {}, error: /current paused report/ },
    { options: opts, prepare: (db: ReturnType<typeof database>) => { db.checkpoint.phase = 'scored'; }, error: /current paused report/ },
  ];
  for (const item of cases) {
    const db = database(); item.prepare(db);
    await assert.rejects(reviseRehearsalEdition(db, item.options), item.error);
    assert.equal(db.revisions.size, 0);
    assert.ok(db.calls.every(call => !/^(?:CREATE|INSERT)/.test(call.sql)));
  }
});

test('renderer cannot change archived results or recipient selection, even with valid recalculated hashes', async () => {
  const db = database(), original = stableJson(db.original);
  await assert.rejects(reviseRehearsalEdition(db, opts, input => {
    input.selection.favorites = [];
    return renderFinishedEdition(input);
  }), /cannot change archived facts/);
  assert.equal(stableJson(db.original), original);
  assert.equal(db.revisions.size, 0);
  assert.ok(db.calls.every(call => !/^(?:CREATE|INSERT)/.test(call.sql)));
});

test('revision detects tampered bytes on retry and CLI has no send or advance mode', async () => {
  const db = database(), first = await reviseRehearsalEdition(db, opts);
  db.revisions.get(first.rendered.hashes.content)!.html += 'changed';
  await assert.rejects(reviseRehearsalEdition(db, opts), /Saved layout revision differs/);
  assert.equal(db.calls.at(-1)?.sql, 'ROLLBACK');
  for (const flag of ['send','day-through','reviewed-day']) assert.throws(() => revisionArguments(['--' + flag, 'true']), /Unsupported/);
});

function archiveReader(hasRevisions: boolean, copies: Row[]) {
  const calls: { sql: string; values: any[] }[] = [];
  return { calls, async query(sql: string, values: any[] = []) {
    calls.push({ sql, values });
    assert.match(sql, /^(?:SELECT|WITH) /, 'review endpoint must remain read-only');
    if (sql.startsWith('SELECT to_regclass')) return { rows: [{ relation: hasRevisions ? 'bracket_rehearsal_edition_revisions' : null }] };
    if (!hasRevisions) assert.doesNotMatch(sql, /FROM public\.bracket_rehearsal_edition_revisions/);
    let selected = copies.filter(row => hasRevisions || !row.revision);
    if (values[3]) selected = selected.filter(row => row.content_hash === values[3]);
    const byRecipient = new Map<string, Row>();
    for (const row of selected.sort((a,b) => b.created_at.localeCompare(a.created_at))) if (!byRecipient.has(row.recipient_email)) byRecipient.set(row.recipient_email, row);
    return { rows: [...byRecipient.values()].map(({html,plain_text,content_hash,layout_version}) => ({html,plain_text,content_hash,layout_version})) };
  } };
}
test('read-only edition access falls back to original, selects latest revision and retrieves original by hash', async () => {
  const copies = [
    { recipient_email: opts.email, created_at: '2026-11-22T01:00:00Z', revision: false, html: 'original html', plain_text: 'original text', content_hash: parentHash, layout_version: null },
    { recipient_email: opts.email, created_at: '2026-11-22T02:00:00Z', revision: true, html: 'corrected html', plain_text: 'corrected text', content_hash: 'b'.repeat(64), layout_version: 'corrected-layout' },
  ];
  const request = { season: '2027', cadence: 'daily', date: opts.day };
  assert.equal((await readRehearsalEdition(archiveReader(false, copies), request))?.html, 'original html');
  assert.equal((await readRehearsalEdition(archiveReader(true, copies), request))?.html, 'corrected html');
  const db = archiveReader(true, copies);
  assert.equal((await readRehearsalEdition(db, { ...request, version: parentHash }))?.plain_text, 'original text');
  assert.equal(db.calls[1].values[3], parentHash);
  assert.equal(await readRehearsalEdition(db, { ...request, version: 'c'.repeat(64) }), null);
  await assert.rejects(readRehearsalEdition(db, { ...request, version: 'not-a-hash' }), /Invalid edition version/);
  assert.equal(await readRehearsalEdition(archiveReader(true, [...copies, { ...copies[1], recipient_email: 'other@example.invalid' }]), request), null);
});
