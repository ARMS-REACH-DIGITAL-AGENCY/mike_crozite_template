#!/usr/bin/env python3
"""Batch process player images in S3 into transparent PNG cutouts.

Default behavior:
- Reads source images from s3://yatstats-assets/players/cutouts/
- Skips PNG source files so existing generated outputs do not recursively process
- Writes matching PNG files back to the same prefix
- Skips output PNGs that already exist unless OVERWRITE=true

Environment variables:
- YATSTATS_S3_BUCKET: default yatstats-assets
- YATSTATS_S3_PREFIX: default players/cutouts/
- AWS_REGION: default us-west-2
- DRY_RUN: true/false, default true
- OVERWRITE: true/false, default false
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
PREFIX = os.getenv("YATSTATS_S3_PREFIX", "players/cutouts/")
AWS_REGION = os.getenv("AWS_REGION") or os.getenv("AWS_DEFAULT_REGION") or "us-west-2"
DRY_RUN = os.getenv("DRY_RUN", "true").lower() == "true"
OVERWRITE = os.getenv("OVERWRITE", "false").lower() == "true"
MAX_FILES_RAW = os.getenv("MAX_FILES", "").strip()
MAX_FILES = int(MAX_FILES_RAW) if MAX_FILES_RAW.isdigit() else None

s3 = boto3.client("s3", region_name=AWS_REGION)


def is_source_image(key: str) -> bool:
    lower = key.lower()
    if lower.endswith(".png"):
        return False
    return lower.endswith((".jpg", ".jpeg", ".webp"))


def output_key_for(input_key: str) -> str:
    return str(PurePosixPath(input_key).with_suffix(".png"))


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

    for page in paginator.paginate(Bucket=bucket, Prefix=prefix):
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
    print(f"Prefix: {PREFIX}")
    print(f"Region: {AWS_REGION}")
    print(f"Dry run: {DRY_RUN}")
    print(f"Overwrite: {OVERWRITE}")
    print(f"Max files: {MAX_FILES if MAX_FILES is not None else 'all'}")

    keys = list_source_keys(BUCKET, PREFIX)
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
                print("SKIP existing output PNG")
                skipped_existing += 1
                continue

            if DRY_RUN:
                print("DRY RUN would process")
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

            print(f"OK uploaded {len(output_bytes):,} bytes")
            processed += 1

        except Exception as exc:
            print(f"FAILED {key}: {exc}")
            failed += 1

    print("\nSummary")
    print(f"Processed: {processed}")
    print(f"Skipped existing: {skipped_existing}")
    print(f"Dry-run skipped: {skipped_dry_run}")
    print(f"Failed: {failed}")

    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
