// A production scoring run reads the CURRENT seven-day window, not the
// 34-week history. Past scores, series and standings come from master_bracket.
// For an unfinished older week (e.g. an interrupted Monday lock), fetch ONLY
// that missing week. Do not touch a previously locked game.
import type { Live } from '@/components/bracket/liveSeason';
import { tournamentWeeks } from '@/lib/bracket/tournamentCalendar';

export type WeekRow = {
  week: number;
  home_hsid: number | null;
  away_hsid: number | null;
  locked_at: string | null;
};

/** The earliest unfinished scheduled week, or the week currently in progress. */
export function selectScoringWeek(
  openingDay: string, count: number, asof: string, rows: readonly WeekRow[],
): { week: number; latest: number; start: string } | null {
  const weeks = tournamentWeeks(openingDay, count);
  const latest = weeks.filter(([start]) => start <= asof).length;
  if (!latest) return null;
  const pending = rows
    .filter((r) => r.week >= 1 && r.week < latest && r.home_hsid != null &&
      r.away_hsid != null && !r.locked_at).map((r) => r.week);
  const week = pending.length ? Math.min(...pending) : latest;
  return { week, latest, start: weeks[week - 1][0] };
}

/** Rebase one API week (days 0-6) onto the original full-season clock. */
export function rebaseBracketWeek(live: Live, week: number): Live {
  if (!Number.isInteger(week) || week < 1 || week > 40) throw Error('Invalid scoring week');
  const dayOffset = (week - 1) * 7;
  const shift = (day: number) => day + dayOffset;
  return {
    ...live,
    lines: live.lines.map((l) => [l[0], l[1], shift(l[2]), ...l.slice(3)] as typeof l),
    clubs: Object.fromEntries(Object.entries(live.clubs).map(([club, games]) =>
      [club, games.map((g) => [shift(g[0]), ...g.slice(1)] as typeof g)])),
    games: live.games ? Object.fromEntries(Object.entries(live.games).map(([club, games]) =>
      [club, games.map((g) => [shift(g[0]), ...g.slice(1)] as typeof g)])) : undefined,
    // The fan-count tiebreak API returns its selected week's cutoff as index
    // zero. The original scoreboard scorer indexes fan counts by game week.
    fans: Object.fromEntries(Object.entries(live.fans || {}).map(([hsid, counts]) =>
      [hsid, Array.from({ length: week }, (_, i) => i === week - 1 ? counts[0] ?? 0 : 0)])),
  };
}
