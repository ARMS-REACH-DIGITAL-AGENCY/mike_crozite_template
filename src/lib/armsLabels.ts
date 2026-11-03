// src/lib/armsLabels.ts
// Readable labels for ARMS (HighLevel) and our own records, so a contact
// shows "Hamilton — Chandler, AZ" and "Cody Bellinger — Hamilton — Chandler, AZ"
// instead of bare ids. The school always comes from the hsid (never from a
// name match or a state); a player's school is the player's own hsid.
import 'server-only';
import { query } from './db';

/** "Hamilton — Chandler, AZ" (the same format syncYatstatsContact writes). */
export function formatSchoolLabel(hsname?: string | null, hslocation?: string | null): string {
  const name = String(hsname || '').trim();
  const location = String(hslocation || '').replace(/\s*,\s*/g, ', ').trim();
  return [name, location].filter(Boolean).join(' — ');
}

export async function schoolLabel(hsid: string | null | undefined): Promise<string> {
  if (!hsid) return '';
  const { rows } = await query<{ hsname: string | null; hslocation: string | null }>(
    'SELECT hsname, hslocation FROM school_success WHERE hsid::text = $1 LIMIT 1',
    [String(hsid)]
  );
  return rows[0] ? formatSchoolLabel(rows[0].hsname, rows[0].hslocation) : '';
}

/** A player's name and high school, looked up by playerid. */
export async function playerLabel(playerid: string): Promise<{ name: string; school: string; label: string } | null> {
  const { rows } = await query<{ name: string; hsname: string | null; hslocation: string | null }>(
    `SELECT TRIM(COALESCE(NULLIF(f.display_name, ''), COALESCE(f.first_name, '') || ' ' || COALESCE(f.last_name, ''))) AS name,
            s.hsname, s.hslocation
       FROM public.flip_card_front_stage f
       LEFT JOIN public.school_success s ON s.hsid::text = f.hsid::text
      WHERE f.playerid::text = $1
      LIMIT 1`,
    [String(playerid)]
  );
  const r = rows[0];
  if (!r?.name) return null;
  const school = formatSchoolLabel(r.hsname, r.hslocation);
  return { name: r.name, school, label: [r.name, school].filter(Boolean).join(' — ') };
}

/** Save the home school's readable name on a profile that doesn't have one yet. */
export async function fillHomeSchoolName(firebaseUid: string, label: string) {
  if (!label) return;
  await query(
    `UPDATE user_profiles SET home_school_name = $2, updated_at = NOW()
      WHERE firebase_uid = $1 AND COALESCE(TRIM(home_school_name), '') = ''`,
    [firebaseUid, label]
  ).catch((error) => console.error('home_school_name fill failed (non-fatal):', error));
}
