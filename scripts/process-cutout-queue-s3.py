#!/usr/bin/env python3
"""Cut out only the photos that are waiting (Pete, Nov 17 2026).

The site leaves one small marker per photo that still needs a cutout:
    cutout-queue/v1/<source key>     e.g. cutout-queue/v1/players/then/309617.jpg
This job lists only that marker folder (a handful of objects), never the photo
folders, so a run with nothing waiting costs one S3 listing and finishes in
seconds. For each waiting photo it:
  1. makes the transparent PNG cutout (rembg), same folder pairs as
     process-player-cutouts-s3.py;
  2. builds the trimmed web WebP the timeline loads first (then/back/now),
     same builder as build-web-cutouts-s3.py;
  3. removes the marker. A photo that fails keeps its marker for the next run
     (attempt count in the marker); after MAX_ATTEMPTS it moves to
     cutout-queue-failed/v1/ for review instead of retrying forever.

Environment: YATSTATS_S3_BUCKET, AWS_REGION / AWS_DEFAULT_REGION,
DRY_RUN (default false), MAX_FILES (optional limit per run).
"""

from __future__ import annotations

import importlib.util
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath

import boto3
from botocore.exceptions import ClientError

HERE = Path(__file__).resolve().parent


def load(name: str, filename: str):
    spec = importlib.util.spec_from_file_location(name, HERE / filename)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(module)
    return module


cutouts = load("process_player_cutouts", "process-player-cutouts-s3.py")
web = load("build_web_cutouts", "build-web-cutouts-s3.py")

BUCKET = os.getenv("YATSTATS_S3_BUCKET", "yatstats-assets")
AWS_REGION = os.getenv("AWS_REGION") or os.getenv("AWS_DEFAULT_REGION") or "us-west-2"
DRY_RUN = os.getenv("DRY_RUN", "false").lower() == "true"
MAX_FILES_RAW = os.getenv("MAX_FILES", "").strip()
MAX_FILES = int(MAX_FILES_RAW) if MAX_FILES_RAW.isdigit() else None
QUEUE_PREFIX = "cutout-queue/v1/"
FAILED_PREFIX = "cutout-queue-failed/v1/"
MAX_ATTEMPTS = 3
CACHE_CONTROL = "public, max-age=0, must-revalidate"

# source folder -> (cutout folder, web kind or None)
PAIRS = {
    "players/then/": ("players/then-cutouts/", "then"),
    "players/back/": ("players/back-cutouts/", "back"),
    "players/now/": ("players/now-cutouts/", "now"),
    "players/season-photos/": ("players/season-cutouts/", None),
}

s3 = boto3.client("s3", region_name=AWS_REGION)


def waiting_markers() -> list[str]:
    keys: list[str] = []
    for page in s3.get_paginator("list_objects_v2").paginate(Bucket=BUCKET, Prefix=QUEUE_PREFIX):
        keys.extend(obj["Key"] for obj in page.get("Contents", []) if not obj["Key"].endswith("/"))
    return sorted(keys)


def read_attempts(marker: str) -> int:
    try:
        body = s3.get_object(Bucket=BUCKET, Key=marker)["Body"].read()
        return int(json.loads(body or b"{}").get("attempts", 0))
    except Exception:
        return 0


def process(source_key: str) -> str:
    pair = next(((src, out) for src, out in PAIRS.items() if source_key.startswith(src)), None)
    if not pair:
        return "not a cutout folder"
    src_prefix, (out_prefix, web_kind) = pair
    try:
        source = s3.get_object(Bucket=BUCKET, Key=source_key)["Body"].read()
    except ClientError as exc:
        if exc.response.get("Error", {}).get("Code") in {"404", "NoSuchKey", "NotFound"}:
            return "photo no longer exists"
        raise
    stem = PurePosixPath(source_key[len(src_prefix):]).with_suffix("")
    cutout_key = f"{out_prefix}{stem}.png"
    if DRY_RUN:
        return f"DRY RUN would write {cutout_key}"
    png = cutouts.process_image_bytes(source)
    s3.put_object(Bucket=BUCKET, Key=cutout_key, Body=png, ContentType="image/png", CacheControl=CACHE_CONTROL)
    done = [cutout_key]
    if web_kind:
        web_key = f"players/{web_kind}-web/{stem}.webp"
        s3.put_object(Bucket=BUCKET, Key=web_key, Body=web.build_web_image(web_kind, png),
                      ContentType="image/webp", CacheControl=CACHE_CONTROL)
        done.append(web_key)
    return "OK " + ", ".join(done)


def main() -> int:
    markers = waiting_markers()
    if MAX_FILES is not None:
        markers = markers[:MAX_FILES]
    print(f"{len(markers)} photo(s) waiting for a cutout.")
    failed = 0
    for marker in markers:
        source_key = marker[len(QUEUE_PREFIX):]
        try:
            result = process(source_key)
            print(f"{source_key}: {result}")
            if not DRY_RUN:
                s3.delete_object(Bucket=BUCKET, Key=marker)
        except Exception as exc:
            failed += 1
            attempts = read_attempts(marker) + 1
            note = json.dumps({"source": source_key, "attempts": attempts, "error": str(exc)[:500],
                               "at": datetime.now(timezone.utc).isoformat()})
            print(f"{source_key}: FAILED (attempt {attempts}): {exc}")
            if DRY_RUN:
                continue
            if attempts >= MAX_ATTEMPTS:
                s3.put_object(Bucket=BUCKET, Key=FAILED_PREFIX + source_key, Body=note, ContentType="application/json")
                s3.delete_object(Bucket=BUCKET, Key=marker)
            else:
                s3.put_object(Bucket=BUCKET, Key=marker, Body=note, ContentType="application/json")
    # A failed photo keeps its marker and is retried; the run itself stays
    # green unless every waiting photo failed.
    return 1 if markers and failed == len(markers) else 0


if __name__ == "__main__":
    sys.exit(main())
