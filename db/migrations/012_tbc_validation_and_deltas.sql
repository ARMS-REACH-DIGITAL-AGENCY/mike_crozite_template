-- 1. Create tbc_invalid_rows table for rejected data
CREATE TABLE IF NOT EXISTS tbc_invalid_rows (
    id SERIAL PRIMARY KEY,
    ingest_run_id UUID NOT NULL,
    snapshot_id INTEGER, -- Reference to the source snapshot if available
    feed_type TEXT NOT NULL,
    raw_payload JSONB NOT NULL,
    error_reason TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create tbc_batting_daily_deltas table
CREATE TABLE IF NOT EXISTS tbc_batting_daily_deltas (
    id SERIAL PRIMARY KEY,
    playerid TEXT NOT NULL,
    teamid INTEGER NOT NULL,
    year INTEGER NOT NULL,
    delta_date DATE NOT NULL DEFAULT CURRENT_DATE,
    g_delta INTEGER DEFAULT 0,
    ab_delta INTEGER DEFAULT 0,
    r_delta INTEGER DEFAULT 0,
    h_delta INTEGER DEFAULT 0,
    dbl_delta INTEGER DEFAULT 0,
    tpl_delta INTEGER DEFAULT 0,
    hr_delta INTEGER DEFAULT 0,
    rbi_delta INTEGER DEFAULT 0,
    sb_delta INTEGER DEFAULT 0,
    bb_delta INTEGER DEFAULT 0,
    so_delta INTEGER DEFAULT 0,
    from_snapshot_ts TIMESTAMPTZ,
    to_snapshot_ts TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Create tbc_pitching_daily_deltas table
CREATE TABLE IF NOT EXISTS tbc_pitching_daily_deltas (
    id SERIAL PRIMARY KEY,
    playerid TEXT NOT NULL,
    teamid INTEGER NOT NULL,
    year INTEGER NOT NULL,
    delta_date DATE NOT NULL DEFAULT CURRENT_DATE,
    w_delta INTEGER DEFAULT 0,
    l_delta INTEGER DEFAULT 0,
    g_delta INTEGER DEFAULT 0,
    gs_delta INTEGER DEFAULT 0,
    sv_delta INTEGER DEFAULT 0,
    ip_delta NUMERIC DEFAULT 0,
    h_delta INTEGER DEFAULT 0,
    r_delta INTEGER DEFAULT 0,
    er_delta INTEGER DEFAULT 0,
    hr_delta INTEGER DEFAULT 0,
    bb_delta INTEGER DEFAULT 0,
    so_delta INTEGER DEFAULT 0,
    from_snapshot_ts TIMESTAMPTZ,
    to_snapshot_ts TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Add summary columns to tbc_ingest_runs
ALTER TABLE tbc_ingest_runs ADD COLUMN IF NOT EXISTS valid_count INTEGER DEFAULT 0;
ALTER TABLE tbc_ingest_runs ADD COLUMN IF NOT EXISTS invalid_count INTEGER DEFAULT 0;
ALTER TABLE tbc_ingest_runs ADD COLUMN IF NOT EXISTS delta_count INTEGER DEFAULT 0;
