#!/usr/bin/env python3
"""Safe snapshot-first ingest for TBC YAT stats feeds."""

from __future__ import annotations

import argparse
import csv
import io
import json
import os
import sys
import uuid
from dataclasses import dataclass
from datetime import date, datetime, timezone
from typing import Iterable

import psycopg
import requests

try:
    import cloudscraper
except ImportError:
    cloudscraper = None

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


FEED_TABLES = {
    "players": FeedConfig(feed_type="players", snapshot_table="tbc_players_feed_snapshots"),
    "batting": FeedConfig(feed_type="batting", snapshot_table="tbc_batting_feed_snapshots"),
    "pitching": FeedConfig(feed_type="pitching", snapshot_table="tbc_pitching_feed_snapshots"),
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
    return f"{BASE_URL}/{feed_type}?pw={feed_password}"


def is_html_or_challenge(body: str, content_type: str) -> bool:
    probe = (body[:1000] or "").lower()
    ctype = (content_type or "").lower()
    html_markers = ("<html", "<!doctype", "cloudflare", "just a moment", "captcha")
    return "text/html" in ctype or any(marker in probe for marker in html_markers)


def normalize_header(header: str) -> str:
    normalized = (header or "").strip().lower()
    return HEADER_RENAMES.get(normalized, normalized)


def parse_csv_rows(feed_type: str, response_text: str) -> tuple[list[str], list[dict[str, str]]]:
    reader = csv.DictReader(io.StringIO(response_text))
    if not reader.fieldnames:
        raise IngestError(f"{feed_type}: empty or missing CSV header")

    normalized_headers = [normalize_header(header) for header in reader.fieldnames]
    if not any(h.strip() for h in normalized_headers):
        raise IngestError(f"{feed_type}: CSV header is blank after normalization")

    if "playerid" not in normalized_headers:
        raise IngestError(f"{feed_type}: required playerid column is missing")

    rows: list[dict[str, str]] = []
    for line_number, row in enumerate(reader, start=2):
        normalized_row = {}
        for original_header, normalized_header in zip(reader.fieldnames, normalized_headers):
            value = row.get(original_header, "")
            normalized_row[normalized_header] = value.strip() if isinstance(value, str) else value

        playerid = str(normalized_row.get("playerid", "") or "").strip()
        if not playerid:
            raise IngestError(f"{feed_type}: blank playerid encountered at CSV line {line_number}")

        rows.append(normalized_row)

    return normalized_headers, rows


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
    error_message: str | None,
) -> None:
    cur.execute(
        """
        UPDATE tbc_ingest_runs
        SET finished_at = now(),
            status = %s,
            row_count = %s,
            error_message = %s
        WHERE ingest_run_id = %s
        """,
        (status, row_count, error_message, ingest_run_id),
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
            row["playerid"],
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


def fetch_feed_response(feed_type: str, source_url: str) -> requests.Response:
    try:
        response = requests.get(source_url, headers=REQUEST_HEADERS, timeout=60)
        response.raise_for_status()
        if is_html_or_challenge(response.text, response.headers.get("content-type", "")):
            raise IngestError(f"{feed_type}: feed returned HTML/challenge content via requests")
        return response
    except (requests.HTTPError, requests.RequestException, IngestError) as exc:
        should_retry = False

        if isinstance(exc, requests.HTTPError):
            if exc.response is not None and exc.response.status_code == 403:
                should_retry = True
        elif isinstance(exc, IngestError):
            should_retry = True
        else:
            should_retry = True

        if not should_retry:
            raise

        if cloudscraper is None:
            raise IngestError(
                f"{feed_type}: requests fetch failed ({exc}) and cloudscraper is not installed"
            ) from exc

        scraper = cloudscraper.create_scraper(
            browser={"browser": "chrome", "platform": "windows", "mobile": False}
        )
        response = scraper.get(source_url, headers=REQUEST_HEADERS, timeout=60)
        response.raise_for_status()

        if is_html_or_challenge(response.text, response.headers.get("content-type", "")):
            raise IngestError(f"{feed_type}: feed returned HTML/challenge content via cloudscraper")

        return response


def run_feed_ingest(conn: psycopg.Connection, feed_type: str, feed_password: str) -> int:
    feed_cfg = FEED_TABLES[feed_type]
    ingest_run_id = str(uuid.uuid4())
    source_url = build_feed_url(feed_type, feed_password)
    started_at = datetime.now(timezone.utc)

    with conn.cursor() as cur:
        create_ingest_run(cur, ingest_run_id, feed_cfg.feed_type, started_at)
    conn.commit()

    try:
        response = fetch_feed_response(feed_type, source_url)

        _, rows = parse_csv_rows(feed_type, response.text)

        snapshot_ts = datetime.now(timezone.utc)
        snapshot_date = snapshot_ts.date()

        with conn.cursor() as cur:
            inserted = append_snapshot_rows(
                cur,
                feed_cfg.snapshot_table,
                ingest_run_id,
                snapshot_ts,
                snapshot_date,
                source_url,
                rows,
            )
            finalize_ingest_run(cur, ingest_run_id, "succeeded", inserted, None)

        conn.commit()
        print(f"{feed_type}: ingested {inserted} rows into {feed_cfg.snapshot_table} (run_id={ingest_run_id})")
        return inserted

    except Exception as exc:
        error_message = str(exc)
        with conn.cursor() as cur:
            finalize_ingest_run(cur, ingest_run_id, "failed", 0, error_message[:4000])
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
                total_rows += run_feed_ingest(conn, feed_type, feed_password)

        print(f"Completed safe ingest for feeds={feeds}; total_rows={total_rows}")
        return 0

    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
