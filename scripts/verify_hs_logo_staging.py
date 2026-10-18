#!/usr/bin/env python3
"""Independent HSID, source-provenance, image-alpha and S3 read-back checks.

No S3 writes, moves, deletes, or publishing. Results are logged to
logo_verification.csv and an optional HTML contact sheet.

Normal mode verifies the precise candidates just uploaded by
fetch_hs_logos_expanded.py, using the CSV's source and image SHA256.
Audit mode independently checks existing staged PNGs against live Neon and
re-fetches the matched MaxPreps source where possible.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import html
import io
import logging
import re
from pathlib import Path
from urllib.parse import urlparse

from PIL import Image, UnidentifiedImageError

LOG = logging.getLogger("hs-logo-verification")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

BUCKET = "yatstats-assets"
STAGE_PREFIX = "schools-candidates/"
MIN_TRANSPARENT = 0.01
MIN_OPAQUE = 0.01
CITY_ALIASES = {
    ("FL", "hallandale beach"): {"hallandale"},
}


def norm(value: object) -> str:
    return re.sub(r"[^a-z0-9]+", " ", str(value or "").casefold()).strip()


def slug(value: object) -> str:
    return norm(value).replace(" ", "-")


def city_matches(state: str, expected: str, observed: str) -> bool:
    expected_n = norm(expected)
    observed_n = norm(observed)
    return (expected_n == observed_n
            or observed_n in CITY_ALIASES.get((state.upper(), expected_n), set()))


def school_signature(school: dict) -> str:
    identity = "|".join(str(school[k]).strip() for k in
                        ("hsid", "name", "nickname", "city", "state"))
    return hashlib.sha256(identity.encode("utf-8")).hexdigest()


def verify_identity(row: dict, school: dict, prefix: str = STAGE_PREFIX) -> list[str]:
    failures = []
    hsid = str(row.get("hsid") or "")
    expected_key = f"{prefix}{hsid}.png"
    if not hsid.isdecimal() or hsid != str(school.get("hsid")):
        failures.append("hsid_not_canonical")
    if row.get("key") != expected_key:
        failures.append("s3_key_not_canonical_hsid")
    for field in ("name", "nickname", "city", "state"):
        if norm(row.get(field)) != norm(school.get(field)):
            failures.append(f"neon_{field}_mismatch")
    return failures


def verify_source(row: dict, school: dict) -> tuple[list[str], list[str]]:
    """Validate source school vs canonical name, state, city and mascot.

    Weak-but-plausible matches are reported for human review, never
    considered approved. Definite location or mascot mismatches fail.
    """
    failures, warnings = [], []
    url = urlparse(str(row.get("page") or ""))
    parts = [part for part in url.path.split("/") if part]
    if (url.scheme != "https" or url.hostname not in {"www.maxpreps.com", "maxpreps.com"}
            or len(parts) != 3):
        return ["source_page_invalid"], warnings

    source_state, source_city, source_slug = parts
    if source_state.upper() != school["state"].upper():
        failures.append("source_state_mismatch")
    if not city_matches(school["state"], school["city"], source_city.replace("-", " ")):
        failures.append("source_url_city_mismatch")

    expected_slug = slug(school["name"]) + "-" + slug(school["nickname"])
    if source_slug != expected_slug:
        warnings.append("source_url_school_name_not_exact")

    visible = str(row.get("page_seen") or "").strip()
    if " / " not in visible:
        warnings.append("source_page_city_mascot_unavailable")
    else:
        observed_city, observed_mascot = visible.rsplit(" / ", 1)
        if not city_matches(school["state"], school["city"], observed_city):
            failures.append("source_page_city_mismatch")
        if norm(school["nickname"]) != norm(observed_mascot):
            failures.append("source_page_mascot_mismatch")

    try:
        score = int(row.get("score") or 0)
        runner_up = int(row.get("runner_up") or 0)
        if score < 85 or score - runner_up < 15:
            warnings.append("source_match_ambiguous")
    except (TypeError, ValueError):
        warnings.append("source_match_score_unavailable")
    return failures, warnings


def inspect_png(data: bytes, expected_hash: str = "") -> tuple[list[str], dict]:
    failures: list[str] = []
    stats: dict = {"sha256": hashlib.sha256(data).hexdigest(),
                   "transparent_percent": "", "width": "", "height": ""}
    if expected_hash and stats["sha256"] != expected_hash:
        failures.append("s3_bytes_differ_from_processed_source")
    if not data.startswith(b"\x89PNG\r\n\x1a\n"):
        return failures + ["not_png"], stats
    try:
        with Image.open(io.BytesIO(data)) as verify_image:
            if verify_image.format != "PNG":
                failures.append("wrong_image_format")
            verify_image.verify()  # Detect truncated/corrupt PNG chunks.
        with Image.open(io.BytesIO(data)) as image:
            image.load()
            stats["width"], stats["height"] = image.size
            if image.width < 48 or image.height < 48:
                failures.append("image_too_small")
            if image.mode not in ("RGBA", "LA") and "transparency" not in image.info:
                return failures + ["missing_alpha_channel"], stats
            alpha = image.convert("RGBA").getchannel("A")
            histogram = alpha.histogram()
            total = image.width * image.height
            transparent = sum(histogram[:11]) / total
            opaque = sum(histogram[245:]) / total
            stats["transparent_percent"] = round(transparent * 100, 2)
            if transparent < MIN_TRANSPARENT:
                failures.append("background_not_sufficiently_transparent")
            if opaque < MIN_OPAQUE:
                failures.append("logo_not_sufficiently_opaque")
            for xy in ((0, 0), (image.width - 1, 0),
                       (0, image.height - 1), (image.width - 1, image.height - 1)):
                if alpha.getpixel(xy) > 10:
                    failures.append("nontransparent_canvas_corner")
                    break
    except (OSError, ValueError, UnidentifiedImageError, Image.DecompressionBombError) as exc:
        failures.append("invalid_png:" + type(exc).__name__)
    return failures, stats


def canonical_schools():
    # A deliberately independent database read; never trust a CSV as the
    # authoritative HSID mapping.
    from fetch_hs_logos_expanded import load_schools
    return {school["hsid"]: school for school in load_schools()}


def list_staged_ids(s3, bucket: str, prefix: str) -> list[str]:
    ids = set()
    for page in s3.get_paginator("list_objects_v2").paginate(Bucket=bucket, Prefix=prefix):
        for obj in page.get("Contents", []):
            tail = obj["Key"][len(prefix):]
            if re.fullmatch(r"[0-9]+\.png", tail):
                ids.add(tail[:-4])
    return sorted(ids, key=int)


def _candidate_from_maxpreps(school: dict, sitemap: dict) -> dict:
    # Independent provenance check for files staged by older runs without
    # source metadata or an accompanying SHA256 in the report.
    import fetch_hs_logos_expanded as collector
    from urllib.parse import quote
    score, runner_up, page = collector.match(school, sitemap)
    row = dict(school, score=score, runner_up=runner_up, page=page,
               page_seen="", image_sha256="", key=f"{STAGE_PREFIX}{school['hsid']}.png")
    if not page or score < 50:
        return row
    try:
        url, seen = collector.logo_url_from_page(page)
        row["page_seen"] = seen
        if url:
            response = collector.SESSION.get(url, timeout=30)
            response.raise_for_status()
            png = collector.make_png(response.content)
            if png:
                row["image_sha256"] = hashlib.sha256(png).hexdigest()
    except Exception as exc:
        LOG.warning("Source re-check unavailable for %s: %s", school["hsid"], exc)
    return row


def verify_s3_row(s3, bucket: str, prefix: str, row: dict, school: dict) -> tuple[dict, bytes | None]:
    record = {"hsid": row.get("hsid", ""), "school": row.get("name", ""),
              "s3_key": row.get("key", ""), "source_page": row.get("page", ""),
              "score": row.get("score", ""), "status": "FAILED",
              "alpha_transparent_percent": "", "sha256": "", "width": "", "height": "",
              "failures": "", "review_flags": ""}
    failures = verify_identity(row, school, prefix)
    source_failures, warnings = verify_source(row, school)
    failures.extend(source_failures)
    if not row.get("image_sha256"):
        warnings.append("source_image_hash_not_available")

    data = None
    expected_key = f"{prefix}{row['hsid']}.png"
    try:
        obj = s3.get_object(Bucket=bucket, Key=expected_key)
        data = obj["Body"].read()
        if obj.get("ContentType", "").lower().split(";")[0].strip() != "image/png":
            failures.append("s3_content_type_not_png")
        meta = {k.lower(): v for k, v in (obj.get("Metadata") or {}).items()}
        if meta:
            if meta.get("hsid") != row["hsid"]:
                failures.append("s3_metadata_hsid_mismatch")
            if meta.get("source-sha256") and meta["source-sha256"] != hashlib.sha256(data).hexdigest():
                failures.append("s3_metadata_image_hash_mismatch")
            if meta.get("school-signature") and meta["school-signature"] != school_signature(school):
                failures.append("s3_metadata_school_signature_mismatch")
        else:
            warnings.append("legacy_s3_object_without_provenance_metadata")
        image_failures, stats = inspect_png(data, str(row.get("image_sha256") or ""))
        failures.extend(image_failures)
        record["alpha_transparent_percent"] = stats["transparent_percent"]
        record["sha256"] = stats["sha256"]
        record["width"] = stats["width"]
        record["height"] = stats["height"]
    except Exception as exc:
        failures.append("s3_readback_failed:" + type(exc).__name__)
    record["failures"] = ";".join(dict.fromkeys(failures))
    record["review_flags"] = ";".join(dict.fromkeys(warnings))
    if failures:
        record["status"] = "FAILED"
    elif warnings:
        record["status"] = "REVIEW_REQUIRED"
    else:
        record["status"] = "VERIFIED_PENDING_VISUAL_REVIEW"
    return record, data


def write_review_page(records: list[dict], thumbnails: dict[str, str], target: Path):
    cards = []
    for row in records:
        src = thumbnails.get(str(row["hsid"]), "")
        image = (f'<img src="data:image/png;base64,{src}">' if src else "")
        def safe(k):
            return html.escape(str(row.get(k, "")))
        cards.append(
            f'<section><h3>HSID {safe("hsid")} — {safe("school")}</h3>{image}'
            f'<p><b>{safe("status")}</b></p><p>{safe("failures")}</p>'
            f'<p>{safe("review_flags")}</p><p>{safe("source_page")}</p></section>'
        )
    target.write_text(
        "<!doctype html><html><head><meta charset='utf-8'><title>HS logo storage audit</title>"
        "<style>body{font:14px system-ui;background:#f3f3f3;padding:20px}"
        "main{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:14px}"
        "section{background:white;border:1px solid #aaa;border-radius:9px;padding:12px}"
        "img{width:170px;height:170px;object-fit:contain;display:block;margin:auto;"
        "background:repeating-conic-gradient(#ddd 0% 25%,white 0% 50%) 0 0/20px 20px}"
        "p{overflow-wrap:anywhere}</style></head><body><h1>S3 high-school logo audit</h1>"
        "<p>Every image remains pending human visual approval. "
        "REVIEW_REQUIRED means an automated check cannot establish every detail.</p>"
        f"<main>{''.join(cards)}</main></body></html>", encoding="utf-8")


def main() -> int:
    p = argparse.ArgumentParser(description="Read-back audit of staged school logos; never writes to S3")
    p.add_argument("--report", default="")
    p.add_argument("--audit", action="store_true", help="Audit existing staging files independently")
    p.add_argument("--hsids", default="")
    p.add_argument("--limit", type=int, default=10)
    p.add_argument("--bucket", default=BUCKET)
    p.add_argument("--stage-prefix", default=STAGE_PREFIX)
    args = p.parse_args()
    if args.limit < 1 or args.limit > 100:
        p.error("--limit must be between 1 and 100")
    if not args.stage_prefix.endswith("/") or args.stage_prefix == "schools/":
        p.error("Must audit the isolated staging prefix, not production")
    if bool(args.report) == bool(args.audit):
        p.error("Supply exactly one of --report or --audit")

    import boto3
    s3 = boto3.client("s3", region_name="us-west-2")
    schools = canonical_schools()
    if args.audit:
        ids = list_staged_ids(s3, args.bucket, args.stage_prefix)
        if args.hsids:
            allowed = {v.strip() for v in args.hsids.split(",") if v.strip()}
            ids = [value for value in ids if value in allowed]
        ids = ids[:args.limit]
        from fetch_hs_logos_expanded import load_sitemap
        sitemap = load_sitemap() if ids else {}
        rows = [_candidate_from_maxpreps(schools[i], sitemap) for i in ids if i in schools]
        # Any staged object with no canonical school association is a hard error.
        unknown_ids = [i for i in ids if i not in schools]
        if unknown_ids:
            LOG.error("Staged HSIDs absent from the canonical school population: %s", unknown_ids)
    else:
        with open(args.report, newline="", encoding="utf-8") as stream:
            rows = [row for row in csv.DictReader(stream) if row.get("status") == "staged"]
        unknown_ids = []
    results, thumbs = [], {}
    import base64
    for row in rows:
        school = schools.get(str(row.get("hsid", "")))
        if not school:
            results.append({"hsid": row.get("hsid", ""), "school": row.get("name", ""),
                            "s3_key": row.get("key", ""), "source_page": row.get("page", ""),
                            "score": row.get("score", ""), "status": "FAILED",
                            "failures": "hsid_absent_from_neon", "review_flags": ""})
            continue
        verified, data = verify_s3_row(s3, args.bucket, args.stage_prefix, row, school)
        results.append(verified)
        if data:
            try:
                with Image.open(io.BytesIO(data)) as im:
                    im.thumbnail((170, 170))
                    with io.BytesIO() as buffer:
                        im.save(buffer, format="PNG")
                        thumbs[str(row["hsid"])] = base64.b64encode(buffer.getvalue()).decode()
            except Exception:
                pass
        LOG.info("S3_CHECK HSID=%s status=%s transparent=%s%% failures=%s review=%s",
                 verified["hsid"], verified["status"],
                 verified["alpha_transparent_percent"],
                 verified["failures"] or "-", verified["review_flags"] or "-")

    target = Path("logo_verification.csv")
    fields = ["hsid", "school", "s3_key", "source_page", "score", "status",
              "alpha_transparent_percent", "sha256", "width", "height",
              "failures", "review_flags"]
    with target.open("w", newline="", encoding="utf-8") as stream:
        writer = csv.DictWriter(stream, fieldnames=fields, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(results)
    write_review_page(results, thumbs, Path("logo_verification_review.html"))
    failed = sum(row["status"] == "FAILED" for row in results) + len(unknown_ids)
    review = sum(row["status"] == "REVIEW_REQUIRED" for row in results)
    passed = len(results) - failed + len(unknown_ids) - review
    LOG.info("VERIFICATION SUMMARY audited=%d verified=%d review_required=%d failed=%d",
             len(results) + len(unknown_ids), passed, review, failed)
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
