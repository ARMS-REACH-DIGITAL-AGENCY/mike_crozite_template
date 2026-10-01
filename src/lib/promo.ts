/**
 * Promo-code Superfan grants — no Stripe involved.
 *
 * A fan redeems a code (e.g. WOODY10) and is granted Superfan directly in the
 * database. The redeem is a single atomic SQL statement: it validates the code
 * (active, not expired, under max redemptions, not already used by this fan),
 * records the redemption, bumps the redemption count, and grants Superfan —
 * all-or-nothing, so concurrent redeems can't double-apply or overshoot caps.
 *
 * Paying subscribers are never harmed: if the fan already has a Stripe
 * subscription, their Stripe fields and subscription status are left intact.
 */

import { query } from '@/lib/db';
import { getUserProfile } from '@/lib/userProfile';
import { addTagToGHLContact } from '@/lib/gohighlevel';

export type RedeemResult =
  | { ok: true; expiresAt: string | null }
  | {
      ok: false;
      reason: 'invalid' | 'inactive' | 'expired' | 'maxed' | 'already_redeemed';
      error: string;
      status: number;
    };

export async function redeemPromoCode(
  firebaseUid: string,
  email: string | null,
  rawCode: string
): Promise<RedeemResult> {
  const code = rawCode.trim().toUpperCase();
  if (!code) {
    return { ok: false, reason: 'invalid', error: 'Enter a promo code.', status: 400 };
  }

  const res = await query<{ grant_expires_at: string | null }>(
    `WITH pc AS (
       SELECT * FROM promo_codes WHERE code = $1 FOR UPDATE
     ),
     ins AS (
       INSERT INTO promo_redemptions (code, firebase_uid, grant_expires_at)
       SELECT pc.code,
              $2,
              CASE WHEN pc.duration_months IS NULL THEN NULL
                   ELSE NOW() + (pc.duration_months || ' months')::interval END
       FROM pc
       WHERE pc.active
         AND (pc.expires_at IS NULL OR pc.expires_at > NOW())
         AND (pc.max_redemptions IS NULL OR pc.redemption_count < pc.max_redemptions)
         AND NOT EXISTS (
           SELECT 1 FROM promo_redemptions r WHERE r.code = pc.code AND r.firebase_uid = $2
         )
       RETURNING grant_expires_at
     ),
     cnt AS (
       UPDATE promo_codes p SET redemption_count = p.redemption_count + 1
       FROM ins WHERE p.code = $1
     ),
     prof AS (
       INSERT INTO user_profiles (firebase_uid, email, role, subscription_status, plan, promo_expires_at)
       SELECT $2,
              COALESCE($3, $2 || '@promo.local'),
              'superfan',
              'promo',
              'superfan',
              ins.grant_expires_at
       FROM ins
       ON CONFLICT (firebase_uid) DO UPDATE SET
         plan                = 'superfan',
         role                = COALESCE(user_profiles.role, 'superfan'),
         subscription_status = CASE WHEN user_profiles.stripe_subscription_id IS NOT NULL
                                    THEN user_profiles.subscription_status ELSE 'promo' END,
         promo_expires_at    = EXCLUDED.promo_expires_at,
         email               = COALESCE(EXCLUDED.email, user_profiles.email),
         updated_at          = NOW()
       RETURNING promo_expires_at
     )
     SELECT grant_expires_at FROM ins`,
    [code, firebaseUid, email]
  );

  if ((res.rowCount ?? 0) > 0) {
    const expiresAt = res.rows[0]?.grant_expires_at ?? null;
    // Tag the ARMS contact like the Stripe webhook does for paid superfans (non-fatal).
    try {
      const profile = await getUserProfile(firebaseUid);
      if (profile?.arms_contact_id) {
        await addTagToGHLContact(profile.arms_contact_id, 'superfan').catch(() => {});
      }
    } catch {
      /* non-fatal */
    }
    return { ok: true, expiresAt };
  }

  // Diagnose why it failed so the UI can show a useful message.
  const diag = await query<{
    active: boolean;
    expires_at: string | null;
    max_redemptions: number | null;
    redemption_count: number;
  }>(
    `SELECT active, expires_at, max_redemptions, redemption_count
     FROM promo_codes WHERE code = $1`,
    [code]
  );
  const row = diag.rows[0];
  if (!row) {
    return { ok: false, reason: 'invalid', error: 'That code is not valid.', status: 400 };
  }
  if (!row.active) {
    return { ok: false, reason: 'inactive', error: 'That code is no longer active.', status: 400 };
  }
  if (row.expires_at && new Date(row.expires_at) <= new Date()) {
    return { ok: false, reason: 'expired', error: 'That code has expired.', status: 400 };
  }
  if (row.max_redemptions != null && row.redemption_count >= row.max_redemptions) {
    return {
      ok: false,
      reason: 'maxed',
      error: 'That code has reached its redemption limit.',
      status: 400,
    };
  }
  const already = await query(
    `SELECT 1 FROM promo_redemptions WHERE code = $1 AND firebase_uid = $2`,
    [code, firebaseUid]
  );
  if ((already.rowCount ?? 0) > 0) {
    return {
      ok: false,
      reason: 'already_redeemed',
      error: 'You have already used that code.',
      status: 400,
    };
  }
  return { ok: false, reason: 'invalid', error: 'That code could not be applied.', status: 400 };
}
