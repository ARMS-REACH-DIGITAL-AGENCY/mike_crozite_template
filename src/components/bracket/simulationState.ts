// Progressive 2026 bracket simulation preview.
// 0 = opening morning before any games have been played.
// Then bump 1 through 34; each step reveals exactly one additional completed
// week while keeping the deterministic season stable.
export const SIMULATION_WEEK = 0;

const DAY = 86400000;
const START_UTC = Date.UTC(2026, 1, 1); // Sun Feb 1, 2026

export function simulationAsOf() {
  const week = Math.max(0, Math.min(34, SIMULATION_WEEK));
  return new Date(START_UTC + week * 7 * DAY).toISOString().slice(0, 10);
}
