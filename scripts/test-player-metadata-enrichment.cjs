/* eslint-disable @typescript-eslint/no-require-imports -- Standalone Node test harness follows the existing repository convention. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const filename = path.join(root, 'src/lib/playerMetadataEnrichment.ts');
const api = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 },
}).outputText, { exports: api, Date }, { filename });
const asOf = new Date('2026-10-18T12:00:00Z');
const clean = (value) => JSON.parse(JSON.stringify(value));
const evidence = (changes = {}) => ({
  stage: { playerid: 'player-1', hsid: 'school-1', display_name: 'Test Player' },
  latest_stat_year: null, latest_teamids: [], current_teamids: [], current_team: null,
  current_status: null, team_override: null, verified_submission: null, college_resolution: null,
  ...changes,
});
const mapping = (changes = {}) => ({ teamid: '10001', team_name: 'Iowa Cubs', org_name: 'Chicago Cubs',
  level: 'AAA', source_team_id: '451', mapping_source: 'canonical', ...changes });
const current = (changes = {}) => evidence({ latest_stat_year: 2026, latest_teamids: ['10001'],
  current_teamids: ['10001'], ...changes });
const resolve = (e, mappings = [mapping()]) => api.resolveBaselineMetadata(e, mappings, asOf);

test('an uncovered player receives no invented status, team, or metadata write', () => {
  const result = resolve(evidence());
  assert.equal(result.patch, null);
  assert.equal(result.reason, 'missing_status_source');
  assert.equal(result.missing_status, true);
});

test('historical participation alone never implies retirement', () => {
  for (const year of [1900, 2015, 2024, 2025]) {
    const result = resolve(evidence({ latest_stat_year: year, latest_teamids: ['10001'] }));
    assert.equal(result.patch, null);
    assert.equal(result.reason, 'historical_stats_without_current_status');
  }
});

test('current-year activity follows exact player/team IDs and fills mapped labels', () => {
  const { patch, reason } = resolve(current());
  assert.equal(reason, 'resolved');
  assert.equal(patch.after.status_label, 'ACTIVE');
  assert.equal(patch.after.current_team_name, 'Iowa Cubs');
  assert.equal(patch.after.current_org_or_conference_name, 'Chicago Cubs');
  assert.equal(patch.after.current_teamid, '10001');
  assert.equal(patch.after.current_team_source_team_id, '10001');
  assert.equal(patch.after.level_label, 'TRIPLE-A');
  assert.equal(patch.after.current_team_source, 'baseline_metadata');
  assert.equal(patch.provenance.team_source, 'current_season_teamid');
});

test('a generic NCAA label does not invent a division', () => {
  const result = resolve(current(), [mapping({ level: 'NCAA' })]);
  assert.equal(result.patch.after.level_label, null);
  assert.equal(result.reason, 'missing_level_mapping');
});

test('an exact college division can refine an existing generic NCAA label', () => {
  const e = current({ stage: { playerid: 'player-1', level_label: 'NCAA' } });
  const result = resolve(e, [mapping({ level: 'D2', source_team_id: '10001', mapping_source: 'college' })]);
  assert.equal(result.patch.after.level_label, 'NCAA-D2');
  assert.equal(result.patch.after.display_level_label, 'NCAA-D2');
});

test('same team ID with conflicting division or organization is held for review', () => {
  for (const changed of [{ level: 'AA' }, { org_name: 'Boston Red Sox' }, { source_team_id: '999' }]) {
    const result = resolve(current(), [mapping(), mapping(changed)]);
    assert.equal(result.reason, 'missing_or_conflicting_team_mapping');
    assert.equal(result.patch.after.current_team_name, null);
    assert.equal(result.patch.after.status_label, 'ACTIVE');
  }
});

test('multiple current-season teams never select an arbitrary first row', () => {
  const result = resolve(current({ current_teamids: ['10001', '10002'] }));
  assert.equal(result.reason, 'multiple_recorded_teams');
  assert.equal(result.patch.after.current_team_name, null);
});

test('the accepted college manual resolver can disambiguate current-season team IDs', () => {
  const result = resolve(current({ current_teamids: ['10001', '10002'],
    college_resolution: { teamid: '10001', resolution_method: 'manual_override' } }));
  assert.equal(result.patch.after.current_teamid, '10001');
  assert.equal(result.patch.provenance.team_source, 'college_manual_override');
});

test('historical college resolutions do not masquerade as current activity', () => {
  const result = resolve(evidence({ latest_stat_year: 2025,
    college_resolution: { teamid: '10001', resolution_method: 'manual_override' } }));
  assert.equal(result.patch, null);
});

test('the current-source freshness window is bounded and manual review remains authoritative', () => {
  assert.equal(api.isTrustedCurrentSource('mlb_api', '2026-10-16T12:00:00Z', asOf), true);
  assert.equal(api.isTrustedCurrentSource('mlb_api', '2026-10-16T11:59:59Z', asOf), false);
  assert.equal(api.isTrustedCurrentSource('mlb_api', '2026-10-18T12:00:01Z', asOf), false);
  assert.equal(api.isTrustedCurrentSource('mlb_api', '2026-10-18 11:00:00', asOf), true);
  assert.equal(api.isTrustedCurrentSource('unreviewed_import', '2026-10-18T11:00:00Z', asOf), false);
  assert.equal(api.isTrustedCurrentSource('manual_review', '2024-01-01T00:00:00Z', asOf), true);
});

test('stale MLB roster rows cannot repopulate a current team or active status', () => {
  const result = resolve(evidence({ current_team: { teamid: '10001', team_name: 'Iowa Cubs',
    roster_status: 'ACTIVE', source: 'mlb_api', last_verified: '2026-04-26T00:00:00Z' } }));
  assert.equal(result.patch, null);
});

test('trusted current assignment without roster status remains UNKNOWN despite older stats', () => {
  const result = resolve(evidence({ latest_stat_year: 2024, current_team: { teamid: '10001',
    team_name: 'Iowa Cubs', source: 'mlb_api', last_verified: '2026-10-18T11:00:00Z' } }));
  assert.equal(result.patch.after.status_label, null);
  assert.equal(result.patch.after.current_team_name, 'Iowa Cubs');
  assert.equal(result.patch.after.previous_team_name, null);
});

test('baseline scheduling uses the canonical TBC ID even when the trusted source has an MLB ID', () => {
  const result = resolve(evidence({ stage: { playerid: 'player-1', current_team_source_team_id: '10001' },
    current_team: { teamid: '10001', team_name: 'Iowa Cubs', source_team_id: '451',
      source: 'mlb_api', roster_status: 'ACTIVE', last_verified: '2026-10-18T11:00:00Z' } }));
  assert.equal(result.reason, 'resolved');
  assert.equal(result.patch.after.current_teamid, '10001');
  assert.equal(result.patch.after.current_team_source_team_id, '10001');
  assert.equal(result.patch.after.current_team_source, 'baseline_metadata');
  assert.equal(result.patch.provenance.team_source, 'player_current_team');
});

test('a fresh MLB source-only ID is never passed to baseline TBC scheduling', () => {
  const source = { teamid: null, team_name: 'New York Yankees', source_team_id: '147',
    level: 'MLB', source: 'mlb_api', roster_status: 'ACTIVE', last_verified: '2026-10-18T11:00:00Z' };
  const result = resolve(evidence({ current_team: source }), [mapping({ teamid: '147', team_name: 'Unrelated TBC Team' })]);
  assert.equal(result.patch.after.current_team_name, 'New York Yankees');
  assert.equal(result.patch.after.current_teamid, null);
  assert.equal(result.patch.after.current_team_source_team_id, null);
  assert.equal(result.patch.after.current_team_source, 'baseline_metadata');
  assert.equal(result.patch.provenance.team_source, 'player_current_team');
  assert.equal(source.source_team_id, '147');
});

test('reviewed team override supplies a current assignment without guessing status', () => {
  const result = resolve(evidence({ latest_stat_year: 2024,
    team_override: { teamid: '10001', team_name: 'Iowa Cubs' } }));
  assert.equal(result.patch.after.current_team_name, 'Iowa Cubs');
  assert.equal(result.patch.after.status_label, null);
});

test('an explicit departed status uses previous fields with displayable provenance', () => {
  const result = resolve(evidence({ stage: { playerid: 'player-1', status_label: 'RETIRED' },
    latest_stat_year: 2024, latest_teamids: ['10001'] }));
  assert.equal(result.patch.after.previous_team_name, 'Iowa Cubs');
  assert.equal(result.patch.after.current_team_name, null);
  assert.equal(result.patch.after.team_affiliation_status, 'RETIRED');
  assert.equal(result.patch.after.current_team_source, 'baseline_metadata');
  assert.equal(result.patch.after.display_status_label, 'RETIRED');
});

test('a reviewed departure status outranks current-season stats for an incomplete baseline', () => {
  const result = resolve(current({ verified_submission: { submitted_status: 'FREE AGENT' } }));
  assert.equal(result.patch.after.status_label, 'FREE AGENT');
  assert.equal(result.patch.after.current_team_name, null);
  assert.equal(result.patch.after.previous_team_name, 'Iowa Cubs');
});

test('new explicit special roles preserve status while holding unsupported affiliation fields', () => {
  for (const status of ['DECEASED', 'RETIRED - COACH', 'COACH', 'COMMIT']) {
    const result = resolve(current({ verified_submission: { submitted_status: status, submitted_teamid: '10001' } }));
    assert.equal(result.patch.after.status_label, status);
    assert.equal(result.patch.after.current_team_name, null);
    assert.equal(result.patch.after.previous_team_name, null);
    assert.equal(result.patch.after.team_affiliation_status, null);
    assert.equal(result.reason, 'unsupported_status_team_enrichment');
  }
});

test('existing meaningful status is preserved even when another source differs', () => {
  const result = resolve(current({ stage: { playerid: 'player-1', status_label: 'RETIRED' } }));
  assert.equal(result.patch.after.status_label, 'RETIRED');
});

test('MLB, manual, transaction, and special status ownership prevents writes', () => {
  for (const stage of [
    { current_team_source: 'mlb_api' }, { current_team_source: 'manual' },
    { last_transaction_applied_at: '2026-10-18T11:00:00Z' }, { status_label: 'INJURED 60-DAY' },
    { status_label: 'UNKNOWN', display_status_label: 'COACH' },
    { status_label: 'ACTIVE', display_status_label: 'RETIRED' },
  ]) {
    const result = resolve(current({ stage: { playerid: 'player-1', ...stage } }));
    assert.equal(result.patch, null);
    assert.equal(result.reason, 'protected_metadata');
  }
});

test('all real existing team identity fields must agree before joining a mapping', () => {
  for (const conflicting of [
    { current_team_name: 'Another Team' }, { current_teamid: '999' },
    { current_org_or_conference_name: 'Boston Red Sox' }, { display_level_label: 'DOUBLE-A' },
    { current_team_level: 'DOUBLE-A' }, { current_level_label: 'DOUBLE-A' },
    { current_team_source_team_id: '999' },
  ]) {
    const result = resolve(current({ stage: { playerid: 'player-1', ...conflicting } }));
    assert.equal(result.reason, 'missing_or_conflicting_team_mapping');
    assert.equal(result.patch.after.current_team_source, null);
  }
});

test('UNKNOWN and dash placeholders are missing values, not contradictory identities', () => {
  const result = resolve(current({ stage: { playerid: 'player-1', current_team_name: 'UNKNOWN',
    current_org_or_conference_name: '--', current_teamid: 'UNKNOWN', current_team_source_team_id: '-',
    current_team_source: 'UNKNOWN', status_label: '--' } }));
  assert.equal(result.reason, 'resolved');
  assert.equal(result.patch.after.current_team_name, 'Iowa Cubs');
  assert.equal(result.patch.after.current_teamid, '10001');
});

test('an incomplete mapping remains a coverage finding after safe partial enrichment', () => {
  const result = resolve(current(), [mapping({ org_name: null })]);
  assert.equal(result.patch.after.current_team_name, 'Iowa Cubs');
  assert.equal(result.missing_org, true);
  assert.equal(result.reason, 'missing_org_mapping');
});

test('MLB teams do not require a redundant parent organization label', () => {
  const result = resolve(current(), [mapping({ level: 'MLB', org_name: null })]);
  assert.equal(result.reason, 'resolved');
});

test('reapplying the same plan is idempotent', () => {
  const initial = resolve(current());
  const next = resolve(current({ stage: { playerid: 'player-1', ...initial.patch.after } }));
  assert.equal(next.patch, null);
  assert.equal(next.reason, 'resolved');
});

test('read-only planning reports broad source gaps without fetching all uncovered records', async () => {
  const calls = [];
  const client = { query: async (sql, args) => {
    calls.push({ sql, args });
    if (sql === api.BASELINE_METADATA_EVIDENCE_SQL) return { rows: [{ inspected: 66000, protected: 200,
      missing_source_coverage: 65799, candidates: [current()], examples: [] }] };
    if (sql === api.BASELINE_TEAM_MAPPING_SQL) return { rows: [mapping()] };
    throw new Error('Planner tried a write');
  } };
  const plan = await api.planBaselineMetadata(client, { asOf, playerIds: ['player-1'] });
  assert.equal(calls.length, 2);
  assert.deepEqual(clean(calls[0].args), [['player-1'], 2026, asOf.toISOString()]);
  assert.deepEqual(clean(calls[1].args), [['10001']]);
  assert.equal(plan.coverage.state, 'degraded');
  assert.equal(plan.coverage.missing_source_coverage, 65799);
  assert.equal(plan.patches.length, 1);
});

test('no-evidence planning never performs an unnecessary mapping query or write', async () => {
  const calls = [];
  const client = { query: async (sql) => { calls.push(sql); return { rows: [{ inspected: 24,
    protected: 0, missing_source_coverage: 24, candidates: [], examples: [] }] }; } };
  const plan = await api.planBaselineMetadata(client, { asOf });
  const result = await api.applyBaselineMetadata(client, plan);
  assert.equal(calls.length, 1);
  assert.equal(result.applied_updates, 0);
  assert.equal(result.state, 'degraded');
});

test('guarded update detects concurrent changes and keeps a reviewable before/after payload', async () => {
  const patch = resolve(current()).patch;
  const client = { query: async (sql, values) => {
    assert.equal(sql, api.APPLY_BASELINE_METADATA_SQL);
    const payload = JSON.parse(values[0]);
    assert.equal(payload[0].before_values.status_label, null);
    assert.equal(payload[0].after_values.status_label, 'ACTIVE');
    assert.equal(payload[0].provenance.version, 1);
    return { rows: [], rowCount: 0 };
  } };
  const result = await api.applyBaselineMetadata(client, { patches: [patch], coverage: {
    state: 'healthy', reasons: {}, proposed_updates: 1, applied_updates: 0,
  } });
  assert.equal(result.concurrent_changes_skipped, 1);
  assert.equal(result.applied_updates, 0);
  assert.equal(result.state, 'degraded');
  for (const field of api.METADATA_FIELDS) assert.ok(api.APPLY_BASELINE_METADATA_SQL.includes(`f.${field} IS NOT DISTINCT FROM`));
  assert.match(api.APPLY_BASELINE_METADATA_SQL, /f\.last_transaction_applied_at IS NULL/);
  assert.match(api.APPLY_BASELINE_METADATA_SQL, /f\.current_team_last_verified IS NOT DISTINCT FROM/);
  assert.ok(!/\b(TRUNCATE|DELETE|refresh_flip_card_front_stage)\b/i.test(api.APPLY_BASELINE_METADATA_SQL));
});

test('CLI is read-only by default and disallows historical writes', () => {
  const { parseArgs } = require('./enrich-player-baseline-metadata.cjs');
  assert.equal(parseArgs([]).apply, false);
  assert.deepEqual(parseArgs(['--playerids', '123,123,456']).playerIds, ['123', '456']);
  assert.throws(() => parseArgs(['--as-of', '2025-01-01', '--apply']), /read-only/);
  assert.throws(() => parseArgs(['--playerids']), /value is required/);
});

test('ingest enriches after baseline insertion, before health recording and commit', () => {
  const route = fs.readFileSync(path.join(root, 'src/app/api/cron/tbc-safe-ingest/route.ts'), 'utf8');
  const baseline = route.indexOf('const baseline = await ensureFlipCardBaselineRows(client)');
  const enrichment = route.indexOf('const metadataCoverage = await enrichFlipCardBaselineMetadata(client)');
  const health = route.indexOf('await recordIngestSuccess(client,', enrichment);
  const commit = route.indexOf('await client.query("commit")', health);
  assert.ok(baseline > 0 && baseline < enrichment && enrichment < health && health < commit);
  assert.match(route.slice(enrichment, commit), /dataQuality, metadataCoverage/);
  assert.match(route.slice(enrichment, commit), /result.skippedRows > 0/);
  assert.match(route.slice(commit), /event: "yatstats_metadata_coverage_gap"/);
});
