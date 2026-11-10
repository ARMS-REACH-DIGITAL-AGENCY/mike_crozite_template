import 'server-only';
import { revalidateTag } from 'next/cache';
import { query } from '@/lib/db';

// Authoritative manual edits are restricted to an authenticated publisher.
// Raw stats, team mappings and automated roster ownership are never touched.
const EDITABLE = ['first_name', 'last_name', 'class_of', 'position', 'roster_years'] as const;

export async function publishAuthorizedPlayerInfo(input: {
  playerId: string; hsid: string; uid: string;
  fields: Record<string, string | string[]>;
}): Promise<boolean> {
  const { playerId, hsid, uid } = input;
  const payload: Record<string, string | string[]> = {};
  for (const key of EDITABLE) {
    if (Object.prototype.hasOwnProperty.call(input.fields, key)) payload[key] = input.fields[key];
  }
  if (!Object.keys(payload).length) return true;

  for (const key of ['first_name', 'last_name'] as const) {
    const value = payload[key];
    if (value !== undefined &&
      (typeof value !== 'string' || !/^[\p{L}\p{M} .'-]{1,80}$/u.test(value))) {
      throw new Error('Enter a valid player name.');
    }
  }
  if (payload.position !== undefined &&
    (typeof payload.position !== 'string' || !/^[a-z0-9 ,/-]{1,20}$/i.test(payload.position))) {
    throw new Error('Choose a valid baseball position.');
  }
  if (payload.class_of !== undefined &&
    (typeof payload.class_of !== 'string' || !/^\d{4}$/.test(payload.class_of)
      || Number(payload.class_of) < 1900 || Number(payload.class_of) > new Date().getFullYear()+1)) {
    throw new Error('Choose a valid graduation year.');
  }
  if (payload.roster_years !== undefined &&
    (!Array.isArray(payload.roster_years) || payload.roster_years.length > 4 ||
      payload.roster_years.some(v => typeof v !== 'string' || !/^\d{4}$/.test(v)))) {
    throw new Error('Choose up to four valid varsity seasons.');
  }

  const sql = [
    'WITH revised AS (',
    ' UPDATE flip_card_front_stage f SET',
    "  first_name=CASE WHEN $3::jsonb ? 'first_name' THEN $3::jsonb->>'first_name' ELSE f.first_name END,",
    "  last_name=CASE WHEN $3::jsonb ? 'last_name' THEN $3::jsonb->>'last_name' ELSE f.last_name END,",
    "  display_name=CASE WHEN $3::jsonb ?| ARRAY['first_name','last_name']",
    "   THEN BTRIM(COALESCE($3::jsonb->>'first_name',f.first_name,'') || ' ' ||",
    "     COALESCE($3::jsonb->>'last_name',f.last_name,'')) ELSE f.display_name END,",
    "  position=CASE WHEN $3::jsonb ? 'position' THEN UPPER($3::jsonb->>'position') ELSE f.position END,",
    "  class_of=CASE WHEN $3::jsonb ? 'class_of' THEN $3::jsonb->>'class_of' ELSE f.class_of END,",
    "  roster_years=CASE WHEN $3::jsonb ? 'roster_years'",
    "    THEN ARRAY(SELECT jsonb_array_elements_text($3::jsonb->'roster_years')) ELSE f.roster_years END,",
    "  roster_years_count=CASE WHEN $3::jsonb ? 'roster_years'",
    "    THEN jsonb_array_length($3::jsonb->'roster_years') ELSE f.roster_years_count END,",
    "  source_summary=COALESCE(f.source_summary,'{}'::jsonb) ||",
    "    jsonb_build_object('publisher_profile_edit',jsonb_build_object(",
    "      'actor_uid',$4::text,'fields',$3::jsonb,'at',now())),",
    '  updated_at=now(),stage_updated_at=now()',
    ' WHERE f.playerid::text=$1 AND f.hsid::text=$2',
    "   AND (NOT ($3::jsonb ? 'roster_years') OR NOT EXISTS (",
    "     SELECT 1 FROM jsonb_array_elements_text($3::jsonb->'roster_years') AS y(year)",
    "     WHERE y.year::int > COALESCE(($3::jsonb->>'class_of')::int,",
    "       CASE WHEN f.class_of ~ '^[0-9]{4}$' THEN f.class_of::int ELSE NULL END,",
    '       extract(year from now())::int+1)',
    '   ))',
    ' RETURNING f.playerid::text AS playerid',
    '), audited AS (',
    ' INSERT INTO fan_activity(firebase_uid,action,playerid,hsid,details)',
    ' SELECT $4,\'contribute_published\',playerid,$2,',
    "    jsonb_build_object('source','verified_publisher','fields',$3::jsonb,'at',now())",
    ' FROM revised RETURNING id',
    ') SELECT playerid FROM revised',
  ].join('\n');
  const { rows } = await query<{ playerid: string }>(sql, [playerId, hsid, JSON.stringify(payload), uid]);
  if (rows.length !== 1) return false;
  revalidateTag('school-data:' + hsid, { expire: 0 });
  return true;
}
