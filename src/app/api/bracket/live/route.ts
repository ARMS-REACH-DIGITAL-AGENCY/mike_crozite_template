import { NextResponse, type NextRequest } from 'next/server';
import { query } from '@/lib/db';
import { isActiveGalleryStatus } from '@/lib/galleryStatuses';

// Live bracket lines: every game line (player_game_logs - the 10-minute MLB
// feed plus the 4-hourly game-log sync, Arizona Fall League included) that a
// school's active alumni posted from `start` for `weeks` weeks, and the
// results of their clubs' games (the W-L inning).
//
// The roster is the school's Active Baseball Alumni flip-card gallery - the
// same players the drawer lists (/api/players/[hsid]) - so the scoreboard and
// the drawer always count the same people.
//
//   GET /api/bracket/live?start=2026-10-05&weeks=3&h=25,1546,...
//
// Response:
//   roster: { [hsid]: [playerid, name, level, isPitcher (0|1), club][] }
//   lines:  [hsid, playerid, day, 'b'|'p', stats[], gameId, club, final (0|1)][]
//           day: 0 = start; batting stats [PA AB H 2B 3B HR BB HBP SF],
//           pitching [outs HR BB HBP K H R ER]
//   clubs:  { [club]: [day, gameId, won (0|1)][] } - finished games only
//   games:  { [club]: [day, gameId, done (0|1)][] } - every scheduled pro game
//           (team_schedules, refreshed every 10 minutes): done = final,
//           postponed or cancelled. A day's run waits on the games not done.

export const dynamic = 'force-dynamic';

type StageRow = {
  playerid: string; hsid: string; display_name: string | null; first_name: string | null; last_name: string | null;
  status_label: string | null; level_label: string | null; display_level_label: string | null;
  position: string | null; current_team_name: string | null;
};
type LineRow = { playerid: string; day: number; stat_type: string; stats: Record<string, unknown>; game: string; team: string | null; status: string | null };
type SchedRow = { game: string; day: number; status: string | null; home: string; away: string; home_runs: number | null; away_runs: number | null };
type ClubRow = { team: string; game: string; day: number; is_win: boolean };

