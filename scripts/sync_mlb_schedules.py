import os
from datetime import date, timedelta
from typing import Any

import psycopg
import requests

DATABASE_URL = os.environ["DATABASE_URL"]

# Full MLB/MiLB season schedule ingest.
# This intentionally does not depend on a team mapping table. It fetches every
# game returned by the MLB Stats API for each pro baseball sportId.
SCHEDULE_SEASON = int(os.environ.get("SCHEDULE_SEASON", "2026"))
START_DATE = date.fromisoformat(os.environ.get("SCHEDULE_START_DATE", f"{SCHEDULE_SEASON}-02-01"))
END_DATE = date.fromisoformat(os.environ.get("SCHEDULE_END_DATE", f"{SCHEDULE_SEASON}-11-30"))

API_BASE_URL = "https://statsapi.mlb.com/api/v1/schedule"
PRO_SPORT_IDS = [1, 11, 12, 13, 14, 16]
SPORT_LEVELS = {
    1: "MLB",
    11: "TRIPLE-A",
    12: "DOUBLE-A",
    13: "HIGH-A",
    14: "LOW-A",
    16: "ROOKIE",
}

UPSERT_SQL = """
INSERT INTO team_schedules (
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
VALUES (
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
    NOW(),
    NOW()
)
ON CONFLICT (game_pk) DO UPDATE SET
    game_date = EXCLUDED.game_date,
    game_time_utc = EXCLUDED.game_time_utc,
    status = EXCLUDED.status,
    home_team_id = EXCLUDED.home_team_id,
    home_team_name = EXCLUDED.home_team_name,
    away_team_id = EXCLUDED.away_team_id,
    away_team_name = EXCLUDED.away_team_name,
    venue_name = EXCLUDED.venue_name,
    sport_id = EXCLUDED.sport_id,
    level = EXCLUDED.level,
    home_score = EXCLUDED.home_score,
    away_score = EXCLUDED.away_score,
    updated_at = NOW();
"""


def month_windows(start_date: date, end_date: date) -> list[tuple[date, date]]:
    windows: list[tuple[date, date]] = []
    current = start_date

    while current <= end_date:
        if current.month == 12:
            next_month = date(current.year + 1, 1, 1)
        else:
            next_month = date(current.year, current.month + 1, 1)

        window_end = min(end_date, next_month - timedelta(days=1))
        windows.append((current, window_end))
        current = window_end + timedelta(days=1)

    return windows


def get_table_columns(cur: psycopg.Cursor, table_name: str) -> set[str]:
    cur.execute(
        """
        select column_name
        from information_schema.columns
        where table_schema = 'public'
          and table_name = %s
        """,
        (table_name,),
    )
    return {row[0] for row in cur.fetchall()}


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


def fetch_complete_pro_schedule() -> list[dict[str, Any]]:
    session = requests.Session()
    all_rows_by_game_pk: dict[int, dict[str, Any]] = {}

    windows = month_windows(START_DATE, END_DATE)
    print(
        f"Fetching complete pro schedule by sportId for {START_DATE} to {END_DATE}: "
        f"sportIds={PRO_SPORT_IDS}"
    )

    for sport_id in PRO_SPORT_IDS:
        level = SPORT_LEVELS.get(sport_id, str(sport_id))
        sport_count_before = len(all_rows_by_game_pk)

        for window_start, window_end in windows:
            try:
                rows = fetch_sport_schedule(session, sport_id, window_start, window_end)
            except Exception as exc:
                print(
                    f"WARNING: schedule fetch failed for sportId={sport_id} "
                    f"{window_start} to {window_end}: {exc}"
                )
                continue

            for row in rows:
                game_pk = row.get("game_pk")
                if game_pk is None:
                    continue
                all_rows_by_game_pk[int(game_pk)] = row

        sport_total = len(all_rows_by_game_pk) - sport_count_before
        print(f"Fetched {sport_total} unique {level} games")

    return list(all_rows_by_game_pk.values())


