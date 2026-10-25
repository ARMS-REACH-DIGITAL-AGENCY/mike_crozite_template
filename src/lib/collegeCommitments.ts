// Canonical team levels eligible for a high-school player's college commitment.
// A college commitment does NOT change the player's current playing level.
export const COLLEGE_COMMIT_LEVELS = [
  'NCAA-D1', 'NCAA-D2', 'NCAA-D3', 'NJCAA', 'CCCAA', 'NWAC', 'NAIA',
] as const;

export function isCollegeCommitLevel(value: unknown): boolean {
  const level = String(value ?? '').trim().toUpperCase();
  return (COLLEGE_COMMIT_LEVELS as readonly string[]).includes(level);
}
