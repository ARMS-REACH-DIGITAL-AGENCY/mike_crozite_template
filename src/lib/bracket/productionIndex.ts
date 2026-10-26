// The production tournament uses only the seed field and first-round pairings.
// Historical fixture scores, winners and later rounds never leave this boundary.
import type { GameRow, Index, Round, SeriesRow } from '@/components/bracket/gallery';
import { TOURNAMENT_2027, tournamentWeeks } from './tournamentCalendar';

export function toProductionTournamentIndex(seed: Index): Index {
  const idx = structuredClone(seed);
  idx.season = TOURNAMENT_2027.season;
  idx.weeks = tournamentWeeks(TOURNAMENT_2027.start, idx.weeks.length);
  idx.rounds = idx.rounds.map((round: Round) => {
    const [a, b] = [idx.weeks[(round.r - 1) * 3]?.[0] || '', idx.weeks[round.r * 3 - 1]?.[1] || ''];
    const series = round.r === 1
      ? round.series.map((s) => {
        const games = s[7].map((g): GameRow => [g[0], g[1], g[2], g[3], '', [], null]);
        return [s[0], s[1], s[2], s[3], s[4], 0, [0, 0], games] as SeriesRow;
      })
      : [];
    return { ...round, start: a, end: b, series };
  });
  idx.lbt = [];
  idx.gf = [];
  idx.lbLeaders = [];
  idx.champion = 0; idx.lbChampion = 0; idx.grandChampion = 0;
  return idx;
}
