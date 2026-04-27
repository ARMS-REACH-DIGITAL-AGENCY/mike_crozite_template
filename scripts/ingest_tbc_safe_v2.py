#!/usr/bin/env python3
"""Direct ingest for TBC YAT?STATS feeds.

What this version does:
- Fetch live CSV from TBC feed URLs
- Parse and validate rows
- Load rows into reusable landing tables (all TEXT columns)
- Players feed upserts into tbc_players_raw without deleting missing players
- Batting/pitching season feeds truncate/reload only the 2026 season raw tables
- Record ingest runs in tbc_ingest_runs
- Record invalid rows in tbc_invalid_rows
- FAIL the job if required feeds fail or insert zero valid rows

This replaces the prior snapshot-first pattern.
"""

from __future__ import annotations

import argparse
import csv
import io
import json
import logging
import os
import re
import sys
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Iterable

import psycopg
from psycopg import sql
import requests


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
    stream=sys.stdout,
)
logger = logging.getLogger(__name__)

VALID_FEEDS = ("players", "batting", "pitching")

HEADER_RENAMES = {
    "2b": "dbl",
    "3b": "tpl",
}

REQUEST_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "text/csv,application/json;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Cache-Control": "no-cache",
    "Pragma": "no-cache",
    "Referer": "https://www.thebaseballcube.com/",
    "Connection": "keep-alive",
}

FEED_URL_TEMPLATES = {
    "players": "https://www.thebaseballcube.com/data/feed/yatstats/players/?pw=yattbc",
    "batting": "https://www.thebaseballcube.com/data/feed/yatstats/batting/?pw=yattbc",
    "pitching": "https://www.thebaseballcube.com/data/feed/yatstats/pitching/?pw=yattbc",
}

WARMUP_URL = "https://www.thebaseballcube.com/"


@dataclass(frozen=True)
class FeedConfig:
    feed_type: str
    landing_table: str
    target_table: str


FEED_TABLES = {
    "players": FeedConfig("players", "tbc_players_landing_latest", "tbc_players_raw"),
    "batting": FeedConfig("batting", "tbc_batting_landing_latest", "tbc_batting_2026_season_raw"),
    "pitching": FeedConfig("pitching", "tbc_pitching_landing_latest", "tbc_pitching_2026_season_raw"),
}


class IngestError(Exception):
    pass


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Direct-ingest TBC YAT?STATS feeds into landing and raw tables.")
    parser.add_argument(
        "--feeds",
        default="batting,pitching,players",
        help="Comma-separated feeds to ingest. Example: batting,pitching or batting,pitching,players",
    )
    parser.add_argument(
        "--optional-feeds",
        default="players",
        help="Comma-separated feeds that should not fail the whole job if they fail.",
    )
    parser.add_argument(
        "--year",
        type=int,
        default=2026,
        help="Filter batting/pitching rows by year. Use 0 for all years.",
    )
    return parser.parse_args()


def require_env(var_name: str) -> str:
    value = os.getenv(var_name, "").strip()
    if not value:
        raise IngestError(f"Required environment variable is missing: {var_name}")
    return value


def parse_feed_list(raw_feeds: str) -> list[str]:
    feeds = [f.strip().lower() for f in (raw_feeds or "").split(",") if f.strip()]
    if not feeds:
        raise IngestError("No feeds specified.")

    invalid = [f for f in feeds if f not in VALID_FEEDS]
    if invalid:
        raise IngestError(f"Unsupported feeds requested: {', '.join(invalid)}")

    deduped: list[str] = []
    for feed in feeds:
        if feed not in deduped:
            deduped.append(feed)
    return deduped


def build_feed_url(feed_type: str) -> str:
    return FEED_URL_TEMPLATES[feed_type]


def redact_url(url: str) -> str:
    return re.sub(r"([?&]pw=)[^&]+", r"\1***", url)


