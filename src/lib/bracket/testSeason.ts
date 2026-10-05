// TEST BRANCH ONLY: the live October test of the bracket.
// Opening day is Monday Oct 5, 2026 (Week 1 = Oct 5-11, Round 1 Game 1),
// and "today" is the real date in Arizona - no simulated season clock.
export const TEST_OPENING_DAY = '2026-10-05';

// Today's date in Arizona (UTC-7 all year, no DST), YYYY-MM-DD.
export function arizonaToday(now = Date.now()) {
  return new Date(now - 7 * 3600000).toISOString().slice(0, 10);
}
