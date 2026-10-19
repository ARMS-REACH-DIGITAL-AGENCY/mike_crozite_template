import { normalizeGalleryStatus } from './galleryStatuses';

type PlayerRow = Record<string, unknown>;

function text(value: unknown): string {
  return value == null ? '' : String(value).trim();
}

const LEVEL_ALIASES: Record<string, string> = {
  AAA: 'TRIPLE-A', AA: 'DOUBLE-A',
  'A+': 'HIGH-A', 'HIGH A': 'HIGH-A',
  // Official levels only (Oct 18, 2026): Single-A is MLB's name for the
  // old Low-A, International is spelled out, JUCO is NJCAA.
  A: 'SINGLE-A', 'A-': 'SINGLE-A', 'LOW-A': 'SINGLE-A', 'LOW A': 'SINGLE-A', 'SINGLE A': 'SINGLE-A',
  RK: 'ROOKIE',
  INTL: 'INTERNATIONAL', "INT'L": 'INTERNATIONAL',
  INDEPENDENT: 'INDY',
  D1: 'NCAA-D1', 'NCAA D1': 'NCAA-D1',
  D2: 'NCAA-D2', 'NCAA D2': 'NCAA-D2',
  D3: 'NCAA-D3', 'NCAA D3': 'NCAA-D3',
  JRCOLLEGE: 'NJCAA', JUCO: 'NJCAA',
  HS: 'HIGH SCHOOL',
};

// Formatting aliases never establish a player's current assignment. In
// particular, TBC's career-level "NCAA" does not establish an NCAA division.
export function normalizePlayerLevel(value: unknown): string {
  const level = text(value).toUpperCase()
    .replace(/\s*\(?40-MAN\)?\s*/g, ' ')
    .replace(/\s+/g, ' ').trim();
  if (!level || level === '-' || level === '--' || level === 'UNKNOWN') return '';

  return LEVEL_ALIASES[level] || level;
}

export type PlayerDisplayMetadata = {
  statusLabel: string;
  levelLabel: string;
  teamName: string;
  orgConferenceName: string;
  isSourcedDeparture: boolean;
  isTransactionDeparture: boolean;
};

// The card faces, filter attributes, photo proof and profile must present
// the same stored facts. A season year, career level or missing team never
// supplies a status: absent an explicit status, the player remains UNKNOWN.
export function resolvePlayerDisplay(player: PlayerRow): PlayerDisplayMetadata {
  const explicitStatus = [player.display_status_label, player.status_label, player.status]
    .map(normalizeGalleryStatus)
    .find((status) => !['UNKNOWN', '-', '--'].includes(status)) || 'UNKNOWN';
  const affiliationStatus = text(player.team_affiliation_status).toUpperCase();
  const currentTeam = text(player.current_team_name);
  const previousTeam = text(player.previous_team_name);
  const hasDepartureStatus = affiliationStatus === 'FREE AGENT' || affiliationStatus === 'RETIRED';
  const isTransactionDeparture = hasDepartureStatus && Boolean(text(player.last_transaction_type));

  // The MLB roster refresh and baseline metadata enrichment write explicit
  // departure status and previous_* fields without owning last_transaction_*.
  // Do not require or invent a transaction to show those recorded facts.
  // Matching status, provenance and an empty current team prevent stale
  // previous-team fields from replacing a player's current assignment.
  const isRecordedDeparture = hasDepartureStatus
    && explicitStatus === affiliationStatus
    && ['mlb_api', 'baseline_metadata'].includes(text(player.current_team_source).toLowerCase())
    && !player.last_transaction_applied_at
    && !currentTeam
    && Boolean(previousTeam);
  const isSourcedDeparture = isTransactionDeparture || isRecordedDeparture;

  const levelLabel = [
    player.display_level_label,
    player.level_label,
    isSourcedDeparture ? player.previous_level_label : null,
    player.level,
    player.career_highlevel,
  ].map(normalizePlayerLevel).find(Boolean) || '';

  return {
    statusLabel: isSourcedDeparture ? affiliationStatus : explicitStatus,
    levelLabel,
    teamName: isSourcedDeparture ? previousTeam || currentTeam : currentTeam,
    orgConferenceName: text(isSourcedDeparture
      ? player.previous_org_or_conference_name
      : player.current_org_or_conference_name),
    isSourcedDeparture,
    isTransactionDeparture,
  };
}
