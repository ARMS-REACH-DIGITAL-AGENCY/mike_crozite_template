"""
fetch_hs_logos.py
-----------------
Fetches high school logos from FieldLevel first using a real browser render,
with MaxPreps + SBLive fallbacks, renames them {hsid}.png, and uploads to S3.

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
import re
import time
from pathlib import Path
from urllib.parse import quote

import boto3
import requests
from botocore.exceptions import ClientError
from playwright.sync_api import sync_playwright

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
    "Referer": "https://www.fieldlevel.com/app/teams?sportEnum=baseball&athleticAssociation=512",
}

SESSION = requests.Session()
SESSION.headers.update(HEADERS)

BROWSER_PAGE = None


# -- CSV parsing ---------------------------------------------------------------

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
                city = parts[0].strip()
                state = parts[1].strip()
            else:
                city = city_field
                state = ""

            schools.append({
                "hsid": hsid,
                "name": row.get("hsname.1", "").strip(),
                "nickname": row.get("nickname", "").strip(),
                "city": city,
                "state": state,
            })

    if skipped:
        log.info(f"Skipped {skipped} row(s) with blank hsid")

    return schools


# -- S3 helpers ----------------------------------------------------------------

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
        log.info(f"  Uploaded -> s3://{bucket}/{key}")
        return True

    except ClientError as e:
        log.error(f"  S3 upload failed for {hsid}: {e}")
        return False


# -- Image download helper -----------------------------------------------------

def _absolute_url(url: str) -> str:
    if not url:
        return ""
    if url.startswith("//"):
        return "https:" + url
    if url.startswith("/"):
        return "https://www.fieldlevel.com" + url
    return url


def _download_image(url: str):
    try:
        url = _absolute_url(url)

        r = SESSION.get(url, timeout=12, stream=True)
        r.raise_for_status()

        ctype = r.headers.get("Content-Type", "")
        if "image" not in ctype and "octet-stream" not in ctype:
            log.debug(f"    Not image content: {ctype} from {url}")
            return None

        data = r.content
        if len(data) < 500:
            log.debug(f"    Image too small: {len(data)} bytes from {url}")
            return None

        return data

    except Exception as e:
        log.debug(f"    Download error {url}: {e}")
        return None


# -- Matching helpers ----------------------------------------------------------

def _norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", (s or "").lower()).strip()


def _school_matches(name: str, city: str, state: str, text: str) -> bool:
    text_n = _norm(text)
    name_n = _norm(name)
    city_n = _norm(city)
    state_n = _norm(state)

    if not name_n or not text_n:
        return False

    # Must be the baseball listing, not another sport.
    if "baseball" not in text_n:
        return False

    # Must be a high school listing.
    if "high school" not in text_n:
        return False

    # Must match the school name.
    short_name = re.sub(r"\b(high school|school|hs)\b", "", name_n).strip()

    name_matches = (
        name_n in text_n
        or (short_name and short_name in text_n)
    )

    if not name_matches:
        return False

    # Must match city when city is available.
    if city_n and city_n not in text_n:
        return False

    # Must match state when state is available.
    if state_n and state_n not in text_n:
        return False

    return True


def _candidate_queries(name: str, city: str, state: str) -> list:
    queries = [
        name,
        f"{name} {state}",
        f"{name} High School {state}",
    ]

    if city:
        queries.append(f"{name} {city} {state}")

    clean = []
    seen = set()

    for q in queries:
        q = q.strip()
        if q and q not in seen:
            clean.append(q)
            seen.add(q)

    return clean


# -- FieldLevel primary using browser render ----------------------------------

def search_fieldlevel(name: str, state: str, city: str = ""):
    global BROWSER_PAGE

    if BROWSER_PAGE is None:
        log.warning("    Browser page not initialized for FieldLevel")
        return None

    for q in _candidate_queries(name, city, state):
        url = (
            "https://www.fieldlevel.com/app/teams"
            "?sportEnum=baseball"
            "&athleticAssociation=512"
            f"&q={quote(q)}"
        )

        try:
            log.info(f"    FieldLevel search: {q}")

            BROWSER_PAGE.goto(url, wait_until="networkidle", timeout=30000)
            BROWSER_PAGE.wait_for_timeout(2500)

            results = BROWSER_PAGE.evaluate("""
                () => {
                    const anchors = Array.from(document.querySelectorAll('a[href*="/app/organization/"][href*="/baseball"]'));

                    return anchors.map((a) => {
                        let el = a;
                        let bestText = '';

                        for (let i = 0; i < 8 && el; i++) {
                            const text = el.innerText || '';
                            if (
                                text.toLowerCase().includes('high school') ||
                                text.toLowerCase().includes('baseball')
                            ) {
                                bestText = text;
                            }
                            el = el.parentElement;
                        }

                        return {
                            href: a.href || a.getAttribute('href') || '',
                            text: bestText || a.innerText || ''
                        };
                    });
                }
            """)

            # Remove duplicate organization links
            clean_results = []
            seen = set()

            for result in results:
                href = result.get("href") or ""
                text = result.get("text") or ""

                if href in seen:
                    continue

                seen.add(href)
                clean_results.append({"href": href, "text": text})

            log.info(f"    FieldLevel found {len(clean_results)} baseball organization result(s)")

            for result in clean_results:
                href = result["href"]
                text = result["text"]

                if not href:
                    continue

                if not _school_matches(name, city, state, text):
                    continue

                match = re.search(r"/app/organization/([^/?#]+)/baseball", href)
                if not match:
                    continue

                shortname = match.group(1)

                logo_url = (
                    "https://www.fieldlevel.com/media/orglogo"
                    f"?shortname={shortname}"
                    "&width=200"
                    "&height=200"
                )

                log.info(f"    FieldLevel baseball org match: {href}")
                log.info(f"    FieldLevel logo URL: {logo_url}")

                img = _download_image(logo_url)
                if img:
                    return img

        except Exception as e:
            log.debug(f"    FieldLevel browser error for '{name}': {e}")

        time.sleep(DELAY)

    return None

# -- MaxPreps fallback ---------------------------------------------------------

MAXPREPS_SEARCH = "https://api.maxpreps.com/gatewayweb/search/v1/site-search"
MAXPREPS_LOGO = "https://d2ub8l8azeufoa.cloudfront.net/team/{guid}/school-logo.png"

def search_maxpreps(name: str, state: str, city: str = ""):
    try:
        resp = SESSION.get(
            MAXPREPS_SEARCH,
            params={"term": f"{name} {state}"},
            timeout=10,
        )
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


# -- SBLive fallback -----------------------------------------------------------

def search_sblive(name: str, state: str, city: str = ""):
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


# -- Orchestration -------------------------------------------------------------

SOURCES = [
    ("FieldLevel", search_fieldlevel),
    ("MaxPreps", search_maxpreps),
    ("SBLive", search_sblive),
]

def fetch_logo(name: str, state: str, city: str = ""):
    for label, fn in SOURCES:
        img = fn(name, state, city)
        if img:
            return img, label

        time.sleep(DELAY)

    return None, ""


# -- Main ----------------------------------------------------------------------

def parse_args():
    p = argparse.ArgumentParser(description="Fetch HS logos and upload to S3")
    p.add_argument("--csv", required=True, help="Path to schools CSV")
    p.add_argument("--bucket", required=True, help="S3 bucket name")
    p.add_argument("--prefix", default="schools/", help="S3 key prefix")
    p.add_argument("--region", default="us-west-2", help="AWS region")
    p.add_argument("--limit", type=int, default=0, help="Max schools to process (0=all)")
    p.add_argument("--dry-run", action="store_true", help="Skip S3 upload")
    return p.parse_args()


def run_job():
    args = parse_args()

    csv_path = Path(args.csv)
    if not csv_path.exists():
        log.error(f"CSV not found: {args.csv}")
        return

    schools = load_schools(csv_path)
    log.info(f"Loaded {len(schools)} schools from CSV")

    if args.dry_run:
        log.info("DRY RUN MODE - no uploads will happen")

    s3 = boto3.client("s3", region_name=args.region)

    log.info("Checking existing S3 objects...")
    existing = get_existing_hsids(s3, args.bucket, args.prefix)
    log.info(f"  {len(existing)} logos already in S3 - skipping those")

    todo = [s for s in schools if s["hsid"] not in existing]

    if args.limit and args.limit > 0:
        todo = todo[:args.limit]
        log.info(f"  Limiting to first {args.limit} schools")

    log.info(f"  {len(todo)} logos to fetch\n")

    success, failed = [], []

    for i, school in enumerate(todo, 1):
        hsid = school["hsid"]
        name = school["name"]
        state = school["state"]
        city = school["city"]

        log.info(f"[{i:>4}/{len(todo)}]  {name} ({city}, {state})  ->  {hsid}.png")

        img, source = fetch_logo(name, state, city)

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
                log.warning(f"  No logo found for {name} ({state})")
                failed.append({"hsid": hsid, "name": name, "state": state, "source": "none"})

        time.sleep(DELAY)

    log.info("\n" + "=" * 60)
    log.info(f"Done.  Success: {len(success)}  |  Failed: {len(failed)}")

    if failed:
        out = Path("failed_logos.csv")
        with open(out, "w", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=["hsid", "name", "state", "source"])
            writer.writeheader()
            writer.writerows(failed)
        log.info(f"Failed schools saved to -> {out}")


def main():
    global BROWSER_PAGE

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            user_agent=HEADERS["User-Agent"],
            viewport={"width": 1440, "height": 1200},
        )
        BROWSER_PAGE = context.new_page()

        try:
            run_job()
        finally:
            browser.close()


if __name__ == "__main__":
    main()
