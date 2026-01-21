// opsPlus.ts
// Team OPS+ (for scoring): compute from team-summed OBP + SLG ("true team OPS").
// Player daily OPS+ (display only): same math at player-line level.
// Assumes you have *daily integer outcomes* per player for the simulated day.

export type BatLine = {
  hsid: number;          // 5004 / 9655
  day: number | string;  // simulation day index or date string
  playerid: string;

  ab: number;
  h: number;
  dbl: number; // 2B
  tpl: number; // 3B
  hr: number;
  bb: number;
  hbp: number;
  sf: number;
};

export type RateLine = {
  obp: number;
  slg: number;
  ops: number;
  opsPlus: number;
};

export type TeamTotals = Omit<BatLine, "playerid"> & {
  single: number;
  tb: number;
};

function n(x: unknown): number {
  const v = Number(x);
  return Number.isFinite(v) ? v : 0;
}

export function computeSingles(h: number, dbl: number, tpl: number, hr: number): number {
  const s = n(h) - n(dbl) - n(tpl) - n(hr);
  return s < 0 ? 0 : s; // guard against dirty inputs
}

export function computeTotalBases(single: number, dbl: number, tpl: number, hr: number): number {
  return n(single) + 2 * n(dbl) + 3 * n(tpl) + 4 * n(hr);
}

export function computeOBP(h: number, bb: number, hbp: number, ab: number, sf: number): number {
  const num = n(h) + n(bb) + n(hbp);
  const den = n(ab) + n(bb) + n(hbp) + n(sf);
  return den === 0 ? 0 : num / den;
}

export function computeSLG(tb: number, ab: number): number {
  const den = n(ab);
  return den === 0 ? 0 : n(tb) / den;
}

export function computeOPS(obp: number, slg: number): number {
  return n(obp) + n(slg);
}

export function computeOPSPlus(ops: number, baselineOPS: number): number {
  const base = n(baselineOPS);
  if (base <= 0) return 0;
  return 100 * (n(ops) / base);
}

export function computeDailyRatesFromLine(
  line: Pick<BatLine, "ab" | "h" | "dbl" | "tpl" | "hr" | "bb" | "hbp" | "sf">,
  baselineOPS: number
): RateLine {
  const single = computeSingles(line.h, line.dbl, line.tpl, line.hr);
  const tb = computeTotalBases(single, line.dbl, line.tpl, line.hr);
  const obp = computeOBP(line.h, line.bb, line.hbp, line.ab, line.sf);
  const slg = computeSLG(tb, line.ab);
  const ops = computeOPS(obp, slg);
  const opsPlus = computeOPSPlus(ops, baselineOPS);
  return { obp, slg, ops, opsPlus };
}

export function aggregateTeamTotals(lines: BatLine[], hsid: number, day: number | string): TeamTotals {
  const filtered = lines.filter(l => n(l.hsid) === n(hsid) && String(l.day) === String(day));

  let ab = 0, h = 0, dbl = 0, tpl = 0, hr = 0, bb = 0, hbp = 0, sf = 0;
  for (const l of filtered) {
    ab += n(l.ab);
    h += n(l.h);
    dbl += n(l.dbl);
    tpl += n(l.tpl);
    hr += n(l.hr);
    bb += n(l.bb);
    hbp += n(l.hbp);
    sf += n(l.sf);
  }

  const single = computeSingles(h, dbl, tpl, hr);
  const tb = computeTotalBases(single, dbl, tpl, hr);

  return {
    hsid: n(hsid),
    day,
    playerid: "__TEAM__" as any, // not used; kept for shape compatibility if needed
    ab, h, dbl, tpl, hr, bb, hbp, sf,
    single,
    tb,
  };
}

export function computeTeamDailyOPSPlus(
  lines: BatLine[],
  hsid: number,
  day: number | string,
  baselineOPS: number
) {
  const totals = aggregateTeamTotals(lines, hsid, day);
  const rates = computeDailyRatesFromLine(totals, baselineOPS);
  return { totals, ...rates };
}

/**
 * Example usage inside simulate_ham_basha_week1.ts after you generate player day box lines:
 *
 * const baselineOPS = 0.730; // whatever baseline you choose for this matchup context
 * const day = 1;
 *
 * // playerDayLines: BatLine[] (daily integers)
 * const hamTeam = computeTeamDailyOPSPlus(playerDayLines, 5004, day, baselineOPS);
 * const bashTeam = computeTeamDailyOPSPlus(playerDayLines, 9655, day, baselineOPS);
 *
 * // fan display (informational only):
 * const playerDisplay = playerDayLines.map(p => ({
 *   ...p,
 *   ...computeDailyRatesFromLine(p, baselineOPS),
 * }));
 */
