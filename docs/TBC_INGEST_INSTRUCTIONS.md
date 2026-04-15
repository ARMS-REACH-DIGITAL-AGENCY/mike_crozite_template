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

## Option 2: Bulk Import from Manually Saved Files

If the live feeds are failing or you have manually saved data:

1. Save the feed content from your browser as a file (RTF or CSV).
2. Use the `bulk_import_tbc.py` script to load the file into the database.

### How to run the bulk import:

```bash
# For Batting data
export DATABASE_URL="your_database_url_here"
python scripts/bulk_import_tbc.py --file path/to/your/batting_file.rtf --type batting

# For Pitching data (Note: this is the 'players' feed in TBC terms)
python scripts/bulk_import_tbc.py --file path/to/your/pitching_file.rtf --type players

# For Player Identity data (Note: this is the 'pitching' feed in TBC terms)
python scripts/bulk_import_tbc.py --file path/to/your/identity_file.rtf --type pitching
```

## Option 3: Promoting Data to Main Tables

After data is ingested into the "snapshot" tables (via either method above), you can promote it to the main raw tables using the provided SQL script:

1. Open your database management tool (e.g., Neon console, psql).
2. Run the contents of `db/migrations/011_promote_tbc_snapshots.sql`.

---

## What changed and why?

1.  **Robust Parsing**: The new scripts handle "dirty" data, such as uniform numbers containing commas (e.g., "12,34,7"), which previously caused data to shift into the wrong columns.
2.  **Multi-Stage Fetching**: The ingestion script now tries three different ways to get the data (Requests, Cloudscraper, and Playwright) to bypass Cloudflare and other automation blocks.
3.  **Snapshot-First Approach**: Data is first saved into "snapshot" tables. This ensures we never lose data even if the main tables have issues, and allows for easy auditing.
4.  **Bulk Import Path**: A new script allows you to import data from files you've saved manually from your browser, ensuring the system works even when live feeds are completely blocked.
