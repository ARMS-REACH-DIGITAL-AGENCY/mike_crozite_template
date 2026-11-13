// src/lib/bracket/appearance.ts
// Did a player bat or pitch in a stat line? One definition for the scoring
// engine's player rows (liveSeason.ts) and the stat drawer (gallery.tsx), so
// the drawer shows a dash - not a 0 - exactly when there is no OPS+ / FIP-.
//   bat: [PA, AB, H, 2B, 3B, HR, BB, HBP, SF]
//   pit: [outs, HR, BB, HBP, K, H, R, ER, ...]
// A pitching line counts only with a FIP event or an out (outs, HR, BB, HBP,
// K): a reliever who gave up a single and left without an out has no FIP-.
export function battedIn(bat: unknown): boolean {
  return Array.isArray(bat) && Number(bat[0] || 0) > 0;
}
export function pitchedIn(pit: unknown): boolean {
  return Array.isArray(pit) && [0, 1, 2, 3, 4].some((i) => Number(pit[i] || 0) > 0);
}
