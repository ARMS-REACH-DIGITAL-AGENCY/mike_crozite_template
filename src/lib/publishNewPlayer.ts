import 'server-only';
import { randomUUID } from 'crypto';
import { revalidateTag } from 'next/cache';
import { after } from 'next/server';
import { enqueueRealTimelineSnapshot } from '@/lib/realTimelineSnapshotQueue';
import { query } from '@/lib/db';
import type { CanonicalCurrentTeam } from '@/lib/publishCurrentTeamChange';

// Create an immediately searchable YAT identity. This is NOT a moderation queue.
// A single SQL statement serializes same-school/name submissions, checks both
// first-party and Baseball Cube identities, and inserts the finished flip card.
export class NewPlayerPublicationError extends Error {
  constructor(message: string, public readonly status = 400) {
    super(message);
    this.name = 'NewPlayerPublicationError';
  }
}

const PLAYING_LEVELS = new Set([
  'HIGH SCHOOL','NJCAA','CCCAA','NWAC','NCAA-D1','NCAA-D2','NCAA-D3','NAIA',
  'ROOKIE','SINGLE-A','HIGH-A','DOUBLE-A','TRIPLE-A','MLB','INDY','INTERNATIONAL',
]);

export async function publishNewPlayerNow(input: {
  hsid: string;
  fields: Record<string, string | string[]>;
  canonicalTeam: CanonicalCurrentTeam | null;
}): Promise<{ playerId: string; submissionId: string }> {
  const { hsid, fields, canonicalTeam } = input;
  const first = String(fields.first_name || '').trim();
  const last = String(fields.last_name || '').trim();
  if (!first || !last || !/^\d+$/.test(hsid)) {
    throw new NewPlayerPublicationError('Choose the school and enter first and last names.');
  }

  const graduationYear = String(fields.class_of || '').trim();
  if (graduationYear && (!/^\d{4}$/.test(graduationYear) ||
      Number(graduationYear) < 1900 || Number(graduationYear) > new Date().getFullYear() + 1)) {
    throw new NewPlayerPublicationError('Choose a valid graduation year.');
  }
  const level = canonicalTeam?.level || String(fields.level_label || 'HIGH SCHOOL').trim().toUpperCase();
  if (!PLAYING_LEVELS.has(level)) {
    throw new NewPlayerPublicationError('Choose a valid playing level. RETIRED is a status, not a level.');
  }
  if (canonicalTeam && !canonicalTeam.orgName.trim()) {
    throw new NewPlayerPublicationError('That team is missing its official league or conference. Choose a verified team.', 409);
  }
  const status = String(fields.status_label || (level === 'HIGH SCHOOL' ? 'UNCOMMITTED' : 'UNKNOWN')).trim().toUpperCase();
  const rosterYears = Array.isArray(fields.roster_years)
    ? fields.roster_years.map(String).filter(Boolean)
    : [];
  const submissionId = randomUUID();
  // The submission token is only for audit; Postgres assigns the permanent ID.
  // Both allocation and stage insertion happen in one atomic SQL statement.

  const sql = [
    'WITH identity_lock AS MATERIALIZED (',
    " SELECT pg_advisory_xact_lock(hashtextextended($1::text || ':' || lower($2::text) || ':' || lower($3::text), 0)) AS acquired",
    '), potential_duplicate AS MATERIALIZED (',
    ' SELECT f.playerid FROM identity_lock l',
    ' JOIN public.flip_card_front_stage f ON f.hsid::text=$1',
    ' WHERE lower(trim(f.first_name))=lower($2) AND lower(trim(f.last_name))=lower($3)',
    ' UNION ALL',
    ' SELECT tp.playerid FROM identity_lock l',
    ' JOIN public.player_hsids ph ON ph.hsid::text=$1',
    ' JOIN public.tbc_players_raw tp ON tp.playerid::text=ph.playerid::text',
    ' WHERE lower(trim(tp.firstname))=lower($2) AND lower(trim(tp.lastname))=lower($3)',
    '), reserved AS (',
    ' UPDATE public.yat_player_id_counter c',
    ' SET last_assigned = (',
    '   SELECT candidate FROM generate_series(c.last_assigned + 1, 999999) AS seq(candidate)',
    "   WHERE NOT EXISTS (SELECT 1 FROM public.flip_card_front_stage existing WHERE existing.playerid = 'YAT' || lpad(candidate::text,6,'0'))",
    "     AND NOT EXISTS (SELECT 1 FROM public.yat_registry reg WHERE reg.yatid = 'YAT' || lpad(candidate::text,6,'0'))",
    '   LIMIT 1',
    ' )',
    ' FROM identity_lock l',
    ' WHERE c.id=1 AND c.last_assigned < 999999',
    '   AND EXISTS (SELECT 1 FROM public.school_success s WHERE s.hsid::text=$1)',
    '   AND NOT EXISTS (SELECT 1 FROM potential_duplicate)',
    ' RETURNING c.last_assigned',
    '), inserted AS (',
    ' INSERT INTO public.flip_card_front_stage',
    ' (playerid,hsid,first_name,last_name,display_name,class_of,position,',
    '  status_label,display_status_label,level_label,display_level_label,',
    '  roster_years,roster_years_count,current_team_name,current_teamid,',
    '  current_org_or_conference_name,source_notes,source_summary)',
    " SELECT 'YAT' || lpad(r.last_assigned::text,6,'0'),$1,$2,$3,trim($2::text || ' ' || $3::text),$4,$5,",
    '        $6,$6,$7,$7,$11::text[],',
    '        CASE WHEN $11::text[] IS NULL THEN NULL ELSE cardinality($11::text[]) END,',
    "        $8,$9,NULLIF($10,''),'fan-contributed; unverified',",
    "        jsonb_build_object('source','contribute','submission_id',$12::text,'submitted_fields',$13::jsonb)",
    ' FROM reserved r',
    ' RETURNING playerid',
    // YAT? Baseball Registry (Pete, Nov 2026): every YAT ID is one person in
    // yat_registry; outside numbers (TBC, MLB, ...) attach in yat_registry_ids.
    '), registered AS (',
    " INSERT INTO public.yat_registry (yatid,first_name,last_name,notes)",
    " SELECT playerid,$2,$3,'site-added player' FROM inserted",
    ' RETURNING yatid',
    '), registered_id AS (',
    " INSERT INTO public.yat_registry_ids (yatid,source,source_id,match_method)",
    " SELECT yatid,'yat_card',yatid,'site playerid' FROM registered",
    ' RETURNING yatid',
    ') SELECT playerid FROM inserted WHERE EXISTS (SELECT 1 FROM registered_id)',
  ].join('\n');
  let rows: { playerid: string }[];
  try {
    const result = await query<{ playerid: string }>(sql, [
      hsid, first, last, graduationYear || null,
      String(fields.position || '').trim() || null, status, level,
      canonicalTeam?.name || null, canonicalTeam?.teamId || null,
      canonicalTeam?.orgName || null, rosterYears.length ? rosterYears : null,
      submissionId, JSON.stringify(fields),
    ]);
    rows = result.rows;
  } catch (error) {
    if ((error as { code?: string })?.code === '23505') {
      throw new NewPlayerPublicationError(
        'A YAT player ID is already allocated. No player was created. The ID counter needs an administrator check.', 503
      );
    }
    throw error;
  }
  if (!rows[0]?.playerid) {
    const { rows: school } = await query<{ exists: boolean }>(
      'SELECT EXISTS(SELECT 1 FROM public.school_success WHERE hsid::text=$1) AS exists', [hsid]
    );
    if (!school[0]?.exists) throw new NewPlayerPublicationError('That high school was not found.');
    const { rows: counter } = await query<{ last_assigned: number }>(
      'SELECT last_assigned FROM public.yat_player_id_counter WHERE id=1'
    );
    if (!counter.length || Number(counter[0].last_assigned) >= 999999) {
      throw new NewPlayerPublicationError('YAT ID counter unavailable; no player was created.', 503);
    }
    throw new NewPlayerPublicationError(
      'A player with that name is already linked to the school. Find the existing player instead of adding a duplicate.',
      409
    );
  }

  // Search reads stage rows on every request. Bust the longer-lived school
  // All-Time/flip-card cache so the new identity is also visible there.
  try {
    revalidateTag('school-data:' + hsid, { expire: 0 });
  } catch (error) {
    console.error('[contribute/new-player] school cache refresh failed', error);
  }
  // Capture the real Career Path slide after the response, not during fan
  // submission. This is a single idempotent S3 job, not a browser launch.
  after(async () => {
    await enqueueRealTimelineSnapshot(hsid, rows[0].playerid);
  });
  return { playerId: rows[0].playerid, submissionId };
}