def refresh_flip_card_next_games(cur: psycopg.Cursor) -> int:
    """
    Write the next game directly into flip_card_front_stage.

    Status-driven rules:
      Scheduled   -> NEXT GAME
      Pre-Game    -> Pre-Game
      In Progress -> In Progress
      Final       -> skip and move to next non-final game

    Date display:
      Today -> TODAY | April 27, 2026
      Other -> Monday | April 27, 2026
    """
    stage_cols = get_table_columns(cur, "flip_card_front_stage")
    schedule_cols = get_table_columns(cur, "team_schedules")

    required_stage = {"playerid", "current_team_name"}
    required_schedule = {"game_time_utc", "home_team_name", "away_team_name", "status"}

    missing_stage = required_stage - stage_cols
    missing_schedule = required_schedule - schedule_cols

    if missing_stage:
        print(f"Skipping next-game refresh: flip_card_front_stage missing {sorted(missing_stage)}")
        return 0

    if missing_schedule:
        print(f"Skipping next-game refresh: team_schedules missing {sorted(missing_schedule)}")
        return 0

    set_clauses: list[str] = []

    if "next_game_date" in stage_cols:
        set_clauses.append(
            """
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
            end
            """
        )

    if "next_game_time_local" in stage_cols:
        set_clauses.append(
            """
            next_game_time_local = to_char(
              rng.game_time_utc at time zone 'America/Phoenix',
              'FMHH12:MI AM'
            )
            """
        )

    if "next_game_time_utc" in stage_cols:
        set_clauses.append("next_game_time_utc = rng.game_time_utc")

    if "next_game_home_away" in stage_cols:
        set_clauses.append("next_game_home_away = rng.home_away")

    if "next_game_opponent" in stage_cols:
        set_clauses.append("next_game_opponent = rng.opponent")

    if "next_game_status_label" in stage_cols:
        set_clauses.append(
            """
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
            end
            """
        )

    if "next_game_time_zone" in stage_cols:
        set_clauses.append("next_game_time_zone = 'MST'")

    if "stage_updated_at" in stage_cols:
        set_clauses.append("stage_updated_at = now()")

    if not set_clauses:
        print("Skipping next-game refresh: no compatible flip_card_front_stage next-game columns found")
        return 0

    status_filter = ""
    if "status_label" in stage_cols:
        status_filter = "and lower(trim(coalesce(f.status_label, ''))) = 'active'"

    level_filter = ""
    if "level_label" in stage_cols:
        level_filter = """
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
        """

    cur.execute(
        f"""
        with eligible_players as (
          select
            f.ctid as row_id,
            f.playerid,
            f.current_team_name
          from public.flip_card_front_stage f
          where f.current_team_name is not null
            and trim(f.current_team_name) <> ''
            and f.current_team_name <> '--'
            {status_filter}
            {level_filter}
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

              and lower(trim(coalesce(ts.status, ''))) not in (
                'final',
                'game over',
                'completed early'
              )

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
        set {", ".join(set_clauses)}
        from resolved_next_games rng
        where f.ctid = rng.row_id
        """
    )

    refreshed = cur.rowcount or 0
    print(f"flip_card_front_stage next-game refresh complete: {refreshed} rows updated")
    return refreshed


def main() -> None:
    rows = fetch_complete_pro_schedule()
    print(f"Fetched {len(rows)} unique MLB/MiLB games from {START_DATE} to {END_DATE}")

    with psycopg.connect(DATABASE_URL) as conn:
        with conn.cursor() as cur:
            for row in rows:
                cur.execute(UPSERT_SQL, row)

            print("team_schedules upsert complete")
            refresh_flip_card_next_games(cur)

        conn.commit()

    print("Complete MLB/MiLB schedule sync complete")


if __name__ == "__main__":
    main()
