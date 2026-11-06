/**
 * Shared read-time team identity resolution for all TBC player-season readers.
 *
 * Authority: teamid_universe_mapping supplies verified team name, official
 * level, and org/conference. The raw TBC catalogs are NAME-ONLY fallbacks
 * while unmapped IDs await verified level/org reconciliation.
 *
 * Do not use these joins to infer CURRENT affiliation; MLB/INDY roster
 * authority and explicit FREE AGENT / RETIRED status remain independent.
 * Do not run one mapping query per row: use these joins in a single SQL query.
 */
import 'server-only';

export type TeamRowAlias = 'r' | 'b' | 'p' | 's';

export function teamIdentityJoins(alias: TeamRowAlias): string {
  return `
    LEFT JOIN public.teamid_universe_mapping canonical_identity
      ON canonical_identity.teamid = ${alias}.teamid::text
    LEFT JOIN public.tbc_college_teams_map_raw college_identity
      ON college_identity.teamid = ${alias}.teamid::text
    LEFT JOIN public.tbc_pro_teams_map_raw pro_identity
      ON pro_identity.teamid = ${alias}.teamid::text`;
}

// A missing canonical ID must never be displayed as the literal numeric ID.
// The raw catalog can supply a name, NOT an unverified NCAA level or conference.
export const VERIFIED_TEAM_SOURCE_NAME_SQL = `COALESCE(
  NULLIF(BTRIM(canonical_identity.current_team_name), ''),
  NULLIF(BTRIM(college_identity.collegename), ''),
  NULLIF(BTRIM(pro_identity.teamname), '')
)`;

export const PUBLIC_TEAM_NAME_SQL =
  `COALESCE(${VERIFIED_TEAM_SOURCE_NAME_SQL}, 'Team name not yet identified')`;

export const VERIFIED_TEAM_LEVEL_SQL = 'canonical_identity.level_label';
export const VERIFIED_TEAM_ORG_SQL = 'canonical_identity.current_org_or_conference_name';
export const VERIFIED_TEAM_ORG_ABBR_SQL = 'canonical_identity.current_org_or_conference_abbrev';
export const IS_COLLEGE_SOURCE_SQL = '(college_identity.teamid IS NOT NULL)';
