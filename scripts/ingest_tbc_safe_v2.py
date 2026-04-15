#!/usr/bin/env python3
"""Safe snapshot-first ingest for TBC YAT stats feeds with validation and delta tracking."""

from __future__ import annotations

import argparse
import csv
import io
import json
import os
import sys
import uuid
import re
import logging
from dataclasses import dataclass
from datetime import date, datetime, timezone
from typing import Iterable, List, Dict, Tuple, Any

import psycopg
import requests

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    stream=sys.stdout
)
logger = logging.getLogger(__name__)

try:
    import cloudscraper
except ImportError:
    cloudscraper = None

try:
    from playwright.sync_api import sync_playwright
except ImportError:
    sync_playwright = None

BASE_URL = "https://thebaseballcube.com/data/feed/yatstats"
VALID_FEEDS = ("players", "batting", "pitching")
HEADER_RENAMES = {
    "2b": "dbl",
    "3b": "tpl",
}
REQUEST_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/122.0.0.0 Safari/537.36"
    ),
    "Accept": "text/csv,application/json;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Cache-Control": "no-cache",
    "Pragma": "no-cache",
    "Referer": "https://thebaseballcube.com/",
}


@dataclass
class FeedConfig:
    feed_type: str
    snapshot_table: str
    expected_cols: int


FEED_TABLES = {
    "players": FeedConfig(feed_type="players", snapshot_table="tbc_players_feed_snapshots", expected_cols=13),
    "batting": FeedConfig(feed_type="batting", snapshot_table="tbc_batting_feed_snapshots", expected_cols=46),
    "pitching": FeedConfig(feed_type="pitching", snapshot_table="tbc_pitching_feed_snapshots", expected_cols=40),
}


class IngestError(Exception):
    pass


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Safely ingest TBC CSV feeds into snapshot tables.")
    parser.add_argument(
        "--feeds",
        default=",".join(VALID_FEEDS),
        help="Comma-separated list of feeds (players,batting,pitching).",
    )
    parser.add_argument(
        "--year",
        type=int,
        default=2026,
        help="Filter stats by year (default: 2026). Use 0 for all years.",
    )
    return parser.parse_args()


def require_env(var_name: str) -> str:
    value = os.getenv(var_name, "").strip()
    if not value:
        raise IngestError(f"Required environment variable is missing: {var_name}")
    return value


def parse_feed_list(raw_feeds: str) -> list[str]:
    feeds = [f.strip().lower() for f in raw_feeds.split(",") if f.strip()]
    if not feeds:
        raise IngestError("No feeds specified. Provide at least one feed.")

    invalid = [f for f in feeds if f not in VALID_FEEDS]
    if invalid:
        raise IngestError(f"Unsupported feeds requested: {', '.join(invalid)}")

    deduped: list[str] = []
    for feed in feeds:
        if feed not in deduped:
            deduped.append(feed)
    return deduped


def build_feed_url(feed_type: str, feed_password: str) -> str:
    return f"{BASE_URL}/{feed_type}/?pw={feed_password}"


def is_html_or_challenge(body: str, content_type: str) -> bool:
    probe = (body[:1000] or "").lower()
    ctype = (content_type or "").lower()
    html_markers = ("<html", "<!doctype", "cloudflare", "just a moment", "captcha")
    return "text/html" in ctype or any(marker in probe for marker in html_markers)


def normalize_header(header: str) -> str:
    normalized = (header or "").strip().lower()
    return HEADER_RENAMES.get(normalized, normalized)


def robust_csv_split(line: str) -> List[str]:
    """
    Splits a CSV line while handling quoted values with commas.
    """
    reader = csv.reader([line])
    try:
        return next(reader)
    except Exception:
        return line.split(',')


def validate_row(feed_type: str, row: dict[str, str]) -> tuple[bool, str | None]:
    """
    Validates a row based on feed-specific rules.
    """
    try:
        if not row.get("playerid"):
            return False, "Missing playerid"

        if feed_type == "players":
            if not row.get("firstname") or not row.get("lastname"):
                return False, "Missing firstname or lastname"
        
        elif feed_type == "batting":
            # Validate numeric fields
            for field in ["ab", "h", "hr", "rbi"]:
                val = row.get(field)
                if val is not None and (not val.strip().isdigit() or int(val) < 0):
                    return False, f"Invalid numeric field: {field}={val}"
            
            # Validate batting average and OPS
            bavg = float(row.get("bavg", 0))
            if bavg < 0 or bavg > 1:
                return False, f"Invalid batting average: {bavg}"
            
            ops = float(row.get("ops", 0))
            if ops < 0 or ops > 2:
                return False, f"Invalid OPS: {ops}"

            # Detect level shift
            highlevel = row.get("highlevel", "")
            if re.match(r'^[0-9.]+$', highlevel):
                return False, f"Level field contains numeric value: {highlevel}"

        elif feed_type == "pitching":
            # Validate numeric fields
            for field in ["ip", "so", "bb"]:
                val = row.get(field)
                try:
                    if val is not None and float(val) < 0:
                        return False, f"Invalid numeric field: {field}={val}"
                except ValueError:
                    return False, f"Non-numeric value in field: {field}={val}"
            
            # Validate ERA
            era = float(row.get("era", 0))
            if era < 0 or era > 20:
                return False, f"Invalid ERA: {era}"

            # Detect level shift
            highlevel = row.get("highlevel", "")
            if re.match(r'^[0-9.]+$', highlevel):
                return False, f"Level field contains numeric value: {highlevel}"

        return True, None
    except Exception as e:
        return False, f"Validation exception: {str(e)}"