const n = (v: unknown) => (typeof v === 'number' ? v : Number(v) || 0);
// "6.2" innings = 20 outs.
function outsFromIp(ip: unknown) {
  const [w, f] = String(ip ?? '0').split('.');
  return n(w) * 3 + n(f);
}
const batOf = (s: Record<string, unknown>) => [
  n(s.plateAppearances), n(s.atBats), n(s.hits), n(s.doubles), n(s.triples), n(s.homeRuns), n(s.baseOnBalls), n(s.hitByPitch), n(s.sacFlies),
];
const pitOf = (s: Record<string, unknown>) => [
  outsFromIp(s.inningsPitched), n(s.homeRuns), n(s.baseOnBalls), n(s.hitByPitch), n(s.strikeOuts), n(s.hits), n(s.runs), n(s.earnedRuns),
];
const text = (v: unknown) => String(v ?? '').trim();
const isHighSchool = (r: StageRow) => [r.level_label, r.display_level_label].some((v) => /^(HIGH SCHOOL|HS)$/i.test(text(v)));
// A game that is over (or will not be played).
const isDone = (status: unknown) => /^(final|game over|completed|postponed|cancelled|canceled|suspended)/i.test(text(status));
const isFinal = (status: unknown) => /^(final|game over|completed)/i.test(text(status));
const isPitcher = (position: unknown) => /(^|[^A-Z])(P|RHP|LHP|PITCHER)([^A-Z]|$)/.test(text(position).toUpperCase());

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const start = sp.get('start') || '';
  const weeks = Math.min(40, Math.max(1, Number(sp.get('weeks')) || 1));
  const hsids = [...new Set((sp.get('h') || '').split(',').map((x) => x.trim()).filter((x) => /^\d{1,7}$/.test(x)))].slice(0, 64);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !hsids.length) {
    return NextResponse.json({ error: 'start=YYYY-MM-DD and h=<hsid,...> are required' }, { status: 400 });
  }

  try {
    const { rows: stage } = await query<StageRow>(
      `SELECT playerid::text AS playerid, hsid::text AS hsid, display_name, first_name, last_name, status_label,
              level_label, display_level_label, position, current_team_name
         FROM flip_card_front_stage
        WHERE hsid::text = ANY($1)`,
      [hsids],
    );
    const roster: Record<string, [string, string, string, 0 | 1, string][]> = {};
    const schoolOf = new Map<string, string>();
    for (const r of stage) {
      if (!isActiveGalleryStatus(r.status_label) || isHighSchool(r)) continue;
      const name = text(r.display_name) || [text(r.first_name), text(r.last_name)].filter(Boolean).join(' ') || r.playerid;
      (roster[r.hsid] ||= []).push([r.playerid, name, text(r.level_label ?? r.display_level_label), isPitcher(r.position) ? 1 : 0, text(r.current_team_name)]);
      schoolOf.set(r.playerid, r.hsid);
    }

    const ids = [...schoolOf.keys()];
    const { rows: logRows } = ids.length
      ? await query<LineRow>(
        // One row per player, game and stat type: the newest copy.
        `SELECT DISTINCT ON (playerid, source_game_id, stat_type)
                playerid::text AS playerid, (game_date::date - $2::date) AS day, stat_type, stats,
                source_game_id::text AS game, team_name AS team, game_status AS status
           FROM player_game_logs
          WHERE playerid::text = ANY($1) AND game_date >= $2::date AND game_date < $2::date + $3::int
            AND stat_type IN ('batting', 'pitching')
          ORDER BY playerid, source_game_id, stat_type, updated_at DESC`,
        [ids, start, weeks * 7],
      )
      : { rows: [] as LineRow[] };
    const lines = logRows.map((r) => [
      schoolOf.get(r.playerid)!, r.playerid, Number(r.day), r.stat_type === 'batting' ? 'b' : 'p',
      r.stat_type === 'batting' ? batOf(r.stats || {}) : pitOf(r.stats || {}), r.game, text(r.team), isDone(r.status) ? 1 : 0,
    ]);

    // Club results: every finished game of every club these alumni play
    // for, from any line that carries the result (isWin).
    const clubNames = [...new Set([
      ...logRows.map((r) => text(r.team)),
      ...Object.values(roster).flat().map((p) => p[4]),
    ].filter(Boolean))];
    const { rows: clubRows } = clubNames.length
      ? await query<ClubRow>(
        `SELECT DISTINCT ON (team_name, source_game_id)
                team_name AS team, source_game_id::text AS game, (game_date::date - $2::date) AS day,
                (raw_payload->>'isWin')::boolean AS is_win
           FROM player_game_logs
          WHERE team_name = ANY($1) AND game_date >= $2::date AND game_date < $2::date + $3::int
            AND raw_payload ? 'isWin' AND jsonb_typeof(raw_payload->'isWin') = 'boolean'
          ORDER BY team_name, source_game_id, updated_at DESC`,
        [clubNames, start, weeks * 7],
      )
      : { rows: [] as ClubRow[] };
    const clubs: Record<string, [number, string, 0 | 1][]> = {};
    const seen = new Set<string>();
    const result = (club: string, day: number, game: string, won: boolean) => {
      if (seen.has(`${club}:${game}`)) return;
      seen.add(`${club}:${game}`);
      (clubs[club] ||= []).push([day, game, won ? 1 : 0]);
    };

    // The pro schedule: each club's games and their state; a final score
    // is that club's result (the W-L inning) as soon as the game ends.
    const { rows: sched } = clubNames.length
      ? await query<SchedRow>(
        `SELECT game_pk::text AS game, (game_date::date - $2::date) AS day, status,
                home_team_name AS home, away_team_name AS away, home_score AS home_runs, away_score AS away_runs
           FROM team_schedules
          WHERE (home_team_name = ANY($1) OR away_team_name = ANY($1))
            AND game_date >= $2::date AND game_date < $2::date + $3::int`,
        [clubNames, start, weeks * 7],
      )
      : { rows: [] as SchedRow[] };
    const want = new Set(clubNames);
    const games: Record<string, [number, string, 0 | 1][]> = {};
    for (const r of sched) {
      for (const [club, mine, theirs] of [[r.home, r.home_runs, r.away_runs], [r.away, r.away_runs, r.home_runs]] as const) {
        if (!want.has(club)) continue;
        (games[club] ||= []).push([Number(r.day), r.game, isDone(r.status) ? 1 : 0]);
        if (isFinal(r.status) && mine !== null && theirs !== null && mine !== theirs) result(club, Number(r.day), r.game, mine > theirs);
      }
    }
    // The schedule decides whether a pro game is over: the 4-hourly game-log
    // sync stamps every line it saves "Final" with MLB's in-game isWin
    // (false until the game ends), so a line alone can call a game still
    // being played over, and lost.
    const schedState = new Map(sched.map((r) => [r.game, { done: isDone(r.status), final: isFinal(r.status) }]));
    for (const l of lines) {
      const st = schedState.get(String(l[5]));
      if (st) l[7] = st.done ? 1 : 0;
    }
    // Clubs off the pro schedule (Fall League ...): the result on the lines -
    // never for a scheduled game that isn't final yet.
    for (const r of clubRows) {
      const st = schedState.get(r.game);
      if (!st || st.final) result(r.team, Number(r.day), r.game, r.is_win);
    }

    return NextResponse.json(
      { asOf: new Date().toISOString(), start, weeks, roster, lines, clubs, games },
      { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=60' } },
    );
  } catch (error) {
    console.error('[bracket/live]', error);
    return NextResponse.json({ error: 'live lines unavailable' }, { status: 500 });
  }
}
