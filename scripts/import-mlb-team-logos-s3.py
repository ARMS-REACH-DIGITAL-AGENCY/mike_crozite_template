#!/usr/bin/env python3
"""Save official MLB and minor league team logos to S3 for the pro teams our
players played for.

For every pro team (MLB, Triple-A down to Rookie, and the older "PRO"
teams) that appears in a player's season stats, find that team's MLB Stats
API id and save its official logo as teams/{teamid}.png - the same key the
hand-uploaded logos use. The hourly Build Web Cutouts job then makes the
small teams-web/{teamid}.webp the site loads, like every other logo.

Matching a TBC team id to an MLB id, exact names only:
1. tbc_to_mlb_team_map rows with match_score = 1 (the table also holds
   fuzzy guesses, e.g. an independent team matched to a Triple-A club; those
   are ignored).
2. Otherwise the team's name, compared letters-and-digits only, against
   every affiliated team the Stats API lists for each season from 1990 on.
   A name used by more than one team id resolves to the most recent one.

Logos: https://www.mlbstatic.com/team-logos/{id}.svg (transparent), drawn
to an 800px-wide PNG; the midfield.mlbstatic.com PNG is the fallback.

A team that already has any file in teams/ is left alone, so hand-uploaded
logos are never replaced.

Environment:
- DATABASE_URL (required)
- YATSTATS_S3_BUCKET: default yatstats-assets
- AWS_REGION / AWS_DEFAULT_REGION: default us-west-2
- DRY_RUN: true/false, default true (match and download, but don't upload)
- MAX_TEAMS: optional limit for testing
- ONLY_TEAMIDS: optional comma-separated TBC team ids
- REPORT_PATH: default team-logo-report.csv
"""

from __future__ import annotations

import csv
import io
import os
import re
import sys
import time
from datetime import date

import boto3
import cairosvg
import psycopg
import requests
from PIL import Image

BUCKET = os.environ.get("YATSTATS_S3_BUCKET", "yatstats-assets")
REGION = os.environ.get("AWS_REGION") or os.environ.get("AWS_DEFAULT_REGION") or "us-west-2"
DRY_RUN = os.environ.get("DRY_RUN", "true").strip().lower() != "false"
MAX_TEAMS = int(os.environ.get("MAX_TEAMS") or 0)
ONLY_TEAMIDS = {t.strip() for t in (os.environ.get("ONLY_TEAMIDS") or "").split(",") if t.strip()}
REPORT_PATH = os.environ.get("REPORT_PATH", "team-logo-report.csv")

PRO_LEVELS = ("PRO", "MLB", "TRIPLE-A", "DOUBLE-A", "HIGH-A", "LOW-A", "ROOKIE", "RK", "AAA", "AA", "A+")
# MLB, Triple-A, Double-A, High-A, Single-A, Short Season A, Rookie, Rookie Advanced.
SPORT_IDS = "1,11,12,13,14,15,16,5442"
FIRST_SEASON = 1990
HEADERS = {"User-Agent": "YATStatsBot/1.0 (+https://yatstats.com)"}

s3 = boto3.client("s3", region_name=REGION)


def norm(name: str) -> str:
    return re.sub(r"[^a-z0-9]", "", (name or "").lower())


def pro_teams(conn) -> list[dict]:
    sql = """
      WITH used AS (
        SELECT teamid FROM tbc_batting_raw UNION SELECT teamid FROM tbc_pitching_raw
        UNION SELECT teamid FROM tbc_batting_2026_season_raw UNION SELECT teamid FROM tbc_pitching_2026_season_raw
      )
      SELECT u.teamid, m.current_team_name, m.level_label,
             (SELECT x.mlb_stats_api_id FROM tbc_to_mlb_team_map x
               WHERE x.tbc_teamid::text = u.teamid AND x.match_score >= 1 LIMIT 1) AS mapped_id
        FROM used u
        JOIN teamid_universe_mapping m ON m.teamid = u.teamid
       WHERE m.level_label = ANY(%s)
       ORDER BY u.teamid
    """
    with conn.cursor() as cur:
        cur.execute(sql, (list(PRO_LEVELS),))
        return [
            {"teamid": str(r[0]), "name": (r[1] or "").strip(), "level": r[2] or "", "mapped_id": r[3]}
            for r in cur.fetchall()
        ]