def parse_csv_rows(feed_type: str, response_text: str, filter_year: int = 2026) -> tuple[list[str], list[dict[str, str]], list[tuple[dict[str, str], str]]]:
    lines = response_text.strip().splitlines()
    if not lines:
        raise IngestError(f"{feed_type}: empty response")

    header_line = lines[0]
    headers = robust_csv_split(header_line)
    normalized_headers = [normalize_header(h) for h in headers]
    
    if "playerid" not in normalized_headers:
        raise IngestError(f"{feed_type}: required playerid column is missing")

    expected_count = len(normalized_headers)
    valid_rows: list[dict[str, str]] = []
    invalid_rows: list[tuple[dict[str, str], str]] = []
    
    for i, line in enumerate(lines[1:], start=2):
        if not line.strip():
            continue
            
        parts = robust_csv_split(line)
        
        # Defensive alignment: if we have too many columns, try to merge the uniform column
        if len(parts) > expected_count:
            # In batting/pitching(stats), uniform is index 3 (0-based)
            if feed_type in ("batting", "pitching") and expected_count >= 4:
                extra = len(parts) - expected_count
                merged_uniform = ",".join(parts[3:3+extra+1])
                new_parts = parts[:3] + [merged_uniform] + parts[3+extra+1:]
                parts = new_parts
        
        if len(parts) != expected_count:
            invalid_rows.append(({"raw_line": line}, f"Column mismatch: got {len(parts)}, expected {expected_count}"))
            continue

        row_dict = {normalized_headers[j]: parts[j].strip() for j in range(expected_count)}
        
        # Filter by year for stats feeds
        if filter_year > 0 and feed_type in ("batting", "pitching"):
            row_year = row_dict.get("year")
            if row_year and str(row_year) != str(filter_year):
                continue

        # Validate row
        is_valid, reason = validate_row(feed_type, row_dict)
        if is_valid:
            valid_rows.append(row_dict)
        else:
            invalid_rows.append((row_dict, reason or "Unknown validation error"))

    return normalized_headers, valid_rows, invalid_rows


def create_ingest_run(cur: psycopg.Cursor, ingest_run_id: str, feed_type: str, started_at: datetime) -> None:
    cur.execute(
        """
        INSERT INTO tbc_ingest_runs (
            ingest_run_id,
            feed_type,
            started_at,
            status,
            row_count
        ) VALUES (%s, %s, %s, %s, %s)
        """,
        (ingest_run_id, feed_type, started_at, "running", 0),
    )


def finalize_ingest_run(
    cur: psycopg.Cursor,
    ingest_run_id: str,
    status: str,
    row_count: int,
    valid_count: int,
    invalid_count: int,
    error_message: str | None,
) -> None:
    cur.execute(
        """
        UPDATE tbc_ingest_runs
        SET finished_at = now(),
            status = %s,
            row_count = %s,
            valid_count = %s,
            invalid_count = %s,
            error_message = %s
        WHERE ingest_run_id = %s
        """,
        (status, row_count, valid_count, invalid_count, error_message, ingest_run_id),
    )


def append_snapshot_rows(
    cur: psycopg.Cursor,
    table_name: str,
    ingest_run_id: str,
    snapshot_ts: datetime,
    snapshot_date: date,
    source_url: str,
    rows: Iterable[dict[str, str]],
) -> int:
    row_values = [
        (
            ingest_run_id,
            snapshot_ts,
            snapshot_date,
            row.get("playerid", "unknown"),
            source_url,
            json.dumps(row),
        )
        for row in rows
    ]

    if not row_values:
        return 0

    with cur.copy(
        f"""
        COPY {table_name} (
            ingest_run_id,
            snapshot_ts,
            snapshot_date,
            playerid,
            source_url,
            raw_payload
        ) FROM STDIN
        """
    ) as copy:
        for ingest_run_id_v, snapshot_ts_v, snapshot_date_v, playerid_v, source_url_v, raw_payload_v in row_values:
            copy.write_row(
                (
                    ingest_run_id_v,
                    snapshot_ts_v.isoformat(),
                    snapshot_date_v.isoformat(),
                    playerid_v,
                    source_url_v,
                    raw_payload_v,
                )
            )

    return len(row_values)


def log_invalid_rows(cur: psycopg.Cursor, ingest_run_id: str, feed_type: str, invalid_rows: list[tuple[dict[str, str], str]]) -> None:
    if not invalid_rows:
        return
    
    row_values = [
        (ingest_run_id, feed_type, json.dumps(row), reason)
        for row, reason in invalid_rows
    ]
    
    with cur.copy(
        "COPY tbc_invalid_rows (ingest_run_id, feed_type, raw_payload, error_reason) FROM STDIN"
    ) as copy:
        for val in row_values:
            copy.write_row(val)


