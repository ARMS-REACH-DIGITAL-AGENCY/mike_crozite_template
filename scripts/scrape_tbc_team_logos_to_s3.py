#!/usr/bin/env python3
"""
Scrape The Baseball Cube team logos and upload directly to S3.

Default target:
  s3://yatstats-assets/teams/{teamid}.png

Expected CSV columns:
  teamid,year,page_url

Only teamid is required if --logo-url-template is provided.
Either page_url or year is required for page-scan mode.

Examples:
  python scripts/scrape_tbc_team_logos_to_s3.py \
    --input team_logo_targets.csv \
    --bucket yatstats-assets \
    --prefix teams/ \
    --upload

  python scripts/scrape_tbc_team_logos_to_s3.py \
    --input team_logo_targets.csv \
    --logo-url-template 'https://www.thebaseballcube.com/images/teamlogos/{teamid}.png' \
    --upload

Notes:
- Intended for use from AWS CloudShell or a machine with AWS credentials configured.
- Default behavior is dry-run. Add --upload to write to S3.
- Use respectfully: low request rate, no bypassing access controls, no hammering TBC.
"""

from __future__ import annotations

import argparse
import csv
import mimetypes
import re
import sys
import time
from io import BytesIO
from pathlib import Path
from typing import Iterable
from urllib.parse import urljoin, urlparse

import boto3
import requests
from bs4 import BeautifulSoup

DEFAULT_BUCKET = "yatstats-assets"
DEFAULT_PREFIX = "teams/"
DEFAULT_USER_AGENT = (
    "Mozilla/5.0 (compatible; YatStatsLogoCollector/1.0; "
    "+https://yatstats.com)"
)

IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"}


def clean_teamid(value: str) -> str:
    teamid = str(value or "").strip()
    if not re.fullmatch(r"[A-Za-z0-9_-]+", teamid):
        raise ValueError(f"Invalid teamid: {value!r}")
    return teamid


def read_csv_rows(path: Path) -> list[dict[str, str]]:
    with path.open("r", newline="", encoding="utf-8-sig") as f:
        return list(csv.DictReader(f))


def guess_extension(content_type: str, url: str) -> str:
    parsed_ext = Path(urlparse(url).path).suffix.lower()
    if parsed_ext in IMAGE_EXTENSIONS:
        return parsed_ext

    ext = mimetypes.guess_extension(content_type.split(";")[0].strip())
    if ext in IMAGE_EXTENSIONS:
        return ext

    return ".png"


def content_type_for_ext(ext: str) -> str:
    if ext == ".svg":
        return "image/svg+xml"
    if ext in {".jpg", ".jpeg"}:
        return "image/jpeg"
    if ext == ".webp":
        return "image/webp"
    if ext == ".gif":
        return "image/gif"
    return "image/png"


def score_image_candidate(img, teamid: str) -> int:
    score = 0
    attrs = " ".join(
        str(img.get(attr, ""))
        for attr in ["src", "data-src", "data-original", "alt", "title", "class", "id"]
    ).lower()

    parent = img.parent
    if parent:
        attrs += " " + " ".join(
            str(parent.get(attr, ""))
            for attr in ["href", "class", "id", "title"]
        ).lower()

    teamid_lower = teamid.lower()

    if teamid_lower in attrs:
        score += 200
    if "logo" in attrs:
        score += 80
    if "team" in attrs:
        score += 25
    if "minor" in attrs or "college" in attrs:
        score += 10

    if "player" in attrs or "headshot" in attrs or "person" in attrs:
        score -= 100
    if "ad" in attrs or "advert" in attrs or "banner" in attrs or "sponsor" in attrs:
        score -= 100

    src = str(img.get("src") or img.get("data-src") or img.get("data-original") or "")
    if Path(urlparse(src).path).suffix.lower() in IMAGE_EXTENSIONS:
        score += 20

    width = str(img.get("width") or "")
    height = str(img.get("height") or "")
    if width.isdigit() and height.isdigit():
        w, h = int(width), int(height)
        if 20 <= w <= 700 and 20 <= h <= 700:
            score += 10
        if w > 1200 or h > 1200:
            score -= 40

    return score


def image_sources_from_page(html: str, page_url: str, teamid: str) -> list[str]:
    soup = BeautifulSoup(html, "html.parser")
    candidates: list[tuple[int, str]] = []

    for img in soup.find_all("img"):
        src = img.get("src") or img.get("data-src") or img.get("data-original")
        if not src:
            continue
        src = str(src).strip()
        if src.startswith("data:"):
            continue
        absolute = urljoin(page_url, src)
        score = score_image_candidate(img, teamid)
        if score > 0:
            candidates.append((score, absolute))

    # Also scan raw HTML for image URLs that contain the teamid.
    for match in re.finditer(r"https?://[^'\"\s)]+", html):
        url = match.group(0)
        if teamid in url and Path(urlparse(url).path).suffix.lower() in IMAGE_EXTENSIONS:
            candidates.append((250, url))

    candidates.sort(reverse=True, key=lambda item: item[0])
    deduped: list[str] = []
    seen = set()
    for _, url in candidates:
        if url in seen:
            continue
        seen.add(url)
        deduped.append(url)
    return deduped


