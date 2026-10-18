/**
 * Fill incomplete player cards from existing, identified sources.
 *
 * No source rows is a coverage failure, never evidence of retirement. Current
 * teams use playerid -> recorded teamid -> a unique mapping. Existing facts,
 * MLB/transaction-owned cards and reviewed overrides are never overwritten.
 * The caller owns the transaction (the TBC cron calls this after baseline
 * insertion). The same planner powers the operator's default read-only report.
 */

export const METADATA_FIELDS = [
  'status_label', 'display_status_label', 'level_label', 'display_level_label',
  'current_team_name', 'current_org_or_conference_name', 'current_teamid',
  'current_team_source_team_id', 'current_team_level', 'current_level_label',
  'previous_team_name', 'previous_org_or_conference_name', 'previous_teamid',
  'previous_level_label', 'team_affiliation_status', 'current_team_source',
] as const;
export type MetadataField = (typeof METADATA_FIELDS)[number];
export type MetadataValues = Record<MetadataField, string | null>;
export type QueryClient = { query: (sql: string, values?: any[]) => Promise<{ rows: any[]; rowCount?: number | null }> };

export type StageMetadata = Partial<MetadataValues> & {
  playerid: string;
  hsid?: string | null;
  display_name?: string | null;
  last_transaction_applied_at?: string | null;
  current_team_last_verified?: string | null;
};
export type TeamSource = {
  teamid?: string | null;
  team_name?: string | null;
  level?: string | null;
  org_name?: string | null;
  source_team_id?: string | null;
  source?: string | null;
  roster_status?: string | null;
  last_verified?: string | null;
  updated_at?: string | null;
};
export type StatusSource = { status?: string | null; source?: string | null; last_updated?: string | null };
export type VerifiedSubmission = {
  submitted_status?: string | null;
  submitted_teamid?: string | null;
  submitted_team_name?: string | null;
  submitted_level?: string | null;
  submitted_org_or_conference_name?: string | null;
};
export type MetadataEvidence = {
  stage: StageMetadata;
  latest_stat_year: number | null;
  latest_teamids: string[];
  current_teamids: string[];
  current_team: TeamSource | null;
  current_status: StatusSource | null;
  team_override: TeamSource | null;
  verified_submission: VerifiedSubmission | null;
  college_resolution: { teamid: string; resolution_method: string } | null;
};
export type MappingRow = {
  teamid: string;
  team_name: string | null;
  org_name: string | null;
  level: string | null;
  source_team_id: string | null;
  mapping_source: 'canonical' | 'college';
};
export type ResolvedTeam = {
  teamid: string | null;
  team_name: string | null;
  org_name: string | null;
  level: string | null;
  source_team_id: string | null;
};
export type MetadataPatch = {
  playerid: string;
  hsid: string | null;
  display_name: string | null;
  before: MetadataValues;
  after: MetadataValues;
  last_transaction_applied_at: string | null;
  current_team_last_verified: string | null;
  provenance: { status_source: string | null; team_source: string | null; latest_stat_year: number | null };
};
export type CandidateResult = {
  patch: MetadataPatch | null;
  reason: string;
  missing_status: boolean;
  missing_team: boolean;
  missing_level: boolean;
  missing_org: boolean;
};
export type MetadataCoverage = {
  state: 'healthy' | 'degraded';
  inspected: number;
  protected: number;
  evidence_candidates: number;
  missing_source_coverage: number;
  unresolved_candidates: number;
  proposed_updates: number;
  applied_updates: number;
  concurrent_changes_skipped: number;
  reasons: Record<string, number>;
  examples: Array<{ playerid: string; hsid: string | null; name: string | null; reason: string }>;
};
export type MetadataPlan = { coverage: MetadataCoverage; patches: MetadataPatch[] };

