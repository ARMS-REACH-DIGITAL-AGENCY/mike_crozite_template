#!/usr/bin/env python3
"""Save the official MLB / minor league headshot of every player on the
platform who has an MLB id.

MLB publishes a current headshot for every player in affiliated baseball,
keyed by his MLB id (player_source_map, source 'mlb_api'). For each player:

- players/season-headshots/{playerid}_{season}.jpg: that season's official
  headshot (the season being the current year), for the Career Path
  Timeline's per-year headshots. Rewritten on every real run, since MLB
  updates a player's photo during the season.
- players/now/{playerid}.jpg: his "current" photo, only when he doesn't have
  one yet. A photo already there (usually picked by hand) is kept unless
  REPLACE_NOW=true; a replaced one is copied to players/replaced-now/ first.
  The hourly Player Image Cutouts job cuts out anything new in players/now/.

Headshot URLs (no default image, so a player without a photo is a 404, not
a silhouette): .../people/{id}/headshot/67/current for the majors and
.../people/{id}/headshot/milb/current for the minors. A player whose level
is MLB tries the major league photo first; everyone else tries the minors'
first. Either way, both are tried.

Environment:
- DATABASE_URL (required)
- YATSTATS_S3_BUCKET: default yatstats-assets
- AWS_REGION / AWS_DEFAULT_REGION: default us-west-2
- DRY_RUN: true/false, default true (look up and download, but don't upload)
- REPLACE_NOW: true/false, default false
- MAX_PLAYERS: optional limit for testing
- ONLY_PLAYERIDS: optional comma-separated player ids
- REPORT_PATH: default headshot-report.csv
"""

from __future__ import annotations

import csv
import io
import os
import sys
import time
from datetime import date

import boto3
import psycopg
import requests
from botocore.exceptions import ClientError
from PIL import Image

BUCKET = os.environ.get("YATSTATS_S3_BUCKET", "yatstats-assets")
REGION = os.environ.get("AWS_REGION") or os.environ.get("AWS_DEFAULT_REGION") or "us-west-2"
DRY_RUN = os.environ.get("DRY_RUN", "true").strip().lower() != "false"
REPLACE_NOW = os.environ.get("REPLACE_NOW", "false").strip().lower() == "true"
MAX_PLAYERS = int(os.environ.get("MAX_PLAYERS") or 0)
ONLY_PLAYERIDS = {p.strip() for p in (os.environ.get("ONLY_PLAYERIDS") or "").split(",") if p.strip()}
REPORT_PATH = os.environ.get("REPORT_PATH", "headshot-report.csv")
SEASON = date.today().year

IMG_BASE = "https://img.mlbstatic.com/mlb-photos/image/upload/w_600,q_auto:best/v1/people"
HEADERS = {"User-Agent": "YATStatsBot/1.0 (+https://yatstats.com)"}

s3 = boto3.client("s3", region_name=REGION)


def players(conn) -> list[dict]:
    sql = """
      SELECT DISTINCT ON (m.playerid) m.playerid, m.source_player_id, m.source_player_name,
             f.display_name, f.level_label, f.hsid
        FROM player_source_map m
        LEFT JOIN flip_card_front_stage f ON f.playerid = m.playerid::text
       WHERE m.source = 'mlb_api'
         AND m.match_method IS DISTINCT FROM 'rejected_bad_identity_match'
         AND m.source_player_id ~ '^[0-9]+$'
       ORDER BY m.playerid, m.updated_at DESC NULLS LAST
    """
    with conn.cursor() as cur:
        cur.execute(sql)
        return [
            {
                "playerid": str(r[0]),
                "mlb_id": str(r[1]),
                "name": (r[3] or r[2] or "").strip(),
                "level": (r[4] or "").strip().upper(),
                "hsid": str(r[5] or ""),
            }
            for r in cur.fetchall()
        ]


