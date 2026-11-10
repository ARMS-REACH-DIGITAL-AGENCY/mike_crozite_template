// Adapted from the 1A-6A stored-results reader for the full 2027 tournament.
// This file READS the official results already persisted by master-bracket-results.
// It never scores games, changes tournament rules, or writes to Neon.
import { query } from '@/lib/db';
import { tournamentWeeks } from '@/lib/bracket/tournamentCalendar';
import type { GameBox, GameRow, Index, LbGame, SeriesRow } from '@/components/bracket/gallery';

type Stored = {
  stage: string; region: number; round: number; series_no: number; game_no: number;
  game_id: number; week: number; home_hsid: number | null; away_hsid: number | null;
  home_seed: number | null; away_seed: number | null;
  home_school_name: string | null; away_school_name: string | null;
  status: string; innings: number[] | null; winner_hsid: number | null;
  decided_by: string | null; computed_at: string | null;
  settled: [boolean, boolean][] | null;
};
export type LiveInning = [gameId: number, day: number, phase: 'top' | 'posted'];
export type Prepared = { index: Index; lb: LbGame[]; live: LiveInning[] };

const DAY = 86400000;
// Tournament scoring days turn over at 4 a.m. Arizona time.
const bracketDay = (now: number) => new Date(now - 11 * 3600000).toISOString().slice(0, 10);
const daysFrom = (a: string, b: string) =>
  Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / DAY);

export async function preparedIndex(season: string, now = Date.now()): Promise<Prepared | null> {
  const { rows: [s] } = await query<{ opening_day: string; weeks: number; regions: number; schools_per_region: number; is_test: boolean }>(
    'SELECT opening_day::text, weeks, regions, schools_per_region, is_test FROM public.fantasy_seasons WHERE season_key=$1', [season]);
  if (!s || s.is_test || s.regions !== 8 || s.schools_per_region !== 128 || s.weeks !== 34) return null;
  // The small stored innings, names and game metadata are shared across all
  // school pages. Large player-by-player Stat Ledger boxes are fetched on demand.
  const { rows } = await query<Stored>(
    "SELECT stage,region,round,series_no,game_no,game_id,week,home_hsid,away_hsid," +
    "home_seed,away_seed,home_school_name,away_school_name,status,innings,winner_hsid,decided_by," +
    "computed_at::text,box->'f' AS settled " +
    "FROM public.master_bracket WHERE season_key=$1 AND " +
    "(stage='bracket' OR (stage IN ('total_runs','season_championship','world_series') " +
    "AND home_hsid IS NOT NULL AND away_hsid IS NOT NULL)) " +
    "ORDER BY stage,round,region,series_no,game_no", [season]);
  const weeks = tournamentWeeks(s.opening_day, s.weeks);
  const today = bracketDay(now);
  const schools: Index['schools'] = {};
  const live: LiveInning[] = [];
  const toGame = (g: Stored): GameRow => {
    const final = g.status === 'final';
    const weekStart = weeks[g.week - 1]?.[0];
    if (!final && weekStart && weekStart <= today && g.home_hsid != null && g.away_hsid != null) {
      const computedDay = g.computed_at ? bracketDay(Date.parse(g.computed_at)) : weekStart;
      const through = computedDay < today ? computedDay : today;
      const day = Math.max(0, Math.min(6, daysFrom(weekStart, through)));
      live.push([g.game_id, day, g.settled?.[day]?.[0] ? 'posted' : 'top']);
    }
    return [g.game_id, g.week, Number(g.home_hsid), Number(g.away_hsid),
      final ? g.decided_by || 'runs' : '', (g.innings || []).map(Number),
      final && g.winner_hsid != null ? Number(g.winner_hsid) : null];
  };

  const first = rows.filter(g => g.stage === 'bracket' && g.round === 1 && g.game_no === 1);
  for (const g of first) {
    if (g.home_hsid != null) schools[String(g.home_hsid)] = [g.home_school_name || String(g.home_hsid), Number(g.region), Number(g.home_seed) || 0];
    if (g.away_hsid != null) schools[String(g.away_hsid)] = [g.away_school_name || String(g.away_hsid), Number(g.region), Number(g.away_seed) || 0];
  }
  if (Object.keys(schools).length !== 1024 || first.length !== 512) {
    throw new Error('Prepared 2027 field does not contain 1,024 schools and 512 opening series');
  }

  const rounds: Index['rounds'] = [];
  for (let round = 1; round <= 10; round++) {
    const games = rows.filter(g => g.stage === 'bracket' && g.round === round &&
      g.home_hsid != null && g.away_hsid != null);
    const bySeries = new Map<string, Stored[]>();
    for (const g of games) {
      const key = String(g.region) + ':' + String(g.series_no);
      if (!bySeries.has(key)) bySeries.set(key, []);
      bySeries.get(key)!.push(g);
    }
    const series = Array.from(bySeries.values()).map(group => {
      const sorted = group.sort((a,b) => a.game_no - b.game_no);
      const firstGame = sorted[0], home = Number(firstGame.home_hsid), away = Number(firstGame.away_hsid);
      const all = sorted.map(toGame);
      const homeWins = all.filter(g => g[6] === home).length;
      const awayWins = all.filter(g => g[6] === away).length;
      return [firstGame.region, home, away, Number(firstGame.home_seed) || 0,
        Number(firstGame.away_seed) || 0, homeWins >= 2 ? home : awayWins >= 2 ? away : 0,
        [homeWins, awayWins], all] as SeriesRow;
    });
    rounds.push({ r: round, name: 'Round ' + round,
      start: weeks[(round - 1) * 3]?.[0] || '',
      end: weeks[round * 3 - 1]?.[1] || '', series });
  }

  const lb: LbGame[] = rows.filter(g => g.stage === 'total_runs' &&
    g.home_hsid != null && g.away_hsid != null).map(g => [...toGame(g), Number(g.region)] as LbGame);
  const championship = rows.filter(g => g.stage === 'season_championship' &&
    g.home_hsid != null && g.away_hsid != null).sort((a,b) => a.week - b.week || a.game_id - b.game_id);
  const lbt: Index['lbt'] = championship.map(g => ({
    seeds: [Number(g.home_seed) || 0, Number(g.away_seed) || 0] as [number,number],
    game: toGame(g),
  }));
  const world = rows.filter(g => g.stage === 'world_series' &&
    g.home_hsid != null && g.away_hsid != null);
  const gf = world.map(toGame);
  // The bracket champion is the best-of-three SERIES winner, not the
  // winner of Game 3. Game 3 is still played even if a team won Games 1-2.
  const finalSeriesGames = rows.filter(g => g.stage === 'bracket' && g.round === 10 &&
    g.series_no === 9 && g.home_hsid != null && g.away_hsid != null);
  const finalHome = Number(finalSeriesGames[0]?.home_hsid) || 0;
  const finalAway = Number(finalSeriesGames[0]?.away_hsid) || 0;
  const finalHomeWins = finalSeriesGames.filter(g => g.status === 'final' && g.winner_hsid === finalHome).length;
  const finalAwayWins = finalSeriesGames.filter(g => g.status === 'final' && g.winner_hsid === finalAway).length;
  const bracketWinner = finalHomeWins >= 2 ? finalHome : finalAwayWins >= 2 ? finalAway : 0;
  const championshipFinal = championship.find(g => g.week === 33);
  const lbLeaders = championship.filter(g => g.week === 31)
    .flatMap(g => [[Number(g.home_seed), Number(g.home_hsid)], [Number(g.away_seed), Number(g.away_hsid)]])
    .sort((a,b) => a[0] - b[0]).map(x => x[1]);
  return { index: {
    season: Number(s.opening_day.slice(0, 4)), weeks, schools, rounds,
    lbt, gf, champion: Number(bracketWinner) || 0, lbLeaders,
    lbChampion: Number(championshipFinal?.winner_hsid) || 0,
    grandChampion: Number(world[0]?.winner_hsid) || 0,
    alumni: {},
  }, lb, live };
}

