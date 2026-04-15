#!/usr/bin/env python3
"""Bulk import script for manually saved TBC RTF/CSV files with validation and 2026 filtering."""

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

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    stream=sys.stdout
)
logger = logging.getLogger(__name__)

VALID_FEEDS = ("players", "batting", "pitching")
HEADER_RENAMES = {
    "2b": "dbl",
    "3b": "tpl",
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

class ImportError(Exception):
    pass

def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Bulk import TBC files into snapshot tables.")
    parser.add_argument("--file", required=True, help="Path to the RTF or CSV file.")
    parser.add_argument("--type", required=True, choices=VALID_FEEDS, help="Type of feed (players, batting, pitching).")
    parser.add_argument("--year", type=int, default=2026, help="Filter stats by year (default: 2026). Use 0 for all years.")
    return parser.parse_args()

def require_env(var_name: str) -> str:
    value = os.getenv(var_name, "").strip()
    if not value:
        raise ImportError(f"Required environment variable is missing: {var_name}")
    return value

def extract_rtf_text(file_path: str) -> str:
    """Extracts text from RTF file, specifically looking for the CSV content."""
    try:
        with open(file_path, 'r', encoding='cp1252', errors='ignore') as f:
            content = f.read()
        
        # Look for the CSV content which usually starts after \strokec2 or similar RTF tags
        match = re.search(r'(teamid|playerid),.*', content, re.DOTALL)
        if match:
            text = match.group(0)
            # Remove RTF commands and closing braces
            text = re.sub(r'\\par\b', '\n', text)
            text = re.sub(r'\\tab\b', '\t', text)
            text = re.sub(r'\\[a-z0-9]+\b', '', text)
            # Remove trailing RTF braces
            text = text.split('}')[0]
            return text.strip()
        return content.strip()
    except Exception as e:
        logger.error(f"Failed to read file {file_path}: {e}")
        raise

def normalize_header(header: str) -> str:
    normalized = (header or "").strip().lower()
    return HEADER_RENAMES.get(normalized, normalized)

def robust_csv_split(line: str) -> List[str]:
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

def parse_csv_rows(feed_type: str, text: str, filter_year: int = 2026) -> tuple[list[str], list[dict[str, str]], list[tuple[dict[str, str], str]]]:
    lines = text.strip().splitlines()
    if not lines:
        raise ImportError(f"{feed_type}: no content found in file")

    header_line = lines[0]
    headers = robust_csv_split(header_line)
    normalized_headers = [normalize_header(h) for h in headers]
    
    if "playerid" not in normalized_headers:
        raise ImportError(f"{feed_type}: required playerid column is missing")

    expected_count = len(normalized_headers)
    valid_rows: list[dict[str, str]] = []
    invalid_rows: list[tuple[dict[str, str], str]] = []
    
    for i, line in enumerate(lines[1:], start=2):
        if not line.strip():
            continue
            
        parts = robust_csv_split(line)
        
        # Defensive alignment
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

def main() -> int:
    try:
        args = parse_args()
        database_url = require_env("DATABASE_URL")
        feed_cfg = FEED_TABLES[args.type]
        
        logger.info(f"Starting bulk import for {args.type} from {args.file} (year filter: {args.year})")
        
        text = extract_rtf_text(args.file)
        _, valid_rows, invalid_rows = parse_csv_rows(args.type, text, args.year)
        
        logger.info(f"Parsed {len(valid_rows)} valid rows, {len(invalid_rows)} invalid rows.")
        
        ingest_run_id = str(uuid.uuid4())
        snapshot_ts = datetime.now(timezone.utc)
        snapshot_date = snapshot_ts.date()
        source_url = f"file://{os.path.abspath(args.file)}"

        with psycopg.connect(database_url) as conn:
            with conn.cursor() as cur:
                # Create ingest run
                cur.execute(
                    "INSERT INTO tbc_ingest_runs (ingest_run_id, feed_type, started_at, status, row_count) VALUES (%s, %s, %s, %s, %s)",
                    (ingest_run_id, args.type, snapshot_ts, "running", 0)
                )
                
                # Insert valid rows into snapshots
                row_values = [
                    (ingest_run_id, snapshot_ts, snapshot_date, row.get("playerid", "unknown"), source_url, json.dumps(row))
                    for row in valid_rows
                ]
                
                with cur.copy(
                    f"COPY {feed_cfg.snapshot_table} (ingest_run_id, snapshot_ts, snapshot_date, playerid, source_url, raw_payload) FROM STDIN"
                ) as copy:
                    for val in row_values:
                        copy.write_row((val[0], val[1].isoformat(), val[2].isoformat(), val[3], val[4], val[5]))
                
                # Log invalid rows
                if invalid_rows:
                    invalid_values = [
                        (ingest_run_id, args.type, json.dumps(row), reason)
                        for row, reason in invalid_rows
                    ]
                    with cur.copy(
                        "COPY tbc_invalid_rows (ingest_run_id, feed_type, raw_payload, error_reason) FROM STDIN"
                    ) as copy:
                        for val in invalid_values:
                            copy.write_row(val)

                # Finalize run summary
                cur.execute(
                    """
                    UPDATE tbc_ingest_runs 
                    SET finished_at = now(), 
                        status = 'succeeded', 
                        row_count = %s,
                        valid_count = %s,
                        invalid_count = %s
                    WHERE ingest_run_id = %s
                    """,
                    (len(valid_rows) + len(invalid_rows), len(valid_rows), len(invalid_rows), ingest_run_id)
                )
            conn.commit()
            
        logger.info(f"Successfully imported {len(valid_rows)} valid rows into {feed_cfg.snapshot_table}")
        return 0

    except Exception as exc:
        logger.error(f"Import failed: {exc}")
        return 1

if __name__ == "__main__":
    sys.exit(main())
