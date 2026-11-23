// The ONE game stat line (Pete, Nov 23 2026). The card's 7-day snapshot and the
// Daily Digest print the same saved line (player_game_logs.line_summary), so
// they can never disagree. Both MLB game-log writers build it here:
//   src/lib/mlb/liveGameLogs.ts (live) and scripts/sync-mlb-player-gamelogs.ts (nightly).
// Hitter:  "2-4 | 1 HR, 2 RBI, 1 BB"   (extras only when not zero)
// Pitcher: "1.0 IP | 0 ER, 2 K, 0 BB"  (+ ", W" / "L" / "SV" / "HLD")
// Input: MLB Stats API game stat object (stats.batting / stats.pitching).

type Stat = Record<string, unknown>;
const n = (stat: Stat, key: string) => { const v = Number(stat[key]); return Number.isFinite(v) ? v : 0; };

export function battingLine(stat: Stat): string {
  const extras = ([['doubles', '2B'], ['triples', '3B'], ['homeRuns', 'HR'], ['rbi', 'RBI'], ['runs', 'R'],
    ['baseOnBalls', 'BB'], ['stolenBases', 'SB']] as const)
    .filter(([key]) => n(stat, key) > 0).map(([key, label]) => `${n(stat, key)} ${label}`);
  const head = `${n(stat, 'hits')}-${n(stat, 'atBats')}`;
  return extras.length ? `${head} | ${extras.join(', ')}` : head;
}

export function pitchingLine(stat: Stat): string {
  const decision = n(stat, 'wins') > 0 ? 'W' : n(stat, 'losses') > 0 ? 'L' : n(stat, 'saves') > 0 ? 'SV' : n(stat, 'holds') > 0 ? 'HLD' : '';
  const parts = [`${n(stat, 'earnedRuns')} ER`, `${n(stat, 'strikeOuts')} K`, `${n(stat, 'baseOnBalls')} BB`];
  if (decision) parts.push(decision);
  return `${String(stat.inningsPitched ?? '0.0')} IP | ${parts.join(', ')}`;
}