// Only the selected game's/round's Stat Ledger is transferred to the browser.
// Unlike the test's all-boxes response, this stays bounded in Week 30.
export async function preparedBoxes(season: string, file: string): Promise<Record<string, GameBox>> {
  let stage = '', round: number | null = null, region: number | null = null, week: number | null = null;
  let m: RegExpMatchArray | null;
  if ((m = file.match(/^d-(\d{1,2})-(\d)$/))) {
    stage = 'bracket'; round = Number(m[1]); region = Number(m[2]);
    if (round < 1 || round > 10 || region < 0 || region > 8) throw new Error('Invalid bracket file');
  } else if ((m = file.match(/^d-lb-(\d{1,2})-(\d)$/))) {
    stage = 'total_runs'; week = Number(m[1]); region = Number(m[2]);
    if (week < 1 || week > 30 || region < 0 || region > 8) throw new Error('Invalid leaderboard file');
  } else if (file === 'd-lbt') {
    stage = 'season_championship';
  } else if (file === 'd-gf') {
    stage = 'world_series';
  } else {
    throw new Error('Invalid prepared box file');
  }
  const { rows } = await query<{ game_id: number; box: GameBox }>(
    "SELECT game_id,box FROM public.master_bracket WHERE season_key=$1 AND stage=$2 " +
    "AND ($3::int IS NULL OR round=$3) AND ($4::int IS NULL OR region=$4) " +
    "AND ($5::int IS NULL OR week=$5) AND box IS NOT NULL",
    [season, stage, round, region, week]);
  return Object.fromEntries(rows.map(g => [String(g.game_id), g.box]));
}
