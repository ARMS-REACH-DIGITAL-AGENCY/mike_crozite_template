import type { Baselines, PlayerLines } from "./engine";
import { teamOffense, teamPitching } from "./engine";

export const SCORING_CALCULATION_VERSION = "real-v1";
export const DAILY_LOCK_HOUR_ARIZONA = 5;
export const ARIZONA_TIME_ZONE = "America/Phoenix";

export type SourceClass = "REAL" | "TEST";

export type TallyLine = {
  players: PlayerLines;
  receivedAt: Date;
  dailyLockAt: Date;
  weeklyLockAt: Date;
  sourceClass: SourceClass;
};

export function dailyEligible(line: TallyLine): boolean {
  return line.sourceClass === "REAL" && line.receivedAt.getTime() <= line.dailyLockAt.getTime();
}

export function weeklyEligible(line: TallyLine): boolean {
  return line.sourceClass === "REAL" && line.receivedAt.getTime() <= line.weeklyLockAt.getTime();
}

function mergeEligible(lines: TallyLine[], eligible: (line: TallyLine) => boolean): PlayerLines {
  const out: PlayerLines = new Map();
  for (const line of lines) {
    if (!eligible(line)) continue;
    for (const [playerId, buckets] of line.players) out.set(playerId, buckets);
  }
  return out;
}

export type CategoryResult = {
  homeOffense: number | null;
  awayOffense: number | null;
  homePitching: number | null;
  awayPitching: number | null;
};

export function dailyMetrics(home: TallyLine[], away: TallyLine[], baselines: Baselines): CategoryResult {
  const h = mergeEligible(home, dailyEligible);
  const a = mergeEligible(away, dailyEligible);
  return {
    homeOffense: teamOffense(h, baselines, "adjusted"),
    awayOffense: teamOffense(a, baselines, "adjusted"),
    homePitching: teamPitching(h, baselines, "adjusted"),
    awayPitching: teamPitching(a, baselines, "adjusted"),
  };
}

export function weeklyMetrics(home: TallyLine[], away: TallyLine[], baselines: Baselines): CategoryResult {
  const h = mergeEligible(home, weeklyEligible);
  const a = mergeEligible(away, weeklyEligible);
  return {
    homeOffense: teamOffense(h, baselines, "adjusted"),
    awayOffense: teamOffense(a, baselines, "adjusted"),
    homePitching: teamPitching(h, baselines, "adjusted"),
    awayPitching: teamPitching(a, baselines, "adjusted"),
  };
}
