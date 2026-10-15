// A navigation announcement only: this does not change tournament schedules,
// scoring, or the bracket-test pipelines. Arizona is UTC-07:00 at this kickoff.
export const FANTASY_COUNTDOWN_START = '2027-02-01T12:00:00-07:00';
export const FANTASY_COUNTDOWN_START_MS = Date.parse(FANTASY_COUNTDOWN_START);
export const FANTASY_COUNTDOWN_START_LABEL = 'February 1st, 2027';

export function getFantasyCountdown(now: number) {
  const remainingMs = Math.max(0, FANTASY_COUNTDOWN_START_MS - now);
  const totalMinutes = Math.floor(remainingMs / 60_000);
  return {
    days: Math.floor(totalMinutes / (24 * 60)),
    hours: Math.floor(totalMinutes / 60) % 24,
    minutes: totalMinutes % 60,
    complete: now >= FANTASY_COUNTDOWN_START_MS,
  };
}
