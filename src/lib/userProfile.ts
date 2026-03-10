/**
 * User profile helpers — PostgreSQL-backed
 * Stores the Firebase uid ↔ GHL contact ↔ Stripe billing mapping.
 *
 * Tables bootstrapped on first import:
 *   user_profiles  — one row per Firebase user
 *   user_favorites — player favorites per user
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
  ghl_contact_id: string | null;
  ghl_location_id: string | null;
  plan: 'free' | 'superfan';
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface UserFavorite {
  id: number;
  firebase_uid: string;
  ghl_contact_id: string | null;
  player_id: string;
  school_id: string | null;
  created_at: Date;
}

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

declare global {
  var __userProfileBootstrapped: boolean | undefined;
}

if (!global.__userProfileBootstrapped) {
  global.__userProfileBootstrapped = true;
  void (async () => {
    try {
      await query(`
        CREATE TABLE IF NOT EXISTS user_profiles (
          firebase_uid          TEXT PRIMARY KEY,
          email                 TEXT NOT NULL,
          first_name            TEXT,
          last_name             TEXT,
          ghl_contact_id        TEXT,
          ghl_location_id       TEXT,
          plan                  TEXT NOT NULL DEFAULT 'free',
          stripe_customer_id    TEXT,
          stripe_subscription_id TEXT,
          created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await query(`
        CREATE TABLE IF NOT EXISTS user_favorites (
          id              SERIAL PRIMARY KEY,
          firebase_uid    TEXT NOT NULL,
          ghl_contact_id  TEXT,
          player_id       TEXT NOT NULL,
          school_id       TEXT,
          created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE (firebase_uid, player_id)
        )
      `);
    } catch (err) {
      console.error('Failed to bootstrap user profile tables:', err);
    }
  })();
}

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
 * Safe to call on every login — does not overwrite plan with 'free' if already 'superfan'.
 *
 * Update semantics:
 *   email              — always updated to the latest value (Firebase is the auth source of truth)
 *   first_name/last_name — preserved if caller passes null/undefined (COALESCE)
 *   ghl_contact_id     — preserved once set; only updated if caller provides a value
 *   plan               — never downgraded from 'superfan' to 'free' via this function
 */
export async function upsertUserProfile(
  firebaseUid: string,
  data: Partial<Omit<UserProfile, 'firebase_uid' | 'created_at' | 'updated_at'>> & { email: string }
): Promise<UserProfile> {
  const res = await query<UserProfile>(
    `INSERT INTO user_profiles (
       firebase_uid, email, first_name, last_name,
       ghl_contact_id, ghl_location_id, plan,
       stripe_customer_id, stripe_subscription_id
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (firebase_uid) DO UPDATE SET
       email                 = EXCLUDED.email,
       first_name            = COALESCE(EXCLUDED.first_name, user_profiles.first_name),
       last_name             = COALESCE(EXCLUDED.last_name,  user_profiles.last_name),
       ghl_contact_id        = COALESCE(EXCLUDED.ghl_contact_id, user_profiles.ghl_contact_id),
       ghl_location_id       = COALESCE(EXCLUDED.ghl_location_id, user_profiles.ghl_location_id),
       -- Never downgrade plan from superfan to free via upsert
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
      data.ghl_contact_id ?? null,
      data.ghl_location_id ?? null,
      data.plan ?? 'free',
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

/** Downgrade to free plan when a Stripe subscription is cancelled/deleted. */
export async function deactivateSuperfan(stripeSubscriptionId: string): Promise<void> {
  await query(
    `UPDATE user_profiles
     SET plan = 'free',
         stripe_subscription_id = NULL,
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
  opts: { ghlContactId?: string | null; schoolId?: string | null } = {}
): Promise<{ created: boolean }> {
  const res = await query<{ id: number }>(
    `INSERT INTO user_favorites (firebase_uid, ghl_contact_id, player_id, school_id)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (firebase_uid, player_id) DO NOTHING
     RETURNING id`,
    [firebaseUid, opts.ghlContactId ?? null, playerId, opts.schoolId ?? null]
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
