import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";

export const runtime = "nodejs";
export const maxDuration = 120;
export const dynamic = "force-dynamic";

// Every-10-minute live schedule refresh: pulls MLB/MiLB games for AZ
// yesterday/today/tomorrow into team_schedules, writes each pro alum's
// live or next game onto flip_card_front_stage, and expires stale ones.
//
// This is scripts/refresh_live_schedule_status.py moved onto Vercel Cron.
// GitHub Actions ran that workflow's "*/10" schedule only every 3-5 hours
// (scheduled workflows are best-effort), so "In Progress" on the flip card
// could be hours stale. The SQL below is the Python job's, verbatim; keep
// the two in step while the GitHub workflow remains as a manual fallback.

// Mutates team_schedules and flip_card_front_stage, so it uses the writer
// connection like the other cron routes.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const SCHEDULE_URL = "https://statsapi.mlb.com/api/v1/schedule";
const AZ_TZ = "America/Phoenix";

const SPORT_LEVELS: Record<number, string> = {
  1: "MLB",
  11: "TRIPLE-A",
  12: "DOUBLE-A",
  13: "HIGH-A",
  14: "LOW-A",
  16: "ROOKIE",
};

function isAuthorized(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  const bearer = req.headers.get("authorization") || "";
  return Boolean(expected && bearer === `Bearer ${expected}`);
}

function azNow(): { isoDate: string; dow: number; time: string } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: AZ_TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date())
      .map((p) => [p.type, p.value])
  );
  const dow = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.weekday);
  return {
    isoDate: `${parts.year}-${parts.month}-${parts.day}`,
    dow,
    time: `${parts.hour}:${parts.minute}:${parts.second}`,
  };
}

