// The commissioner's decisions: games still tied after every extra inning
// (the head-to-head matchups and the hitter-vs-pitcher inning). Until one is
// recorded here the game shows tied, awaiting the commissioner's decision.
// Key: `${week}:${home hsid}:${away hsid}`; value: the winning school's hsid.
export const COMMISSIONER_DECISIONS: Record<string, number> = {};

export function commissionerRuling(week: number, home: number, away: number): 'home' | 'away' | null {
  const winner = COMMISSIONER_DECISIONS[`${week}:${home}:${away}`];
  return winner === home ? 'home' : winner === away ? 'away' : null;
}
