// Read-only release policy for the complete Baseball Cube player universe.
// This file has no SQL and no I/O; status must be based on recorded evidence.
export const MIN_VERIFIED_PLAYER_IDS = 208427;

const number = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};

export function evaluateTbcIngestionReleaseGate(metrics, {
  now = new Date(),
  performanceApproved = false,
  functionalParityApproved = false,
  mappingExceptionsApproved = false,
} = {}) {
  const reasons = [];
  const capture = metrics?.capture || {};
  const production = metrics?.production || {};
  const crosswalk = metrics?.crosswalk || {};
  const season = metrics?.season || {};
  const checks = [];

  function check(label, condition, explanation) {
    checks.push({ label, passed: Boolean(condition), explanation });
    if (!condition) reasons.push(explanation);
  }

  const ids = number(capture.uniqueIds);
  const sourceRows = number(capture.sourceRows);
  const savedRows = number(capture.savedRows);
  const uniqueSaved = number(capture.uniqueSaved);
  const quarantine = number(capture.quarantinedRows);
  const capturedAt = new Date(capture.capturedAt || "");
  const ageHours = Number.isFinite(capturedAt.getTime())
    ? (new Date(now).getTime() - capturedAt.getTime()) / 3_600_000
    : null;

  check("complete-source-identities",
    ids !== null && ids >= MIN_VERIFIED_PLAYER_IDS &&
      ids === sourceRows && ids === savedRows && ids === uniqueSaved,
    "Current source must contain at least 208,427 unique IDs and reconcile exactly to preserved landing rows.");

  check("source-freshness",
    ageHours !== null && ageHours >= 0 && ageHours <= 24,
    "Full row-level source landing is older than 24 hours or has no validated capture timestamp.");

  check("source-quarantine",
    quarantine === 0 || (mappingExceptionsApproved && quarantine !== null),
    "Malformed source rows are unresolved; quarantine requires documented and approved exceptions.");

  check("player-raw-coverage",
    number(production.sourceMissingRaw) === 0,
    "Captured Player IDs are missing from tbc_players_raw.");

  check("flip-card-coverage",
    number(production.sourceMissingCards) === 0,
    "Captured Player IDs are missing from flip_card_front_stage.");

  check("school-link-integrity",
    number(production.cardsWithoutHSID) === 0 &&
      number(production.cardHSIDMismatches) === 0,
    "Some player cards have a missing or inconsistent HSID.");

  check("school-crosswalk-exceptions",
    (number(crosswalk.unmatched) === 0 && number(crosswalk.ambiguous) === 0) ||
      mappingExceptionsApproved,
    "Unmatched and ambiguous school identities remain unresolved.");

  check("fan-facing-enrichment",
    number(production.cardsWithoutStatus) === 0 &&
      number(production.cardsWithoutLevel) === 0,
    "Some cards are missing authoritative player status or level.");

  check("season-coverage-review",
    Boolean(season.coverageReviewed),
    "2026 season and historical ZIP coverage must be reconciled before active alumni counts are published.");

  check("performance-and-cost-approval",
    Boolean(performanceApproved),
    "208K scale, SQL cost, caching, and staging throughput have not passed the performance release gate.");

  check("functional-parity-approval",
    Boolean(functionalParityApproved),
    "School and player profile parity, filters, contributions, and rollback are not signed off.");

  return {
    ready: checks.every((c) => c.passed),
    checks,
    blockers: reasons,
    sourceAgeHours: ageHours === null ? null : Math.round(ageHours * 10) / 10,
    note: "This is a read-only release gate; it never promotes or modifies players.",
  };
}
