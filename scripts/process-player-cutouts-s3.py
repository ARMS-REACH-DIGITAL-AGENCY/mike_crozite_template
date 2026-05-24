#!/usr/bin/env python3
"""Batch process player images in S3 into transparent PNG cutouts.

Current batch default:
- Reads source images from s3://yatstats-assets/players/cutouts/
- Writes matching transparent PNG files to s3://yatstats-assets/players/cutouts/
- Keeps original JPG/JPEG/WEBP files intact
- Skips PNG source files so generated outputs do not recursively process
- Skips output PNGs that already exist unless OVERWRITE=true

Future automation can use:
- YATSTATS_S3_SOURCE_PREFIX=players/then/
- YATSTATS_S3_OUTPUT_PREFIX=players/cutouts/

Environment variables:
- YATSTATS_S3_BUCKET: default yatstats-assets
- YATSTATS_S3_SOURCE_PREFIX: default from YATSTATS_S3_PREFIX or players/cutouts/
- YATSTATS_S3_OUTPUT_PREFIX: default from YATSTATS_S3_SOURCE_PREFIX
- AWS_REGION / AWS_DEFAULT_REGION: default us-west-2
- DRY_RUN: true/false, default true
- OVERWRITE: true/false, default false; only controls replacing generated PNG outputs
- MAX_FILES: optional integer limit for testing
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
LEGACY_PREFIX = os.getenv("YATSTATS_S3_PREFIX", "players/cutouts/")
SOURCE_PREFIX = os.getenv("YATSTATS_S3_SOURCE_PREFIX", LEGACY_PREFIX)
OUTPUT_PREFIX = os.getenv("YATSTATS_S3_OUTPUT_PREFIX", SOURCE_PREFIX)
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
    if lower.endswith(".png"):
        return False
    return lower.endswith((".jpg", ".jpeg", ".webp"))


def output_key_for(input_key: str) -> str:
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
    removed = remove(input_bytes)
    image = Image.open(io.BytesIO(removed)).convert("RGBA")

    buffer = io.BytesIO()
    image.save(buffer, format="PNG", optimize=True)
    return buffer.getvalue()


def main() -> int:
    print(f"Bucket: {BUCKET}")
    print(f"Source prefix: {normalize_prefix(SOURCE_PREFIX)}")
    print(f"Output prefix: {normalize_prefix(OUTPUT_PREFIX)}")
    print(f"Region: {AWS_REGION}")
    print(f"Dry run: {DRY_RUN}")
    print(f"Overwrite generated PNG outputs: {OVERWRITE}")
    print(f"Max files: {MAX_FILES if MAX_FILES is not None else 'all'}")

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
            if not OVERWRITE and s3_object_exists(BUCKET, output_key):
                print("SKIP existing generated PNG output")
                skipped_existing += 1
                continue

            if DRY_RUN:
                print("DRY RUN would create/update generated PNG output")
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

            print(f"OK uploaded generated PNG: {len(output_bytes):,} bytes")
            processed += 1

        except Exception as exc:
            print(f"FAILED {key}: {exc}")
            failed += 1

    print("\nSummary")
    print(f"Processed/generated PNGs: {processed}")
    print(f"Skipped existing generated PNGs: {skipped_existing}")
    print(f"Dry-run skipped: {skipped_dry_run}")
    print(f"Failed: {failed}")

    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
