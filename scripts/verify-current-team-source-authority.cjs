'use strict';

// Lightweight build-time guard against the Oct 28, 2026 current-team rollback.
// It protects the shared template: no player/school-specific exceptions.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const source = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const levels = source('src/lib/officialLevels.ts');
const cron = source('src/app/api/cron/level-qc/route.ts');
const mlb = source('scripts/refresh-flip-card-front-stage-from-mlb.ts');
const gallery = source('src/lib/galleryStatuses.ts');

const section = (text, head, tail) => {
  const start = text.indexOf(head);
  assert(start >= 0, 'Missing section: ' + head);
  const end = text.indexOf(tail, start + head.length);
  assert(end > start, 'Missing end of ' + head);
  return text.slice(start, end);
};

const qc = section(levels,
  'export const CANONICAL_STAGE_REPAIR_SQL = `',
  'export const CANONICAL_ACTIVE_STAGE_MISMATCH_SQL');
const roster = section(mlb,
  'async function reconcileFortyManOnlyAffiliations()',
  '// The daily full-schedule ingest owns schedule acquisition.');
const ids = section(mlb,
  'async function normalizeLegacyCanonicalSourceTeamIds()',
  '// The daily full-schedule ingest owns schedule acquisition.');

assert(cron.includes('CANONICAL_STAGE_REPAIR_SQL'),
  'Daily cron must use the guarded canonical metadata repair');
assert(!/public\.player_current_team\b/i.test(qc),
  'Daily QC must not use the stale April player_current_team table');
assert(!/current_team_source_team_id\s*=/i.test(qc),
  'Daily QC must never overwrite MLB source-team IDs with TBC IDs');
assert(!/current_teamid\s*=/i.test(qc),
  'Daily QC must not replace a professional player team assignment');
assert(qc.includes("'mlb_api_canonical_teamid'") && qc.includes("'mlb_api'"),
  'Daily QC must explicitly exclude all MLB-sourced assignments');
assert(qc.includes("'INDY','INTERNATIONAL'") || qc.includes("'INDY', 'INTERNATIONAL'"),
  'Daily QC must still be able to repair non-MLB canonical metadata');
assert(qc.includes('current_team_name = t.team_name'),
  'Non-MLB canonical name repair must remain functional');

assert(/COUNT\(DISTINCT mlb_team_id\) = 1/.test(roster),
  'Ambiguous simultaneous 40-man organizations must not be guessed');
assert(/COUNT\(DISTINCT source_player_id\) = 1/.test(roster),
  'Ambiguous MLB person identities must not be guessed');
assert(roster.includes("raw.source_team_id::text = raw.org_source_team_id::text"),
  'Only true parent-club 40-man rows can establish a parent affiliation');
assert(roster.includes("LOWER(COALESCE(raw.roster_type, '')) = 'active'"),
  'Active MLB/MiLB roster evidence must outrank the 40-man fallback');
assert(roster.includes("UPPER(TRIM(COALESCE(raw.roster_status, ''))) <> 'FORTY MAN'"),
  'A fullRoster 40-man tag cannot be treated as an actual assignment');
assert(roster.includes("stage.last_transaction_applied_at IS NULL"),
  'Transaction-owned departures must remain protected');
assert(roster.includes('public.player_team_override'),
  'Manual team overrides must remain protected');
assert(roster.includes('stage.current_team_last_verified <= fm.seen_at'),
  'Older 40-man data must never overwrite a newer verified assignment');
assert(roster.includes('current_team_source_team_id = fm.mlb_team_id'),
  'Store the MLB source ID in the source-team-ID field');
assert(roster.includes('current_teamid = fm.tbc_teamid'),
  'Store the canonical TBC ID in the display/logo team-ID field');
assert(roster.includes("current_team_roster_status = 'Forty Man'"),
  '40-man-only status must be carried in source roster status');
assert(roster.includes("status_label = '40-MAN'"),
  'Do not misrepresent a 40-man-only player as game-roster ACTIVE');
assert(roster.includes("display_status_label = '40-MAN'"),
  'Fan-facing status must distinguish 40-man from active game roster');

// The source-team-ID repair must never be allowed to edit the display
// assignment or freshen the last-verified timestamp.
assert(ids.includes("f.current_team_source = 'mlb_api_canonical_teamid'"),
  'Only legacy canonical sources may have their mixed provider IDs normalized');
assert(ids.includes('map.mlb_stats_api_id::text AS mlb_team_id'),
  'Convert through the verified one-to-one provider crosswalk');
assert(ids.includes('current_team_source_team_id = vm.mlb_team_id'),
  'Correct the MLB source ID, not the TBC ID');
assert(!ids.includes('SET current_team_name =') && !ids.includes('current_team_last_verified ='),
  'ID normalization must not modify team assignment or pretend to reverify a player');

const call = mlb.indexOf('const fortyManAffiliations = await reconcileFortyManOnlyAffiliations()');
const active = mlb.indexOf('const updated = await refreshStage(mlbCurrent)');
const games = mlb.indexOf('const scheduled = await refreshLoadedNextGames()');
assert(active >= 0 && call > active && games > call,
  'The 40-man fallback must run after the active roster and before schedule publication');
assert(mlb.includes("NOT IN ('retired', 'not active', 'free agent', '40-man')"),
  '40-man-only players must not inherit an active club game schedule');

for (const variable of ['GALLERY_STATUS_OPTIONS','ROSTER_STATUSES','ACTIVE_GALLERY_STATUSES']) {
  const at = gallery.indexOf('export const ' + variable);
  assert(at >= 0 && gallery.slice(at,at+1100).includes("'40-MAN'"),
    variable + ' must explicitly recognize 40-MAN');
}

console.log('PASS: current-team precedence, provider IDs, 40-man affiliation, manual overrides and shared UI status');
