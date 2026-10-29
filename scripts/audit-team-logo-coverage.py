#!/usr/bin/env python3
"""Read-only inventory of team-logo gaps for career timelines.

Reports all distinct team IDs used in the four canonical batting/pitching
tables, checks all supported S3 logo paths, and preserves historic names.
Never substitutes a successor franchise's crest or writes to S3/Neon.
Requires DATABASE_URL and read-only S3 ListBucket permission.
"""
from __future__ import annotations

import csv
import os
from pathlib import Path

import boto3
import psycopg

BUCKET = os.environ.get("YATSTATS_S3_BUCKET", "yatstats-assets")
REGION = os.environ.get("AWS_REGION") or os.environ.get("AWS_DEFAULT_REGION") or "us-west-2"
REPORT = Path(os.environ.get("REPORT_PATH", "team-logo-coverage.csv"))
SOURCE_TABLES = (
    "tbc_batting_raw", "tbc_pitching_raw",
    "tbc_batting_2026_season_raw", "tbc_pitching_2026_season_raw",
)


def inventory(s3, prefix: str) -> set[str]:
    keys = set()
    for page in s3.get_paginator("list_objects_v2").paginate(Bucket=BUCKET, Prefix=prefix):
        for item in page.get("Contents", []):
            keys.add(item["Key"])
    return keys


def rows_from_database(conn):
    used = " UNION ".join(f"SELECT DISTINCT teamid FROM public.{table} WHERE teamid ~ '^[0-9]+$'" for table in SOURCE_TABLES)
    sql = f"""
        WITH used AS ({used})
        SELECT u.teamid,
               coalesce(nullif(m.current_team_name, ''), nullif(p.teamname, ''), nullif(c.collegename,''), '') AS name,
               coalesce(m.level_label, '') AS level,
               coalesce(p.currentteamid, '') AS successor_teamid
        FROM used u
        LEFT JOIN public.teamid_universe_mapping m ON m.teamid = u.teamid
        LEFT JOIN public.tbc_pro_teams_map_raw p ON p.teamid = u.teamid
        LEFT JOIN public.tbc_college_teams_map_raw c ON c.teamid = u.teamid
        ORDER BY u.teamid
    """
    with conn.cursor() as cur:
        cur.execute(sql)
        return cur.fetchall()


def main():
    url = os.getenv("DATABASE_URL")
    if not url:
        raise SystemExit("DATABASE_URL required")
    s3 = boto3.client("s3", region_name=REGION)
    originals = inventory(s3, "teams/")
    prepared = inventory(s3, "teams-web/")
    with psycopg.connect(url) as conn:
        records = rows_from_database(conn)
    totals = {}
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    with REPORT.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=[
            "teamid", "team_name", "level", "historical_successor_id",
            "original", "cutout", "webp", "status",
        ])
        writer.writeheader()
        for teamid, name, level, successor in records:
            tid = str(teamid)
            base = any(f"teams/{tid}.{ext}" in originals for ext in ("png","jpg","jpeg","webp","PNG","JPG"))
            cutout = f"teams/cutouts/{tid}.png" in originals
            webp = f"teams-web/{tid}.webp" in prepared
            historical = bool(successor and successor != tid)
            if webp or base or cutout:
                status = "ready" if webp else "needs_webp"
            else:
                status = "historical_artwork_needed" if historical else "original_artwork_needed"
            totals[status] = totals.get(status, 0) + 1
            writer.writerow({
                "teamid": tid, "team_name": name, "level": level,
                "historical_successor_id": successor if historical else "",
                "original": bool(base), "cutout": bool(cutout),
                "webp": bool(webp), "status": status,
            })
    print(f"Coverage report: {REPORT} ({len(records)} team IDs)")
    for key in sorted(totals):
        print(f"{key}: {totals[key]}")


if __name__ == "__main__":
    main()
