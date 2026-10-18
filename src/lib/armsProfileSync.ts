/**
 * Mirror YAT?STATS member entitlement into the school-scoped ARMS contact.
 * Non-fatal, so payments and promo redemptions cannot be rolled back by CRM outages.
 */
import { query } from '@/lib/db';
import { getUserProfile } from '@/lib/userProfile';
import { lookupGHLContactByEmail, syncYatstatsContact } from '@/lib/gohighlevel';

export async function syncUserProfileToArms(firebaseUid: string): Promise<boolean> {
  const profile = await getUserProfile(firebaseUid);
  if (!profile) return false;
  const contactId = profile.arms_contact_id || await lookupGHLContactByEmail(profile.email);
  if (!contactId) return false;

  let school: { hsname?: string | null; hslocation?: string | null } | null = null;
  if (profile.home_hsid) {
    const result = await query<{ hsname: string | null; hslocation: string | null }>(
      'SELECT hsname, hslocation FROM school_success WHERE hsid::text = $1 LIMIT 1',
      [profile.home_hsid]
    );
    school = result.rows[0] || null;
  }
  return syncYatstatsContact(contactId, profile, school);
}