const MANUAL_SOURCES = new Set(['manual', 'manual_review', 'verified_school_submission']);
const MACHINE_SOURCES = new Set(['mlb_api']);
const FRESHNESS_MS = 48 * 60 * 60 * 1000;
const key = (value: unknown): string => String(value ?? '').trim().replace(/\s+/g, ' ').toUpperCase();
const absent = (value: unknown): boolean => ['', 'UNKNOWN', '--', '-'].includes(key(value));
const text = (value: unknown): string | null => absent(value) ? null : String(value).trim();
const departure = (value: unknown): boolean => /^(RETIRED|FREE AGENT|DECEASED)(\b|$)/.test(key(value));

export function normalizeMetadataLevel(value: unknown): string | null {
  const raw = key(value);
  const levels: Record<string, string> = {
    AAA: 'TRIPLE-A', 'TRIPLE A': 'TRIPLE-A', AA: 'DOUBLE-A', 'DOUBLE A': 'DOUBLE-A',
    'A+': 'HIGH-A', 'HIGH A': 'HIGH-A', A: 'LOW-A', 'A-': 'LOW-A',
    'SINGLE-A': 'LOW-A', 'SINGLE A': 'LOW-A', 'LOW A': 'LOW-A', RK: 'ROOKIE',
    INTL: "INT'L", INTERNATIONAL: "INT'L", INDEPENDENT: 'INDY',
    D1: 'NCAA-D1', D2: 'NCAA-D2', D3: 'NCAA-D3',
    JRCOLLEGE: 'JUCO', NJCAA: 'JUCO', CCCAA: 'JUCO', NWAC: 'JUCO', HS: 'HIGH SCHOOL',
  };
  // Generic NCAA is not evidence of Division I. A real mapped division is required.
  if (['', '-', '--', 'UNKNOWN', 'NCAA', 'COLLEGE'].includes(raw)) return null;
  return levels[raw] || raw;
}

function normalizeStatus(value: unknown): string | null {
  const raw = key(value);
  if (['', 'UNKNOWN', '-', '--', 'FORTY MAN', '40-MAN'].includes(raw)) return null;
  if (['ACTIVE', 'RETIRED', 'FREE AGENT', 'DECEASED', 'DFA', 'COACH', 'COMMIT', 'UNCOMMITTED',
    'RED SHIRT', 'REDSHIRT-MEDICAL', 'RETIRED - COACH'].includes(raw)) return raw;
  if (/^(INJURED|REHAB|DEVELOPMENT|OPTIONED|RESTRICTED|SUSPENDED|BEREAVEMENT|PATERNITY|REASSIGNED|MILITARY|ADMINISTRATIVE|RESERVE|TEMPORARILY|NOT YET REPORTED|INELIGIBLE)\b/.test(raw)) return raw;
  return null;
}

export function isTrustedCurrentSource(source: unknown, verifiedAt: unknown, asOf: Date): boolean {
  const kind = String(source ?? '').trim().toLowerCase();
  if (MANUAL_SOURCES.has(kind)) return true;
  if (!MACHINE_SOURCES.has(kind) || !text(verifiedAt)) return false;
  const stamp = String(verifiedAt).trim();
  const at = Date.parse(/(?:Z|[+-]\d\d(?::?\d\d)?)$/i.test(stamp) ? stamp : `${stamp}Z`);
  return Number.isFinite(at) && at <= asOf.getTime() && at >= asOf.getTime() - FRESHNESS_MS;
}

export function isProtectedMetadata(stage: StageMetadata): boolean {
  const source = key(stage.current_team_source);
  const statuses = [stage.status_label, stage.display_status_label].filter((value) => !absent(value)).map(key);
  return Boolean(stage.last_transaction_applied_at) || (!absent(source) && source !== 'BASELINE_METADATA') ||
    statuses.some((status) => !['ACTIVE', 'RETIRED', 'FREE AGENT', 'DECEASED'].includes(status)) ||
    new Set(statuses).size > 1;
}

