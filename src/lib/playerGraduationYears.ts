// Central graduation-year bounds for Connect & Contribute.
// The year is OPTIONAL for new players. Keep client choices and both server
// validators in sync; allow incoming high-school classes through 2030.
export const MIN_PLAYER_GRAD_YEAR = 1900;

export function latestPlayerGradYear(currentYear = new Date().getFullYear()): number {
  return Math.max(2030, currentYear + 4);
}

export function isValidPlayerGradYear(value: string): boolean {
  if (!/^\d{4}$/.test(value)) return false;
  const year = Number(value);
  return year >= MIN_PLAYER_GRAD_YEAR && year <= latestPlayerGradYear();
}

export function playerGradYearOptions(): string[] {
  const latest = latestPlayerGradYear();
  return Array.from({ length: latest - MIN_PLAYER_GRAD_YEAR + 1 }, (_, i) => String(latest - i));
}