def mlb_names() -> dict[str, int]:
    """Normalized team name -> MLB team id (the most recent season wins)."""
    by_name: dict[str, int] = {}
    for season in range(FIRST_SEASON, date.today().year + 1):
        url = f"https://statsapi.mlb.com/api/v1/teams?sportIds={SPORT_IDS}&season={season}"
        for attempt in range(3):
            try:
                res = requests.get(url, headers=HEADERS, timeout=30)
                res.raise_for_status()
                break
            except requests.RequestException as error:
                if attempt == 2:
                    print(f"  season {season}: {error}", file=sys.stderr)
                    res = None
                time.sleep(2 * (attempt + 1))
        if res is None:
            continue
        for team in res.json().get("teams", []):
            key = norm(team.get("name", ""))
            if key and team.get("id"):
                by_name[key] = int(team["id"])  # later seasons overwrite earlier ones
        time.sleep(0.2)
    print(f"Stats API: {len(by_name)} distinct team names, {FIRST_SEASON}-{date.today().year}")
    return by_name


def has_logo(teamid: str) -> bool:
    res = s3.list_objects_v2(Bucket=BUCKET, Prefix=f"teams/{teamid}.", MaxKeys=1)
    return res.get("KeyCount", 0) > 0


def fetch_logo(mlb_id: int) -> tuple[bytes | None, str]:
    """An 800px-wide transparent PNG of the team's logo, and where it came from."""
    try:
        res = requests.get(f"https://www.mlbstatic.com/team-logos/{mlb_id}.svg", headers=HEADERS, timeout=30)
        if res.ok and b"<svg" in res.content[:2000]:
            png = cairosvg.svg2png(bytestring=res.content, output_width=800)
            if looks_like_logo(png):
                return png, "svg"
    except Exception as error:  # a bad SVG falls through to the PNG
        print(f"  svg {mlb_id}: {error}", file=sys.stderr)
    try:
        res = requests.get(f"https://midfield.mlbstatic.com/v1/team/{mlb_id}/spots/400", headers=HEADERS, timeout=30)
        if res.ok and res.headers.get("content-type", "").startswith("image/") and looks_like_logo(res.content):
            return res.content, "spot-png"
    except requests.RequestException as error:
        print(f"  png {mlb_id}: {error}", file=sys.stderr)
    return None, ""


def looks_like_logo(data: bytes) -> bool:
    """A real image with something drawn in it (not blank or a 1px placeholder)."""
    try:
        img = Image.open(io.BytesIO(data)).convert("RGBA")
    except Exception:
        return False
    if img.width < 32 or img.height < 32:
        return False
    return img.getchannel("A").getbbox() is not None


def main() -> int:
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        print("DATABASE_URL is required", file=sys.stderr)
        return 1
    print(f"Bucket: {BUCKET}  Dry run: {DRY_RUN}")

    with psycopg.connect(database_url) as conn:
        teams = pro_teams(conn)
    if ONLY_TEAMIDS:
        teams = [t for t in teams if t["teamid"] in ONLY_TEAMIDS]
    print(f"Pro teams in player stats: {len(teams)}")

    names = mlb_names()
    rows = []
    counts: dict[str, int] = {}
    processed = 0
    for team in teams:
        status, mlb_id, method, source = "", None, "", ""
        if has_logo(team["teamid"]):
            status = "already_has_logo"
        else:
            if team["mapped_id"]:
                mlb_id, method = int(team["mapped_id"]), "team_map_exact"
            elif names.get(norm(team["name"])):
                mlb_id, method = names[norm(team["name"])], "stats_api_name"
            if not mlb_id:
                status = "no_mlb_match"
            elif MAX_TEAMS and processed >= MAX_TEAMS:
                status = "skipped_max_teams"
            else:
                processed += 1
                png, source = fetch_logo(mlb_id)
                if not png:
                    status = "logo_not_found"
                elif DRY_RUN:
                    status = "would_upload"
                else:
                    s3.put_object(
                        Bucket=BUCKET,
                        Key=f"teams/{team['teamid']}.png",
                        Body=png,
                        ContentType="image/png",
                        CacheControl="public, max-age=31536000",
                    )
                    status = "uploaded"
                time.sleep(0.2)
        counts[status] = counts.get(status, 0) + 1
        rows.append({**team, "mlb_id": mlb_id or "", "match": method, "source": source, "status": status})
        print(f"{team['teamid']:>7}  {team['level']:<9} {team['name'][:34]:<34} {str(mlb_id or ''):>6}  {status}")

    with open(REPORT_PATH, "w", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=["teamid", "name", "level", "mapped_id", "mlb_id", "match", "source", "status"])
        writer.writeheader()
        writer.writerows(rows)
    print("\nSummary: " + ", ".join(f"{k} {v}" for k, v in sorted(counts.items())))
    return 0


if __name__ == "__main__":
    sys.exit(main())