def is_html_or_challenge(body: str, content_type: str) -> bool:
    probe = (body[:2500] or "").lower()
    ctype = (content_type or "").lower()
    html_markers = (
        "<html",
        "<!doctype",
        "cloudflare",
        "just a moment",
        "checking your browser",
        "attention required",
        "cf-browser-verification",
        "cf_clearance",
    )
    return "text/html" in ctype or any(marker in probe for marker in html_markers)


def looks_like_csv(body: str) -> bool:
    first = (body or "").lstrip()
    return (
        first.startswith("teamid,")
        or first.startswith("playerid,")
        or ("playerid" in first.splitlines()[0].lower() if first else False)
    )


def normalize_header(header: str) -> str:
    normalized = (header or "").strip().lower()
    normalized = HEADER_RENAMES.get(normalized, normalized)
    normalized = re.sub(r"[^\w]+", "_", normalized)
    normalized = re.sub(r"_+", "_", normalized).strip("_")
    return normalized


def robust_csv_split(line: str) -> list[str]:
    reader = csv.reader([line])
    try:
        return next(reader)
    except Exception:
        return line.split(",")


def is_numeric(val: str | None) -> bool:
    if val is None:
        return False
    try:
        float(val)
        return True
    except ValueError:
        return False


def validate_row(feed_type: str, row: dict[str, str]) -> tuple[bool, str | None]:
    try:
        if not row.get("playerid"):
            return False, "Missing playerid"

        if feed_type == "players":
            if not row.get("firstname") or not row.get("lastname"):
                return False, "Missing firstname or lastname"

        elif feed_type == "batting":
            for field in ["ab", "h", "hr", "rbi"]:
                val = row.get(field)
                if val is None or not val.strip().isdigit():
                    return False, f"Non-integer field: {field}={val}"
                if int(val) < 0:
                    return False, f"Negative stat: {field}={val}"

            bavg_str = row.get("bavg", "0")
            if not is_numeric(bavg_str):
                return False, f"Non-numeric batting average: {bavg_str}"
            bavg = float(bavg_str)
            if bavg < 0 or bavg > 1:
                return False, f"Invalid batting average: {bavg}"

            ops_str = row.get("ops", "0")
            if not is_numeric(ops_str):
                return False, f"Non-numeric OPS: {ops_str}"
            ops = float(ops_str)
            if ops < 0 or ops > 2:
                return False, f"Invalid OPS: {ops}"

            highlevel = row.get("highlevel", "")
            if highlevel and re.match(r"^[0-9.]+$", highlevel):
                return False, f"Level field contains numeric value: {highlevel}"

        elif feed_type == "pitching":
            for field in ["ip", "so", "bb"]:
                val = row.get(field)
                if not is_numeric(val):
                    return False, f"Non-numeric field: {field}={val}"
                if float(val) < 0:
                    return False, f"Negative stat: {field}={val}"

            era_str = row.get("era", "0")
            if not is_numeric(era_str):
                return False, f"Non-numeric ERA: {era_str}"
            era = float(era_str)
            if era < 0 or era > 99.99:
                return False, f"Invalid ERA: {era}"

            highlevel = row.get("highlevel", "")
            if highlevel and re.match(r"^[0-9.]+$", highlevel):
                return False, f"Level field contains numeric value: {highlevel}"

        return True, None
    except Exception as exc:
        return False, f"Validation exception: {exc}"


