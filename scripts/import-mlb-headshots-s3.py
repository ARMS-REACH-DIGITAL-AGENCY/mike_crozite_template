#!/usr/bin/env python3
"""Import available official MLB / minor league headshots.

MLB ids come from nonrejected player_source_map links. An affiliated player
can have a valid id before MLB publishes a headshot. Both photo endpoints
are retried on later runs; two 404s mean no_headshot, while HTTP, image, and
storage failures are reported separately and make the job fail visibly.
Players with multiple eligible MLB ids are reported and skipped.

- players/season-headshots/{playerid}_{season}.jpg is refreshed every run.
- players/now/{playerid}.jpg is filled only when no current photo exists.
  REPLACE_NOW=true explicitly allows replacement, with a backup first.
- players/now-thumb/{playerid}.webp is filled from the actual current photo
  when absent, so a new headshot can display without waiting for cutouts.
  Existing thumbnails are preserved; the hourly derivative job handles
  refreshing them and producing cutouts. No high-school/action photos change.

The URLs deliberately have no default-image transformation: missing MLB
photos must remain 404s, never be imported as stock silhouettes.

Environment:
- DATABASE_URL (required)
- YATSTATS_S3_BUCKET: default yatstats-assets
- AWS_REGION / AWS_DEFAULT_REGION: default us-west-2
- DRY_RUN: true/false, default true (download and report, no S3 writes)
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
from dataclasses import dataclass
from datetime import date

import boto3
import psycopg
import requests
from botocore.exceptions import BotoCoreError, ClientError
from PIL import Image, ImageOps

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
PHOTO_EXTENSIONS = ("jpg", "jpeg", "png", "webp")
RETRY_HTTP_STATUSES = {429, 500, 502, 503, 504}
REPORT_FIELDS = ["playerid", "mlb_player_id", "mlb_id_candidates", "name", "level", "hsid",
                 "headshot_origin", "season", "status", "season_photo", "now", "now_thumb", "detail"]


@dataclass
class HeadshotResult:
    jpeg: bytes | None
    origin: str
    status: str
    detail: str = ""


def players(conn) -> list[dict]:
    # Do not choose the newest link when two different MLB people resolve to
    # one player. Keep every eligible id so that process_player can skip it.
    sql = """
      WITH links AS (
        SELECT m.playerid,
               array_agg(DISTINCT m.source_player_id ORDER BY m.source_player_id) AS mlb_ids,
               max(m.source_player_name) AS source_player_name
          FROM player_source_map m
         WHERE m.source = 'mlb_api'
           AND m.match_method IS DISTINCT FROM 'rejected_bad_identity_match'
           AND m.source_player_id ~ '^[0-9]+$'
         GROUP BY m.playerid
      )
      SELECT m.playerid, m.mlb_ids, m.source_player_name,
             f.display_name, f.level_label, f.hsid
        FROM links m
        LEFT JOIN flip_card_front_stage f ON f.playerid = m.playerid::text
       ORDER BY m.playerid
    """
    with conn.cursor() as cur:
        cur.execute(sql)
        return [
            {
                "playerid": str(r[0]),
                "mlb_player_id": str(r[1][0]) if len(r[1]) == 1 else "",
                "mlb_id_candidates": ";".join(str(i) for i in r[1]),
                "name": (r[3] or r[2] or "").strip(),
                "level": (r[4] or "").strip().upper(),
                "hsid": str(r[5] or ""),
            }
            for r in cur.fetchall()
        ]


def fetch_headshot(mlb_id: str, level: str, session) -> HeadshotResult:
    kinds = ["67", "milb"] if level == "MLB" else ["milb", "67"]
    failures = []
    missing = 0
    for kind in kinds:
        origin = "mlb" if kind == "67" else "milb"
        url = f"{IMG_BASE}/{mlb_id}/headshot/{kind}/current"
        # One bounded retry for temporary HTTP/network failures. A 404 is
        # retried on the next daily import, not repeatedly within this run.
        for attempt in range(2):
            try:
                res = session.get(url, headers=HEADERS, timeout=(5, 20))
            except requests.RequestException as error:
                if attempt == 0:
                    time.sleep(0.5)
                    continue
                failures.append(f"{origin}:{type(error).__name__}")
                break
            if res.status_code in RETRY_HTTP_STATUSES and attempt == 0:
                time.sleep(0.5)
                continue
            if res.status_code == 404:
                missing += 1
                failures.append(f"{origin}:http_404")
            elif not res.ok:
                failures.append(f"{origin}:http_{res.status_code}")
            elif not res.headers.get("content-type", "").lower().startswith("image/"):
                failures.append(f"{origin}:invalid_content_type")
            else:
                jpeg = to_jpeg(res.content)
                if jpeg:
                    return HeadshotResult(jpeg, origin, "found", "; ".join(failures))
                failures.append(f"{origin}:invalid_image")
            break
    return HeadshotResult(None, "", "no_headshot" if missing == 2 else "fetch_error", "; ".join(failures))


def to_jpeg(data: bytes) -> bytes | None:
    """Convert an actual, usable image; never accept an error body as a photo."""
    try:
        img = ImageOps.exif_transpose(Image.open(io.BytesIO(data)))
        img.load()
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
    except (OSError, ValueError, Image.DecompressionBombError):
        return None


def to_now_thumb(data: bytes) -> bytes:
    """Match the 400px-wide gallery derivative made by build-web-cutouts."""
    img = ImageOps.exif_transpose(Image.open(io.BytesIO(data)))
    img = img.convert("RGBA" if img.mode in ("RGBA", "LA", "P") else "RGB")
    if img.width > 400:
        img = img.resize((400, round(img.height * 400 / img.width)), Image.Resampling.LANCZOS)
    out = io.BytesIO()
    img.save(out, format="WEBP", quality=80, method=4)
    return out.getvalue()


def error_code(error: Exception) -> str:
    if isinstance(error, ClientError):
        return str(error.response.get("Error", {}).get("Code", "ClientError"))
    return type(error).__name__


def exists(s3, key: str) -> bool:
    try:
        s3.head_object(Bucket=BUCKET, Key=key)
        return True
    except ClientError as error:
        if error_code(error) in {"404", "NoSuchKey", "NotFound"}:
            return False
        # AccessDenied, throttling, and bucket/configuration errors are not
        # evidence that a photo is missing and must never permit replacement.
        raise


def list_keys(s3, prefix: str) -> set[str]:
    # Two paginated inventories replace thousands of per-player HEAD calls.
    # Storage/list errors propagate, rather than acting like an empty bucket.
    return {
        item["Key"]
        for page in s3.get_paginator("list_objects_v2").paginate(Bucket=BUCKET, Prefix=prefix)
        for item in page.get("Contents", [])
    }


def put(s3, key: str, body: bytes, content_type: str = "image/jpeg", *, only_if_missing: bool = False) -> bool:
    args = dict(Bucket=BUCKET, Key=key, Body=body, ContentType=content_type,
                CacheControl="public, max-age=86400")
    if only_if_missing:
        args["IfNoneMatch"] = "*"
    try:
        s3.put_object(**args)
        return True
    except ClientError as error:
        if only_if_missing and error_code(error) in {"412", "PreconditionFailed"}:
            return False  # Another writer supplied the photo after inventory.
        raise


def process_player(p: dict, s3, session, now_keys: set[str], thumb_keys: set[str], *,
                   dry_run: bool, replace_now: bool) -> dict:
    row = {**p, "headshot_origin": "", "season": SEASON, "status": "", "season_photo": "",
           "now": "", "now_thumb": "", "detail": ""}
    if not p["mlb_player_id"]:
        row.update(status="ambiguous_mlb_ids", detail="Multiple eligible MLB ids; identity review required")
        return row
    photo = fetch_headshot(p["mlb_player_id"], p["level"], session)
    row.update(headshot_origin=photo.origin, detail=photo.detail)
    if photo.jpeg is None:
        row["status"] = photo.status
        return row

    now_key = f"players/now/{p['playerid']}.jpg"
    thumb_key = f"players/now-thumb/{p['playerid']}.webp"
    current_key = next((f"players/now/{p['playerid']}.{ext}" for ext in PHOTO_EXTENSIONS
                        if f"players/now/{p['playerid']}.{ext}" in now_keys), None)
    operation = "check_current_photo"
    try:
        if not current_key and exists(s3, now_key):
            current_key = now_key
        operation = "save_season_photo"
        if not dry_run:
            put(s3, f"players/season-headshots/{p['playerid']}_{SEASON}.jpg", photo.jpeg)
        row["season_photo"] = "would_save" if dry_run else "saved"

        current_bytes = None
        if current_key and not replace_now:
            row["now"] = "kept_existing"
        elif dry_run:
            row["now"] = "would_replace" if current_key else "would_fill"
        else:
            operation = "save_current_photo"
            if current_key:
                s3.copy_object(
                    Bucket=BUCKET,
                    Key=f"players/replaced-now/{current_key.rsplit('/', 1)[1]}",
                    CopySource={"Bucket": BUCKET, "Key": current_key},
                )
            if put(s3, now_key, photo.jpeg, only_if_missing=not current_key):
                row["now"] = "replaced" if current_key else "filled"
                current_bytes = photo.jpeg
            else:
                row["now"] = "kept_existing"
            current_key = now_key
            now_keys.add(now_key)

        operation = "save_current_thumbnail"
        if thumb_key in thumb_keys:
            row["now_thumb"] = "kept_existing"
        elif dry_run:
            row["now_thumb"] = "would_fill"
        else:
            # Also recover a missing thumbnail after a previous partial run.
            # For a kept/racing current photo, derive from that actual photo,
            # never from MLB's fetched image which may be a different choice.
            if current_bytes is None:
                current_bytes = s3.get_object(Bucket=BUCKET, Key=current_key)["Body"].read()
            thumb = to_now_thumb(current_bytes)
            created = put(s3, thumb_key, thumb, "image/webp", only_if_missing=True)
            row["now_thumb"] = "filled" if created else "kept_existing"
            thumb_keys.add(thumb_key)
        row["status"] = "would_save" if dry_run else "saved"
    except (BotoCoreError, ClientError, OSError, ValueError, Image.DecompressionBombError) as error:
        row.update(status="storage_error", detail=f"{operation}:{error_code(error)}")
    return row


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
    print(f"Players with eligible MLB links: {len(roster)}")

    s3 = boto3.client("s3", region_name=REGION)
    counts: dict[str, int] = {}
    with open(REPORT_PATH, "w", newline="") as fh, requests.Session() as session:
        writer = csv.DictWriter(fh, fieldnames=REPORT_FIELDS)
        writer.writeheader()
        try:
            now_keys = list_keys(s3, "players/now/")
            thumb_keys = list_keys(s3, "players/now-thumb/")
        except (BotoCoreError, ClientError) as error:
            writer.writerow({"status": "storage_error", "detail": f"inventory:{error_code(error)}"})
            print(f"S3 inventory failed: {error_code(error)}", file=sys.stderr)
            return 1
        for p in roster:
            row = process_player(p, s3, session, now_keys, thumb_keys,
                                 dry_run=DRY_RUN, replace_now=REPLACE_NOW)
            counts[row["status"]] = counts.get(row["status"], 0) + 1
            for field in ("now", "now_thumb"):
                if row[field]:
                    key = f"{field}_{row[field]}"
                    counts[key] = counts.get(key, 0) + 1
            writer.writerow(row)
            fh.flush()  # Preserve completed rows if the workflow is interrupted.
            print(f"{p['playerid']:>10}  {p['mlb_player_id']:>7}  {p['level']:<10} "
                  f"{p['name'][:28]:<28} {row['status']}  now={row['now']} thumb={row['now_thumb']} {row['detail']}")
            time.sleep(0.15)
    print("\nSummary: " + ", ".join(f"{k} {v}" for k, v in sorted(counts.items())))
    return 1 if counts.get("fetch_error") or counts.get("storage_error") else 0


if __name__ == "__main__":
    sys.exit(main())
