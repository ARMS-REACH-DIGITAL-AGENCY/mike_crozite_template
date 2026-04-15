#!/usr/bin/env python3
"""Bulk import script for manually saved TBC RTF/CSV files with 2026 filtering."""

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

def parse_csv_rows(feed_type: str, text: str, filter_year: int = 2026) -> tuple[list[str], list[dict[str, str]]]:
    lines = text.strip().splitlines()
    if not lines:
        raise ImportError(f"{feed_type}: no content found in file")

    header_line = lines[0]
    headers = robust_csv_split(header_line)
    normalized_headers = [normalize_header(h) for h in headers]
    
    if "playerid" not in normalized_headers:
        raise ImportError(f"{feed_type}: required playerid column is missing")

    expected_count = len(normalized_headers)
    rows: list[dict[str, str]] = []
    
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
            logger.error(f"Line {i}: column mismatch (got {len(parts)}, expected {expected_count}). Skipping.")
            continue

        row_dict = {normalized_headers[j]: parts[j].strip() for j in range(expected_count)}
        if not row_dict.get("playerid"):
            continue

        # Filter by year for stats feeds
        if filter_year > 0 and feed_type in ("batting", "pitching"):
            row_year = row_dict.get("year")
            if row_year and str(row_year) != str(filter_year):
                continue
            
        rows.append(row_dict)

    return normalized_headers, rows

def main() -> int:
    try:
        args = parse_args()
        database_url = require_env("DATABASE_URL")
        feed_cfg = FEED_TABLES[args.type]
        
        logger.info(f"Starting bulk import for {args.type} from {args.file} (year filter: {args.year})")
        
        text = extract_rtf_text(args.file)
        _, rows = parse_csv_rows(args.type, text, args.year)
        
        logger.info(f"Parsed {len(rows)} rows from file.")
        
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
                
                # Insert rows
                row_values = [
                    (ingest_run_id, snapshot_ts, snapshot_date, row["playerid"], source_url, json.dumps(row))
                    for row in rows
                ]
                
                with cur.copy(
                    f"COPY {feed_cfg.snapshot_table} (ingest_run_id, snapshot_ts, snapshot_date, playerid, source_url, raw_payload) FROM STDIN"
                ) as copy:
                    for val in row_values:
                        copy.write_row((val[0], val[1].isoformat(), val[2].isoformat(), val[3], val[4], val[5]))
                
                # Finalize run
                cur.execute(
                    "UPDATE tbc_ingest_runs SET finished_at = now(), status = 'succeeded', row_count = %s WHERE ingest_run_id = %s",
                    (len(rows), ingest_run_id)
                )
            conn.commit()
            
        logger.info(f"Successfully imported {len(rows)} rows into {feed_cfg.snapshot_table}")
        return 0

    except Exception as exc:
        logger.error(f"Import failed: {exc}")
        return 1

if __name__ == "__main__":
    sys.exit(main())
