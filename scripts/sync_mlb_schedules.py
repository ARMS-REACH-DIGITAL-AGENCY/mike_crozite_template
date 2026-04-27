import os
from datetime import date, timedelta

import psycopg
import requests

DATABASE_URL = os.environ["DATABASE_URL"]

START_DATE = date.today() - timedelta(days=2)
END_DATE = date.today() + timedelta(days=14)

SCHEDULE_URL = (
    "https://statsapi.mlb.com/api/v1/schedule"
    f"?sportId=1&startDate={START_DATE}&endDate={END_DATE}"
)

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


def should_run_schedule_sync() -> bool:
    today = date.today()
    url = f"https://statsapi.mlb.com/api/v1/schedule?sportId=1&date={today}"

    res = requests.get(url, timeout=30)
    res.raise_for_status()
    payload = res.json()

    dates = payload.get("dates", [])
    if not dates:
        print("No games today -> skipping sync")
        return False

    games = dates[0].get("games", [])
    if not games:
        print("No games today -> skipping sync")
        return False

    for game in games:
        status = (game.get("status") or {}).get("detailedState")
        if status not in ("Final", "Game Over", "Completed Early"):
            return True

    print("All games finished -> skipping sync")
    return False


def fetch_schedule() -> list[dict]:
    res = requests.get(SCHEDULE_URL, timeout=60)
    res.raise_for_status()
    payload = res.json()

    rows: list[dict] = []

    for day in payload.get("dates", []):
        for game in day.get("games", []):
            teams = game.get("teams", {})
            home = teams.get("home", {})
            away = teams.get("away", {})
            venue = game.get("venue", {}) or {}
            status = game.get("status", {}) or {}

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
                    "sport_id": 1,
                    "level": "MLB",
                    "home_score": home.get("score"),
                    "away_score": away.get("score"),
                }
            )

    return rows


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


def refresh_flip_card_next_games(cur: psycopg.Cursor) -> int:
    """
    Refresh cached next-game display fields after the MLB schedule sync.

    Source of truth:
      public.v_player_next_game_resolved

    Target:
      public.flip_card_front_stage

    The view already resolves player -> current team -> next future game.
    This function only writes that resolved answer into the front-card cache.
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

    active_filter = ""
    if "status_label" in stage_cols:
        active_filter = "and lower(trim(coalesce(f.status_label, ''))) = 'active'"

    cur.execute(
        f"""
        update public.flip_card_front_stage f
        set {", ".join(set_clauses)}
        from public.v_player_next_game_resolved v
        where v.playerid::text = f.playerid::text
          and v.next_game_time_utc is not null
          and v.next_game_time_utc > now()
          {active_filter}
        """
    )

    refreshed = cur.rowcount or 0
    print(f"flip_card_front_stage next-game refresh complete: {refreshed} rows updated")
    return refreshed


def main() -> None:
    if not should_run_schedule_sync():
        return

    rows = fetch_schedule()
    print(f"Fetched {len(rows)} MLB games from {START_DATE} to {END_DATE}")

    with psycopg.connect(DATABASE_URL) as conn:
        with conn.cursor() as cur:
            for row in rows:
                cur.execute(UPSERT_SQL, row)

            print("team_schedules upsert complete")
            refresh_flip_card_next_games(cur)

        conn.commit()

    print("MLB schedule sync complete")


if __name__ == "__main__":
    main()