function addDays(isoDate: string, delta: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

// Same gate as should_run_now(): schedule_polling_windows_2026 holds each
// AZ weekday's polling window (possibly overnight, e.g. 08:30 -> 00:10).
async function insidePollingWindow(): Promise<{ inside: boolean; detail: string }> {
  const now = azNow();
  const { rows } = await pool.query(
    `select polling_start_az::text as start, polling_stop_az::text as stop, active
       from public.schedule_polling_windows_2026
      where az_dow = $1`,
    [now.dow]
  );
  const row = rows[0];
  if (!row) return { inside: false, detail: `no polling window for AZ dow=${now.dow}` };
  if (!row.active) return { inside: false, detail: `polling window inactive for AZ dow=${now.dow}` };
  const start = String(row.start).slice(0, 8);
  const stop = String(row.stop).slice(0, 8);
  const inside = start <= stop ? start <= now.time && now.time <= stop : now.time >= start || now.time <= stop;
  return { inside, detail: `AZ ${now.isoDate} ${now.time} dow=${now.dow} window=${start}..${stop}` };
}

type ScheduleRow = {
  game_pk: number;
  game_date: string | null;
  game_time_utc: string | null;
  status: string | null;
  home_team_id: number | null;
  home_team_name: string | null;
  away_team_id: number | null;
  away_team_name: string | null;
  venue_name: string | null;
  sport_id: number;
  level: string | null;
  home_score: number | null;
  away_score: number | null;
};

async function fetchLiveWindow(): Promise<{ rows: ScheduleRow[]; warnings: string[] }> {
  const today = azNow().isoDate;
  const startDate = addDays(today, -1);
  const endDate = addDays(today, 1);
  const byGamePk = new Map<number, ScheduleRow>();
  const warnings: string[] = [];

  await Promise.all(
    Object.keys(SPORT_LEVELS).map(async (key) => {
      const sportId = Number(key);
      try {
        const url = `${SCHEDULE_URL}?sportId=${sportId}&startDate=${startDate}&endDate=${endDate}`;
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const payload = (await res.json()) as { dates?: { date?: string; games?: any[] }[] };
        for (const day of payload.dates ?? []) {
          for (const game of day.games ?? []) {
            if (game?.gamePk == null) continue;
            const home = game.teams?.home ?? {};
            const away = game.teams?.away ?? {};
            const resolvedSportId = Number(game.sport?.id ?? sportId);
            byGamePk.set(Number(game.gamePk), {
              game_pk: Number(game.gamePk),
              game_date: day.date ?? null,
              game_time_utc: game.gameDate ?? null,
              status: game.status?.detailedState ?? null,
              home_team_id: home.team?.id ?? null,
              home_team_name: home.team?.name ?? null,
              away_team_id: away.team?.id ?? null,
              away_team_name: away.team?.name ?? null,
              venue_name: game.venue?.name ?? null,
              sport_id: resolvedSportId,
              level: SPORT_LEVELS[resolvedSportId] ?? SPORT_LEVELS[sportId] ?? null,
              home_score: home.score ?? null,
              away_score: away.score ?? null,
            });
          }
        }
      } catch (error) {
        warnings.push(`sportId=${sportId}: ${error instanceof Error ? error.message : String(error)}`);
      }
    })
  );

  return { rows: [...byGamePk.values()], warnings };
}

// One statement for the whole window instead of a round trip per game.
async function upsertTeamSchedules(rows: ScheduleRow[]): Promise<number> {
  if (rows.length === 0) return 0;
  const result = await pool.query(
    `insert into public.team_schedules (
         game_pk, game_date, game_time_utc, status,
         home_team_id, home_team_name, away_team_id, away_team_name,
         venue_name, sport_id, level, home_score, away_score,
         created_at, updated_at
       )
       select r.game_pk, r.game_date::date, r.game_time_utc::timestamptz, r.status,
              r.home_team_id, r.home_team_name, r.away_team_id, r.away_team_name,
              r.venue_name, r.sport_id, r.level, r.home_score, r.away_score,
              now(), now()
         from jsonb_to_recordset($1::jsonb) as r(
           game_pk bigint, game_date text, game_time_utc text, status text,
           home_team_id bigint, home_team_name text, away_team_id bigint, away_team_name text,
           venue_name text, sport_id int, level text, home_score int, away_score int
         )
     on conflict (game_pk) do update set
         game_date = excluded.game_date,
         game_time_utc = excluded.game_time_utc,
         status = excluded.status,
         home_team_id = excluded.home_team_id,
         home_team_name = excluded.home_team_name,
         away_team_id = excluded.away_team_id,
         away_team_name = excluded.away_team_name,
         venue_name = excluded.venue_name,
         sport_id = excluded.sport_id,
         level = excluded.level,
         home_score = excluded.home_score,
         away_score = excluded.away_score,
         updated_at = now()`,
    [JSON.stringify(rows)]
  );
  return result.rowCount ?? 0;
}

const REFRESH_NEXT_GAMES_SQL = `
            with eligible_players as (
              select
                f.ctid as row_id,
                f.playerid,
                f.current_team_name
              from public.flip_card_front_stage f
            where lower(trim(coalesce(f.status_label, ''))) not in (
              'retired',
              'not active',
              'free agent'
            )
                and upper(trim(coalesce(f.level_label, ''))) in (
  'MLB',
  'AAA',
  'TRIPLE-A',
  'AA',
  'DOUBLE-A',
  'HIGH-A',
  'A+',
  'A',
  'LOW-A',
  'ROOKIE',
  'ACL',
  'FCL'
)
                and f.current_team_name is not null
                and trim(f.current_team_name) <> ''
                and f.current_team_name <> '--'
            ),

            resolved_next_games as (
              select
                ep.row_id,
                ep.playerid,
                ng.game_time_utc,
                ng.schedule_status,
                ng.home_away,
                ng.opponent
              from eligible_players ep
              join lateral (
                select
                  ts.game_time_utc,
                  ts.status as schedule_status,

                  case
                    when lower(trim(ts.away_team_name)) = lower(trim(ep.current_team_name)) then '@'
                    else 'vs.'
                  end as home_away,

                  case
                    when lower(trim(ts.away_team_name)) = lower(trim(ep.current_team_name)) then ts.home_team_name
                    else ts.away_team_name
                  end as opponent,

                  case
                    when lower(trim(coalesce(ts.status, ''))) = 'in progress' then 1
                    when lower(trim(coalesce(ts.status, ''))) = 'pre-game' then 2
                    when lower(trim(coalesce(ts.status, ''))) in (
                      'delayed',
                      'warmup',
                      'manager challenge',
                      'review'
                    ) then 3
                    when lower(trim(coalesce(ts.status, ''))) = 'scheduled' then 4
                    else 9
                  end as status_priority

                from public.team_schedules ts

                where (
                      lower(trim(ts.home_team_name)) = lower(trim(ep.current_team_name))
                   or lower(trim(ts.away_team_name)) = lower(trim(ep.current_team_name))
                )

                  -- Final games are not displayed on the flip-card front.
                  -- Final means move forward to the next relevant game.
                  and lower(trim(coalesce(ts.status, ''))) not in (
                    'final',
                    'game over',
                    'completed early'
                  )

                  -- Status is the primary driver.
                  -- Scheduled games still need future time so old scheduled rows do not get picked.
                  and (
                    lower(trim(coalesce(ts.status, ''))) in (
                      'pre-game',
                      'in progress',
                      'delayed',
                      'warmup',
                      'manager challenge',
                      'review'
                    )
                    or (
                      lower(trim(coalesce(ts.status, ''))) = 'scheduled'
                      and ts.game_time_utc > now()
                    )
                  )

                order by
                  status_priority asc,
                  ts.game_time_utc asc

                limit 1
              ) ng on true
            )

            update public.flip_card_front_stage f
            set
              next_game_date = case
                when (rng.game_time_utc at time zone coalesce(f.school_timezone, 'America/Phoenix'))::date =
                     (now() at time zone coalesce(f.school_timezone, 'America/Phoenix'))::date
                then 'TODAY | ' || to_char(
                  rng.game_time_utc at time zone coalesce(f.school_timezone, 'America/Phoenix'),
                  'FMMonth DD, YYYY'
                )
                else to_char(
                  rng.game_time_utc at time zone coalesce(f.school_timezone, 'America/Phoenix'),
                  'FMDay | FMMonth DD, YYYY'
                )
              end,

              next_game_time_local = to_char(
                rng.game_time_utc at time zone coalesce(f.school_timezone, 'America/Phoenix'),
                'FMHH12:MI AM'
              ),

              next_game_time_utc = rng.game_time_utc,
              next_game_home_away = rng.home_away,
              next_game_opponent = rng.opponent,

              next_game_status_label = case
                  when lower(trim(coalesce(rng.schedule_status, ''))) = 'scheduled'
                    then 'NEXT GAME'
                  when lower(trim(coalesce(rng.schedule_status, ''))) in (
                    'pre-game',
                    'in progress',
                    'delayed',
                    'warmup',
                    'manager challenge',
                    'review'
                  )
                    then rng.schedule_status
                  else 'NEXT GAME'
                end,

                stage_updated_at = now()

            from resolved_next_games rng
            where f.ctid = rng.row_id;`;

const EXPIRE_STALE_NEXT_GAMES_SQL = `
            update public.flip_card_front_stage
            set
              next_game_date = null,
              next_game_time_local = null,
              next_game_time_utc = null,
              next_game_home_away = null,
              next_game_opponent = null,
              next_game_status_label = null,
              stage_updated_at = now()
            where next_game_time_utc is not null
              and (
                -- A scheduled game whose start time has passed and that
                -- the refresh above didn't replace (it only picks future
                -- scheduled games) is stale.
                (
                  next_game_time_utc < now()
                  and upper(trim(coalesce(next_game_status_label, 'NEXT GAME'))) = 'NEXT GAME'
                )
                -- A live label (In Progress, Pre-Game, Delayed, ...) always
                -- has a start time in the past - that's what makes it live -
                -- so it only expires once no game could still be going.
                or next_game_time_utc < now() - interval '8 hours'
                -- ...or as soon as that game is final (e.g. a season finale,
                -- where the refresh above has no later game to replace it).
                or exists (
                  select 1
                  from public.team_schedules ts
                  where ts.game_time_utc = flip_card_front_stage.next_game_time_utc
                    and lower(trim(flip_card_front_stage.current_team_name)) in (
                      lower(trim(ts.home_team_name)),
                      lower(trim(ts.away_team_name))
                    )
                    and lower(trim(coalesce(ts.status, ''))) in ('final', 'game over', 'completed early')
                )
              );`;

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  try {
    const gate = await insidePollingWindow();
    if (!gate.inside) {
      return NextResponse.json({ ok: true, skipped: true, reason: gate.detail });
    }

    const { rows, warnings } = await fetchLiveWindow();
    const upserted = await upsertTeamSchedules(rows);
    const refreshed = await pool.query(REFRESH_NEXT_GAMES_SQL);
    const expired = await pool.query(EXPIRE_STALE_NEXT_GAMES_SQL);

    const summary = {
      ok: true,
      window: gate.detail,
      gamesUpserted: upserted,
      nextGamesRefreshed: refreshed.rowCount ?? 0,
      staleNextGamesExpired: expired.rowCount ?? 0,
      warnings,
    };
    console.log("[live-schedule-refresh]", JSON.stringify(summary));
    return NextResponse.json(summary);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[live-schedule-refresh] failed", { message });
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
