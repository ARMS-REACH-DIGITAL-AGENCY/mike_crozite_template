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


// Guard the non-MLB 2026 NULL-team-ID recovery. A past season, April MLB
// snapshot or ambiguous team must never become a current assignment.
const recovery = section(levels,
  'export const SAFE_2026_STAGE_TEAM_RECOVERY_SQL = `',
  'export const STAGE_TEAM_COVERAGE_SQL');
assert(recovery.includes("year = '2026'"),
  'Recovery must use only current-season 2026 records');
assert(recovery.includes('COUNT(DISTINCT teamid) = 1'),
  'Ambiguous multi-team 2026 assignments must not be guessed');
assert(!/public\.player_current_team\b/i.test(recovery),
  'Recovery must never read the obsolete MLB snapshot');
assert(recovery.includes("f.current_teamid IS NULL") &&
       recovery.includes("f.current_team_source IS NULL"),
  'Recovery must not overwrite an existing verified assignment');
assert(recovery.includes('public.player_team_override') &&
       recovery.includes('f.last_transaction_applied_at IS NULL'),
  'Recovery must protect overrides and transaction departures');
assert(!/current_team_last_verified\s*=/i.test(recovery),
  '2026 stats evidence must not be misrepresented as a live verified roster');
assert(recovery.includes("'NCAA-D1','NCAA-D2','NCAA-D3','NAIA','NJCAA','CCCAA','NWAC'") &&
       !recovery.includes("'INDY','INTERNATIONAL'") &&
       !recovery.includes("'INDY', 'INTERNATIONAL'"),
  'TBC season totals may repair college teams but never pro roster assignments');
