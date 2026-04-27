import os
from datetime import date, datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

import psycopg
import requests


DATABASE_URL = os.environ["DATABASE_URL"]

API_BASE_URL = "https://statsapi.mlb.com/api/v1/schedule"

AZ_TZ = ZoneInfo("America/Phoenix")

PRO_SPORT_IDS = [1, 11, 12, 13, 14, 16]

SPORT_LEVELS = {
    1: "MLB",
    11: "TRIPLE-A",
    12: "DOUBLE-A",
    13: "HIGH-A",
    14: "LOW-A",
    16: "ROOKIE",
}

LIVE_STATUSES = {
    "pre-game",
    "in progress",
    "delayed",
    "warmup",
    "manager challenge",
    "review",
}

FINAL_STATUSES = {
    "final",
    "game over",
    "completed early",
}

PRO_LEVELS_SQL = """
(
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
"""

UPSERT_SQL = """
insert into public.team_schedules (
    game_pk,
    game_date,
    game_time_utc,
    status,
    home_team_id,
    home_team_name,
    away_team_id,
    away_team_name,
    venue_name,
    sport_id,
    level,
    home_score,
    away_score,
    created_at,
    updated_at
)
values (
    %(game_pk)s,
    %(game_date)s,
    %(game_time_utc)s,
    %(status)s,
    %(home_team_id)s,
    %(home_team_name)s,
    %(away_team_id)s,
    %(away_team_name)s,
    %(venue_name)s,
    %(sport_id)s,
    %(level)s,
    %(home_score)s,
    %(away_score)s,
    now(),
    now()
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
    updated_at = now();
"""


def current_az_datetime() -> datetime:
    return datetime.now(AZ_TZ)


def should_run_now(conn: psycopg.Connection) -> bool:
    """
    Gate the every-10-minute workflow.

    The workflow wakes up every 10 minutes, but this function decides whether
    the current Arizona time is inside the live polling window for that AZ weekday.
    """
    now_az = current_az_datetime()
    az_dow = int(now_az.strftime("%w"))  # Sunday=0, Monday=1, etc.
    az_time = now_az.time()

    with conn.cursor() as cur:
        cur.execute(
            """
            select
              polling_start_az,
              polling_stop_az,
              active
            from public.schedule_polling_windows_2026
            where az_dow = %s
            """,
            (az_dow,),
        )
        row = cur.fetchone()

    if not row:
        print(f"No polling window found for AZ dow={az_dow}; exiting.")
        return False

    polling_start, polling_stop, active = row

    if not active:
        print(f"Polling window inactive for AZ dow={az_dow}; exiting.")
        return False

    # Normal same-day window, e.g. 08:30 -> 23:50
    if polling_start <= polling_stop:
        inside_window = polling_start <= az_time <= polling_stop

    # Overnight window, e.g. 08:30 -> 00:10
    else:
        inside_window = az_time >= polling_start or az_time <= polling_stop

    print(
        f"AZ now={now_az.isoformat()} "
        f"dow={az_dow} "
        f"window={polling_start}..{polling_stop} "
        f"inside_window={inside_window}"
    )

    return inside_window


def parse_schedule_payload(payload: dict[str, Any], requested_sport_id: int) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []

    for day in payload.get("dates", []):
        for game in day.get("games", []):
            teams = game.get("teams", {}) or {}
            home = teams.get("home", {}) or {}
            away = teams.get("away", {}) or {}
            venue = game.get("venue", {}) or {}
            status = game.get("status", {}) or {}
            sport = game.get("sport", {}) or {}

            resolved_sport_id = sport.get("id") or requested_sport_id

            rows.append(
                {
                    "game_pk": game.get("gamePk"),
                    "game_date": day.get("date"),
                    "game_time_utc": game.get("gameDate"),
                    "status": status.get("detailedState"),
                    "home_team_id": (home.get("team") or {}).get("id"),
                    "home_team_name": (home.get("team") or {}).get("name"),
                    "away_team_id": (away.get("team") or {}).get("id"),
                    "away_team_name": (away.get("team") or {}).get("name"),
                    "venue_name": venue.get("name"),
                    "sport_id": resolved_sport_id,
                    "level": SPORT_LEVELS.get(int(resolved_sport_id), SPORT_LEVELS.get(requested_sport_id)),
                    "home_score": home.get("score"),
                    "away_score": away.get("score"),
                }
            )

    return rows