export function resolveExactTeamMapping(rows: MappingRow[], teamid: string): ResolvedTeam | null {
  const matches = rows.filter((row) => String(row.teamid) === String(teamid));
  if (!matches.length) return null;
  const unique = (values: Array<unknown>): boolean => new Set(values.map(text).filter(Boolean).map(key)).size <= 1;
  if (!unique(matches.map((r) => r.team_name)) || !unique(matches.map((r) => r.org_name)) ||
      !unique(matches.map((r) => normalizeMetadataLevel(r.level))) || !unique(matches.map((r) => r.source_team_id))) return null;
  const first = (values: Array<unknown>): string | null => values.map(text).find(Boolean) || null;
  const level = first(matches.map((r) => normalizeMetadataLevel(r.level)));
  const name = first(matches.map((r) => r.team_name));
  if (!name) return null;
  return { teamid, team_name: name, org_name: first(matches.map((r) => r.org_name)), level,
    source_team_id: first(matches.map((r) => r.source_team_id)) ||
      (matches.some((r) => r.mapping_source === 'college') ? teamid : null) };
}

function sourceTeam(source: TeamSource, mappings: MappingRow[]): ResolvedTeam | null {
  const id = text(source.teamid);
  const mapped = id ? resolveExactTeamMapping(mappings, id) : null;
  const sourceLevel = normalizeMetadataLevel(source.level);
  // Explicit source fields stand on their own. Add mapped fields only when
  // every supplied source field agrees, so an old crosswalk cannot mix teams.
  const agrees = mapped && (!text(source.team_name) || key(source.team_name) === key(mapped.team_name)) &&
    (!sourceLevel || !mapped.level || sourceLevel === mapped.level) &&
    (!text(source.org_name) || !mapped.org_name || key(source.org_name) === key(mapped.org_name));
  const team = { teamid: id, team_name: text(source.team_name) || (agrees ? mapped.team_name : null),
    level: sourceLevel || (agrees ? mapped.level : null), org_name: text(source.org_name) || (agrees ? mapped.org_name : null),
    source_team_id: text(source.source_team_id) || (agrees ? mapped.source_team_id : null) };
  return team.team_name ? team : null;
}

