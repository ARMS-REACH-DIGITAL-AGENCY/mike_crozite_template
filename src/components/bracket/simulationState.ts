import { arizonaToday } from '@/lib/bracket/testSeason';

// Progressive 2026 bracket simulation preview.
// 0 = opening morning before any games have been played.
// Then bump 1 through 34; each step reveals exactly one additional completed
// week while keeping the deterministic season stable.
export const SIMULATION_WEEK = 0;


export function simulationAsOf() {
  // Test branch: the page's "today" is the bracket's day - the date in
  // Arizona, turning over at 4 a.m. (when the day before goes final and the
  // next inning starts), not at midnight.
  return arizonaToday(Date.now() - 4 * 3600000);
}
