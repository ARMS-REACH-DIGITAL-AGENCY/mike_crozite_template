// Player and team ids (Pete, Oct 2026).
//
// Player ids: YAT is for player ids only. A player YAT?STATS adds itself gets
// the next YAT number (YAT + 6 digits, from public.yat_playerid_seq) and keeps
// it for life - high school, college, pro. Never another prefix.
//
// Team ids: a high school's current team (its microsite's current team page)
// is C + hsid - Hamilton (hsid 5004) is C5004. Never the plain hsid (202 hsids
// are already other teams' ids: 25 is Bishop Hendricken and the San Francisco
// Giants) and never YAT.

export function yatPlayerId(n: number | string | bigint): string {
  return `YAT${String(n).padStart(6, '0')}`;
}

export function highSchoolTeamId(hsid: number | string): string {
  return `C${String(hsid).trim()}`;
}
