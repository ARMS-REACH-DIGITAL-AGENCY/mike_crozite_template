import 'server-only';
import { revalidateTag } from 'next/cache';
import { writerQuery } from '@/lib/dbWriter';
import { COLLEGE_COMMIT_LEVELS } from '@/lib/collegeCommitments';

// Called only after the contributor is authenticated and the canonical
// school/player association is read from the stage record. No page-load work.
export async function publishCollegeCommitment(input: {
  playerId: string;
  hsid: string;
  status: 'COMMIT' | 'UNCOMMITTED';
  teamId: string;
  contributorUid: string;
  source: 'contribute' | 'queued';
  queueId?: string;
}): Promise<{ teamName: string | null; changed: boolean }> {
  if (process.env.VERCEL_ENV === 'preview') {
    throw new Error('Commitments cannot be published from a preview deployment.');
  }
  if (!/^(?:YAT)?[0-9]{1,18}$/i.test(input.playerId) || !/^\d{1,18}$/.test(input.hsid) ||
      !input.contributorUid || !['COMMIT','UNCOMMITTED'].includes(input.status) ||
      (input.status === 'COMMIT' && !/^\d{1,18}$/.test(input.teamId)) ||
      (input.status === 'UNCOMMITTED' && input.teamId !== '')) {
    throw new Error('Invalid college commitment.');
  }

  // All validation, the stage update, and its audit entry share one SQL
  // statement: no separate read/modify/write race and no partial audit.
  // Most app reads use PLAYERS_DATABASE_URL; the stage update requires the
  // existing restricted writer pool (DATABASE_URL).
  const { rows } = await writerQuery<{
    eligible: boolean;
    changed: boolean;
    team_name: string | null;
  }>(`
    WITH college AS (
      SELECT teamid, current_team_name, level_label, current_org_or_conference_name
        FROM teamid_universe_mapping
       WHERE teamid = $4
         AND UPPER(TRIM(COALESCE(level_label,''))) = ANY($5::text[])
         AND COALESCE(TRIM(current_team_name),'') <> ''
       LIMIT 1
    ),
    eligible AS (
      SELECT s.playerid, s.hsid,
             c.current_team_name AS selected_team_name,
             c.level_label AS selected_team_level,
             c.current_org_or_conference_name AS selected_conference
        FROM flip_card_front_stage s
        LEFT JOIN college c ON c.teamid = $4
       WHERE s.playerid = $1
         AND s.hsid::text = $2
         AND UPPER(TRIM(COALESCE(NULLIF(TRIM(s.display_level_label),''),s.level_label,''))) = 'HIGH SCHOOL'
         AND UPPER(COALESCE(s.status_label,'')) NOT LIKE '%COACH%'
         AND UPPER(COALESCE(s.display_status_label,'')) NOT LIKE '%COACH%'
         AND ($3::text = 'UNCOMMITTED' OR c.teamid IS NOT NULL)
    ),
    updated AS (
      UPDATE flip_card_front_stage f
         SET status_label = $3,
             display_status_label = $3,
             committed_teamid = NULLIF($4::text,''),
             committed_team_name = CASE WHEN $3::text='COMMIT' THEN e.selected_team_name ELSE NULL END,
             committed_level_label = CASE WHEN $3::text='COMMIT' THEN e.selected_team_level ELSE NULL END,
             committed_org_or_conference_name = CASE WHEN $3::text='COMMIT' THEN e.selected_conference ELSE NULL END,
             committed_source = CASE WHEN $3::text='COMMIT' THEN 'fan_contribution' ELSE NULL END,
             committed_at = CASE WHEN $3::text='COMMIT' THEN COALESCE(f.committed_at, now()) ELSE NULL END,
             updated_at = now()
        FROM eligible e
       WHERE f.playerid = e.playerid
         AND f.hsid::text = e.hsid::text
         AND UPPER(TRIM(COALESCE(NULLIF(TRIM(f.display_level_label),''),f.level_label,''))) = 'HIGH SCHOOL'
         AND UPPER(COALESCE(f.status_label,'')) NOT LIKE '%COACH%'
         AND (f.status_label IS DISTINCT FROM $3::text
           OR f.display_status_label IS DISTINCT FROM $3::text
           OR f.committed_teamid IS DISTINCT FROM NULLIF($4::text,'')
           OR f.committed_team_name IS DISTINCT FROM
             (CASE WHEN $3::text='COMMIT' THEN e.selected_team_name ELSE NULL END)
           OR f.committed_level_label IS DISTINCT FROM
             (CASE WHEN $3::text='COMMIT' THEN e.selected_team_level ELSE NULL END)
           OR f.committed_org_or_conference_name IS DISTINCT FROM
             (CASE WHEN $3::text='COMMIT' THEN e.selected_conference ELSE NULL END))
      RETURNING f.playerid, f.hsid
    ),
    audited AS (
      INSERT INTO fan_activity(firebase_uid,action,playerid,hsid,teamid,details)
      SELECT $6::text, 'commitment_published', u.playerid::text, u.hsid::text,
             NULLIF($4::text,''),
             jsonb_build_object('status_label',$3::text,
               'committed_teamid',NULLIF($4::text,''),
               'source',$7::text,'queue_id',NULLIF($8::text,''))
        FROM updated u
      RETURNING playerid
    )
    SELECT EXISTS(SELECT 1 FROM eligible) AS eligible,
           EXISTS(SELECT 1 FROM audited) AS changed,
           (SELECT current_team_name FROM college LIMIT 1) AS team_name
  `, [
    input.playerId,
    input.hsid,
    input.status,
    input.teamId,
    [...COLLEGE_COMMIT_LEVELS],
    input.contributorUid,
    input.source,
    input.queueId || '',
  ]);
  if (!rows[0]?.eligible) {
    throw new Error('The player or selected college is not eligible for a high-school commitment.');
  }
  // Cards, the current-team Row 3 strip and the commit counter all use the
  // same cached school-stage records. Explicitly expire them on publication.
  revalidateTag(`school-data:${input.hsid}`, { expire: 0 });
  return { teamName: rows[0].team_name || null, changed: !!rows[0].changed };
}