def fetch_headshot(mlb_id: str, level: str) -> tuple[bytes | None, str]:
    kinds = ["67", "milb"] if level == "MLB" else ["milb", "67"]
    for kind in kinds:
        url = f"{IMG_BASE}/{mlb_id}/headshot/{kind}/current"
        try:
            res = requests.get(url, headers=HEADERS, timeout=30)
        except requests.RequestException as error:
            print(f"  {mlb_id} {kind}: {error}", file=sys.stderr)
            continue
        if not res.ok or not res.headers.get("content-type", "").startswith("image/"):
            continue
        jpeg = to_jpeg(res.content)
        if jpeg:
            return jpeg, "mlb" if kind == "67" else "milb"
    return None, ""


def to_jpeg(data: bytes) -> bytes | None:
    """The headshot as a JPEG, or None if it isn't a real photo."""
    try:
        img = Image.open(io.BytesIO(data))
        img.load()
    except Exception:
        return None
    if img.width < 100 or img.height < 100:
        return None
    if img.mode in ("RGBA", "LA", "P"):
        background = Image.new("RGB", img.size, (255, 255, 255))
        rgba = img.convert("RGBA")
        background.paste(rgba, mask=rgba.getchannel("A"))
        img = background
    out = io.BytesIO()
    img.convert("RGB").save(out, format="JPEG", quality=90)
    return out.getvalue()


def exists(key: str) -> bool:
    try:
        s3.head_object(Bucket=BUCKET, Key=key)
        return True
    except ClientError:
        return False


def put(key: str, body: bytes) -> None:
    s3.put_object(Bucket=BUCKET, Key=key, Body=body, ContentType="image/jpeg", CacheControl="public, max-age=86400")


def main() -> int:
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        print("DATABASE_URL is required", file=sys.stderr)
        return 1
    print(f"Bucket: {BUCKET}  Season: {SEASON}  Dry run: {DRY_RUN}  Replace now/: {REPLACE_NOW}")

    with psycopg.connect(database_url) as conn:
        roster = players(conn)
    if ONLY_PLAYERIDS:
        roster = [p for p in roster if p["playerid"] in ONLY_PLAYERIDS]
    if MAX_PLAYERS:
        roster = roster[:MAX_PLAYERS]
    print(f"Players with an MLB id: {len(roster)}")

    rows = []
    counts: dict[str, int] = {}
    for p in roster:
        jpeg, source = fetch_headshot(p["mlb_id"], p["level"])
        now_key = f"players/now/{p['playerid']}.jpg"
        had_now = exists(now_key)
        if not jpeg:
            status, now_status = "no_headshot", ""
        else:
            status = "would_save" if DRY_RUN else "saved"
            if had_now and not REPLACE_NOW:
                now_status = "kept_existing"
            elif DRY_RUN:
                now_status = "would_replace" if had_now else "would_fill"
            else:
                if had_now:
                    s3.copy_object(
                        Bucket=BUCKET,
                        Key=f"players/replaced-now/{p['playerid']}.jpg",
                        CopySource={"Bucket": BUCKET, "Key": now_key},
                    )
                put(now_key, jpeg)
                now_status = "replaced" if had_now else "filled"
            if not DRY_RUN:
                put(f"players/season-headshots/{p['playerid']}_{SEASON}.jpg", jpeg)
        counts[status] = counts.get(status, 0) + 1
        if now_status:
            counts[f"now_{now_status}"] = counts.get(f"now_{now_status}", 0) + 1
        rows.append({**p, "source": source, "season": SEASON, "status": status, "now": now_status})
        print(f"{p['playerid']:>10}  {p['mlb_id']:>7}  {p['level']:<10} {p['name'][:28]:<28} {source:<5} {status}  {now_status}")
        time.sleep(0.15)

    with open(REPORT_PATH, "w", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=["playerid", "mlb_id", "name", "level", "hsid", "source", "season", "status", "now"])
        writer.writeheader()
        writer.writerows(rows)
    print("\nSummary: " + ", ".join(f"{k} {v}" for k, v in sorted(counts.items())))
    return 0


if __name__ == "__main__":
    sys.exit(main())
