// src/lib/galleryStatuses.ts
// The player statuses a school's flip card gallery knows about - one list,
// shared by the filter drawer (which statuses are offered), the gallery's
// first load and its reset (which are checked), and anything else that needs
// "who is on this school's gallery" (the fantasy Stat Ledger).
//
// The gallery opens on ACTIVE plus every injured-list status: injured players
// are still on the roster, they just aren't putting up stats.

export const INJURED_STATUSES = [
  'INJURED 7-DAY',
  'INJURED 10-DAY',
  'INJURED 15-DAY',
  'INJURED 30-DAY',
  'INJURED 60-DAY',
  'INJURED - FULL SEASON',
] as const;

// Every status the filter drawer offers, in this order on every school.
export const GALLERY_STATUS_OPTIONS = [
  'ACTIVE',
  'COMMIT',
  'FREE AGENT',
  ...INJURED_STATUSES,
  'PARTNER/SPONSOR',
  'RED SHIRT',
  'REDSHIRT-MEDICAL',
  'RETIRED',
  'RETIRED - COACH',
  'UNCOMMITTED',
] as const;

// What the gallery shows on first load and after a reset.
export const ACTIVE_GALLERY_STATUSES: readonly string[] = ['ACTIVE', ...INJURED_STATUSES];

export function normalizeGalleryStatus(value: unknown): string {
  return String(value ?? '').trim().toUpperCase();
}

export function isActiveGalleryStatus(value: unknown): boolean {
  return ACTIVE_GALLERY_STATUSES.includes(normalizeGalleryStatus(value));
}
