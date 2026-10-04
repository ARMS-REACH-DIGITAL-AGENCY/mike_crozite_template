import type { Baselines, PlayerDay } from "./engine";
import { playerFipMinus, playerOpsPlus, teamOffense, teamPitching } from "./engine";

export const SCORING_CALCULATION_VERSION = "real-v1";
export const DAILY_LOCK_HOUR_ARIZONA = 5;
export const ARIZONA_TIME_ZONE = "America/Phoenix";

export type SourceClass = "REAL" | "TEST";

export type TallyLine = {
  player: PlayerDay;
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

export function scoreDaily(
  home: TallyLine[],
  away: TallyLine[],
  baselines: Baselines,
): { homeValue: number; awayValue: number; winner: "home" | "away" | null } {
  const h = home.filter(dailyEligible).map((x) => x.player);
  const a = away.filter(dailyEligible).map((x) => x.player);
  const hOff = teamOffense(h, baselines);
  const aOff = teamOffense(a, baselines);
  const hPit = teamPitching(h, baselines);
  const aPit = teamPitching(a, baselines);

  // Same hold rule as canonical engine: a school with no eligible activity
  // cannot score; opponent must still beat the 100 league-average baseline.
  const hActive = hOff !== null || hPit !== null;
  const aActive = aOff !== null || aPit !== null;
  const hValue = hOff ?? (hPit === null ? 100 : 200 - hPit);
  const aValue = aOff ?? (aPit === null ? 100 : 200 - aPit);

  let winner: "home" | "away" | null = null;
  if (hActive && aActive) winner = hValue > aValue ? "home" : aValue > hValue ? "away" : null;
  else if (hActive && hValue > 100) winner = "home";
  else if (aActive && aValue > 100) winner = "away";

  return { homeValue: hValue, awayValue: aValue, winner };
}

export function auditPlayerMetrics(players: PlayerDay[], baselines: Baselines) {
  return players.map((p) => ({
    playerid: p.id,
    opsPlus: playerOpsPlus(p, baselines),
    fipMinus: playerFipMinus(p, baselines),
  }));
}
