// Draft records keep the club's name from the year of the pick ("Oakland
// Athletics", "Montreal Expos", "Florida Marlins"), but teamid_universe_mapping
// only knows each franchise by today's name. This maps an old name to the
// franchise's current one, so a pick still finds its club's logo.
const FORMER_NAMES: Record<string, string> = {
  'oakland athletics': 'athletics',
  'kansas city athletics': 'athletics',
  'anaheim angels': 'los angeles angels',
  'california angels': 'los angeles angels',
  'los angeles angels of anaheim': 'los angeles angels',
  'cleveland indians': 'cleveland guardians',
  'florida marlins': 'miami marlins',
  'milwaukee braves': 'atlanta braves',
  'montreal expos': 'washington nationals',
  'new york giants': 'san francisco giants',
  'seattle pilots': 'milwaukee brewers',
  'tampa bay devil rays': 'tampa bay rays',
  // The 1961-71 expansion Senators (every draft pick under that name).
  'washington senators': 'texas rangers',
};

// SQL: the lower-cased current franchise name for a club-name column, to
// compare with lower(teamid_universe_mapping.current_team_name).
export function currentFranchiseSql(column: string) {
  const whens = Object.entries(FORMER_NAMES)
    .map(([old, now]) => `WHEN '${old}' THEN '${now}'`)
    .join(' ');
  return `(CASE lower(trim(${column})) ${whens} ELSE lower(trim(${column})) END)`;
}