def fetch_sport_schedule(
    session: requests.Session,
    sport_id: int,
    start_date: date,
    end_date: date,
) -> list[dict[str, Any]]:
    params = {
        "sportId": str(sport_id),
        "startDate": start_date.isoformat(),
        "endDate": end_date.isoformat(),
    }

    res = session.get(API_BASE_URL, params=params, timeout=90)
    res.raise_for_status()

    return parse_schedule_payload(res.json(), sport_id)


def fetch_live_window_schedule() -> list[dict[str, Any]]:
    """
    Fetch a small rolling date window, not the full season.

    We use AZ date as the operating day, and pull yesterday/today/tomorrow
    to catch late games, in-progress games, and next-game transitions.
    """
    now_az = current_az_datetime()
    start_date = now_az.date() - timedelta(days=1)
    end_date = now_az.date() + timedelta(days=1)

    session = requests.Session()
    all_rows_by_game_pk: dict[int, dict[str, Any]] = {}

    print(f"Fetching live schedule window: {start_date} to {end_date}")

    for sport_id in PRO_SPORT_IDS:
        level = SPORT_LEVELS.get(sport_id, str(sport_id))

        try:
            rows = fetch_sport_schedule(session, sport_id, start_date, end_date)
        except Exception as exc:
            print(f"WARNING: fetch failed for sportId={sport_id} level={level}: {exc}")
            continue

        for row in rows:
            game_pk = row.get("game_pk")
            if game_pk is None:
                continue
            all_rows_by_game_pk[int(game_pk)] = row

        print(f"Fetched {len(rows)} {level} rows in live window")

    return list(all_rows_by_game_pk.values())


def upsert_team_schedules(conn: psycopg.Connection, rows: list[dict[str, Any]]) -> int:
    with conn.cursor() as cur:
        for row in rows:
            cur.execute(UPSERT_SQL, row)

    conn.commit()
    print(f"team_schedules live upsert complete: {len(rows)} unique games")
    return len(rows)


def refresh_flip_card_next_games(conn: psycopg.Connection) -> int:
    """
    Status-driven next-game refresh.

    Scheduled   -> NEXT GAME
    Pre-Game    -> Pre-Game
    In Progress -> In Progress
    Final       -> ignored; choose next non-final game

    Date display:
      Today -> TODAY | April 27, 2026
      Other -> Monday | April 27, 2026
    """
    with conn.cursor() as cur:
        cur.execute(
            f"""
            with eligible_players as (
              select
                f.ctid as row_id,
                f.playerid,
                f.current_team_name
              from public.flip_card_front_stage f
              where lower(trim(coalesce(f.status_label, ''))) = 'active'
                and upper(trim(coalesce(f.level_label, ''))) in {PRO_LEVELS_SQL}
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
                when (rng.game_time_utc at time zone 'America/Phoenix')::date =
                     (now() at time zone 'America/Phoenix')::date
                then 'TODAY | ' || to_char(
                  rng.game_time_utc at time zone 'America/Phoenix',
                  'FMMonth DD, YYYY'
                )
                else to_char(
                  rng.game_time_utc at time zone 'America/Phoenix',
                  'FMDay | FMMonth DD, YYYY'
                )
              end,

              next_game_time_local = to_char(
                rng.game_time_utc at time zone 'America/Phoenix',
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

              next_game_time_zone = 'MST',
              stage_updated_at = now()

            from resolved_next_games rng
            where f.ctid = rng.row_id;
            """
        )

        updated = cur.rowcount or 0

    conn.commit()
    print(f"flip_card_front_stage live next-game refresh complete: {updated} rows updated")
    return updated


def main() -> None:
    print("=== MLB/MiLB live schedule refresh ===")

    with psycopg.connect(DATABASE_URL) as conn:
        if not should_run_now(conn):
            print("Outside live polling window. No work performed.")
            return

        rows = fetch_live_window_schedule()
        upsert_team_schedules(conn, rows)
        refresh_flip_card_next_games(conn)

    print("Live schedule refresh complete")


if __name__ == "__main__":
    main()
