# TBC Ingestion Pipeline Instructions

This document provides simple, step-by-step instructions for running the Baseball Cube (TBC) ingestion pipeline with validation and delta tracking.

## Pipeline Overview

The system follows a snapshot-first architecture:
**FEED → SNAPSHOT (JSON) → VALIDATION → PROMOTION → RAW TABLES + DELTAS**

## Option 1: Automatic Daily Ingestion (GitHub Actions)

The system is set up to run automatically. If you need to trigger it manually:

1. Go to your GitHub repository.
2. Click on the **Actions** tab.
3. Select **TBC Safe Ingest v2** from the sidebar.
4. Click the **Run workflow** dropdown.
5. Click **Run workflow**.

**Note**: The daily ingest is configured to only process rows for the **2026 season**.

## Option 2: Bulk Import from Manually Saved Files

If the live feeds are failing or you have manually saved data:

1. Save the feed content from your browser as a file (RTF or CSV).
2. Use the `bulk_import_tbc.py` script to load the file into the database.

### How to run the bulk import:

```bash
# For Batting data (2026 only by default)
export DATABASE_URL="your_database_url_here"
python scripts/bulk_import_tbc.py --file path/to/your/batting_file.rtf --type batting

# For Pitching stats (2026 only by default)
python scripts/bulk_import_tbc.py --file path/to/your/pitching_stats_file.rtf --type pitching

# For Player Identity data
python scripts/bulk_import_tbc.py --file path/to/your/identity_file.rtf --type players
```

## Option 3: Promoting Data and Generating Deltas

After data is ingested into the "snapshot" tables, promote it to the main raw tables and generate daily deltas:

1. Open your database management tool (e.g., Neon console, psql).
2. Run the contents of `db/migrations/011_promote_tbc_snapshots.sql` (Promotes valid rows).
3. Run the contents of `db/migrations/013_tbc_delta_generation.sql` (Generates daily deltas).

---

## Key Features

### 1. Validation Layer
- **Batting**: Validates `avg` (0-1), `ops` (0-2), and ensures stats are non-negative.
- **Pitching**: Validates `era` (0-20) and ensures stats are non-negative.
- **Identity**: Ensures `playerid`, `firstname`, and `lastname` are present.
- **Broken Parsing Detection**: Rejects rows where the `highlevel` field contains numeric values (a sign of column shifting).
- **Invalid Rows**: All rejected rows are stored in `tbc_invalid_rows` with the reason for failure.

### 2. Delta System (2026 Only)
- Tracks daily changes in stats for each player.
- Compares the latest snapshot with the previous day's snapshot.
- Appends new rows to `tbc_batting_daily_deltas` and `tbc_pitching_daily_deltas`.
- Skips deltas if stats go backwards (data integrity check).

### 3. Run Summary
- Each ingest run stores a summary in `tbc_ingest_runs`:
    - `total_rows`: Total rows processed.
    - `valid_count`: Rows promoted to raw tables.
    - `invalid_count`: Rows rejected due to validation errors.
    - `delta_count`: Number of delta rows generated.

### 4. Correct Table Mapping
- **Batting Feed** → `tbc_batting_raw`
- **Pitching Feed** → `tbc_pitching_raw`
- **Players Feed** → `tbc_players_raw` (Identity)
