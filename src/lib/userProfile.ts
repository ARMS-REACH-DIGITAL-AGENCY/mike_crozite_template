/**
 * User profile helpers — PostgreSQL-backed
 * Stores the Firebase uid ↔ ARMS contact ↔ Stripe billing mapping.
 *
 * Tables are managed by migrations/ingest scripts rather than bootstrapped on import.
 */

'use server';
import { query } from '@/lib/db';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UserProfile {
  firebase_uid: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  home_hsid: string | null;
  home_school_name: string | null;
  role: string | null;
  subscription_status: string | null;
  arms_contact_id: string | null;
  arms_location_id: string | null;
  plan: 'fan' | 'superfan';
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface UserFavorite {
  id: number;
  firebase_uid: string;
  arms_contact_id: string | null;
  player_id: string;
  school_id: string | null;
  created_at: Date;
}

export interface UserRole {
  id: number;
  firebase_uid: string;
  role: string;
  school_id: number | null;
  player_id: number | null;
  source: string;
  created_at: Date;
}

// ---------------------------------------------------------------------------
// Schema lifecycle
// ---------------------------------------------------------------------------

// Keep schema creation and migrations out of module initialization. Importing this
// helper should be side-effect free so Next.js can collect page data without
// opening PostgreSQL connections for auth tables that are not needed by a page.

// ---------------------------------------------------------------------------
// Profile CRUD
// ---------------------------------------------------------------------------

/** Fetch the profile for a Firebase UID. Returns null if not found. */
export async function getUserProfile(firebaseUid: string): Promise<UserProfile | null> {
  const res = await query<UserProfile>(
    'SELECT * FROM user_profiles WHERE firebase_uid = $1',
    [firebaseUid]
  );
  return res.rows[0] ?? null;
}

/** Fetch the profile by email. Returns null if not found. */
export async function getUserProfileByEmail(email: string): Promise<UserProfile | null> {
  const res = await query<UserProfile>(
    'SELECT * FROM user_profiles WHERE LOWER(email) = LOWER($1)',
    [email]
  );
  return res.rows[0] ?? null;
}

/** Fetch the profile by Stripe customer ID. */
export async function getUserProfileByStripeCustomerId(
  stripeCustomerId: string
): Promise<UserProfile | null> {
  const res = await query<UserProfile>(
    'SELECT * FROM user_profiles WHERE stripe_customer_id = $1',
    [stripeCustomerId]
  );
  return res.rows[0] ?? null;
}

/** Fetch the profile by Stripe subscription ID. */
export async function getUserProfileByStripeSubscriptionId(
  stripeSubscriptionId: string
): Promise<UserProfile | null> {
  const res = await query<UserProfile>(
    'SELECT * FROM user_profiles WHERE stripe_subscription_id = $1',
    [stripeSubscriptionId]
  );
  return res.rows[0] ?? null;
}

/**
 * Create or update the user profile for a given Firebase UID.
 * Safe to call on every login — does not overwrite plan with 'fan' if already 'superfan'.
 *
 * Update semantics:
 *   email              — always updated to the latest value (Firebase is the auth source of truth)
 *   first_name/last_name — preserved if caller passes null/undefined (COALESCE)
 *   home_hsid          — set only on INSERT (first registration); never overwritten on update
 *   home_school_name   — set only on INSERT; never overwritten on update
 *   role               — preserved once set; only updated if caller provides a value
 *   subscription_status — updated when provided
 *   arms_contact_id    — preserved once set; only updated if caller provides a value
 *   plan               — never downgraded from 'superfan' to 'fan' via this function
 */
export async function upsertUserProfile(
  firebaseUid: string,
  data: Partial<Omit<UserProfile, 'firebase_uid' | 'created_at' | 'updated_at'>> & { email: string }
): Promise<UserProfile> {
  const res = await query<UserProfile>(
    `INSERT INTO user_profiles (
       firebase_uid, email, first_name, last_name,
       home_hsid, home_school_name, role, subscription_status,
       arms_contact_id, arms_location_id, plan,
       stripe_customer_id, stripe_subscription_id
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     ON CONFLICT (firebase_uid) DO UPDATE SET
       email                 = EXCLUDED.email,
       first_name            = COALESCE(EXCLUDED.first_name, user_profiles.first_name),
       last_name             = COALESCE(EXCLUDED.last_name,  user_profiles.last_name),
       -- home_hsid and home_school_name are set at first registration only; never overwritten
       home_hsid             = COALESCE(user_profiles.home_hsid, EXCLUDED.home_hsid),
       home_school_name      = COALESCE(user_profiles.home_school_name, EXCLUDED.home_school_name),
       role                  = COALESCE(EXCLUDED.role, user_profiles.role),
       subscription_status   = COALESCE(EXCLUDED.subscription_status, user_profiles.subscription_status),
       arms_contact_id       = COALESCE(EXCLUDED.arms_contact_id, user_profiles.arms_contact_id),
       arms_location_id      = COALESCE(EXCLUDED.arms_location_id, user_profiles.arms_location_id),
       -- Never downgrade plan from superfan to fan via upsert
       plan                  = CASE
                                 WHEN user_profiles.plan = 'superfan' THEN 'superfan'
                                 ELSE EXCLUDED.plan
                               END,
       stripe_customer_id    = COALESCE(EXCLUDED.stripe_customer_id, user_profiles.stripe_customer_id),
       stripe_subscription_id = COALESCE(EXCLUDED.stripe_subscription_id, user_profiles.stripe_subscription_id),
       updated_at            = NOW()
     RETURNING *`,
    [
      firebaseUid,
      data.email,
      data.first_name ?? null,
      data.last_name ?? null,
      data.home_hsid ?? null,
      data.home_school_name ?? null,
      data.role ?? null,
      data.subscription_status ?? null,
      data.arms_contact_id ?? null,
      data.arms_location_id ?? null,
      data.plan ?? 'fan',
      data.stripe_customer_id ?? null,
      data.stripe_subscription_id ?? null,
    ]
  );
  return res.rows[0];
}

/** Update the plan + Stripe fields after a confirmed Stripe subscription event. */
export async function activateSuperfan(
  firebaseUid: string,
  stripeCustomerId: string,
  stripeSubscriptionId: string
): Promise<void> {
  await query(
    `UPDATE user_profiles
     SET plan = 'superfan',
         stripe_customer_id    = $2,
         stripe_subscription_id = $3,
         updated_at            = NOW()
     WHERE firebase_uid = $1`,
    [firebaseUid, stripeCustomerId, stripeSubscriptionId]
  );
}

/** Downgrade to Fan plan when a Stripe subscription is cancelled/deleted. */
export async function deactivateSuperfan(stripeSubscriptionId: string): Promise<void> {
  await query(
    `UPDATE user_profiles
     SET plan = 'fan',
         stripe_subscription_id = NULL,
         subscription_status    = 'cancelled',
         updated_at             = NOW()
     WHERE stripe_subscription_id = $1`,
    [stripeSubscriptionId]
  );
}

// ---------------------------------------------------------------------------
// Favorites
// ---------------------------------------------------------------------------

/** Save a player as a favorite for the authenticated user. No-op if already saved. */
export async function saveFavorite(
  firebaseUid: string,
  playerId: string,
  opts: { armsContactId?: string | null; schoolId?: string | null } = {}
): Promise<{ created: boolean }> {
  const res = await query<{ id: number }>(
    `INSERT INTO user_favorites (firebase_uid, arms_contact_id, player_id, school_id)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (firebase_uid, player_id) DO NOTHING
     RETURNING id`,
    [firebaseUid, opts.armsContactId ?? null, playerId, opts.schoolId ?? null]
  );
  return { created: (res.rowCount ?? 0) > 0 };
}

/** List all favorites for a user. */
export async function getFavorites(firebaseUid: string): Promise<UserFavorite[]> {
  const res = await query<UserFavorite>(
    'SELECT * FROM user_favorites WHERE firebase_uid = $1 ORDER BY created_at DESC',
    [firebaseUid]
  );
  return res.rows;
}

/** Remove a player from a user's favorites. No-op if not present. */
export async function removeFavorite(
  firebaseUid: string,
  playerId: string
): Promise<{ deleted: boolean }> {
  const res = await query(
    'DELETE FROM user_favorites WHERE firebase_uid = $1 AND player_id = $2',
    [firebaseUid, playerId]
  );
  return { deleted: (res.rowCount ?? 0) > 0 };
}

// ---------------------------------------------------------------------------
// User Roles
// ---------------------------------------------------------------------------

/** Add a role to a user. No-op if the exact combination already exists. */
export async function addUserRole(
  firebaseUid: string,
  role: string,
  opts: { schoolId?: number | null; playerId?: number | null; source?: string } = {}
): Promise<void> {
  await query(
    `INSERT INTO user_roles (firebase_uid, role, school_id, player_id, source)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (firebase_uid, role, school_id, player_id) DO NOTHING`,
    [firebaseUid, role, opts.schoolId ?? null, opts.playerId ?? null, opts.source ?? 'manual']
  );
}

/** Get all roles for a user. */
export async function getUserRoles(firebaseUid: string): Promise<UserRole[]> {
  const res = await query<UserRole>(
    'SELECT * FROM user_roles WHERE firebase_uid = $1 ORDER BY created_at ASC',
    [firebaseUid]
  );
  return res.rows;
}

// ---------------------------------------------------------------------------
// ensureUserProfile
// ---------------------------------------------------------------------------

/**
 * Ensure a user profile exists and is up-to-date.
 * - On first call for a firebase_uid, creates the profile and sets home_hsid from currentHsid.
 * - On subsequent calls (login from any subdomain), loads the existing profile without
 *   overwriting home_hsid or home_school_name.
 * - Returns the current profile.
 */
export async function ensureUserProfile(
  firebaseUid: string,
  email: string,
  currentHsid: string | null,
  opts: {
    firstName?: string | null;
    lastName?: string | null;
    armsContactId?: string | null;
    armsLocationId?: string | null;
    homeSchoolName?: string | null;
  } = {}
): Promise<UserProfile> {
  return upsertUserProfile(firebaseUid, {
    email,
    first_name: opts.firstName ?? null,
    last_name: opts.lastName ?? null,
    home_hsid: currentHsid ?? null,
    home_school_name: opts.homeSchoolName ?? null,
    arms_contact_id: opts.armsContactId ?? null,
    arms_location_id: opts.armsLocationId ?? null,
    plan: 'fan',
  });
}
