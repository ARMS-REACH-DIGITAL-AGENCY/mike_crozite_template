// How each tiebreak is told on the scoreboard and in the drawers. Shared by
// the pages and the bracket results job (a server module, so the job can
// call it).
export const TIE_NOTE: Record<string, string> = {
  // The bracket lab's 2026 simulation still records its old coin-flip tiebreak.
  coin: "Tied after 9 and after all available player tiebreakers · commissioner coin flip (+1 run)",
  cross: "Tied after 9 · won a player tiebreaker using same-week hitter and pitcher percentiles (+1 run)",
  runDiff: "Tied after the player tiebreakers · won on the clubs' better run differential (+1 run)",
  fans: "Tied after the player tiebreakers and even run differentials · won on the bigger fan base (+1 run)",
  commissioner: "Tied after the player tiebreakers, even run differentials and even fan bases · the commissioner's decision (+1 run)",
  'commissioner-pending': "Tied after the player tiebreakers · awaiting the commissioner's decision",
};
// 'players-2': the tie went down to each school's #2 hitter and #2 pitcher
export function tieNote(decidedBy: string) {
  const m = /^players-(\d+)$/.exec(decidedBy);
  if (!m) return TIE_NOTE[decidedBy];
  return m[1] === '1'
    ? 'Tied after 9 · won on the top available individual matchups (+1 run)'
    : `Tied after 9 · won at individual matchup stage #${m[1]} (+1 run)`;
}
