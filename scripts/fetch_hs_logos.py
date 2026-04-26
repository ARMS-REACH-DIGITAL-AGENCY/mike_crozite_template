"""
fetch_hs_logos.py
-----------------
Fetches high school logos in priority order:
  1. hslogos.com        - curated static site, high quality logos
  2. FieldLevel         - Playwright headless browser, best coverage
  3. MaxPreps           - API fallback
  4. SBLive             - last resort

CSV expected columns: hsid, hsname.1, nickname, city
  - city format: "CityName,ST"
  - rows with blank hsid are skipped automatically

Usage:
  python fetch_hs_logos.py --csv data/hsid_for_Claude.csv --bucket yatstats-assets \
    --prefix schools/ --region us-west-2 [--limit 10] [--dry-run]

Dependencies:
  pip install boto3 requests beautifulsoup4 playwright
  python -m playwright install --with-deps chromium
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
from bs4 import BeautifulSoup
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

DELAY = 0.8

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json, text/html, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://www.hslogos.com/",
}

SESSION = requests.Session()
SESSION.headers.update(HEADERS)

BROWSER_PAGE = None


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


# ── Image download ────────────────────────────────────────────────────────────

def _absolute_url(url: str, base: str = "") -> str:
    if not url:
        return ""
    if url.startswith("//"):
        return "https:" + url
    if url.startswith("/"):
        return (base or "https://www.hslogos.com") + url
    return url


def _download_image(url: str, base: str = "") -> bytes | None:
    try:
        url = _absolute_url(url, base)
        r = SESSION.get(url, timeout=12, stream=True)
        r.raise_for_status()
        ctype = r.headers.get("Content-Type", "")
        if "image" not in ctype and "octet-stream" not in ctype:
            log.debug(f"    Not image: {ctype} @ {url}")
            return None
        data = r.content
        return data if len(data) > 500 else None
    except Exception as e:
        log.debug(f"    Download error {url}: {e}")
        return None


# ── Normalization helpers ─────────────────────────────────────────────────────

def _norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", (s or "").lower()).strip()


def _normalize_school(name: str) -> str:
    n = _norm(name)
    for suffix in ["high school", "senior high", "high", "hs",
                   "preparatory academy", "preparatory", "prep", "academy"]:
        if n.endswith(suffix):
            n = n[:-len(suffix)].strip()
    return n


# ── Source 1: hslogos.com ─────────────────────────────────────────────────────

HSL_BASE = "https://www.hslogos.com"

STATE_ABBR_TO_NAME = {
    "AL": "Alabama",        "AK": "Alaska",         "AZ": "Arizona",
    "AR": "Arkansas",       "CA": "California",     "CO": "Colorado",
    "CT": "Connecticut",    "DE": "Delaware",       "FL": "Florida",
    "GA": "Georgia",        "HI": "Hawaii",         "ID": "Idaho",
    "IL": "Illinois",       "IN": "Indiana",        "IA": "Iowa",
    "KS": "Kansas",         "KY": "Kentucky",       "LA": "Louisiana",
    "ME": "Maine",          "MD": "Maryland",       "MA": "Massachusetts",
    "MI": "Michigan",       "MN": "Minnesota",      "MS": "Mississippi",
    "MO": "Missouri",       "MT": "Montana",        "NE": "Nebraska",
    "NV": "Nevada",         "NH": "New_Hampshire",  "NJ": "New_Jersey",
    "NM": "New_Mexico",     "NY": "New_York",       "NC": "North_Carolina",
    "ND": "North_Dakota",   "OH": "Ohio",           "OK": "Oklahoma",
    "OR": "Oregon",         "PA": "Pennsylvania",   "RI": "Rhode_Island",
    "SC": "South_Carolina", "SD": "South_Dakota",   "TN": "Tennessee",
    "TX": "Texas",          "UT": "Utah",           "VT": "Vermont",
    "VA": "Virginia",       "WA": "Washington",     "WV": "West_Virginia",
    "WI": "Wisconsin",      "WY": "Wyoming",
}

_HSL_STATE_CACHE: dict[str, dict[str, str]] = {}


def _load_hsl_state(state_abbr: str) -> dict[str, str]:
    if state_abbr in _HSL_STATE_CACHE:
        return _HSL_STATE_CACHE[state_abbr]

    state_name = STATE_ABBR_TO_NAME.get(state_abbr)
    if not state_name:
        _HSL_STATE_CACHE[state_abbr] = {}
        return {}

    index_url = f"{HSL_BASE}/States/{state_name}/search_{state_abbr.lower()}.html"
    log.info(f"  Loading hslogos index: {index_url}")

    try:
        r = SESSION.get(index_url, timeout=15)
        r.raise_for_status()
        soup = BeautifulSoup(r.text, "html.parser")
    except Exception as e:
        log.debug(f"    hslogos state index error: {e}")
        _HSL_STATE_CACHE[state_abbr] = {}
        return {}

    schools = {}
    for a in soup.find_all("a", href=True):
        href = a["href"]
        text = a.get_text(strip=True)
        if "_Schools" in href and href.endswith(".html") and text:
            full_url = href if href.startswith("http") else HSL_BASE + "/" + href.lstrip("/")
            schools[_normalize_school(text)] = full_url

    log.info(f"    hslogos: {len(schools)} schools indexed for {state_abbr}")
    _HSL_STATE_CACHE[state_abbr] = schools
    time.sleep(DELAY)
    return schools


def _find_hsl_match(name: str, state_schools: dict[str, str]) -> str | None:
    norm = _normalize_school(name)

    if norm in state_schools:
        return state_schools[norm]

    for sn, url in state_schools.items():
        if norm in sn or sn in norm:
            return url

    norm_words = set(norm.split())
    best, best_url = 0, None
    for sn, url in state_schools.items():
        overlap = len(norm_words & set(sn.split()))
        if overlap > best and overlap >= 2:
            best, best_url = overlap, url

    return best_url


def _get_hsl_logo(school_url: str) -> bytes | None:
    try:
        r = SESSION.get(school_url, timeout=15)
        r.raise_for_status()
        soup = BeautifulSoup(r.text, "html.parser")
    except Exception as e:
        log.debug(f"    hslogos school page error: {e}")
        return None

    skip = ["hsl_official", "favicon", "banner", "nav", "header", "background"]

    for img in soup.find_all("img"):
        src = img.get("src") or img.get("data-src") or ""
        if not src:
            continue
        if any(p in src.lower() for p in skip):
            continue
        url = src if src.startswith("http") else HSL_BASE + "/" + src.lstrip("/")
        data = _download_image(url)
        if data:
            return data

    return None


def search_hslogos(name: str, state: str, city: str = "") -> bytes | None:
    state_schools = _load_hsl_state(state)
    if not state_schools:
        return None
    school_url = _find_hsl_match(name, state_schools)
    if not school_url:
        log.debug(f"    hslogos: no match for '{name}' ({state})")
        return None
    log.debug(f"    hslogos match: {school_url}")
    time.sleep(DELAY)
    return _get_hsl_logo(school_url)


# ── Source 2: FieldLevel (Playwright) ────────────────────────────────────────

def _school_matches(name: str, city: str, state: str, text: str) -> bool:
    text_n = _norm(text)
    name_n = _norm(name)
    city_n = _norm(city)
    state_n = _norm(state)

    if not name_n or not text_n:
        return False
    if "baseball" not in text_n:
        return False
    if "high school" not in text_n:
        return False

    short_name = re.sub(r"\b(high school|school|hs)\b", "", name_n).strip()
    if name_n not in text_n and not (short_name and short_name in text_n):
        return False
    if city_n and city_n not in text_n:
        return False
    if state_n and state_n not in text_n:
        return False
    return True


def _candidate_queries(name: str, city: str, state: str) -> list:
    queries = [name, f"{name} {state}", f"{name} High School {state}"]
    if city:
        queries.append(f"{name} {city} {state}")
    seen, clean = set(), []
    for q in queries:
        q = q.strip()
        if q and q not in seen:
            clean.append(q)
            seen.add(q)
    return clean


def search_fieldlevel(name: str, state: str, city: str = "") -> bytes | None:
    global BROWSER_PAGE
    if BROWSER_PAGE is None:
        log.debug("    Browser not initialized")
        return None

    for q in _candidate_queries(name, city, state):
        url = (
            "https://www.fieldlevel.com/app/teams"
            "?sportEnum=baseball&athleticAssociation=512"
            f"&q={quote(q)}"
        )
        try:
            log.info(f"    FieldLevel search: {q}")
            BROWSER_PAGE.goto(url, wait_until="networkidle", timeout=30000)
            BROWSER_PAGE.wait_for_timeout(2500)

            results = BROWSER_PAGE.evaluate("""
                () => {
                    const anchors = Array.from(document.querySelectorAll(
                        'a[href*="/app/organization/"][href*="/baseball"]'
                    ));
                    return anchors.map((a) => {
                        let el = a;
                        let bestText = '';
                        for (let i = 0; i < 8 && el; i++) {
                            const text = el.innerText || '';
                            if (text.toLowerCase().includes('high school') ||
                                text.toLowerCase().includes('baseball')) {
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

            seen, clean_results = set(), []
            for result in results:
                href = result.get("href") or ""
                if href in seen:
                    continue
                seen.add(href)
                clean_results.append(result)

            log.info(f"    FieldLevel: {len(clean_results)} result(s)")

            for result in clean_results:
                href = result["href"]
                text = result["text"]
                if not href or not _school_matches(name, city, state, text):
                    continue
                match = re.search(r"/app/organization/([^/?#]+)/baseball", href)
                if not match:
                    continue
                shortname = match.group(1)
                logo_url = (
                    f"https://www.fieldlevel.com/media/orglogo"
                    f"?shortname={shortname}&width=200&height=200"
                )
                log.info(f"    FieldLevel match: {href}")
                img = _download_image(logo_url, "https://www.fieldlevel.com")
                if img:
                    return img

        except Exception as e:
            log.debug(f"    FieldLevel browser error '{name}': {e}")

        time.sleep(DELAY)

    return None


# ── Source 3: MaxPreps ────────────────────────────────────────────────────────

MAXPREPS_SEARCH = "https://api.maxpreps.com/gatewayweb/search/v1/site-search"
MAXPREPS_LOGO   = "https://d2ub8l8azeufoa.cloudfront.net/team/{guid}/school-logo.png"

def search_maxpreps(name: str, state: str, city: str = "") -> bytes | None:
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


# ── Source 4: SBLive ─────────────────────────────────────────────────────────

def search_sblive(name: str, state: str, city: str = "") -> bytes | None:
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


# ── Orchestration ─────────────────────────────────────────────────────────────

SOURCES = [
    ("hslogos.com", search_hslogos),
    ("FieldLevel",  search_fieldlevel),
    ("MaxPreps",    search_maxpreps),
    ("SBLive",      search_sblive),
]

def fetch_logo(name: str, state: str, city: str = "") -> tuple:
    for label, fn in SOURCES:
        try:
            img = fn(name, state, city)
        except Exception as e:
            log.debug(f"    {label} exception: {e}")
            img = None
        if img:
            return img, label
        time.sleep(DELAY)
    return None, ""


# ── Main ──────────────────────────────────────────────────────────────────────

def parse_args():
    p = argparse.ArgumentParser(description="Fetch HS logos and upload to S3")
    p.add_argument("--csv",     required=True)
    p.add_argument("--bucket",  required=True)
    p.add_argument("--prefix",  default="schools/")
    p.add_argument("--region",  default="us-west-2")
    p.add_argument("--limit",   type=int, default=0)
    p.add_argument("--dry-run", action="store_true")
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

        img, source = fetch_logo(name, state, city)

        if args.dry_run:
            if img:
                log.info(f"  [DRY RUN] Would upload {hsid}.png via {source} ({len(img):,} bytes)")
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

    log.info("\n" + "=" * 60)
    log.info(f"Done.  ✓ {len(success)} uploaded  |  ✗ {len(failed)} failed")

    if failed:
        out = Path("failed_logos.csv")
        with open(out, "w", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=["hsid", "name", "state", "source"])
            writer.writeheader()
            writer.writerows(failed)
        log.info(f"Failed schools → {out}")


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