assert(!/['"]PRO['"]/.test(recovery),
  'Unresolved generic PRO team levels must not be auto-assigned');
assert(cron.includes('SAFE_2026_STAGE_TEAM_RECOVERY_SQL') &&
       cron.includes('STAGE_TEAM_COVERAGE_SQL') &&
       cron.includes('UNRESOLVED_ACTIVE_TEAM_SQL'),
  'Daily check must reconcile and report entire stage coverage');
const ingest = source('src/app/api/cron/tbc-safe-ingest/route.ts');
assert(ingest.includes('SAFE_2026_STAGE_TEAM_RECOVERY_SQL'),
  'TBC ingest must recover safe team IDs immediately after the new season feed');


const activeRecovery = section(levels,
  'export const SAFE_2026_BLANK_STATUS_RECOVERY_SQL = `',
  'SELECT COUNT(*)::int AS activated FROM changed');
assert(activeRecovery.includes("f.status_label IS NULL"),
  'Only unclassified players can be classified automatically');
assert(activeRecovery.includes("COUNT(DISTINCT teamid)=1") &&
       activeRecovery.includes("COUNT(DISTINCT evidence_source)=1"),
  '2026 team and source must be unambiguous');
assert(!activeRecovery.includes('indy_iscore_') && !activeRecovery.includes("u.level_label='INDY'"),
  'Independent professional season stats must never auto-classify ACTIVE');
assert(activeRecovery.includes("e.evidence_source='tbc_2026'") &&
       activeRecovery.includes("'NCAA-D1','NCAA-D2','NCAA-D3','NAIA','NJCAA','CCCAA','NWAC'") &&
       activeRecovery.includes("u.current_org_or_conference_name"),
  'Only complete canonical colleges may be activated from 2026 season stats');
assert(activeRecovery.includes('public.mlb_org_roster_resolution') &&
       activeRecovery.includes("m.source='mlb_api'") &&
       activeRecovery.includes('public.player_team_override'),
  'Never overrule MLB API mappings or explicit overrides');
assert(!/current_team_last_verified\s*=/.test(activeRecovery),
  'Season activity must not become a fake verified-live-roster timestamp');
assert(cron.includes('SAFE_2026_BLANK_STATUS_RECOVERY_SQL'),
  'Daily check must classify eligible blank-status players');
assert(ingest.includes('SAFE_2026_BLANK_STATUS_RECOVERY_SQL'),
  'Ingest must classify new eligible player rows');
assert(!ingest.includes('reconcileCollegeToIndyCurrentTeams') &&
       !ingest.includes('tbc_2026_indy_season_reconciled'),
  'TBC season ingest must never promote a professional current team');
const cutoff = section(levels,
  'export const SAFE_2025_RETIREMENT_BACKFILL_SQL = `',
  'export const SAFE_RETIRED_VERIFIED_LEVEL_CLEANUP_SQL');
assert(cutoff.includes("f.status_label IS NULL") &&
       cutoff.includes("season_year=2026") &&
       cutoff.includes("game_date>=DATE '2026-01-01'") &&
       cutoff.includes("m.source='mlb_api'") &&
       cutoff.includes('mlb_org_roster_resolution') &&
       cutoff.includes('player_team_override') &&
       !cutoff.includes('current_teamid=') &&
       !cutoff.includes('current_team_last_verified='),
  'Retirement backfill must preserve 2026 players, verified MLB identities and current teams');
const retiredLevels = section(levels,
  'export const SAFE_RETIRED_VERIFIED_LEVEL_CLEANUP_SQL = `',
  'SELECT COUNT(*)::int AS corrected FROM fixed');
assert(retiredLevels.includes('f.highest_level_label') &&
       retiredLevels.includes("f.level_label='NCAA'") &&
       retiredLevels.includes("f.current_teamid IS NULL"),
  'Retired college cleanup must use verified existing career-high and no current team');
const provenance = source('migrations/20261031_flip_card_stage_field_provenance.sql');
assert(provenance.includes('AFTER INSERT OR UPDATE OF') &&
       provenance.includes('recorded_at TIMESTAMPTZ') &&
       provenance.includes("'before', before_fields -> k"),
  'Stage insert/update history must retain timestamps and field-level before/after');

const statusCron = source('src/app/api/cron/flip-card-status-reconciliation/route.ts');
const schedule = source('vercel.json');
const stageGuard = source('migrations/20261031_guard_flip_card_canonical_promotion.sql');
const readTimeIdentity = source('src/lib/playerStageIdentity.ts');
const careerHighBackfill = section(levels,
  'export const SAFE_RETIRED_TBC_CAREER_HIGH_BACKFILL_SQL = `',
  'SELECT COUNT(*)::int AS recovered FROM changed');
assert(careerHighBackfill.includes('p.highlevel') &&
       careerHighBackfill.includes('verified_level') &&
       careerHighBackfill.includes("f.status_label='RETIRED'") &&
       careerHighBackfill.includes('f.current_teamid IS NULL') &&
       careerHighBackfill.includes('highest_level_label=e.verified_level') &&
       !careerHighBackfill.includes("WHEN 'NCAA'") &&
       !careerHighBackfill.includes("WHEN 'JRCOLLEGE'"),
  'Retired career highs must use unambiguous TBC player highlevel, never infer NCAA division or junior-college level');
assert(statusCron.includes('SAFE_RETIRED_TBC_CAREER_HIGH_BACKFILL_SQL'),
  'Recurring job must catch missing career highs after imports');
assert(statusCron.includes('SAFE_2025_RETIREMENT_BACKFILL_SQL') &&
       statusCron.includes('SAFE_RETIRED_VERIFIED_LEVEL_CLEANUP_SQL') &&
       statusCron.includes('CRON_SECRET'),
  'Dedicated cron must reconcile verified retirement and legacy college levels');
assert(schedule.includes('/api/cron/flip-card-status-reconciliation'),
  'Retirement cutoff must run automatically on future ingests');
assert(stageGuard.includes('BEFORE INSERT OR UPDATE OF current_teamid,level_label,display_level_label') &&
       stageGuard.includes('NEW.level_label NOT IN') &&
       stageGuard.includes('NEW.current_teamid'),
  'Prevent unverified team/level values from entering flip-card stage');
assert(readTimeIdentity.includes("m.level_label IN ('NCAA-D1','NCAA-D2','NCAA-D3','NAIA','NJCAA','CCCAA','NWAC')") &&
       readTimeIdentity.includes('AND m.level IS NOT NULL'),
  'Read-time stage identity must not activate professional players from stats');

const retiredTransactionClear = section(levels,
  'export const SAFE_RETIRED_POST_TRANSACTION_TEAM_CLEAR_SQL = `',
  'SELECT COUNT(*)::int AS cleared FROM changed');
assert(retiredTransactionClear.includes("f.status_label='RETIRED'") &&
       retiredTransactionClear.includes("f.last_transaction_type ILIKE '%retir%'") &&
       retiredTransactionClear.includes("f.last_transaction_applied_at >= f.current_team_last_verified") &&
       retiredTransactionClear.includes('player_team_override') &&
       retiredTransactionClear.includes('current_teamid=NULL') &&
       !retiredTransactionClear.includes('SET status_label=') &&
       !retiredTransactionClear.includes('highest_level_label='),
  'Only a newer retirement transaction can clear an older MLB roster assignment');
assert(statusCron.includes('SAFE_RETIRED_POST_TRANSACTION_TEAM_CLEAR_SQL'),
  'Stage maintenance must clear stale current team after a confirmed retirement');

console.log('PASS: current-team precedence, provider IDs, 40-man affiliation, manual overrides and shared UI status');
