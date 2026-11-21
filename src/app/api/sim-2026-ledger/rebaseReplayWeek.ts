// Rebase a seven-day historical feed onto the original 34-week replay clock.
// The scoring engine uses absolute day indices relative to INDEX.weeks[0][0].
// Fetching the full season for each opened game is unnecessary and can time out.
import type { Live } from '@/components/bracket/liveSeason';

export function rebaseReplayWeek(live: Live, offsetDays: number, week: number): Live {
  if (!Number.isInteger(offsetDays) || offsetDays < 0 || !Number.isInteger(week) || week < 1 || week > 34)
    throw new Error('Invalid historical week offset');
  const shift = (n: number) => n + offsetDays;
  const shifted = {
    ...live,
    lines: live.lines.map((line) =>
      [line[0], line[1], shift(line[2]), ...line.slice(3)] as typeof line),
    clubs: Object.fromEntries(Object.entries(live.clubs).map(([name, games]) =>
      [name, games.map((row) => [shift(row[0]), ...row.slice(1)] as typeof row)])),
    games: Object.fromEntries(Object.entries(live.games || {}).map(([name, games]) =>
      [name, games.map((row) => [shift(row[0]), ...row.slice(1)] as typeof row)])),
    fans: Object.fromEntries(Object.entries(live.fans || {}).map(([hsid, counts]) =>
      [hsid, Array.from({ length: 34 }, (_, index) => index === week - 1 ? counts[0] ?? 0 : 0)])),
  } satisfies Live;
  return shifted;
}
