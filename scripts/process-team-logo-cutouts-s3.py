#!/usr/bin/env python3
"""Batch-remove backgrounds from team logo PNGs in S3.

Same approach as scripts/process-player-cutouts-s3.py (rembg, local/free,
no external API), adapted for team logos:

- The player-cutouts script treats .png as an ALREADY-PROCESSED output and
  skips it, so it never reprocesses its own results when re-run against
  the same folder. Team logos are the opposite case: nearly all of them
  are ALREADY .png, just with a solid (often white) background baked in
  rather than real transparency - so .png has to be a valid SOURCE here.
- Defaults to writing into a separate staging prefix (teams/cutouts/),
  never overwriting the live teams/ folder, so a sample can be reviewed
  before anything site-wide is touched. Only writes in place (same key,
  overwriting the original) if IN_PLACE=true is explicitly set.

Environment variables:
- YATSTATS_S3_BUCKET: default yatstats-assets
- YATSTATS_S3_SOURCE_PREFIX: default teams/
- YATSTATS_S3_SOURCE_KEY: optional exact single key (e.g. teams/14134.png) to
  process instead of scanning SOURCE_PREFIX - for testing one specific logo
- YATSTATS_S3_OUTPUT_PREFIX: default teams/cutouts/ (ignored if IN_PLACE=true)
- IN_PLACE: true/false, default false - true writes back to the exact same
  key as the source (overwrites the live logo), ignoring OUTPUT_PREFIX
- AWS_REGION / AWS_DEFAULT_REGION: default us-west-2
- DRY_RUN: true/false, default true
- OVERWRITE: true/false, default false; only controls replacing an output
  that already exists at the destination key
- MAX_FILES: optional integer limit for testing (ignored when SOURCE_KEY is set)
"""

from __future__ import annotations

import io
import os
import sys
from pathlib import PurePosixPath

import boto3
from botocore.exceptions import ClientError
from PIL import Image
from rembg import remove

BUCKET = os.getenv("YATSTATS_S3_BUCKET", "yatstats-assets")
SOURCE_PREFIX = os.getenv("YATSTATS_S3_SOURCE_PREFIX", "teams/")
SOURCE_KEY = os.getenv("YATSTATS_S3_SOURCE_KEY", "").strip()
IN_PLACE = os.getenv("IN_PLACE", "false").lower() == "true"
OUTPUT_PREFIX = os.getenv("YATSTATS_S3_OUTPUT_PREFIX", "teams/cutouts/")
AWS_REGION = os.getenv("AWS_REGION") or os.getenv("AWS_DEFAULT_REGION") or "us-west-2"
DRY_RUN = os.getenv("DRY_RUN", "true").lower() == "true"
OVERWRITE = os.getenv("OVERWRITE", "false").lower() == "true"
MAX_FILES_RAW = os.getenv("MAX_FILES", "").strip()
MAX_FILES = int(MAX_FILES_RAW) if MAX_FILES_RAW.isdigit() else None

s3 = boto3.client("s3", region_name=AWS_REGION)


def normalize_prefix(prefix: str) -> str:
    if not prefix:
        return ""
    return prefix if prefix.endswith("/") else f"{prefix}/"


def is_source_image(key: str) -> bool:
    lower = key.lower()
    return lower.endswith((".png", ".jpg", ".jpeg", ".webp"))


def output_key_for(input_key: str) -> str:
    if IN_PLACE:
        return input_key

    source_prefix = normalize_prefix(SOURCE_PREFIX)
    output_prefix = normalize_prefix(OUTPUT_PREFIX)

    if source_prefix and input_key.startswith(source_prefix):
        relative_key = input_key[len(source_prefix):]
    else:
        relative_key = PurePosixPath(input_key).name

    return str(PurePosixPath(output_prefix) / PurePosixPath(relative_key).with_suffix(".png"))


def s3_object_exists(bucket: str, key: str) -> bool:
    try:
        s3.head_object(Bucket=bucket, Key=key)
        return True
    except ClientError as exc:
        code = exc.response.get("Error", {}).get("Code")
        if code in {"404", "NoSuchKey", "NotFound"}:
            return False
        raise


def list_source_keys(bucket: str, prefix: str) -> list[str]:
    keys: list[str] = []
    paginator = s3.get_paginator("list_objects_v2")

    for page in paginator.paginate(Bucket=bucket, Prefix=normalize_prefix(prefix)):
        for obj in page.get("Contents", []):
            key = obj.get("Key", "")
            if not key or key.endswith("/"):
                continue
            if is_source_image(key):
                keys.append(key)

    return sorted(keys)


def process_image_bytes(input_bytes: bytes) -> bytes:
    # Flatten any existing alpha onto white first - a logo that's already
    # transparent but was flattened onto white for storage would otherwise
    # confuse rembg's foreground/background estimate.
    source = Image.open(io.BytesIO(input_bytes)).convert("RGBA")
    flattened = Image.new("RGB", source.size, (255, 255, 255))
    flattened.paste(source, mask=source.split()[3])

    flat_buffer = io.BytesIO()
    flattened.save(flat_buffer, format="PNG")

    removed = remove(flat_buffer.getvalue())
    image = Image.open(io.BytesIO(removed)).convert("RGBA")

    buffer = io.BytesIO()
    image.save(buffer, format="PNG", optimize=True)
    return buffer.getvalue()


def main() -> int:
    print(f"Bucket: {BUCKET}")
    if SOURCE_KEY:
        print(f"Source key (single file): {SOURCE_KEY}")
    else:
        print(f"Source prefix: {normalize_prefix(SOURCE_PREFIX)}")
    print(f"In place (overwrite originals): {IN_PLACE}")
    if not IN_PLACE:
        print(f"Output prefix: {normalize_prefix(OUTPUT_PREFIX)}")
    print(f"Region: {AWS_REGION}")
    print(f"Dry run: {DRY_RUN}")
    print(f"Overwrite existing outputs: {OVERWRITE}")
    print(f"Max files: {MAX_FILES if MAX_FILES is not None else 'all'}")

    if SOURCE_KEY:
        keys = [SOURCE_KEY]
    else:
        keys = list_source_keys(BUCKET, SOURCE_PREFIX)
        if MAX_FILES is not None:
            keys = keys[:MAX_FILES]

    print(f"Found {len(keys)} source images to inspect.")

    processed = 0
    skipped_existing = 0
    skipped_dry_run = 0
    failed = 0

    for index, key in enumerate(keys, start=1):
        output_key = output_key_for(key)
        print(f"\n[{index}/{len(keys)}] {key} -> {output_key}")

        try:
            if not OVERWRITE and not IN_PLACE and s3_object_exists(BUCKET, output_key):
                print("SKIP existing output")
                skipped_existing += 1
                continue

            if DRY_RUN:
                print("DRY RUN would create/update output")
                skipped_dry_run += 1
                continue

            obj = s3.get_object(Bucket=BUCKET, Key=key)
            input_bytes = obj["Body"].read()
            output_bytes = process_image_bytes(input_bytes)

            s3.put_object(
                Bucket=BUCKET,
                Key=output_key,
                Body=output_bytes,
                ContentType="image/png",
                CacheControl="public, max-age=31536000, immutable",
            )

            print(f"OK uploaded: {len(output_bytes):,} bytes")
            processed += 1

        except Exception as exc:
            print(f"FAILED {key}: {exc}")
            failed += 1

    print("\nSummary")
    print(f"Processed/generated PNGs: {processed}")
    print(f"Skipped existing outputs: {skipped_existing}")
    print(f"Dry-run skipped: {skipped_dry_run}")
    print(f"Failed: {failed}")

    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