def fetch_feed_response_text(feed_type: str, source_url: str) -> str:
    # 1. Requests
    logger.info(f"{feed_type}: attempting fetch via requests")
    try:
        response = requests.get(source_url, headers=REQUEST_HEADERS, timeout=60)
        response.raise_for_status()
        if not is_html_or_challenge(response.text, response.headers.get("content-type", "")):
            return response.text
        logger.warning(f"{feed_type}: requests returned HTML/challenge")
    except Exception as e:
        logger.warning(f"{feed_type}: requests failed: {e}")

    # 2. Cloudscraper
    if cloudscraper is not None:
        logger.info(f"{feed_type}: attempting fetch via cloudscraper")
        try:
            scraper = cloudscraper.create_scraper(
                browser={"browser": "chrome", "platform": "windows", "mobile": False}
            )
            response = scraper.get(source_url, headers=REQUEST_HEADERS, timeout=60)
            response.raise_for_status()
            if not is_html_or_challenge(response.text, response.headers.get("content-type", "")):
                return response.text
            logger.warning(f"{feed_type}: cloudscraper returned HTML/challenge")
        except Exception as e:
            logger.warning(f"{feed_type}: cloudscraper failed: {e}")

    # 3. Playwright
    if sync_playwright is not None:
        logger.info(f"{feed_type}: attempting fetch via playwright")
        try:
            with sync_playwright() as p:
                browser = p.chromium.launch(headless=True)
                page = browser.new_page(
                    user_agent=REQUEST_HEADERS["User-Agent"],
                    extra_http_headers={
                        "Accept": REQUEST_HEADERS["Accept"],
                        "Accept-Language": REQUEST_HEADERS["Accept-Language"],
                        "Cache-Control": REQUEST_HEADERS["Cache-Control"],
                        "Pragma": REQUEST_HEADERS["Pragma"],
                        "Referer": REQUEST_HEADERS["Referer"],
                    },
                )

                response = page.goto(source_url, wait_until="networkidle", timeout=90000)
                if response is None:
                    browser.close()
                    raise IngestError(f"{feed_type}: playwright got no response")

                body_text = page.locator("body").inner_text(timeout=10000)
                content_type = response.headers.get("content-type", "")
                browser.close()

                if not is_html_or_challenge(body_text, content_type):
                    return body_text
                logger.warning(f"{feed_type}: playwright returned HTML/challenge")
        except Exception as e:
            logger.warning(f"{feed_type}: playwright failed: {e}")

    raise IngestError(f"{feed_type}: all fetch strategies failed")


def run_feed_ingest(conn: psycopg.Connection, feed_type: str, feed_password: str, filter_year: int = 2026) -> int:
    feed_cfg = FEED_TABLES[feed_type]
    ingest_run_id = str(uuid.uuid4())
    source_url = build_feed_url(feed_type, feed_password)
    started_at = datetime.now(timezone.utc)

    with conn.cursor() as cur:
        create_ingest_run(cur, ingest_run_id, feed_cfg.feed_type, started_at)
    conn.commit()

    try:
        response_text = fetch_feed_response_text(feed_type, source_url)
        _, valid_rows, invalid_rows = parse_csv_rows(feed_type, response_text, filter_year)

        snapshot_ts = datetime.now(timezone.utc)
        snapshot_date = snapshot_ts.date()

        with conn.cursor() as cur:
            # Insert valid rows into snapshots
            inserted = append_snapshot_rows(
                cur,
                feed_cfg.snapshot_table,
                ingest_run_id,
                snapshot_ts,
                snapshot_date,
                source_url,
                valid_rows,
            )
            
            # Log invalid rows
            log_invalid_rows(cur, ingest_run_id, feed_type, invalid_rows)
            
            # Finalize run summary
            finalize_ingest_run(cur, ingest_run_id, "succeeded", len(valid_rows) + len(invalid_rows), len(valid_rows), len(invalid_rows), None)

        conn.commit()
        logger.info(f"{feed_type}: ingested {inserted} valid rows, {len(invalid_rows)} invalid rows (run_id={ingest_run_id})")
        return inserted

    except Exception as exc:
        error_message = str(exc)
        logger.error(f"{feed_type} ingest failed: {error_message}")
        with conn.cursor() as cur:
            finalize_ingest_run(cur, ingest_run_id, "failed", 0, 0, 0, error_message[:4000])
        conn.commit()
        raise


def main() -> int:
    try:
        args = parse_args()
        feeds = parse_feed_list(args.feeds)
        database_url = require_env("DATABASE_URL")
        feed_password = require_env("TBC_FEED_PASSWORD")

        total_rows = 0
        with psycopg.connect(database_url) as conn:
            for feed_type in feeds:
                try:
                    total_rows += run_feed_ingest(conn, feed_type, feed_password, args.year)
                except Exception:
                    continue

        logger.info(f"Completed safe ingest for feeds={feeds}; total_rows={total_rows}")
        return 0

    except Exception as exc:
        logger.error(f"FATAL ERROR: {exc}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