export function resolveBaselineMetadata(e: MetadataEvidence, mappings: MappingRow[], asOf: Date): CandidateResult {
  const f = e.stage;
  const before = Object.fromEntries(METADATA_FIELDS.map((field) => [field, f[field] ?? null])) as MetadataValues;
  const after = { ...before };
  if (isProtectedMetadata(f)) return { patch: null, reason: 'protected_metadata', missing_status: false,
    missing_team: false, missing_level: false, missing_org: false };
  const year = asOf.getUTCFullYear();
  const latestYear = e.latest_stat_year != null && e.latest_stat_year >= 1800 && e.latest_stat_year <= year ? e.latest_stat_year : null;
  const ctTrusted = e.current_team && isTrustedCurrentSource(e.current_team.source, e.current_team.last_verified || e.current_team.updated_at, asOf);
  const csTrusted = e.current_status && isTrustedCurrentSource(e.current_status.source, e.current_status.last_updated, asOf);
  let statusSource: string | null = null;
  let status = normalizeStatus(f.status_label) || normalizeStatus(f.display_status_label);
  if (!status) {
    const supplied: Array<[unknown, string]> = [
      [e.verified_submission?.submitted_status, 'verified_school_submission'],
      [csTrusted ? e.current_status?.status : null, 'player_current_status'],
      [ctTrusted ? e.current_team?.roster_status : null, 'player_current_team'],
    ];
    for (const [value, source] of supplied) {
      const normalized = normalizeStatus(value);
      if (normalized) { status = normalized; statusSource = source; break; }
    }
    // Actual current-season participation can affirm ACTIVE. Historical stats
    // cannot establish retirement when later feed coverage is incomplete.
    if (!status && latestYear === year) { status = 'ACTIVE'; statusSource = 'current_season_stats'; }
  }
  const fill = (field: MetadataField, value: unknown): void => {
    const missingLevel = field.includes('level') && !normalizeMetadataLevel(after[field]);
    if ((absent(after[field]) || missingLevel) && text(value)) after[field] = String(value).trim();
  };
  if (status) {
    fill('status_label', status);
    fill('display_status_label', status);
    if (['RETIRED', 'FREE AGENT'].includes(status)) fill('team_affiliation_status', status);
  }
  // These roles have display/affiliation rules outside baseline repair. Keep
  // their explicit status but hold team fields instead of inventing semantics.
  const unsupportedRole = Boolean(status && !['ACTIVE', 'RETIRED', 'FREE AGENT'].includes(status));

  let team: ResolvedTeam | null = null;
  let teamSource: string | null = null;
  const explicit: Array<[TeamSource | null, string]> = [
    [e.team_override, 'player_team_override'],
    [e.verified_submission ? { teamid: e.verified_submission.submitted_teamid,
      team_name: e.verified_submission.submitted_team_name, level: e.verified_submission.submitted_level,
      org_name: e.verified_submission.submitted_org_or_conference_name } : null, 'verified_school_submission'],
    [ctTrusted ? e.current_team : null, 'player_current_team'],
  ];
  for (const [source, label] of explicit) {
    if (!source) continue;
    team = sourceTeam(source, mappings);
    if (team) { teamSource = label; break; }
  }
  let mappingUnresolved = false;
  let multipleTeams = false;
  if (!team) {
    const departed = departure(status);
    const stagedId = text(departed ? f.previous_teamid : f.current_teamid);
    let id = stagedId;
    if (id) teamSource = 'existing_stage_teamid';
    if (!id && !departed && latestYear === year && e.college_resolution?.resolution_method === 'manual_override') {
      id = e.college_resolution.teamid;
      teamSource = 'college_manual_override';
    }
    if (!id && ((departed && latestYear != null) || latestYear === year)) {
      const ids = [...new Set(departed ? e.latest_teamids : e.current_teamids)].filter(Boolean);
      multipleTeams = ids.length > 1;
      if (ids.length === 1) { id = ids[0]; teamSource = departed ? 'last_recorded_teamid' : 'current_season_teamid'; }
    }
    if (id) {
      team = resolveExactTeamMapping(mappings, id);
      mappingUnresolved = !team;
    }
  }
  if (unsupportedRole) { team = null; teamSource = null; }
  if (team) {
    const isPast = departure(status);
    const existingName = isPast ? f.previous_team_name : f.current_team_name;
    const existingId = isPast ? f.previous_teamid : f.current_teamid;
    const existingOrg = isPast ? f.previous_org_or_conference_name : f.current_org_or_conference_name;
    const mappedLevel = team.level;
    const existingLevels = (isPast ? [f.previous_level_label, f.level_label, f.display_level_label] :
      [f.current_team_level, f.current_level_label, f.level_label, f.display_level_label]).map(normalizeMetadataLevel).filter(Boolean);
    const conflicts = (text(existingName) && key(existingName) !== key(team.team_name)) ||
      (text(existingId) && team.teamid && text(existingId) !== team.teamid) ||
      (text(existingOrg) && team.org_name && key(existingOrg) !== key(team.org_name)) ||
      existingLevels.some((level) => mappedLevel && level !== mappedLevel) ||
      (!isPast && text(f.current_team_source_team_id) && team.teamid &&
        text(f.current_team_source_team_id) !== team.teamid);
    if (conflicts) {
      team = null;
      mappingUnresolved = true;
    } else if (isPast) {
      fill('previous_team_name', team.team_name);
      fill('previous_org_or_conference_name', team.org_name);
      fill('previous_teamid', team.teamid);
      fill('previous_level_label', team.level);
      fill('level_label', team.level);
      fill('display_level_label', team.level);
      fill('current_team_source', 'baseline_metadata');
    } else {
      fill('current_team_name', team.team_name);
      fill('current_org_or_conference_name', team.org_name);
      fill('current_teamid', team.teamid);
      // Scheduling consumers translate upstream IDs only for mlb_api-owned
      // cards. A baseline_metadata card must carry a canonical TBC team ID;
      // a source-only MLB ID cannot safely populate this field.
      fill('current_team_source_team_id', team.teamid);
      fill('current_team_level', team.level);
      fill('current_level_label', team.level);
      fill('level_label', team.level);
      fill('display_level_label', team.level);
      // A provenance marker, not a claim of fresh MLB roster verification.
      fill('current_team_source', 'baseline_metadata');
    }
  }
  const missingStatus = absent(after.status_label);
  const missingTeam = absent(departure(status) ? after.previous_team_name : after.current_team_name);
  const missingLevel = !normalizeMetadataLevel(after.level_label);
  const missingOrg = normalizeMetadataLevel(after.level_label) !== 'MLB' &&
    absent(departure(status) ? after.previous_org_or_conference_name : after.current_org_or_conference_name);
  const changed = METADATA_FIELDS.some((field) => before[field] !== after[field]);
  const reason = unsupportedRole ? 'unsupported_status_team_enrichment' :
    mappingUnresolved ? 'missing_or_conflicting_team_mapping' : multipleTeams ? 'multiple_recorded_teams' :
    missingStatus ? (latestYear == null ? 'missing_status_source' : 'historical_stats_without_current_status') :
    missingTeam ? 'missing_team_source' : missingLevel ? 'missing_level_mapping' : missingOrg ? 'missing_org_mapping' : 'resolved';
  return {
    patch: changed ? { playerid: f.playerid, hsid: f.hsid || null, display_name: f.display_name || null,
      before, after, last_transaction_applied_at: f.last_transaction_applied_at || null,
      current_team_last_verified: f.current_team_last_verified || null,
      provenance: { status_source: statusSource, team_source: team ? teamSource : null, latest_stat_year: latestYear } } : null,
    reason, missing_status: missingStatus, missing_team: missingTeam, missing_level: missingLevel, missing_org: missingOrg,
  };
}

