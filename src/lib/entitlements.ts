/**
 * User entitlement helpers
 * Derive feature access from a persisted UserProfile record.
 */

import type { UserProfile } from '@/lib/userProfile';

/** Returns true if the user has an active Superfan subscription. */
export function isSuperfan(profile: UserProfile | null | undefined): boolean {
  if (!profile) return false;

  return (
    profile.plan === 'superfan' ||
    profile.role === 'superfan' ||
    profile.subscription_status === 'active' ||
    profile.subscription_status === 'trialing'
  );
}

/**
 * Returns true if the user can save player favorites.
 * Any authenticated user (Fan or Super Fan) can favorite players from their home school.
 */
export function canSaveFavorite(profile: UserProfile | null | undefined): boolean {
  return !!profile?.firebase_uid;
}

/**
 * Returns true if the user can use global (cross-school) features.
 * Requires Superfan plan.
 */
export function canUseGlobalFeatures(profile: UserProfile | null | undefined): boolean {
  return isSuperfan(profile);
}
