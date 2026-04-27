import os
from datetime import date, timedelta
from typing import Any

import psycopg
import requests

DATABASE_URL = os.environ["DATABASE_URL"]

START_DATE = date.today() - timedelta(days=2)
END_DATE = date.today() + timedelta(days=14)

API_BASE_URL = "https://statsapi.mlb.com/api/v1/schedule"

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


def load_schedule_team_targets(cur: psycopg.Cursor) -> list[dict[str, Any]]:
    """
    Load all pro organization schedule targets from public.teams.

    This is intentionally not MLB-only. It uses each team's MLB Stats API id,
    including MLB and affiliated minor-league clubs, so team_schedules stays
    organization-wide.
    """
    teams_cols = get_table_columns(cur, "teams")

    if "mlb_stats_api_id" not in teams_cols:
        raise RuntimeError("public.teams is missing required mlb_stats_api_id column")

    optional_cols = [col for col in ["team_name", "level"] if col in teams_cols]
    select_cols = ["mlb_stats_api_id", *optional_cols]

    cur.execute(
        f"""
        select {", ".join(select_cols)}
        from public.teams
        where mlb_stats_api_id is not null
          and trim(mlb_stats_api_id::text) <> ''
          and mlb_stats_api_id::text ~ '^[0-9]+$'
        order by mlb_stats_api_id::int
        """
    )

    targets: list[dict[str, Any]] = []
    for db_row in cur.fetchall():
        row = dict(zip(select_cols, db_row))
        targets.append(
            {
                "team_id": int(row["mlb_stats_api_id"]),
                "team_name": row.get("team_name"),
                "level": row.get("level"),
            }
        )

    return targets


def fetch_team_schedule(session: requests.Session, team_id: int, fallback_level: str | None = None) -> list[dict[str, Any]]:
    params = {
        "teamId": str(team_id),
        "startDate": START_DATE.isoformat(),
        "endDate": END_DATE.isoformat(),
    }

    res = session.get(API_BASE_URL, params=params, timeout=60)
    res.raise_for_status()
    payload = res.json()

    rows: list[dict[str, Any]] = []

    for day in payload.get("dates", []):
        for game in day.get("games", []):
            teams = game.get("teams", {}) or {}
            home = teams.get("home", {}) or {}
            away = teams.get("away", {}) or {}
            venue = game.get("venue", {}) or {}
            status = game.get("status", {}) or {}
            sport = game.get("sport", {}) or {}

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
                    "sport_id": sport.get("id"),
                    "level": fallback_level,
                    "home_score": home.get("score"),
                    "away_score": away.get("score"),
                }
            )

    return rows


def fetch_org_schedule(targets: list[dict[str, Any]]) -> list[dict[str, Any]]:
    session = requests.Session()
    all_rows_by_game_pk: dict[int, dict[str, Any]] = {}

    for index, target in enumerate(targets, start=1):
        team_id = target["team_id"]
        level = target.get("level")

        try:
            rows = fetch_team_schedule(session, team_id, level)
        except Exception as exc:
            print(f"WARNING: schedule fetch failed for team_id={team_id}: {exc}")
            continue

        for row in rows:
            game_pk = row.get("game_pk")
            if game_pk is None:
                continue
            all_rows_by_game_pk[int(game_pk)] = row

        if index % 50 == 0:
            print(f"Fetched schedules for {index}/{len(targets)} teams; unique games={len(all_rows_by_game_pk)}")

    return list(all_rows_by_game_pk.values())


def refresh_flip_card_next_games(cur: psycopg.Cursor) -> int:
    """
    Refresh cached next-game fields after the full org schedule sync.

    Source of truth:
      public.v_player_next_game_resolved

    Target:
      public.flip_card_front_stage
    """
    stage_cols = get_table_columns(cur, "flip_card_front_stage")
    view_cols = get_table_columns(cur, "v_player_next_game_resolved")

    required_stage = {"playerid"}
    required_view = {"playerid", "next_game_time_utc"}

    missing_stage = required_stage - stage_cols
    missing_view = required_view - view_cols

    if missing_stage:
        print(f"Skipping next-game refresh: flip_card_front_stage missing {sorted(missing_stage)}")
        return 0

    if missing_view:
        print(f"Skipping next-game refresh: v_player_next_game_resolved missing {sorted(missing_view)}")
        return 0

    set_clauses: list[str] = []

    if "next_game_date" in stage_cols and {"next_game_date", "next_game_time_local"} <= view_cols:
        set_clauses.append(
            """
            next_game_date = concat_ws(
                ' ',
                nullif(v.next_game_date::text, ''),
                nullif(v.next_game_time_local::text, '')
            )
            """
        )
    elif "next_game_date" in stage_cols and "next_game_date" in view_cols:
        set_clauses.append("next_game_date = nullif(v.next_game_date::text, '')")

    if "next_game_home_away" in stage_cols and "next_game_home_away" in view_cols:
        set_clauses.append("next_game_home_away = nullif(v.next_game_home_away::text, '')")

    if "next_game_opponent" in stage_cols and "next_game_opponent" in view_cols:
        set_clauses.append("next_game_opponent = nullif(v.next_game_opponent::text, '')")

    if "current_team_name" in stage_cols and "current_team_name" in view_cols:
        set_clauses.append(
            "current_team_name = coalesce(nullif(f.current_team_name, ''), nullif(v.current_team_name::text, ''))"
        )

    if "current_team_level" in stage_cols and "current_level" in view_cols:
        set_clauses.append(
            "current_team_level = coalesce(nullif(f.current_team_level, ''), nullif(v.current_level::text, ''))"
        )

    if "stage_updated_at" in stage_cols:
        set_clauses.append("stage_updated_at = now()")

    if not set_clauses:
        print("Skipping next-game refresh: no compatible target columns found")
        return 0

    retired_filter = ""
    if "status_label" in stage_cols:
        retired_filter = "and lower(trim(coalesce(f.status_label, ''))) <> 'retired'"

    cur.execute(
        f"""
        update public.flip_card_front_stage f
        set {", ".join(set_clauses)}
        from public.v_player_next_game_resolved v
        where v.playerid::text = f.playerid::text
          and v.next_game_time_utc is not null
          and v.next_game_time_utc > now()
          {retired_filter}
        """
    )

    refreshed = cur.rowcount or 0
    print(f"flip_card_front_stage next-game refresh complete: {refreshed} rows updated")
    return refreshed


def main() -> None:
    with psycopg.connect(DATABASE_URL) as conn:
        with conn.cursor() as cur:
            targets = load_schedule_team_targets(cur)
            print(f"Loaded {len(targets)} schedule team targets from public.teams")

        rows = fetch_org_schedule(targets)
        print(f"Fetched {len(rows)} unique pro org games from {START_DATE} to {END_DATE}")

        with conn.cursor() as cur:
            for row in rows:
                cur.execute(UPSERT_SQL, row)

            print("team_schedules upsert complete")
            refresh_flip_card_next_games(cur)

        conn.commit()

    print("Full pro org schedule sync complete")


if __name__ == "__main__":
    main()
