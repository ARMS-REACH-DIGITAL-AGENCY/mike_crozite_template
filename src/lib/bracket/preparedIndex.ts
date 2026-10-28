// The bracket pages' Index - the same shape the gallery and the school's
// Fantasy tab draw from - built on the server from the prepared results in
// master_bracket: the bracket results job's stored matchups, innings,
// winners and stat drawers (scripts/master-bracket-results.ts). Nothing is
// scored here or in the browser; every page shows the one stored answer.
import { query } from '@/lib/db';
import { tournamentWeeks } from '@/lib/bracket/tournamentCalendar';
import type { GameBox, GameRow, Index, LbGame, SeriesRow } from '@/components/bracket/gallery';

type Stored = {
  stage: string; round: number; series_no: number; game_no: number; game_id: number; week: number;
  home_hsid: number | null; away_hsid: number | null; home_seed: number | null; away_seed: number | null;
  home_school_name: string | null; away_school_name: string | null;
  status: string; innings: number[] | null; winner_hsid: number | null; decided_by: string | null;
  computed_at: string | null; box: GameBox | null;
};
// A week in progress: its game, the inning it's in (0-6 = Monday-Sunday) and
// whether that day's runs are posted (yellow until the day closes).
export type LiveInning = [gameId: number, day: number, phase: 'top' | 'posted'];
export type Prepared = { index: Index; boxes: Record<string, GameBox>; lb: LbGame[]; live: LiveInning[] };

// The bracket pages draw Rounds 1-10 and Weeks 1-34 (C1, C2, CG, YWS).
const ROUNDS = 10;
const WEEKS = 34;
const DAY = 86400000;
// The bracket's day: the date in Arizona (UTC-7, no DST), turning over at 4 a.m.
const bracketDay = (t: number) => new Date(t - 11 * 3600000).toISOString().slice(0, 10);
const daysFrom = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / DAY);

export async function preparedIndex(season: string, region: number, now = Date.now()): Promise<Prepared | null> {
  const { rows: [s] } = await query<{ opening_day: string; is_test: boolean }>(
    'SELECT opening_day::text, is_test FROM public.fantasy_seasons WHERE season_key = $1', [season]);
  if (!s) return null;
  const { rows } = await query<Stored>(
    `SELECT stage, round, series_no, game_no, game_id, week, home_hsid, away_hsid, home_seed, away_seed,
            home_school_name, away_school_name, status, innings, winner_hsid, decided_by, computed_at::text, box
       FROM public.master_bracket
      WHERE season_key = $1 AND region = $2 AND stage IN ('bracket', 'total_runs')
      ORDER BY stage, round, series_no, game_no`,
    [season, region],
  );
  const weeks = tournamentWeeks(s.opening_day, WEEKS);
  const today = bracketDay(now);
  // A test bracket is one region on the page (region 1), as before.
  const shownRegion = s.is_test ? 1 : region;

  const schools: Index['schools'] = {};
  for (const g of rows) {
    if (g.stage !== 'bracket' || g.round !== 1) continue;
    for (const [h, name, seed] of [[g.home_hsid, g.home_school_name, g.home_seed], [g.away_hsid, g.away_school_name, g.away_seed]] as const) {
      if (h != null) schools[String(h)] = [name || String(h), shownRegion, Number(seed) || 0];
    }
  }

  const boxes: Record<string, GameBox> = {};
  const live: LiveInning[] = [];
  const toGame = (g: Stored): GameRow => {
    const final = g.status === 'final';
    const [ws] = weeks[g.week - 1] || [];
    if (!final && ws && ws <= today) {
      // Shown as of the job's last run: through its day, never past today.
      const through = g.computed_at ? bracketDay(Date.parse(g.computed_at)) : ws;
      const day = Math.max(0, Math.min(6, daysFrom(ws, through < today ? through : today)));
      live.push([g.game_id, day, g.box?.f?.[day]?.[0] ? 'posted' : 'top']);
    }
    if (g.box) boxes[String(g.game_id)] = g.box;
    return [g.game_id, g.week, Number(g.home_hsid), Number(g.away_hsid), final ? g.decided_by || 'runs' : '', (g.innings || []).map(Number), final ? Number(g.winner_hsid) : null];
  };

  // Each round's series: its games in order, the wins so far, the winner
  // once a school has 2.
  const known = rows.filter((g) => g.home_hsid != null && g.away_hsid != null);
  const rounds: Index['rounds'] = [];
  for (let r = 1; r <= ROUNDS; r++) {
    const bySeries = new Map<number, Stored[]>();
    for (const g of known) if (g.stage === 'bracket' && g.round === r) (bySeries.get(g.series_no) || bySeries.set(g.series_no, []).get(g.series_no)!).push(g);
    const series = [...bySeries.entries()].sort(([a], [b]) => a - b).map(([, games]) => {
      const g0 = games[0];
      const [home, away] = [Number(g0.home_hsid), Number(g0.away_hsid)];
      const list = games.map(toGame);
      const wins: [number, number] = [list.filter((x) => x[6] === home).length, list.filter((x) => x[6] === away).length];
      return [shownRegion, home, away, Number(g0.home_seed) || 0, Number(g0.away_seed) || 0, wins[0] >= 2 ? home : wins[1] >= 2 ? away : 0, wins, list] as SeriesRow;
    });
    rounds.push({ r, name: `Round ${r}`, start: weeks[(r - 1) * 3]?.[0] || '', end: weeks[r * 3 - 1]?.[1] || '', series });
  }
  // The knocked-out schools' weekly games (they keep playing for Total Runs).
  const lb: LbGame[] = known.filter((g) => g.stage === 'total_runs').map((g) => [...toGame(g), shownRegion] as LbGame);

  return {
    index: {
      season: Number(s.opening_day.slice(0, 4)), weeks, schools, rounds,
      lbt: [], gf: [], champion: 0, lbLeaders: [], alumni: {}, lbChampion: 0, grandChampion: 0,
    },
    boxes, lb, live,
  };
}
