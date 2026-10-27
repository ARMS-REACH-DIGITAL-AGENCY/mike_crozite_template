import 'server-only';
import { query } from '@/lib/db';
import { revalidateTag } from 'next/cache';
import { OFFICIAL_LEVELS } from '@/lib/officialLevels';

// Global Search returns stable team IDs. Never trust a typed team name, level,
// or conference from a contribution; derive them from the canonical universe.
export type CanonicalCurrentTeam = {
  teamId: string;
  name: string;
  level: string;
  orgName: string;
};

const TEAM_LEVELS = new Set<string>(OFFICIAL_LEVELS.filter(level => level !== 'HIGH SCHOOL'));

// A high school's team is C + hsid (Hamilton = C5004), level HIGH SCHOOL;
// every other team id is digits. The two never mix.
export async function resolveCanonicalCurrentTeam(teamId: string): Promise<CanonicalCurrentTeam | null> {
  const highSchool = /^C\d{1,18}$/.test(teamId);
  if (!highSchool && !/^\d{1,18}$/.test(teamId)) return null;
  const { rows } = await query<{
    teamid: string;
    current_team_name: string | null;
    level_label: string | null;
    current_org_or_conference_name: string | null;
  }>(`SELECT teamid::text, current_team_name, level_label, current_org_or_conference_name
       FROM teamid_universe_mapping
       WHERE teamid::text=$1 AND COALESCE(TRIM(current_team_name),'')<>''
       LIMIT 1`, [teamId]);
  const row = rows[0];
  const level = String(row?.level_label || '').trim().toUpperCase();
  if (!row || (highSchool ? level !== 'HIGH SCHOOL' : !TEAM_LEVELS.has(level))) return null;
  return {
    teamId: String(row.teamid),
    name: String(row.current_team_name).trim(),
    level,
    orgName: String(row.current_org_or_conference_name || '').trim(),
  };
}

export async function publishCurrentTeamChange(input: {
  playerId: string;
  hsid: string;
  team: CanonicalCurrentTeam;
  reviewerUid: string;
  reviewedFanSuggestion?: boolean;
  contributionQueueId?: string;
}): Promise<boolean> {
  const { playerId, hsid, team, reviewerUid } = input;
  // Update the stage row first. The manual override is written only for a
  // real matching player, in the same SQL statement, so source refreshes
  // cannot silently restore the superseded affiliation.
  // A college or pro team makes him ACTIVE. His high school team keeps him a
  // high school player - UNCOMMITTED or COMMIT, never ACTIVE: high school
  // players are not active alumni (Pete, Oct 2026).
  const { rows } = await query<{ playerid: string }>(`
    WITH updated AS (
      UPDATE flip_card_front_stage f SET
        status_label=CASE WHEN $5='HIGH SCHOOL'
          THEN CASE WHEN UPPER(COALESCE(f.status_label,'')) IN ('COMMIT','UNCOMMITTED') THEN UPPER(f.status_label) ELSE 'UNCOMMITTED' END
          ELSE 'ACTIVE' END,
        display_status_label=CASE WHEN $5='HIGH SCHOOL'
          THEN CASE WHEN UPPER(COALESCE(f.status_label,'')) IN ('COMMIT','UNCOMMITTED') THEN UPPER(f.status_label) ELSE 'UNCOMMITTED' END
          ELSE 'ACTIVE' END,
        team_affiliation_status=CASE WHEN $5='HIGH SCHOOL' THEN 'CURRENT' ELSE 'ACTIVE' END,
        current_team_name=$4, current_teamid=$3, current_team_source_team_id=NULL,
        current_org_or_conference_name=NULLIF($6,''),
        level_label=$5, display_level_label=$5, current_level_label=$5, current_team_level=$5,
        current_team_source='contribute_direct', current_team_roster_status=NULL,
        current_team_last_verified=NOW(), current_team_absent_since=NULL,
        is_on_40man=FALSE, forty_man_org_name=NULL, forty_man_org_abbr=NULL,
        next_game_date=NULL, next_game_time_local=NULL, next_game_time_utc=NULL,
        next_game_home_away=NULL, next_game_opponent=NULL, next_game_status_label=NULL,
        updated_at=NOW(), stage_updated_at=NOW()
      WHERE f.playerid::text=$1 AND f.hsid::text=$2
      RETURNING f.playerid::text AS playerid
    ), override_written AS (
      INSERT INTO player_team_override (playerid,teamid,team_name,level,reason,updated_by,updated_at)
      SELECT playerid,$3,$4,$5,$8,$7,NOW() FROM updated
      ON CONFLICT(playerid) DO UPDATE SET
        teamid=EXCLUDED.teamid, team_name=EXCLUDED.team_name,
        level=EXCLUDED.level, reason=EXCLUDED.reason,
        updated_by=EXCLUDED.updated_by, updated_at=NOW()
      RETURNING playerid
    ), audited AS (
      INSERT INTO fan_activity(firebase_uid,action,playerid,hsid,details)
      SELECT 'system:contribution-review','contribute_processed',o.playerid,$2,
        jsonb_build_object('queue_id',$9::text,'status','published',
          'reason','Reviewer approved canonical current-team change','current_teamid',$3::text)
      FROM override_written o WHERE $9::text IS NOT NULL
      RETURNING playerid
    )
    SELECT playerid FROM override_written`, [
      playerId, hsid, team.teamId, team.name, team.level, team.orgName, reviewerUid,
      input.reviewedFanSuggestion
        ? 'Reviewer approved canonical current-team change'
        : 'Verified contributor current-team update',
      input.contributionQueueId || null,
    ]);
  if (rows.length !== 1) return false;
  revalidateTag(`school-data:${hsid}`, { expire: 0 });
  return true;
}
