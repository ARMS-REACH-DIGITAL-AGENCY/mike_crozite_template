-- SQL to generate daily deltas for batting and pitching stats.
-- Strategy: Compare the latest snapshot with the previous snapshot for each player+team+year (2026 only).

-- 1. Generate Batting Deltas
WITH latest_snapshots AS (
    SELECT DISTINCT ON (playerid, teamid, year)
        id,
        playerid,
        teamid,
        year,
        snapshot_ts,
        raw_payload
    FROM tbc_batting_feed_snapshots
    WHERE snapshot_date = CURRENT_DATE
      AND (raw_payload->>'year')::INTEGER = 2026
    ORDER BY playerid, teamid, year, snapshot_ts DESC
),
previous_snapshots AS (
    SELECT DISTINCT ON (playerid, teamid, year)
        id,
        playerid,
        teamid,
        year,
        snapshot_ts,
        raw_payload
    FROM tbc_batting_feed_snapshots
    WHERE snapshot_date < CURRENT_DATE
      AND (raw_payload->>'year')::INTEGER = 2026
    ORDER BY playerid, teamid, year, snapshot_ts DESC
)
INSERT INTO tbc_batting_daily_deltas (
    playerid, teamid, year, delta_date,
    g_delta, ab_delta, r_delta, h_delta, dbl_delta, tpl_delta, hr_delta, rbi_delta, sb_delta, bb_delta, so_delta,
    from_snapshot_ts, to_snapshot_ts
)
SELECT 
    l.playerid, l.teamid, l.year, CURRENT_DATE,
    (l.raw_payload->>'g')::INTEGER - (p.raw_payload->>'g')::INTEGER,
    (l.raw_payload->>'ab')::INTEGER - (p.raw_payload->>'ab')::INTEGER,
    (l.raw_payload->>'r')::INTEGER - (p.raw_payload->>'r')::INTEGER,
    (l.raw_payload->>'h')::INTEGER - (p.raw_payload->>'h')::INTEGER,
    (l.raw_payload->>'dbl')::INTEGER - (p.raw_payload->>'dbl')::INTEGER,
    (l.raw_payload->>'tpl')::INTEGER - (p.raw_payload->>'tpl')::INTEGER,
    (l.raw_payload->>'hr')::INTEGER - (p.raw_payload->>'hr')::INTEGER,
    (l.raw_payload->>'rbi')::INTEGER - (p.raw_payload->>'rbi')::INTEGER,
    (l.raw_payload->>'sb')::INTEGER - (p.raw_payload->>'sb')::INTEGER,
    (l.raw_payload->>'bb')::INTEGER - (p.raw_payload->>'bb')::INTEGER,
    (l.raw_payload->>'so')::INTEGER - (p.raw_payload->>'so')::INTEGER,
    p.snapshot_ts, l.snapshot_ts
FROM latest_snapshots l
JOIN previous_snapshots p ON l.playerid = p.playerid AND l.teamid = p.teamid AND l.year = p.year
WHERE (l.raw_payload->>'g')::INTEGER >= (p.raw_payload->>'g')::INTEGER; -- Skip if stats go backwards

-- 2. Generate Pitching Deltas
WITH latest_snapshots AS (
    SELECT DISTINCT ON (playerid, teamid, year)
        id,
        playerid,
        teamid,
        year,
        snapshot_ts,
        raw_payload
    FROM tbc_pitching_feed_snapshots
    WHERE snapshot_date = CURRENT_DATE
      AND (raw_payload->>'year')::INTEGER = 2026
    ORDER BY playerid, teamid, year, snapshot_ts DESC
),
previous_snapshots AS (
    SELECT DISTINCT ON (playerid, teamid, year)
        id,
        playerid,
        teamid,
        year,
        snapshot_ts,
        raw_payload
    FROM tbc_pitching_feed_snapshots
    WHERE snapshot_date < CURRENT_DATE
      AND (raw_payload->>'year')::INTEGER = 2026
    ORDER BY playerid, teamid, year, snapshot_ts DESC
)
INSERT INTO tbc_pitching_daily_deltas (
    playerid, teamid, year, delta_date,
    w_delta, l_delta, g_delta, gs_delta, sv_delta, ip_delta, h_delta, r_delta, er_delta, hr_delta, bb_delta, so_delta,
    from_snapshot_ts, to_snapshot_ts
)
SELECT 
    l.playerid, l.teamid, l.year, CURRENT_DATE,
    (l.raw_payload->>'w')::INTEGER - (p.raw_payload->>'w')::INTEGER,
    (l.raw_payload->>'l')::INTEGER - (p.raw_payload->>'l')::INTEGER,
    (l.raw_payload->>'g')::INTEGER - (p.raw_payload->>'g')::INTEGER,
    (l.raw_payload->>'gs')::INTEGER - (p.raw_payload->>'gs')::INTEGER,
    (l.raw_payload->>'sv')::INTEGER - (p.raw_payload->>'sv')::INTEGER,
    (l.raw_payload->>'ip')::NUMERIC - (p.raw_payload->>'ip')::NUMERIC,
    (l.raw_payload->>'h')::INTEGER - (p.raw_payload->>'h')::INTEGER,
    (l.raw_payload->>'r')::INTEGER - (p.raw_payload->>'r')::INTEGER,
    (l.raw_payload->>'er')::INTEGER - (p.raw_payload->>'er')::INTEGER,
    (l.raw_payload->>'hr')::INTEGER - (p.raw_payload->>'hr')::INTEGER,
    (l.raw_payload->>'bb')::INTEGER - (p.raw_payload->>'bb')::INTEGER,
    (l.raw_payload->>'so')::INTEGER - (p.raw_payload->>'so')::INTEGER,
    p.snapshot_ts, l.snapshot_ts
FROM latest_snapshots l
JOIN previous_snapshots p ON l.playerid = p.playerid AND l.teamid = p.teamid AND l.year = p.year
WHERE (l.raw_payload->>'g')::INTEGER >= (p.raw_payload->>'g')::INTEGER; -- Skip if stats go backwards
