/**
 * Pure, read-only validation of a complete TBC feed release.
 * PRE-PROMOTION and POST-PROMOTION have different gates so the pipeline
 * never requires 208K production cards as a precondition for creating them.
 */
export const MIN_VERIFIED_PLAYER_IDS = 208427;
const positiveOrZero = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 ? n : null;
};
const verdict = (checks) => ({
  ready: checks.every((x) => x.passed),
  checks,
  blockers: checks.filter((x) => !x.passed).map((x) => x.explanation),
  sideEffects: "none",
});
function checksFactory() {
  const checks = [];
  return {
    checks,
    add(label, passed, explanation) {
      checks.push({ label, passed: Boolean(passed), explanation });
    },
  };
}
/** Validate the immutable full-source snapshot independently of fan-facing tables. */
export function evaluateTbcPrePromotionGate(metrics, {
  now = new Date(),
  performanceApproved = false,
  functionalParityApproved = false,
  rollbackVerified = false,
  mappingExceptionsApproved = false,
} = {}) {
  const { checks, add } = checksFactory();
  const capture = metrics?.capture || {};
  const crosswalk = metrics?.crosswalk || {};
  const season = metrics?.season || {};
  const uniqueIds = positiveOrZero(capture.uniqueIds);
  const rows = positiveOrZero(capture.sourceRows);
  const saved = positiveOrZero(capture.savedRows);
  const savedDistinct = positiveOrZero(capture.uniqueSaved);
  const rejected = positiveOrZero(capture.quarantinedRows);
  const capturedAt = new Date(capture.capturedAt || "").getTime();
  const ageHours = Number.isFinite(capturedAt)
    ? (new Date(now).getTime() - capturedAt) / 3_600_000 : NaN;
  add("complete-source-identities", uniqueIds !== null &&
      uniqueIds >= MIN_VERIFIED_PLAYER_IDS && uniqueIds === rows &&
      uniqueIds === saved && uniqueIds === savedDistinct,
    "Captured source lines, distinct IDs and saved landing rows must match and reach 208,427.");
  add("source-freshness", Number.isFinite(ageHours) && ageHours >= 0 && ageHours <= 24,
    "Full row-level source snapshot must be captured and verified within 24 hours.");
  add("source-quarantine", rejected === 0 ||
    (rejected !== null && mappingExceptionsApproved),
    "Malformed source rows must be corrected or explicitly approved for quarantine.");
  add("crosswalk-policy",
    positiveOrZero(crosswalk.unmatched) === 0 && positiveOrZero(crosswalk.ambiguous) === 0 ||
    mappingExceptionsApproved,
    "Unmatched/ambiguous HSIDs require explicit review, not automatic assignment.");
  add("2026-stats-reconciliation", Boolean(season.coverageReviewed),
    "2026 statistics source coverage and its effect on active-roster counts must be reviewed.");
  add("capacity-and-cost", performanceApproved,
    "Scale, database/query cost and concurrency need signoff using isolated tests.");
  add("fan-facing-parity", functionalParityApproved,
    "Flip card, school, active/all-time, and profile parity must pass.");
  add("rollback-rehearsal", rollbackVerified,
    "Incremental publication must have a tested rollback mechanism.");
  return { ...verdict(checks), sourceAgeHours: Number.isFinite(ageHours) ? +ageHours.toFixed(1) : null };
}
/** Completion gate. Not valid until controlled canonical publication has run. */
export function evaluateTbcPostPromotionGate(metrics, { exceptionsApproved = false } = {}) {
  const { checks, add } = checksFactory();
  const production = metrics?.production || {};
  const checkZero = (key, explanation) => add(key, positiveOrZero(production[key]) === 0, explanation);
  checkZero("sourceMissingRaw", "Not all captured player IDs exist in tbc_players_raw.");
  if (exceptionsApproved) {
    add("sourceMissingCards", positiveOrZero(production.sourceMissingCards) !== null,
      "Missing-card count must be explicitly audited and documented.");
  } else {
    checkZero("sourceMissingCards", "Not all publishable source player IDs have flip cards.");
  }
  checkZero("cardsWithoutHSID", "Published cards have blank HSIDs.");
  checkZero("cardHSIDMismatches", "Published cards have incorrect or conflicting HSIDs.");
  if (!exceptionsApproved) {
    checkZero("cardsWithoutStatus", "Published cards are missing an authoritative status.");
    checkZero("cardsWithoutLevel", "Published cards are missing an authoritative level.");
  } else {
    add("enrichmentExceptionsAudited",
      Boolean(production.enrichmentExceptionsAudited),
      "Every unverified status/level must be flagged and excluded from unsupported filters.");
  }
  return verdict(checks);
}