const fieldObject = METADATA_FIELDS.map((field) => `'${field}', f.${field}`).join(', ');
const trustedTeamSql = `(lower(trim(coalesce(ct.source,''))) IN ('manual','manual_review','verified_school_submission') OR
  (lower(trim(ct.source))='mlb_api' AND coalesce(ct.last_verified,ct.updated_at) BETWEEN $3::timestamptz-interval '48 hours' AND $3::timestamptz))`;
const trustedStatusSql = `(lower(trim(coalesce(cs.source,''))) IN ('manual','manual_review','verified_school_submission') OR
  (lower(trim(cs.source))='mlb_api' AND (cs.last_updated AT TIME ZONE 'UTC') BETWEEN $3::timestamptz-interval '48 hours' AND $3::timestamptz))`;

/** Parameters: optional player IDs, assessment year, assessment timestamp. READ ONLY. */
export const BASELINE_METADATA_EVIDENCE_SQL = `
WITH needing_metadata AS MATERIALIZED (
  SELECT f.*,
    (f.last_transaction_applied_at IS NOT NULL OR
      coalesce(upper(trim(f.current_team_source)),'') NOT IN ('','-','--','UNKNOWN','BASELINE_METADATA') OR
      coalesce(upper(trim(f.status_label)),'') NOT IN ('','-','--','UNKNOWN','ACTIVE','RETIRED','FREE AGENT','DECEASED') OR
      coalesce(upper(trim(f.display_status_label)),'') NOT IN ('','-','--','UNKNOWN','ACTIVE','RETIRED','FREE AGENT','DECEASED') OR
      (coalesce(upper(trim(f.status_label)),'') NOT IN ('','-','--','UNKNOWN') AND
       coalesce(upper(trim(f.display_status_label)),'') NOT IN ('','-','--','UNKNOWN') AND
       upper(trim(f.status_label)) <> upper(trim(f.display_status_label)))) AS protected
  FROM public.flip_card_front_stage f
  WHERE ($1::text[] IS NULL OR f.playerid = ANY($1::text[]))
    -- Recurring repair concerns incomplete baselines/current players. An
    -- operator must name IDs to inspect established historical departures;
    -- today's team/conference crosswalk is not their historical affiliation.
    AND ($1::text[] IS NOT NULL OR lower(trim(f.current_team_source))='baseline_metadata'
      OR upper(trim(f.status_label))='ACTIVE' OR upper(trim(f.display_status_label))='ACTIVE'
      OR (coalesce(upper(trim(f.status_label)),'') IN ('','-','--','UNKNOWN')
        AND coalesce(upper(trim(f.display_status_label)),'') IN ('','-','--','UNKNOWN')))
    AND (coalesce(upper(trim(f.status_label)),'') IN ('','-','--','UNKNOWN')
      OR coalesce(upper(trim(f.level_label)),'') IN ('','-','--','UNKNOWN','NCAA','COLLEGE')
      OR CASE WHEN upper(coalesce(f.status_label,f.display_status_label,'')) ~ '^(RETIRED|FREE AGENT|DECEASED)'
        THEN nullif(trim(f.previous_team_name),'') IS NULL
          OR (coalesce(f.previous_level_label,f.level_label,'') <> 'MLB' AND nullif(trim(f.previous_org_or_conference_name),'') IS NULL)
        ELSE nullif(trim(f.current_team_name),'') IS NULL
          OR (coalesce(f.level_label,'') <> 'MLB' AND nullif(trim(f.current_org_or_conference_name),'') IS NULL)
      END)
), eligible AS MATERIALIZED (
  SELECT * FROM needing_metadata WHERE NOT protected
), raw_stat_rows AS (
  SELECT s.playerid, s.year::text AS year, s.teamid::text AS teamid FROM public.tbc_batting_raw s JOIN eligible e ON e.playerid=s.playerid
  UNION ALL
  SELECT s.playerid, s.year::text, s.teamid::text FROM public.tbc_pitching_raw s JOIN eligible e ON e.playerid=s.playerid
  UNION ALL
  SELECT s.playerid, s.year::text, s.teamid::text FROM public.tbc_batting_2026_season_raw s JOIN eligible e ON e.playerid=s.playerid
  UNION ALL
  SELECT s.playerid, s.year::text, s.teamid::text FROM public.tbc_pitching_2026_season_raw s JOIN eligible e ON e.playerid=s.playerid
), parsed_stats AS (
  SELECT playerid, CASE WHEN trim(year) ~ '^[0-9]{4}([.][0-9]+)?$' THEN floor(trim(year)::numeric)::int END AS year,
    nullif(trim(teamid),'') AS teamid FROM raw_stat_rows
), stats AS MATERIALIZED (
  SELECT * FROM parsed_stats WHERE year BETWEEN 1800 AND $2::int
), latest_year AS (
  SELECT playerid,max(year) AS latest_stat_year FROM stats GROUP BY playerid
), stat_teams AS (
  SELECT y.playerid,y.latest_stat_year,
    array_agg(DISTINCT s.teamid) FILTER (WHERE s.year=y.latest_stat_year AND s.teamid IS NOT NULL AND s.teamid<>'0') AS latest_teamids,
    array_agg(DISTINCT s.teamid) FILTER (WHERE s.year=$2::int AND s.teamid IS NOT NULL AND s.teamid<>'0') AS current_teamids
  FROM latest_year y JOIN stats s ON s.playerid=y.playerid GROUP BY y.playerid,y.latest_stat_year
), evidence AS MATERIALIZED (
  SELECT f.playerid,f.hsid,f.display_name,
    jsonb_build_object('playerid',f.playerid,'hsid',f.hsid,'display_name',f.display_name,
      'last_transaction_applied_at',f.last_transaction_applied_at,'current_team_last_verified',f.current_team_last_verified,${fieldObject}) AS stage,
    st.latest_stat_year,coalesce(st.latest_teamids,ARRAY[]::text[]) AS latest_teamids,
    coalesce(st.current_teamids,ARRAY[]::text[]) AS current_teamids,
    CASE WHEN ${trustedTeamSql} THEN jsonb_build_object('teamid',ct.teamid,'team_name',ct.team_name,'level',ct.level,
      'org_name',ct.org_name,'source_team_id',ct.source_team_id,'roster_status',ct.roster_status,'source',ct.source,
      'last_verified',ct.last_verified,'updated_at',ct.updated_at) END AS current_team,
    CASE WHEN ${trustedStatusSql} THEN jsonb_build_object('status',cs.status,'source',cs.source,'last_updated',cs.last_updated) END AS current_status,
    CASE WHEN o.playerid IS NOT NULL THEN jsonb_build_object('teamid',o.teamid,'team_name',o.team_name,'level',o.level) END AS team_override,
    CASE WHEN sr.approved_playerid IS NOT NULL THEN jsonb_build_object('submitted_status',sr.submitted_status,
      'submitted_teamid',sr.submitted_teamid,'submitted_team_name',sr.submitted_team_name,'submitted_level',sr.submitted_level,
      'submitted_org_or_conference_name',sr.submitted_org_or_conference_name) END AS verified_submission,
    CASE WHEN cr.playerid IS NOT NULL THEN jsonb_build_object('teamid',cr.teamid,'resolution_method',cr.resolution_method) END AS college_resolution
  FROM eligible f
  LEFT JOIN stat_teams st ON st.playerid=f.playerid
  LEFT JOIN public.player_current_team ct ON ct.playerid=f.playerid
  LEFT JOIN public.player_current_status cs ON cs.playerid=f.playerid
  LEFT JOIN public.player_team_override o ON o.playerid=f.playerid
  LEFT JOIN public.v_2026_college_player_team_resolved cr ON cr.playerid=f.playerid
  LEFT JOIN LATERAL (
    SELECT approved_playerid,submitted_status,submitted_teamid,submitted_team_name,submitted_level,submitted_org_or_conference_name
    FROM public.school_player_profile_submission_raw s
    WHERE s.approved_playerid=f.playerid AND s.is_reviewed IS TRUE AND s.is_verified IS TRUE
    ORDER BY s.updated_at DESC NULLS LAST,s.created_at DESC NULLS LAST,s.submission_id DESC LIMIT 1
  ) sr ON true
), classified AS MATERIALIZED (
  SELECT *, (latest_stat_year IS NOT NULL OR current_team IS NOT NULL OR current_status IS NOT NULL OR
    team_override IS NOT NULL OR verified_submission IS NOT NULL OR
    nullif(stage->>'current_teamid','') IS NOT NULL OR nullif(stage->>'previous_teamid','') IS NOT NULL) AS has_evidence
  FROM evidence
)
SELECT
  (SELECT count(*)::int FROM needing_metadata) AS inspected,
  (SELECT count(*)::int FROM needing_metadata WHERE protected) AS protected,
  count(*) FILTER (WHERE NOT has_evidence)::int AS missing_source_coverage,
  coalesce(jsonb_agg(to_jsonb(c) - 'playerid' - 'hsid' - 'display_name' - 'has_evidence') FILTER (WHERE has_evidence),'[]'::jsonb) AS candidates,
  coalesce((SELECT jsonb_agg(jsonb_build_object('playerid',s.playerid,'hsid',s.hsid,'name',s.display_name,'reason','missing_source_coverage'))
    FROM (SELECT playerid,hsid,display_name FROM classified WHERE NOT has_evidence ORDER BY playerid LIMIT 20) s),'[]'::jsonb) AS examples
FROM classified c`;