def build_page_url(row: dict[str, str]) -> str:
    page_url = str(row.get("page_url") or "").strip()
    if page_url:
        return page_url

    year = str(row.get("year") or "").strip()
    teamid = clean_teamid(row.get("teamid", ""))
    if not year:
        raise ValueError(f"teamid={teamid} needs page_url or year in page-scan mode")

    return f"https://www.thebaseballcube.com/content/stats_minor/{year}~{teamid}/"


def fetch_image(session: requests.Session, url: str, delay: float) -> tuple[bytes, str, str] | None:
    time.sleep(delay)
    resp = session.get(url, timeout=30)
    if resp.status_code != 200:
        print(f"    image failed {resp.status_code}: {url}")
        return None

    content_type = resp.headers.get("content-type", "")
    ext = guess_extension(content_type, url)
    if "image/" not in content_type and ext not in IMAGE_EXTENSIONS:
        print(f"    skipped non-image content-type={content_type}: {url}")
        return None

    return resp.content, ext, content_type_for_ext(ext)


def object_exists(s3, bucket: str, key: str) -> bool:
    try:
        s3.head_object(Bucket=bucket, Key=key)
        return True
    except Exception:
        return False


def upload_image(s3, bucket: str, key: str, data: bytes, content_type: str, dry_run: bool) -> None:
    if dry_run:
        print(f"    DRY RUN would upload s3://{bucket}/{key} ({len(data):,} bytes, {content_type})")
        return

    s3.put_object(
        Bucket=bucket,
        Key=key,
        Body=BytesIO(data),
        ContentType=content_type,
        CacheControl="public, max-age=31536000, immutable",
    )
    print(f"    uploaded s3://{bucket}/{key} ({len(data):,} bytes)")


def direct_logo_candidates(row: dict[str, str], template: str) -> Iterable[str]:
    teamid = clean_teamid(row.get("teamid", ""))
    year = str(row.get("year") or "").strip()
    yield template.format(teamid=teamid, year=year)


def scan_page_candidates(session: requests.Session, row: dict[str, str], delay: float) -> list[str]:
    teamid = clean_teamid(row.get("teamid", ""))
    page_url = build_page_url(row)
    print(f"  scanning {page_url}")
    time.sleep(delay)
    page = session.get(page_url, timeout=30)
    if page.status_code != 200:
        print(f"    page failed {page.status_code}: {page_url}")
        return []
    return image_sources_from_page(page.text, page_url, teamid)


def process_row(session, s3, row: dict[str, str], args) -> bool:
    teamid = clean_teamid(row.get("teamid", ""))
    bucket = args.bucket
    prefix = args.prefix.strip("/") + "/" if args.prefix.strip("/") else ""
    key = f"{prefix}{teamid}.png"

    print(f"\n[{teamid}]")

    if object_exists(s3, bucket, key) and not args.overwrite:
        print(f"  exists, skipping: s3://{bucket}/{key}")
        return False

    if args.logo_url_template:
        candidates = list(direct_logo_candidates(row, args.logo_url_template))
    else:
        candidates = scan_page_candidates(session, row, args.delay)

    if not candidates:
        print("  no logo candidates found")
        return False

    for candidate in candidates[: args.max_candidates]:
        print(f"  candidate: {candidate}")
        image = fetch_image(session, candidate, args.delay)
        if not image:
            continue
        data, _ext, content_type = image
        upload_image(s3, bucket, key, data, content_type, dry_run=not args.upload)
        return True

    print("  no usable candidate image")
    return False


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, help="CSV with teamid and page_url or year")
    parser.add_argument("--bucket", default=DEFAULT_BUCKET)
    parser.add_argument("--prefix", default=DEFAULT_PREFIX)
    parser.add_argument("--delay", type=float, default=1.5)
    parser.add_argument("--upload", action="store_true", help="Actually upload to S3. Without this, dry-run only.")
    parser.add_argument("--overwrite", action="store_true")
    parser.add_argument("--max-candidates", type=int, default=5)
    parser.add_argument("--logo-url-template", default="", help="Optional direct URL template with {teamid} and {year}")
    args = parser.parse_args()

    rows = read_csv_rows(Path(args.input))
    if not rows:
        print("No rows found.")
        return 1

    session = requests.Session()
    session.headers.update({"User-Agent": DEFAULT_USER_AGENT})
    s3 = boto3.client("s3")

    ok = 0
    skipped = 0
    for row in rows:
        try:
            if process_row(session, s3, row, args):
                ok += 1
            else:
                skipped += 1
        except KeyboardInterrupt:
            raise
        except Exception as exc:
            print(f"  ERROR: {exc}", file=sys.stderr)
            skipped += 1

    print("\nDone")
    print(f"Uploaded/found: {ok}")
    print(f"Skipped/errors: {skipped}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
