# TBC Safe Ingest v2

This workflow is a **manual-only**, snapshot-first ingest for The Baseball Cube YAT stats feeds.

## Safety guarantees

- Never writes directly to canonical raw tables:
  - `tbc_players_raw`
  - `tbc_batting_raw`
  - `tbc_pitching_raw`
- Never uses `TRUNCATE`.
- Only appends feed records into snapshot tables.
- Logs per-feed ingest runs with status and errors.

## Required environment variables

- `DATABASE_URL`
- `TBC_FEED_PASSWORD`

## Feed endpoints

Base URL:

- `https://thebaseballcube.com/data/feed/yatstats`

Feed URLs (using required `?pw=` param):

- `https://thebaseballcube.com/data/feed/yatstats/players?pw=<TBC_FEED_PASSWORD>`
- `https://thebaseballcube.com/data/feed/yatstats/batting?pw=<TBC_FEED_PASSWORD>`
- `https://thebaseballcube.com/data/feed/yatstats/pitching?pw=<TBC_FEED_PASSWORD>`

## Manual local run

1. Apply migration:

```bash
psql "$DATABASE_URL" -f db/migrations/010_tbc_safe_ingest_v2.sql
```

2. Install script deps:

```bash
pip install requests psycopg[binary]
```

3. Run ingest:

```bash
python scripts/ingest_tbc_safe_v2.py --feeds players,batting,pitching
```

## Manual GitHub Actions run

Workflow: `.github/workflows/tbc-ingest.yml`

- Trigger via **Run workflow**.
- Optional input `feeds` defaults to `players,batting,pitching`.

## Verification SQL

```sql
SELECT feed_type, status, row_count, started_at, finished_at
FROM tbc_ingest_runs
ORDER BY started_at DESC
LIMIT 20;
```

```sql
SELECT snapshot_date, COUNT(*) AS row_count
FROM tbc_players_feed_snapshots
GROUP BY snapshot_date
ORDER BY snapshot_date DESC;
```

```sql
SELECT snapshot_date, COUNT(*) AS row_count
FROM tbc_batting_feed_snapshots
GROUP BY snapshot_date
ORDER BY snapshot_date DESC;
```

```sql
SELECT snapshot_date, COUNT(*) AS row_count
FROM tbc_pitching_feed_snapshots
GROUP BY snapshot_date
ORDER BY snapshot_date DESC;
```