export const BASELINE_TEAM_MAPPING_SQL = `
SELECT teamid,current_team_name AS team_name,current_org_or_conference_name AS org_name,level_label AS level,
       nullif(trim(current_team_source_team_id),'') AS source_team_id,'canonical'::text AS mapping_source
FROM public.teamid_universe_mapping WHERE teamid=ANY($1::text[])
UNION ALL
SELECT teamid,school AS team_name,conference AS org_name,division AS level,teamid AS source_team_id,'college'::text
FROM public.college_baseball_programs_with_conferences WHERE teamid=ANY($1::text[])`;

const updateAssignments = METADATA_FIELDS.map((field) => `${field}=p.after_values->>'${field}'`).join(',\n    ');
const compareAssignments = METADATA_FIELDS.map((field) => `f.${field} IS NOT DISTINCT FROM (p.before_values->>'${field}')`).join('\n    AND ');
/** One guarded, idempotent UPDATE. No inserts, deletes, resets, or legacy refresh calls. */
export const APPLY_BASELINE_METADATA_SQL = `
WITH patches AS (
  SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(playerid text,before_values jsonb,after_values jsonb,
    last_transaction_applied_at timestamptz,current_team_last_verified timestamptz,provenance jsonb)
)
UPDATE public.flip_card_front_stage f SET
    ${updateAssignments},
    source_summary=coalesce(f.source_summary,'{}'::jsonb)||jsonb_build_object('baseline_metadata',p.provenance),
    source_refresh_at=now(),stage_updated_at=now(),updated_at=now()
FROM patches p WHERE f.playerid=p.playerid
    AND f.last_transaction_applied_at IS NULL
    AND f.last_transaction_applied_at IS NOT DISTINCT FROM p.last_transaction_applied_at
    AND f.current_team_last_verified IS NOT DISTINCT FROM p.current_team_last_verified
    AND ${compareAssignments}
    AND p.before_values IS DISTINCT FROM p.after_values
RETURNING f.playerid`;

