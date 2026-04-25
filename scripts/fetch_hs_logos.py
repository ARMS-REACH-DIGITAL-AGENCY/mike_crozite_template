"""
fetch_hs_logos.py
-----------------
Fetches high school logos from MaxPreps (with SBLive + FieldLevel fallbacks),
renames them {hsid}.png, and uploads to S3.

CSV expected columns: hsid, hsname.1, nickname, city
  - city format: "CityName,ST"
  - rows with blank hsid are skipped automatically

Usage:
  python fetch_hs_logos.py --csv data/hsid_for_Claude.csv --bucket yatstats-assets \
    --prefix schools/ --region us-west-2 [--limit 10] [--dry-run]
"""

import argparse
import csv
import logging
import time
from pathlib import Path

import boto3
import requests
from botocore.exceptions import ClientError

LOG_FILE = "fetch_logos.log"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    handlers=[
        logging.FileHandler(LOG_FILE),
        logging.StreamHandler(),
    ],
)
log = logging.getLogger(__name__)

DELAY = 0.6

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json, text/html, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://www.maxpreps.com/",
}

SESSION = requests.Session()
SESSION.headers.update(HEADERS)


# ── CSV parsing ───────────────────────────────────────────────────────────────

def load_schools(csv_path: Path) -> list:
    schools = []
    skipped = 0
    with open(csv_path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            hsid = row.get("hsid", "").strip()
            if not hsid:
                skipped += 1
                continue
            city_field = row.get("city", "").strip()
            if "," in city_field:
                parts = city_field.rsplit(",", 1)
                city  = parts[0].strip()
                state = parts[1].strip()
            else:
                city  = city_field
                state = ""
            schools.append({
                "hsid":     hsid,
                "name":     row.get("hsname.1", "").strip(),
                "nickname": row.get("nickname", "").strip(),
                "city":     city,
                "state":    state,
            })
    if skipped:
        log.info(f"Skipped {skipped} row(s) with blank hsid")
    return schools


# ── S3 helpers ────────────────────────────────────────────────────────────────

def get_existing_hsids(s3_client, bucket: str, prefix: str) -> set:
    existing = set()
    paginator = s3_client.get_paginator("list_objects_v2")
    for page in paginator.paginate(Bucket=bucket, Prefix=prefix):
        for obj in page.get("Contents", []):
            filename = obj["Key"].replace(prefix, "")
            if filename.endswith(".png"):
                existing.add(filename[:-4])
    return existing


def upload_to_s3(s3_client, image_bytes: bytes, hsid: str, bucket: str, prefix: str) -> bool:
    key = f"{prefix}{hsid}.png"
    try:
        s3_client.put_object(
            Bucket=bucket,
            Key=key,
            Body=image_bytes,
            ContentType="image/png",
        )
        log.info(f"  ✓  Uploaded → s3://{bucket}/{key}")
        return True
    except ClientError as e:
        log.error(f"  ✗  S3 upload failed for {hsid}: {e}")
        return False


# ── Image download helper ─────────────────────────────────────────────────────

def _download_image(url: str):
    try:
        r = SESSION.get(url, timeout=10, stream=True)
        r.raise_for_status()
        ctype = r.headers.get("Content-Type", "")
        if "image" not in ctype and "octet-stream" not in ctype:
            return None
        data = r.content
        if len(data) < 500:
            return None
        return data
    except Exception as e:
        log.debug(f"    Download error {url}: {e}")
        return None


# ── MaxPreps ──────────────────────────────────────────────────────────────────

MAXPREPS_SEARCH = "https://api.maxpreps.com/gatewayweb/search/v1/site-search"
MAXPREPS_LOGO   = "https://d2ub8l8azeufoa.cloudfront.net/team/{guid}/school-logo.png"

def search_maxpreps(name: str, state: str):
    try:
        resp = SESSION.get(MAXPREPS_SEARCH, params={"term": f"{name} {state}"}, timeout=10)
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        log.debug(f"    MaxPreps error '{name}': {e}")
        return None

    schools = data.get("schools") or data.get("results") or []

    def score(s):
        loc = (s.get("location") or s.get("city") or "").upper()
        return 1 if state.upper() in loc else 0

    for school in sorted(schools, key=score, reverse=True)[:5]:
        logo_url = school.get("logoUrl") or school.get("logo")
        if not logo_url:
            guid = school.get("id") or school.get("schoolId")
            if guid:
                logo_url = MAXPREPS_LOGO.format(guid=guid)
        if logo_url:
            img = _download_image(logo_url)
            if img:
                return img
    return None


# ── SBLive fallback ───────────────────────────────────────────────────────────

def search_sblive(name: str, state: str):
    try:
        resp = SESSION.get(
            "https://scorebook.com/api/v1/schools/search",
            params={"q": name, "state": state},
            timeout=10,
        )
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        log.debug(f"    SBLive error '{name}': {e}")
        return None
    for school in (data.get("schools") or data.get("results") or [])[:5]:
        logo_url = school.get("logo") or school.get("logoUrl") or school.get("image")
        if logo_url:
            img = _download_image(logo_url)
            if img:
                return img
    return None


# ── FieldLevel fallback ───────────────────────────────────────────────────────

def search_fieldlevel(name: str, state: str):
    try:
        resp = SESSION.get(
            "https://www.fieldlevel.com/api/search/schools",
            params={"q": f"{name} {state}"},
            timeout=10,
        )
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        log.debug(f"    FieldLevel error '{name}': {e}")
        return None
    for school in (data.get("results") or [])[:5]:
        logo_url = school.get("logoUrl") or school.get("logo")
        if logo_url:
            img = _download_image(logo_url)
            if img:
                return img
    return None


# ── Orchestration ─────────────────────────────────────────────────────────────

SOURCES = [
    ("MaxPreps",   search_maxpreps),
    ("SBLive",     search_sblive),
    ("FieldLevel", search_fieldlevel),
]

def fetch_logo(name: str, state: str):
    for label, fn in SOURCES:
        img = fn(name, state)
        if img:
            return img, label
        time.sleep(DELAY)
    return None, ""


# ── Main ──────────────────────────────────────────────────────────────────────

def parse_args():
    p = argparse.ArgumentParser(description="Fetch HS logos and upload to S3")
    p.add_argument("--csv",    required=True,  help="Path to schools CSV")
    p.add_argument("--bucket", required=True,  help="S3 bucket name")
    p.add_argument("--prefix", default="schools/", help="S3 key prefix")
    p.add_argument("--region", default="us-west-2", help="AWS region")
    p.add_argument("--limit",  type=int, default=0, help="Max schools to process (0=all)")
    p.add_argument("--dry-run", action="store_true", help="Skip S3 upload")
    return p.parse_args()


def main():
    args = parse_args()

    csv_path = Path(args.csv)
    if not csv_path.exists():
        log.error(f"CSV not found: {args.csv}")
        return

    schools = load_schools(csv_path)
    log.info(f"Loaded {len(schools)} schools from CSV")

    if args.dry_run:
        log.info("DRY RUN MODE — no uploads will happen")

    s3 = boto3.client("s3", region_name=args.region)

    log.info("Checking existing S3 objects…")
    existing = get_existing_hsids(s3, args.bucket, args.prefix)
    log.info(f"  {len(existing)} logos already in S3 — skipping those")

    todo = [s for s in schools if s["hsid"] not in existing]
    if args.limit and args.limit > 0:
        todo = todo[:args.limit]
        log.info(f"  Limiting to first {args.limit} schools")

    log.info(f"  {len(todo)} logos to fetch\n")

    success, failed = [], []

    for i, school in enumerate(todo, 1):
        hsid  = school["hsid"]
        name  = school["name"]
        state = school["state"]
        city  = school["city"]

        log.info(f"[{i:>4}/{len(todo)}]  {name} ({city}, {state})  →  {hsid}.png")

        img, source = fetch_logo(name, state)

        if args.dry_run:
            if img:
                log.info(f"  [DRY RUN] Would upload {hsid}.png (found via {source}, {len(img)} bytes)")
                success.append({"hsid": hsid, "name": name, "state": state, "source": source})
            else:
                log.warning(f"  [DRY RUN] No logo found for {name} ({state})")
                failed.append({"hsid": hsid, "name": name, "state": state, "source": "none"})
        else:
            if img:
                ok = upload_to_s3(s3, img, hsid, args.bucket, args.prefix)
                entry = {"hsid": hsid, "name": name, "state": state, "source": source}
                (success if ok else failed).append(entry)
            else:
                log.warning(f"  ✗  No logo found for {name} ({state})")
                failed.append({"hsid": hsid, "name": name, "state": state, "source": "none"})

        time.sleep(DELAY)

    # ── Summary ───────────────────────────────────────────────────────────────
    log.info("\n" + "=" * 60)
    log.info(f"Done.  ✓ Success: {len(success)}  |  ✗ Failed: {len(failed)}")

    if failed:
        out = Path("failed_logos.csv")
        with open(out, "w", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=["hsid", "name", "state", "source"])
            writer.writeheader()
            writer.writerows(failed)
        log.info(f"Failed schools saved to → {out}")


if __name__ == "__main__":
    main()
