// src/lib/bracket/levelAverages.ts
// Each level's league average - what a player's OPS+ and FIP- are measured
// against (100 = his level's average). 2026 season totals of every alumnus
// in the database at that level (tbc_batting_2026_season_raw /
// tbc_pitching_2026_season_raw, each team's level from
// teamid_universe_mapping); NJCAA, CCCAA and NWAC share one JUCO average.
// Computed Oct 6, 2026 and locked for the 2027 season, so a number never
// moves mid-season.
//
// fip is the level's ERA: the FIP constant (cfip) is set so the level's
// average FIP equals its ERA, so FIP = (13·HR + 3·(BB + HBP) − 2·K) ÷ IP + cfip.

export type LevelAverage = {
  level: string;
  obp: number;
  slg: number;
  ops: number;
  fip: number;
  cfip: number;
  hitters: number;
  pitchers: number;
};

export const LEVEL_AVERAGES_SEASON = 2026;

export const LEVEL_AVERAGES: LevelAverage[] = [
  { level: 'MLB', obp: 0.316, slg: 0.399, ops: 0.715, fip: 4.17, cfip: 3.11, hitters: 229, pitchers: 275 },
  { level: 'Triple-A', obp: 0.350, slg: 0.421, ops: 0.771, fip: 5.05, cfip: 3.67, hitters: 334, pitchers: 411 },
  { level: 'Double-A', obp: 0.344, slg: 0.417, ops: 0.760, fip: 4.91, cfip: 3.64, hitters: 285, pitchers: 293 },
  { level: 'High-A', obp: 0.358, slg: 0.422, ops: 0.780, fip: 4.79, cfip: 3.64, hitters: 260, pitchers: 298 },
  { level: 'Low-A', obp: 0.365, slg: 0.409, ops: 0.774, fip: 4.69, cfip: 3.81, hitters: 278, pitchers: 298 },
  { level: 'Rookie', obp: 0.402, slg: 0.450, ops: 0.853, fip: 5.31, cfip: 4.46, hitters: 108, pitchers: 149 },
  { level: 'Independent', obp: 0.376, slg: 0.454, ops: 0.830, fip: 5.79, cfip: 4.00, hitters: 247, pitchers: 316 },
  { level: 'NCAA D1', obp: 0.383, slg: 0.443, ops: 0.826, fip: 5.86, cfip: 4.19, hitters: 2203, pitchers: 1916 },
  { level: 'NCAA D2', obp: 0.409, slg: 0.460, ops: 0.869, fip: 6.50, cfip: 4.61, hitters: 1368, pitchers: 1147 },
  { level: 'NCAA D3', obp: 0.406, slg: 0.439, ops: 0.845, fip: 6.15, cfip: 4.63, hitters: 1526, pitchers: 1136 },
  { level: 'NAIA', obp: 0.412, slg: 0.464, ops: 0.876, fip: 6.28, cfip: 4.57, hitters: 507, pitchers: 453 },
  { level: 'JUCO', obp: 0.424, slg: 0.490, ops: 0.914, fip: 6.06, cfip: 4.52, hitters: 1253, pitchers: 1012 },
];
