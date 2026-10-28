// How each tiebreak is told on the scoreboard and in the drawers. Shared by
// the pages and the bracket results job (a server module, so the job can
// call it).
export const TIE_NOTE: Record<string, string> = {
  // The bracket lab's 2026 simulation still records its old coin-flip tiebreak.
  coin: "Tied after 9 and after all available player tiebreakers · commissioner coin flip (+1 run)",
  cross: "Tied after 9 and the head-to-head matchups · won hitter vs pitcher, the closer to league average (+1 run)",
  runDiff: "Tied after every extra inning · won on the clubs' better run differential (+1 run)",
  fans: "Tied after every extra inning and even run differentials · won on the bigger fan base (+1 run)",
  commissioner: "Tied after every extra inning, even run differentials and even fan bases · the commissioner's decision (+1 run)",
  'commissioner-pending': "Tied after every extra inning · awaiting the commissioner's decision",
};
// 'players-2': the tie went down to each school's #2 hitter and #2 pitcher
export function tieNote(decidedBy: string) {
  const m = /^players-(\d+)$/.exec(decidedBy);
  if (!m) return TIE_NOTE[decidedBy];
  return m[1] === '1'
    ? 'Tied after 9 · won on the best hitter (OPS+) and best pitcher (FIP-) matchups'
    : `Tied after 9 · won on the #${m[1]} hitter (OPS+) and #${m[1]} pitcher (FIP-) matchups`;
}
