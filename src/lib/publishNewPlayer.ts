import 'server-only';
import { randomUUID } from 'crypto';
import { revalidateTag } from 'next/cache';
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
  // Preserve the established YAT player-only ID format; never manufacture TBC IDs.
  const playerId = 'YAT' + (BigInt('0x' + submissionId.replace(/-/g, '').slice(0, 15)) %
    BigInt('1000000000000000')).toString().padStart(15, '0');

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
    '), inserted AS (',
    ' INSERT INTO public.flip_card_front_stage',
    ' (playerid,hsid,first_name,last_name,display_name,class_of,position,',
    '  status_label,display_status_label,level_label,display_level_label,',
    '  roster_years,roster_years_count,current_team_name,current_teamid,',
    '  current_org_or_conference_name,source_notes,source_summary)',
    ' SELECT $4,$1,$2,$3,trim($2::text || \' \' || $3::text),$5,$6,',
    '        $7,$7,$8,$8,$12::text[],',
    '        CASE WHEN $12::text[] IS NULL THEN NULL ELSE cardinality($12::text[]) END,',
    "        $9,$10,NULLIF($11,''),'fan-contributed; unverified',",
    "        jsonb_build_object('source','contribute','submission_id',$13::text,'submitted_fields',$14::jsonb)",
    ' FROM identity_lock',
    ' WHERE EXISTS (SELECT 1 FROM public.school_success s WHERE s.hsid::text=$1)',
    '   AND NOT EXISTS (SELECT 1 FROM potential_duplicate)',
    ' ON CONFLICT(playerid) DO NOTHING',
    ' RETURNING playerid',
    ') SELECT playerid FROM inserted',
  ].join('\n');
  const { rows } = await query<{ playerid: string }>(sql, [
    hsid, first, last, playerId, graduationYear || null,
    String(fields.position || '').trim() || null, status, level,
    canonicalTeam?.name || null, canonicalTeam?.teamId || null,
    canonicalTeam?.orgName || null, rosterYears.length ? rosterYears : null,
    submissionId, JSON.stringify(fields),
  ]);
  if (!rows[0]?.playerid) {
    const { rows: school } = await query<{ exists: boolean }>(
      'SELECT EXISTS(SELECT 1 FROM public.school_success WHERE hsid::text=$1) AS exists', [hsid]
    );
    if (!school[0]?.exists) throw new NewPlayerPublicationError('That high school was not found.');
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
  return { playerId: rows[0].playerid, submissionId };
}
