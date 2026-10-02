/**
 * Promo-code Superfan grants — no Stripe involved.
 *
 * Valid codes live in PROMO_CODES below (no database table needed).
 * A fan redeems a code (e.g. WOODY10) and is granted Superfan directly on
 * their user_profiles row. Redeeming the same code twice is harmless and
 * idempotent — there are no counters to race.
 *
 * Paying subscribers are never harmed: if the fan already has a Stripe
 * subscription, their Stripe fields and subscription status are left intact,
 * and a live Stripe subscription always wins over an expired promo grant
 * (see isSuperfan() in src/lib/entitlements.ts).
 */

import { query } from '@/lib/db';
import { getUserProfile } from '@/lib/userProfile';
import { addTagToGHLContact } from '@/lib/gohighlevel';

interface PromoDef {
  /** Months the grant lasts. null = lifetime. */
  durationMonths: number | null;
  label: string;
}

const PROMO_CODES: Record<string, PromoDef> = {
  WOODY10RINGS: { durationMonths: null, label: 'Hamilton founding fans — lifetime Superfan' },
};

export type RedeemResult =
  | { ok: true; expiresAt: string | null }
  | { ok: false; reason: 'invalid' | 'already_redeemed'; error: string; status: number };

export async function redeemPromoCode(
  firebaseUid: string,
  email: string | null,
  rawCode: string
): Promise<RedeemResult> {
  const code = rawCode.trim().toUpperCase();
  const def = PROMO_CODES[code];
  if (!def) {
    return { ok: false, reason: 'invalid', error: 'That code is not valid.', status: 400 };
  }

  const existing = await query<{ promo_code: string | null }>(
    `SELECT promo_code FROM user_profiles WHERE firebase_uid = $1`,
    [firebaseUid]
  );
  if (existing.rows[0]?.promo_code === code) {
    return {
      ok: false,
      reason: 'already_redeemed',
      error: 'You have already used that code.',
      status: 400,
    };
  }

  await query(
    `INSERT INTO user_profiles (firebase_uid, email, role, subscription_status, plan, promo_code, promo_expires_at)
     VALUES (
       $1,
       COALESCE($2, $1 || '@promo.local'),
       'superfan',
       'promo',
       'superfan',
       $3,
       CASE WHEN $4::integer IS NULL THEN NULL
            ELSE NOW() + ($4::integer || ' months')::interval END
     )
     ON CONFLICT (firebase_uid) DO UPDATE SET
       plan                = 'superfan',
       role                = COALESCE(user_profiles.role, 'superfan'),
       subscription_status = CASE WHEN user_profiles.stripe_subscription_id IS NOT NULL
                                  THEN user_profiles.subscription_status ELSE 'promo' END,
       promo_code          = EXCLUDED.promo_code,
       promo_expires_at    = EXCLUDED.promo_expires_at,
       email               = COALESCE(EXCLUDED.email, user_profiles.email),
       updated_at          = NOW()`,
    [firebaseUid, email, code, def.durationMonths]
  );

  // Tag the ARMS contact like the Stripe webhook does for paid superfans (non-fatal).
  try {
    const profile = await getUserProfile(firebaseUid);
    if (profile?.arms_contact_id) {
      await addTagToGHLContact(profile.arms_contact_id, 'superfan').catch(() => {});
    }
  } catch {
    /* non-fatal */
  }

  let expiresAt: string | null = null;
  if (def.durationMonths != null) {
    const d = new Date();
    d.setMonth(d.getMonth() + def.durationMonths);
    expiresAt = d.toISOString();
  }
  return { ok: true, expiresAt };
}
