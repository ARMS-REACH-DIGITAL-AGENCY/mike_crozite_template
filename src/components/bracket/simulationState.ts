// Progressive 2026 bracket simulation preview.
// Bump this one number from 1 through 34. Each commit/deploy reveals exactly
// one additional completed week while keeping the deterministic season stable.
export const SIMULATION_WEEK = 1;

const DAY = 86400000;
const START_UTC = Date.UTC(2026, 1, 2); // Mon Feb 2, 2026

export function simulationAsOf() {
  const week = Math.max(1, Math.min(34, SIMULATION_WEEK));
  return new Date(START_UTC + week * 7 * DAY).toISOString().slice(0, 10);
}
