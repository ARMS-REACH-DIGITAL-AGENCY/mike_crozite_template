#!/usr/bin/env python3
"""Publish only fully verified school logos from S3 staging to live S3 keys.

The live YAT?STATS site already renders schools/{canonical_hsid}.png.
No overwrite ever: put_object(..., IfNoneMatch="*") is atomic.
Uncertain or invalid matches remain in staging and appear in exceptions.csv.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import io
import logging
from pathlib import Path

import boto3
from botocore.exceptions import ClientError
from PIL import Image

from fetch_hs_logos_expanded import existing_hsids, load_sitemap
from verify_hs_logo_staging import (
    _candidate_from_maxpreps, canonical_schools, school_signature,
    verify_s3_row,
)

LOG = logging.getLogger("hs-logo-publish")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
BUCKET = "yatstats-assets"
STAGE = "schools-candidates/"
LIVE = "schools/"


def load_report(path: str) -> dict[str, dict]:
    if not path or not Path(path).is_file():
        return {}
    with open(path, newline="", encoding="utf-8") as handle:
        return {str(r["hsid"]): r for r in csv.DictReader(handle)
                if str(r.get("hsid") or "").isdecimal()}


def can_auto_publish(result: dict, row: dict, is_legacy: bool) -> tuple[bool, str]:
    """Strict whitelist; never publish items requiring a discretionary decision.

    Legacy (pre-metadata) staged objects can qualify only if freshly
    re-downloading the source produces the exact same processed PNG SHA256.
    """
    if result["status"] == "FAILED":
        return False, result["failures"] or "verification_failed"
    flags = {v for v in result["review_flags"].split(";") if v}
    if not row.get("image_sha256"):
        return False, "source_checksum_unavailable"
    if is_legacy:
        if flags != {"legacy_s3_object_without_provenance_metadata"}:
            return False, ";".join(sorted(flags)) or "legacy_provenance_unverified"
    elif flags:
        return False, ";".join(sorted(flags))
    if int(row.get("score") or 0) < 85:
        return False, "low_source_match_score"
    if int(row.get("score") or 0) - int(row.get("runner_up") or 0) < 15:
        return False, "ambiguous_source_match"
    if result["sha256"] != str(row.get("image_sha256")):
        return False, "stored_image_source_checksum_mismatch"
    return True, ""


def put_live_if_missing(s3, bucket: str, key: str, data: bytes,
                        school: dict, source_url: str) -> str:
    """Create a published key exactly once, never replacing an existing logo."""
    checksum = hashlib.sha256(data).hexdigest()
    try:
        s3.put_object(
            Bucket=bucket, Key=key, Body=data, IfNoneMatch="*",
            ContentType="image/png", CacheControl="public, max-age=86400",
            Metadata={
                "hsid": school["hsid"],
                "source-sha256": checksum,
                "school-signature": school_signature(school),
                "source": "maxpreps",
            },
        )
    except ClientError as err:
        status = err.response.get("ResponseMetadata", {}).get("HTTPStatusCode")
        if status in (409, 412) or err.response.get("Error", {}).get("Code") in (
                "PreconditionFailed", "ConditionalRequestConflict"):
            return "already_live_race_skipped"
        raise

    published = s3.get_object(Bucket=bucket, Key=key)
    written = published["Body"].read()
    if hashlib.sha256(written).hexdigest() != checksum:
        raise RuntimeError(f"Post-publish S3 checksum mismatch: {key}")
    if published.get("ContentType", "").split(";")[0].lower() != "image/png":
        raise RuntimeError(f"Post-publish S3 ContentType mismatch: {key}")
    return "published"


def one_batch(s3, bucket: str, ids: list[str], report: dict[str, dict],
              schools: dict[str, dict]) -> list[dict]:
    published = existing_hsids(s3, bucket, LIVE)
    staged = existing_hsids(s3, bucket, STAGE)
    rows = []
    sitemap = None
    for i, hsid in enumerate(ids, 1):
        school = schools.get(hsid)
        out = {"hsid": hsid, "school": school["name"] if school else "",
               "status": "exception", "reason": "", "source_page": "",
               "published_key": f"{LIVE}{hsid}.png"}
        try:
            if school is None:
                out["reason"] = "hsid_missing_from_live_neon"
            elif hsid in published:
                out["status"] = "already_live"
            elif hsid not in staged:
                earlier = report.get(hsid) or {}
                out["reason"] = str(earlier.get("status") or "no_staged_candidate")
            else:
                row = report.get(hsid)
                fresh = bool(row and row.get("status") == "staged")
                if not fresh:
                    if sitemap is None:
                        sitemap = load_sitemap()
                    # Fetch current source, verify exact provenance for objects
                    # from older runs which lack embedded identity metadata.
                    row = _candidate_from_maxpreps(school, sitemap)
                out["source_page"] = row.get("page", "")
                result, png = verify_s3_row(s3, bucket, STAGE, row, school)
                allowed, reason = can_auto_publish(result, row, is_legacy=not fresh)
                if not allowed:
                    out["reason"] = reason
                elif png is None:
                    out["reason"] = "staged_s3_read_failed"
                else:
                    live_key = f"{LIVE}{hsid}.png"
                    out["status"] = put_live_if_missing(
                        s3, bucket, live_key, png, school, out["source_page"])
                    if out["status"] == "published":
                        published.add(hsid)
        except Exception as exc:
            out["reason"] = "error_" + type(exc).__name__ + ": " + str(exc)[:200]
            LOG.exception("HSID %s: publication blocked", hsid)
        rows.append(out)
        if out["status"] == "exception":
            LOG.warning("EXCEPTION HSID=%s school=%s reason=%s", hsid, out["school"], out["reason"])
        elif i % 25 == 0:
            LOG.info("PROGRESS %d/%d", i, len(ids))
    return rows


def write_reports(rows: list[dict]):
    fields = ["hsid", "school", "status", "reason", "source_page", "published_key"]
    errors = [row for row in rows if row["status"] == "exception"]
    with open("logo_exceptions.csv", "w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(errors)
    with open("logo_batch_summary.csv", "w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)
    counters = {}
    for row in rows:
        counters[row["status"]] = counters.get(row["status"], 0) + 1
    LOG.info("PUBLICATION SUMMARY processed=%d published=%d already_live=%d exceptions=%d",
             len(rows), counters.get("published", 0),
             counters.get("already_live", 0) + counters.get("already_live_race_skipped", 0),
             len(errors))
    return len(errors)


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--hsids", required=True, help="Comma-separated canonical Neon HSIDs")
    p.add_argument("--report", default="logo_report.csv")
    p.add_argument("--bucket", default=BUCKET)
    args = p.parse_args()
    ids = [value.strip() for value in args.hsids.split(",") if value.strip()]
    if len(ids) == 0 or len(ids) > 100 or len(ids) != len(set(ids)):
        p.error("Expected 1-100 distinct HSIDs")
    if any(not h.isdecimal() or int(h) < 1 for h in ids):
        p.error("Only canonical numeric HSIDs allowed")
    s3 = boto3.client("s3", region_name="us-west-2")
    schools = canonical_schools()
    exceptions = write_reports(one_batch(s3, args.bucket, ids, load_report(args.report), schools))
    # Exceptions are expected and handled in the final summary; they do
    # not cancel subsequent matrix jobs. Tool/setup failures still fail jobs.
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
