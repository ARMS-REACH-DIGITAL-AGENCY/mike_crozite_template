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

// Every other status MLB puts on a player in its organization (major and
// minor league rosters). The roster sync writes MLB's own name, upper-cased
// (scripts/refresh-flip-card-front-stage-from-mlb.ts); each one is a status
// here, offered in the filter drawer. A player with any of these is still
// with an organization.
export const MLB_ORG_STATUSES = [
  'ADMINISTRATIVE LEAVE',
  'BEREAVEMENT LIST',
  'DEVELOPMENT LIST',
  'INELIGIBLE LIST',
  'MILITARY LEAVE',
  'NOT YET REPORTED',
  'OPTIONED',
  'PATERNITY LIST',
  'REASSIGNED TO MINORS',
  'REHAB ASSIGNMENT',
  'RESERVE LIST (MINORS)',
  'RESTRICTED LIST',
  'SUSPENDED',
  'TEMPORARILY INACTIVE LIST',
] as const;

// Every status the filter drawer offers, in this order on every school.
export const GALLERY_STATUS_OPTIONS = [
  'ACTIVE',
  ...INJURED_STATUSES,
  ...MLB_ORG_STATUSES,
  // A coach of the school's team (any status with COACH in it shows as a
  // coach card; RETIRED - COACH is a retired player who coaches).
  'COACH',
  'COMMIT',
  // Designated for assignment: off the 40-man, not released yet. Most get
  // claimed or outrighted; some retire. Not active, not a free agent.
  'DFA',
  'FREE AGENT',
  'PARTNER/SPONSOR',
  'RED SHIRT',
  'REDSHIRT-MEDICAL',
  'RETIRED',
  'RETIRED - COACH',
  'UNCOMMITTED',
  'UNKNOWN',
] as const;

// Who's on a school's active roster: everyone still with a team or an
// organization - ACTIVE, every injured list, and every other MLB
// organization status (the fantasy Stat Ledger's rosters).
export const ROSTER_STATUSES: readonly string[] = ['ACTIVE', ...INJURED_STATUSES, ...MLB_ORG_STATUSES];

// Owner-approved Active Alumni first-paint preset and membership contract:
// ACTIVE, injured, MLB organization roster states, and both redshirt statuses.
// Historical/admin statuses remain available in the drawer but are unchecked.
export const ACTIVE_GALLERY_STATUSES: readonly string[] = [
  'ACTIVE',
  ...INJURED_STATUSES,
  'ADMINISTRATIVE LEAVE',
  'BEREAVEMENT LIST',
  'DEVELOPMENT LIST',
  'INELIGIBLE LIST',
  'MILITARY LEAVE',
  'NOT YET REPORTED',
  'OPTIONED',
  'PATERNITY LIST',
  'REASSIGNED TO MINORS',
  'REHAB ASSIGNMENT',
  'RESERVE LIST (MINORS)',
  'RESTRICTED LIST',
  'SUSPENDED',
  'TEMPORARILY INACTIVE LIST',
  'RED SHIRT',
  'REDSHIRT-MEDICAL',
];

// A missing status reads as UNKNOWN, the same as the database loader.
export function normalizeGalleryStatus(value: unknown): string {
  return String(value ?? '').trim().toUpperCase() || 'UNKNOWN';
}

export function isActiveGalleryStatus(value: unknown): boolean {
  return ACTIVE_GALLERY_STATUSES.includes(normalizeGalleryStatus(value));
}

// On the active roster (fantasy rosters): an UNKNOWN status is not.
export function isRosterStatus(value: unknown): boolean {
  return ROSTER_STATUSES.includes(normalizeGalleryStatus(value));
}