export async function planBaselineMetadata(client: QueryClient, options: { playerIds?: string[]; asOf?: Date } = {}): Promise<MetadataPlan> {
  const asOf = options.asOf || new Date();
  const { rows } = await client.query(BASELINE_METADATA_EVIDENCE_SQL, [options.playerIds || null, asOf.getUTCFullYear(), asOf.toISOString()]);
  const raw = rows[0] || {};
  const evidence: MetadataEvidence[] = raw.candidates || [];
  const teamids = [...new Set(evidence.flatMap((e) => [
    ...e.current_teamids, ...e.latest_teamids, e.current_team?.teamid, e.team_override?.teamid,
    e.verified_submission?.submitted_teamid, e.college_resolution?.teamid, e.stage.current_teamid, e.stage.previous_teamid,
  ]).filter((id): id is string => Boolean(id)))];
  const mappings: MappingRow[] = teamids.length ? (await client.query(BASELINE_TEAM_MAPPING_SQL, [teamids])).rows : [];
  const patches: MetadataPatch[] = [];
  const reasons: Record<string, number> = {};
  const examples: MetadataCoverage['examples'] = raw.examples || [];
  let unresolved = 0;
  for (const e of evidence) {
    const result = resolveBaselineMetadata(e, mappings, asOf);
    reasons[result.reason] = (reasons[result.reason] || 0) + 1;
    if (result.patch) patches.push(result.patch);
    if (result.reason !== 'resolved') {
      unresolved++;
      if (examples.length < 30) examples.push({ playerid: e.stage.playerid, hsid: e.stage.hsid || null,
        name: e.stage.display_name || null, reason: result.reason });
    }
  }
  const missing = Number(raw.missing_source_coverage || 0);
  return { patches, coverage: { state: missing || unresolved ? 'degraded' : 'healthy', inspected: Number(raw.inspected || 0),
    protected: Number(raw.protected || 0), evidence_candidates: evidence.length, missing_source_coverage: missing,
    unresolved_candidates: unresolved, proposed_updates: patches.length, applied_updates: 0, concurrent_changes_skipped: 0,
    reasons, examples } };
}

export async function applyBaselineMetadata(client: QueryClient, plan: MetadataPlan): Promise<MetadataCoverage> {
  if (!plan.patches.length) return plan.coverage;
  const payload = plan.patches.map((p) => ({ playerid: p.playerid, before_values: p.before, after_values: p.after,
    last_transaction_applied_at: p.last_transaction_applied_at, current_team_last_verified: p.current_team_last_verified,
    provenance: { version: 1, ...p.provenance } }));
  const result = await client.query(APPLY_BASELINE_METADATA_SQL, [JSON.stringify(payload)]);
  const applied = result.rowCount ?? result.rows.length;
  const skipped = plan.patches.length - applied;
  return { ...plan.coverage, state: skipped ? 'degraded' : plan.coverage.state, applied_updates: applied,
    concurrent_changes_skipped: skipped,
    reasons: skipped ? { ...plan.coverage.reasons, concurrent_metadata_change: skipped } : plan.coverage.reasons };
}

export async function enrichFlipCardBaselineMetadata(client: QueryClient, options: { playerIds?: string[]; asOf?: Date } = {}): Promise<MetadataCoverage> {
  return applyBaselineMetadata(client, await planBaselineMetadata(client, options));
}
