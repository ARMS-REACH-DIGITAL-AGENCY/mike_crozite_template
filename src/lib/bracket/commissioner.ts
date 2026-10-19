// The commissioner's decisions: games still tied after every extra inning
// (the head-to-head matchups and the hitter-vs-pitcher inning). Until one is
// recorded here the game shows tied, awaiting the commissioner's decision.
// Key: `${week}:${home hsid}:${away hsid}`; value: the winning school's hsid.
export const COMMISSIONER_DECISIONS: Record<string, number> = {
  // Round 1, Game 2 (week 2), ruled by Pete on Oct 19, 2026: the win goes to
  // the school that lost Game 1, tying each series at a game apiece.
  '2:25:265': 265, // Bracket 1: Westminster Christian over Bishop Hendricken
  '2:44:4205': 44, // Bracket 1: Gulliver Prep over Delbarton School
  '2:536:3997': 3997, // Bracket 1: Colleyville Heritage over South Hills
  '2:10039:10152': 10152, // Bracket 2: Oswego East over St. Clair
  '2:1412:12546': 1412, // Bracket 3: Mission Viejo over JSerra Catholic
  '2:25:4830': 4830, // Bracket 3: Gilman School over Bishop Hendricken
  '2:536:44': 536, // Bracket 4: South Hills over Gulliver Prep
  '2:12444:3305': 12444, // Bracket 6: DeSoto Central over Bethel Park
  '2:1094:13112': 13112, // Bracket 6: Holly Springs over La Costa Canyon
};

export function commissionerRuling(week: number, home: number, away: number): 'home' | 'away' | null {
  const winner = COMMISSIONER_DECISIONS[`${week}:${home}:${away}`];
  return winner === home ? 'home' : winner === away ? 'away' : null;
}