def parse_csv_rows(
    feed_type: str,
    response_text: str,
    filter_year: int = 2026,
) -> tuple[list[str], list[dict[str, str]], list[tuple[dict[str, str], str]]]:
    lines = response_text.strip().splitlines()
    if not lines:
        raise IngestError(f"{feed_type}: empty response body")

    header_line = lines[0]
    headers = robust_csv_split(header_line)
    normalized_headers = [normalize_header(h) for h in headers]

    if "playerid" not in normalized_headers:
        raise IngestError(f"{feed_type}: required playerid column is missing")

    expected_count = len(normalized_headers)
    valid_rows: list[dict[str, str]] = []
    invalid_rows: list[tuple[dict[str, str], str]] = []

    for line_no, line in enumerate(lines[1:], start=2):
        if not line.strip():
            continue

        parts = robust_csv_split(line)

        if len(parts) > expected_count and feed_type in ("batting", "pitching") and expected_count >= 4:
            extra = len(parts) - expected_count
            merged_uniform = ",".join(parts[3 : 3 + extra + 1])
            parts = parts[:3] + [merged_uniform] + parts[3 + extra + 1 :]

        if len(parts) != expected_count:
            invalid_rows.append(
                (
                    {"raw_line": line, "line_no": str(line_no)},
                    f"Column mismatch: got {len(parts)}, expected {expected_count}",
                )
            )
            continue

        row_dict = {normalized_headers[i]: parts[i].strip() for i in range(expected_count)}

        if filter_year > 0 and feed_type in ("batting", "pitching"):
            row_year = row_dict.get("year")
            if row_year and str(row_year) != str(filter_year):
                continue

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
            row_count,
            valid_count,
            invalid_count,
            error_message
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        """,
        (ingest_run_id, feed_type, started_at, "running", 0, 0, 0, None),
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


def log_invalid_rows(
    cur: psycopg.Cursor,
    ingest_run_id: str,
    feed_type: str,
    invalid_rows: list[tuple[dict[str, str], str]],
) -> None:
    if not invalid_rows:
        return

    with cur.copy(
        "COPY tbc_invalid_rows (ingest_run_id, feed_type, raw_payload, error_reason) FROM STDIN"
    ) as copy:
        for row, reason in invalid_rows:
            copy.write_row((ingest_run_id, feed_type, json.dumps(row), reason))


def make_session() -> requests.Session:
    session = requests.Session()
    session.headers.update(REQUEST_HEADERS)
    return session


def warmup_session(session: requests.Session) -> None:
    try:
        res = session.get(WARMUP_URL, timeout=30, allow_redirects=True)
        logger.info(
            "warmup: status=%s content_type=%s",
            res.status_code,
            res.headers.get("content-type", ""),
        )
    except Exception as exc:
        logger.warning("warmup failed: %s", exc)


def fetch_feed_response_text(session: requests.Session, feed_type: str, source_url: str) -> str:
    logger.info("%s: fetching %s", feed_type, redact_url(source_url))

    try:
        response = session.get(source_url, timeout=60, allow_redirects=True)
        content_type = response.headers.get("content-type", "")
        logger.info(
            "%s: status=%s content_type=%s bytes=%s final_url=%s",
            feed_type,
            response.status_code,
            content_type,
            len(response.text or ""),
            redact_url(str(response.url)),
        )
        response.raise_for_status()

        if is_html_or_challenge(response.text, content_type):
            preview = (response.text[:200] or "").replace("\n", " ")
            raise IngestError(f"{feed_type}: received HTML/challenge instead of CSV: {preview}")

        if not looks_like_csv(response.text):
            preview = (response.text[:200] or "").replace("\n", " ")
            raise IngestError(f"{feed_type}: response did not look like CSV: {preview}")

        return response.text

    except requests.HTTPError as exc:
        raise IngestError(f"{feed_type}: HTTP error: {exc}") from exc
    except requests.RequestException as exc:
        raise IngestError(f"{feed_type}: request error: {exc}") from exc


def get_table_columns(cur: psycopg.Cursor, table_name: str) -> list[str]:
    schema_name, bare_table_name = table_name.split(".", 1) if "." in table_name else ("public", table_name)
    cur.execute(
        """
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = %s
          AND table_name = %s
        ORDER BY ordinal_position
        """,
        (schema_name, bare_table_name),
    )
    return [r[0] for r in cur.fetchall()]


def recreate_landing_table(cur: psycopg.Cursor, table_name: str, headers: list[str]) -> None:
    schema_name, bare_table_name = table_name.split(".", 1) if "." in table_name else ("public", table_name)

    cur.execute(sql.SQL("CREATE SCHEMA IF NOT EXISTS {}").format(sql.Identifier(schema_name)))
    cur.execute(
        sql.SQL("DROP TABLE IF EXISTS {}.{}").format(
            sql.Identifier(schema_name),
            sql.Identifier(bare_table_name),
        )
    )

    column_defs = [sql.SQL("{} text").format(sql.Identifier(col)) for col in headers]

    cur.execute(
        sql.SQL("CREATE TABLE {}.{} ({})").format(
            sql.Identifier(schema_name),
            sql.Identifier(bare_table_name),
            sql.SQL(", ").join(column_defs),
        )
    )


def copy_rows_to_landing(
    cur: psycopg.Cursor,
    landing_table: str,
    headers: list[str],
    rows: Iterable[dict[str, str]],
) -> int:
    rows = list(rows)
    if not rows:
        return 0

    copy_sql = sql.SQL("COPY {} ({}) FROM STDIN WITH (FORMAT csv)").format(
        sql.SQL(landing_table),
        sql.SQL(", ").join(sql.Identifier(h) for h in headers),
    )

    buf = io.StringIO()
    writer = csv.writer(buf, lineterminator="\n")
    for row in rows:
        writer.writerow([row.get(h, "") for h in headers])
    buf.seek(0)

    with cur.copy(copy_sql) as copy:
        copy.write(buf.read())

    return len(rows)


def replace_target_from_landing(
    cur: psycopg.Cursor,
    landing_table: str,
    target_table: str,
) -> int:
    landing_columns = set(get_table_columns(cur, landing_table))
    target_columns = get_table_columns(cur, target_table)

    common_columns = [col for col in target_columns if col in landing_columns]
    if not common_columns:
        raise IngestError(f"No common columns between {landing_table} and {target_table}")

    col_list = sql.SQL(", ").join(sql.Identifier(c) for c in common_columns)

    cur.execute(sql.SQL("TRUNCATE TABLE {}").format(sql.SQL(target_table)))
    cur.execute(
        sql.SQL("INSERT INTO {} ({}) SELECT {} FROM {}").format(
            sql.SQL(target_table),
            col_list,
            col_list,
            sql.SQL(landing_table),
        )
    )
    cur.execute(sql.SQL("SELECT COUNT(*) FROM {}").format(sql.SQL(target_table)))
    return int(cur.fetchone()[0])


def upsert_players_from_landing(
    cur: psycopg.Cursor,
    landing_table: str,
    target_table: str,
) -> int:
    """
    Safely merge the latest TBC players feed into canonical tbc_players_raw.

    Rules:
    - Never truncate tbc_players_raw.
    - Never delete players missing from the latest feed.
    - Insert new playerids.
    - Update only columns that exist in both landing and target.
    - Leave target-only columns, such as deathdate, untouched when omitted from the feed.
    """
    landing_columns = set(get_table_columns(cur, landing_table))
    target_columns = get_table_columns(cur, target_table)

    if "playerid" not in landing_columns:
        raise IngestError(f"{landing_table}: missing required playerid column")

    common_columns = [col for col in target_columns if col in landing_columns]

    if "playerid" not in common_columns:
        raise IngestError(f"No usable playerid column between {landing_table} and {target_table}")

    update_columns = [col for col in common_columns if col != "playerid"]

    if not update_columns:
        raise IngestError(f"No updatable common columns between {landing_table} and {target_table}")

    insert_cols = sql.SQL(", ").join(sql.Identifier(c) for c in common_columns)

    update_set = sql.SQL(", ").join(
        sql.SQL("{} = EXCLUDED.{}").format(sql.Identifier(c), sql.Identifier(c))
        for c in update_columns
    )

    cur.execute(
        sql.SQL("""
            INSERT INTO {} ({})
            SELECT {}
            FROM {}
            WHERE playerid IS NOT NULL
              AND trim(playerid) <> ''
            ON CONFLICT (playerid) DO UPDATE SET
              {}
        """).format(
            sql.SQL(target_table),
            insert_cols,
            insert_cols,
            sql.SQL(landing_table),
            update_set,
        )
    )

    return cur.rowcount or 0


def run_feed_ingest(
    conn: psycopg.Connection,
    session: requests.Session,
    feed_type: str,
    filter_year: int = 2026,
) -> int:
    feed_cfg = FEED_TABLES[feed_type]
    ingest_run_id = str(uuid.uuid4())
    source_url = build_feed_url(feed_type)
    started_at = datetime.now(timezone.utc)

    with conn.cursor() as cur:
        create_ingest_run(cur, ingest_run_id, feed_type, started_at)
    conn.commit()

    try:
        response_text = fetch_feed_response_text(session, feed_type, source_url)
        headers, valid_rows, invalid_rows = parse_csv_rows(feed_type, response_text, filter_year)

        if len(valid_rows) == 0:
            raise IngestError(f"{feed_type}: zero valid rows after fetch/parse")

        with conn.cursor() as cur:
            recreate_landing_table(cur, feed_cfg.landing_table, headers)
            landing_count = copy_rows_to_landing(
                cur,
                feed_cfg.landing_table,
                headers,
                valid_rows,
            )

            if feed_type == "players":
                if landing_count < 50000:
                    logger.warning(
                        "%s: feed returned only %s valid rows; will upsert additions/updates only and will NOT delete missing canonical players",
                        feed_type,
                        landing_count,
                    )

                target_count = upsert_players_from_landing(
                    cur,
                    feed_cfg.landing_table,
                    feed_cfg.target_table,
                )
            else:
                target_count = replace_target_from_landing(
                    cur,
                    feed_cfg.landing_table,
                    feed_cfg.target_table,
                )

            log_invalid_rows(cur, ingest_run_id, feed_type, invalid_rows)

            finalize_ingest_run(
                cur,
                ingest_run_id,
                "succeeded",
                len(valid_rows) + len(invalid_rows),
                landing_count,
                len(invalid_rows),
                None,
            )

        conn.commit()

        logger.info(
            "%s: landing_rows=%s target_rows=%s invalid=%s run_id=%s",
            feed_type,
            landing_count,
            target_count,
            len(invalid_rows),
            ingest_run_id,
        )
        return landing_count

    except Exception as exc:
        error_message = str(exc)
        logger.error("%s ingest failed: %s", feed_type, error_message)

        with conn.cursor() as cur:
            finalize_ingest_run(
                cur,
                ingest_run_id,
                "failed",
                0,
                0,
                0,
                error_message[:4000],
            )

        conn.commit()
        raise


def main() -> int:
    try:
        args = parse_args()
        feeds = parse_feed_list(args.feeds)
        optional_feeds = set(parse_feed_list(args.optional_feeds)) if args.optional_feeds.strip() else set()

        database_url = require_env("DATABASE_URL")

        total_rows = 0
        hard_failures: list[str] = []
        soft_failures: list[str] = []

        session = make_session()
        warmup_session(session)

        with psycopg.connect(database_url) as conn:
            for feed_type in feeds:
                try:
                    inserted = run_feed_ingest(conn, session, feed_type, args.year)
                    total_rows += inserted
                except Exception as exc:
                    msg = f"{feed_type}: {exc}"
                    if feed_type in optional_feeds:
                        logger.warning("optional feed failed: %s", msg)
                        soft_failures.append(msg)
                    else:
                        hard_failures.append(msg)

        if hard_failures:
            raise IngestError(" ; ".join(hard_failures))

        if total_rows <= 0:
            raise IngestError("No rows were ingested across requested feeds")

        if soft_failures:
            logger.warning("Completed with optional feed failures: %s", " ; ".join(soft_failures))

        logger.info("Completed direct ingest for feeds=%s total_rows=%s", feeds, total_rows)
        return 0

    except Exception as exc:
        logger.error("FATAL ERROR: %s", exc)
        return 1


if __name__ == "__main__":
    sys.exit(main())
