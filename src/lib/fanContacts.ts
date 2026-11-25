/**
 * Every registered Fan and SuperFan has a working HighLevel contact (Pete, Nov 25
 * 2026): the newsletters are sent through each fan's contact, so a fan without one
 * gets nothing. Sign-up creates the contact, but a failure there is "non-fatal" and
 * was only repaired at the fan's next sign-in, and some saved contacts were later
 * deleted in HighLevel. This repair runs daily before the newsletters, the same
 * way sign-up does: find the contact by email; if there is none, create it (the
 * home school as its source tag); save the link on the profile and sync its tags.
 */
import { query } from '@/lib/db';
import { createGHLContact, getGHLLocationId, lookupGHLContactByEmail, syncYatstatsContact } from '@/lib/gohighlevel';
import { upsertUserProfile, type UserProfile } from '@/lib/userProfile';

export type FanContactRun = { fans: number; upToDate: number; relinked: number; created: number; failed: { uid: string; error: string }[]; stoppedEarly: boolean };

export async function ensureFanContacts(o: { deadlineMs?: number } = {}): Promise<FanContactRun> {
  const stopAt = Date.now() + (o.deadlineMs ?? 240_000);
  const { rows } = await query<UserProfile & { hsname: string | null; hslocation: string | null }>(
    `SELECT p.*, s.hsname, s.hslocation
       FROM public.user_profiles p
       JOIN public.newsletter_recipients r ON r.firebase_uid = p.firebase_uid
       LEFT JOIN public.school_success s ON s.hsid::text = p.home_hsid::text
      WHERE coalesce(p.email, '') <> ''
      ORDER BY p.created_at`,
  );
  const run: FanContactRun = { fans: rows.length, upToDate: 0, relinked: 0, created: 0, failed: [], stoppedEarly: false };
  for (const fan of rows) {
    if (Date.now() > stopAt) { run.stoppedEarly = true; break; }
    try {
      let id = await lookupGHLContactByEmail(fan.email);
      let made = false;
      if (!id) {
        const created = await createGHLContact(
          { email: fan.email, firstName: fan.first_name || '', lastName: fan.last_name || '' },
          String(fan.home_hsid || 'yatstats'),
        );
        if ('error' in created) {
          if (typeof created.existingContactId === 'string') id = created.existingContactId;
          else throw new Error('HighLevel did not create the contact: ' + String(created.error));
        } else {
          id = (created as { contact?: { id?: string } }).contact?.id || null;
          made = Boolean(id);
        }
      }
      if (!id) throw new Error('No HighLevel contact id');
      if (id === fan.arms_contact_id && !made) { run.upToDate++; continue; }
      const profile = await upsertUserProfile(fan.firebase_uid, { email: fan.email, arms_contact_id: id, arms_location_id: getGHLLocationId() ?? null });
      await syncYatstatsContact(id, profile, { hsname: fan.hsname, hslocation: fan.hslocation });
      if (made) run.created++; else run.relinked++;
    } catch (error) {
      run.failed.push({ uid: fan.firebase_uid, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return run;
}
