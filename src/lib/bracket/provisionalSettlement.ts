// Verified source-completeness certificate for early provisional bracket finals.
// The ingester/schedule reconciler must issue this proof after confirming both
// schools' rosters, expected games, final game statuses and all player lines.
// Do NOT fabricate a certificate from empty stat lines or inferred idle days.
export type VerifiedSchoolWeek = {
  rosterComplete: boolean;
  scheduleComplete: boolean;
  statLinesComplete: boolean;
  expectedGames: number;
  finalGames: number;
  pendingPlayerLines: number;
};
export type VerifiedWeek = {
  week: number;
  snapshotId: string;
  checkedAt: string;
  schools: Record<string, VerifiedSchoolWeek>;
};
export function hasVerifiedWeek(
  evidence: VerifiedWeek | undefined,
  week: number,
  home: number,
  away: number,
): boolean {
  if (!evidence || evidence.week !== week ||
      !evidence.snapshotId || !Number.isFinite(Date.parse(evidence.checkedAt))) return false;
  for (const hsid of [home, away]) {
    const school = evidence.schools[String(hsid)];
    if (!school?.rosterComplete || !school.scheduleComplete || !school.statLinesComplete ||
        !Number.isInteger(school.expectedGames) || school.expectedGames < 0 ||
        school.finalGames !== school.expectedGames ||
        school.pendingPlayerLines !== 0) return false;
  }
  return true;
}
