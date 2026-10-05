// src/lib/bracket/tournamentCalendar.ts
// Canonical production tournament calendar.
//
// IMPORTANT: This is deliberately separate from scripts/simulate-bracket-2026.ts.
// The 2026 simulator is only a development fixture and keeps its 2026 source
// dates so it can continue reading the 2026 stat data. Production uses this
// calendar and maps live data to week/day by the actual calendar date.

const DAY = 86400000;

export const TOURNAMENT_2027 = {
  season: 2027,
  start: '2027-02-01', // Monday
  end: '2027-09-26',   // Sunday
  bracketLastWeek: 30,
  seasonChampionshipStartWeek: 31,
  seasonChampionshipEndWeek: 33,
  worldSeriesWeek: 34,
} as const;

function parseUtc(iso: string) {
  return Date.parse(`${iso}T00:00:00Z`);
}

function iso(t: number) {
  return new Date(t).toISOString().slice(0, 10);
}

export function tournamentWeeks(start: string = TOURNAMENT_2027.start, count: number = TOURNAMENT_2027.worldSeriesWeek): [string, string][] {
  const t0 = parseUtc(start);
  return Array.from({ length: count }, (_, i) => {
    const a = t0 + i * 7 * DAY;
    return [iso(a), iso(a + 6 * DAY)];
  });
}

export const TOURNAMENT_2027_WEEKS = tournamentWeeks();

export function bracketRoundWeeks(round: number): [number, number] {
  if (!Number.isInteger(round) || round < 1 || round > 10) throw new Error('bracket round must be 1-10');
  return [(round - 1) * 3 + 1, round * 3];
}
