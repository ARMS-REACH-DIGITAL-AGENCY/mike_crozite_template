# TBC Ingestion Pipeline Instructions

This document provides simple, step-by-step instructions for running the Baseball Cube (TBC) ingestion pipeline.

## Option 1: Automatic Daily Ingestion (GitHub Actions)

The system is set up to run automatically. If you need to trigger it manually:

1. Go to your GitHub repository.
2. Click on the **Actions** tab.
3. Select **TBC Safe Ingest v2** from the sidebar.
4. Click the **Run workflow** dropdown.
5. (Optional) Specify which feeds to run (default is `players,batting,pitching`).
6. Click **Run workflow**.

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
# Note: In TBC feeds, 'players' contains pitching stats
python scripts/bulk_import_tbc.py --file path/to/your/pitching_stats_file.rtf --type players

# For Player Identity data
# Note: In TBC feeds, 'pitching' contains player identity
python scripts/bulk_import_tbc.py --file path/to/your/identity_file.rtf --type pitching
```

**Filtering**: By default, these scripts filter for `year = 2026`. To import all years, add `--year 0`.

## Option 3: Promoting Data to Main Tables

After data is ingested into the "snapshot" tables, promote it to the main raw tables:

1. Open your database management tool (e.g., Neon console, psql).
2. Run the contents of `db/migrations/011_promote_tbc_snapshots.sql`.

---

## What changed and why?

1.  **Corrected Table Mapping**: 
    - `tbc_pitching_feed_snapshots` (Identity) → `tbc_players_raw`
    - `tbc_batting_feed_snapshots` (Batting stats) → `tbc_batting_raw`
    - `tbc_players_feed_snapshots` (Pitching stats) → `tbc_pitching_raw`
2.  **2026 Season Filtering**: To improve performance and focus on current data, the pipeline now filters for the 2026 season. This filtering happens at two levels:
    - **Script Level**: Both `ingest_tbc_safe_v2.py` and `bulk_import_tbc.py` filter rows before saving to snapshots.
    - **SQL Level**: The promotion script also includes a `WHERE year = 2026` clause for extra safety.
3.  **Robust Parsing**: Maintained the defensive parsing to handle uniform numbers with commas and other formatting inconsistencies.
4.  **Corrected Schema Mapping**: Ensured that identity fields (firstname, birthplace, etc.) only go to the players table, while stats tables keep player names for convenience.
