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
                    "sport_id": ((game.get("gameType") and 1) or 1),
                    "level": "MLB",
                    "home_score": home.get("score"),
                    "away_score": away.get("score"),
                }
            )

    return rows

def main() -> None:
    rows = fetch_schedule()
    print(f"Fetched {len(rows)} MLB games from {START_DATE} to {END_DATE}")

    with psycopg.connect(DATABASE_URL) as conn:
        with conn.cursor() as cur:
            for row in rows:
                cur.execute(UPSERT_SQL, row)
        conn.commit()

    print("team_schedules upsert complete")

if __name__ == "__main__":
    main()
