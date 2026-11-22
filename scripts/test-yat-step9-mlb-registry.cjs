'use strict';
// YAT key step 9, part 1 (Pete, Nov 19 2026): every MLB job reads "which of
// our people is this MLB ID" from the YAT Registry (yat_mlb_links), never
// player_source_map. A different birth date never links automatically: it
// waits in yat_registry_review and Pete is emailed. No one-off scoring.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const read = (f) => fs.readFileSync(f, 'utf8');

const mlbJobs = [
  'scripts/apply-mlb-transaction-status.ts', 'scripts/audit-afl-coverage.ts', 'scripts/audit-mlb-player-links.ts',
  'scripts/export-spring-training-2026.ts', 'scripts/import-mlb-headshots-s3.py', 'scripts/import-player-draft-picks.ts',
  'scripts/ingest-news.ts', 'scripts/refresh-flip-card-front-stage-from-mlb.ts', 'scripts/sync-mlb-full-org-rosters.ts',
  'scripts/sync-mlb-person-profiles.ts', 'scripts/sync-mlb-player-gamelogs.ts', 'scripts/sync_afl_rosters.py',
  'src/app/api/cron/mlb-live-gamelogs/route.ts', 'src/lib/mlb/liveGameLogs.ts', 'scripts/lib/player-source-map.ts',
];
for (const f of mlbJobs) {
  const code = read(f).split('\n').filter((l) => !/^\s*(\/\/|#|\*|--)/.test(l)).join('\n');
  assert.ok(!/(FROM|JOIN)\s+(public\.)?player_source_map\b/i.test(code), `${f} must not read player_source_map`);
}
assert.match(read('scripts/lib/player-source-map.ts'), /FROM public\.yat_mlb_links WHERE mlb_id = \$1/, 'shared resolver reads the registry');

// The nightly TBC job's crosswalk and rejections come from the registry too.
const ingest = read('src/app/api/cron/tbc-safe-ingest/route.ts');
assert.ok(!/from public\.player_source_map/i.test(ingest), 'nightly job does not read player_source_map');
assert.match(ingest, /from public\.yat_registry_rejections r/);

// No one-off scoring (Pete: no hard coding).
assert.ok(!/hamilton/i.test(read('scripts/sync-mlb-full-org-rosters.ts')), 'no hard-coded school in MLB scoring');
assert.match(read('scripts/sync-mlb-full-org-rosters.ts'), /saveForReview\(p, candidates,/, 'a tie goes to Pete');

// The identity rule.
const src = read('scripts/lib/player-identity.ts');
const mod = { exports: {} };
new Function('module', 'exports', ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 } }).outputText)(mod, mod.exports);
const { identityVerdict } = mod.exports;
assert.equal(identityVerdict({ borndate: '4/15/2005', place: 'Atlanta,GA' }, { birthDate: '2005-04-15', birthCity: 'Macon' }), 'confirmed', 'same birth date');
// Domenic Picone: 7 days apart, same birth city -> Pete decides.
assert.equal(identityVerdict({ borndate: '10/16/2000', place: 'Garnet Valley,PA' }, { birthDate: '2000-10-09', birthCity: 'Garnet Valley', birthStateProvince: 'PA' }), 'review');
// Luc Rising: 10 days apart, neighboring towns, same state and year -> Pete decides.
assert.equal(identityVerdict({ borndate: '12/21/2003', place: 'Exton,PA' }, { birthDate: '2003-12-11', birthCity: 'West Chester', birthStateProvince: 'PA' }), 'review');
// Different birth date and nothing else agrees -> not the same person.
assert.equal(identityVerdict({ borndate: '7/3/2005', place: 'Miami,FL' }, { birthDate: '2005-07-03'.replace('07-03', '01-20'), birthCity: 'Santo Domingo', birthStateProvince: '' }), 'conflict');
assert.equal(identityVerdict({ borndate: '', place: 'Atlanta,GA' }, { birthDate: '2005-04-15', birthCity: 'Atlanta' }), 'confirmed', 'no birth date, same birth city');

// Pete is emailed when a player waits for review.
const alerts = read('src/app/api/cron/flip-card-auto-create-alerts/route.ts');
assert.match(alerts, /from public\.yat_registry_review\s+where status = 'pending' and notified_at is null/);
assert.match(alerts, /const QUARANTINE_EMAIL = "pete@yatstats\.com";/);

const sql = read('migrations/20261119_yat_step9_mlb_registry.sql');
assert.match(sql, /CREATE OR REPLACE VIEW public\.yat_mlb_links AS/);
assert.match(sql, /IF EXISTS \(SELECT 1 FROM public\.yat_registry_rejections/, 'a rejected pair is never attached again');
console.log('yat step 9 MLB registry OK');
