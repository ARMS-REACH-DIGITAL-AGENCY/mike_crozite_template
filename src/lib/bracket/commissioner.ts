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
  // Round 1, Game 3 (week 3, Oct 19-25), ruled Oct 26, 2026 (Pete: "you need
  // to be the commissioner"). Every game below finished 0-0 with nobody in
  // action, even club run differentials and even fan bases. Ruled in order:
  // (1) the better series run differential (Games 1-2), (2) the series game
  // won on the field rather than by a commissioner's decision, (3) the higher
  // seed.
  '3:25:265': 25, // Bracket 1: Bishop Hendricken over Westminster Christian (run diff even; won Game 1 on the field)
  '3:44:4205': 4205, // Bracket 1: Delbarton School over Gulliver Prep (run diff even; won Game 1 on the field)
  '3:536:3997': 536, // Bracket 1: South Hills over Colleyville Heritage (run diff even; won Game 1 on the field)
  '3:10039:10152': 10039, // Bracket 2: St. Clair over Oswego East (series run diff +2; Pete's call)
  '3:1412:12546': 12546, // Bracket 3: JSerra Catholic over Mission Viejo (run diff even; won Game 1 on the field)
  '3:25:4830': 25, // Bracket 3: Bishop Hendricken over Gilman School (run diff even; won Game 1 on the field)
  '3:1838:523': 1838, // Bracket 3: La Jolla Country Day over Land O'Lakes (run diff even, both wins on the field; seed 7 over 10)
  '3:536:44': 44, // Bracket 4: Gulliver Prep over South Hills (run diff even; won Game 1 on the field)
  '3:1198:10591': 1198, // Bracket 5: Henry B. Plant over Normal West (series run diff +5; series already won 2-0)
  '3:12444:3305': 3305, // Bracket 6: Bethel Park over DeSoto Central (series run diff +2)
  '3:1838:1514': 1514, // Bracket 6: Elk Grove over La Jolla Country Day (series run diff +2; series already won 2-0; Pete's call)
  '3:1094:13112': 1094, // Bracket 6: La Costa Canyon over Holly Springs (series run diff +1)
};

export function commissionerRuling(week: number, home: number, away: number): 'home' | 'away' | null {
  const winner = COMMISSIONER_DECISIONS[`${week}:${home}:${away}`];
  return winner === home ? 'home' : winner === away ? 'away' : null;
}
