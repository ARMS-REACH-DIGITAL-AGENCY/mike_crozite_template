// The ONE game stat line (Pete, Nov 23 2026). The card's 7-day snapshot and the
// Daily Digest print the same saved line (player_game_logs.line_summary), so
// they can never disagree. Both MLB game-log writers build it here:
//   src/lib/mlb/liveGameLogs.ts (live) and scripts/sync-mlb-player-gamelogs.ts (nightly).
// Hitter:  "2-5 | 3B, 2 R, 2K" (Pete, Nov 24 2026; extras only when not zero;
//          2B/3B/HR/BB/SB show a count only above one, e.g. "2HR")
// Pitcher: "1.0 IP | 0 ER, 2 K, 0 BB"  (+ ", W" / "L" / "SV" / "HLD")
// Input: MLB Stats API game stat object (stats.batting / stats.pitching).

type Stat = Record<string, unknown>;
const n = (stat: Stat, key: string) => { const v = Number(stat[key]); return Number.isFinite(v) ? v : 0; };

export function battingLine(stat: Stat): string {
  // Pete, Nov 25 2026: the count, a space, then the stat ("2-4 | 2 2B, 1 R, 2 RBI,
  // 1 BB, 1 K"). One extra-base hit or steal stays bare ("2B", "HR", "SB");
  // runs, RBI, walks and strikeouts always carry their count.
  const times = (key: string, label: string) => { const v = n(stat, key); return v > 1 ? `${v} ${label}` : label; };
  const count = (key: string, label: string) => `${n(stat, key)} ${label}`;
  const extras = [
    n(stat, 'doubles') > 0 && times('doubles', '2B'),
    n(stat, 'triples') > 0 && times('triples', '3B'),
    n(stat, 'homeRuns') > 0 && times('homeRuns', 'HR'),
    n(stat, 'runs') > 0 && count('runs', 'R'),
    n(stat, 'rbi') > 0 && count('rbi', 'RBI'),
    n(stat, 'baseOnBalls') > 0 && count('baseOnBalls', 'BB'),
    n(stat, 'strikeOuts') > 0 && count('strikeOuts', 'K'),
    n(stat, 'stolenBases') > 0 && times('stolenBases', 'SB'),
  ].filter(Boolean);
  const head = `${n(stat, 'hits')}-${n(stat, 'atBats')}`;
  return extras.length ? `${head} | ${extras.join(', ')}` : head;
}

export function pitchingLine(stat: Stat): string {
  const decision = n(stat, 'wins') > 0 ? 'W' : n(stat, 'losses') > 0 ? 'L' : n(stat, 'saves') > 0 ? 'SV' : n(stat, 'holds') > 0 ? 'HLD' : '';
  const parts = [`${n(stat, 'earnedRuns')} ER`, `${n(stat, 'strikeOuts')} K`, `${n(stat, 'baseOnBalls')} BB`];
  if (decision) parts.push(decision);
  return `${String(stat.inningsPitched ?? '0.0')} IP | ${parts.join(', ')}`;
}
