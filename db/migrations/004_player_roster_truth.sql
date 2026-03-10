-- Migration 004: Player roster truth + overrides + transactions foundation
-- Adds canonical "current team truth" tables, a manual-override table,
-- a full transaction history table, and a resolved view that prefers:
--   1) manual overrides  (player_team_override)
--   2) roster-truth rows (player_current_team)
--   3) inferred team     (latest stat season from tbc_batting_raw + tbc_pitching_raw)
--
-- This migration is additive and does not alter any existing tables or views.

-- ---------------------------------------------------------------------------
-- 1) Roster truth (one row per player — canonical current team)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS player_current_team (
    playerid        TEXT PRIMARY KEY,
    teamid          TEXT NULL,
    team_name       TEXT NULL,
    level           TEXT NULL,
    source          TEXT NOT NULL,
    source_team_id  TEXT NULL,
    roster_status   TEXT NULL,
    last_verified   TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 2) Manual override (one row per player — takes highest priority)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS player_team_override (
    playerid    TEXT PRIMARY KEY,
    teamid      TEXT NULL,
    team_name   TEXT NULL,
    level       TEXT NULL,
    reason      TEXT NULL,
    updated_by  TEXT NULL,
    updated_at  TIMESTAMPTZ DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 3) Transaction history (many rows per player)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS player_transactions (
    id               BIGSERIAL PRIMARY KEY,
    playerid         TEXT NOT NULL,
    transaction_type TEXT NULL,
    from_team_name   TEXT NULL,
    to_team_name     TEXT NULL,
    effective_date   DATE NULL,
    source           TEXT DEFAULT 'mlb_api',
    payload          JSONB NULL,
    created_at       TIMESTAMPTZ DEFAULT now()
);

-- Useful indexes on player_transactions
CREATE INDEX IF NOT EXISTS idx_player_transactions_player
    ON player_transactions (playerid);

CREATE INDEX IF NOT EXISTS idx_player_transactions_effective_date
    ON player_transactions (effective_date DESC);

-- ---------------------------------------------------------------------------
-- Resolved "current team" view
-- Priority: override → roster truth → inferred from latest stat season
--
-- The inferred CTE resolves the per-player latest teamid from
-- tbc_batting_raw + tbc_pitching_raw ordered by year DESC, games DESC.
-- team_name/level are not reliably available in raw stat tables, so the
-- inferred tier only supplies teamid and source='inferred'.
-- ---------------------------------------------------------------------------
DROP VIEW IF EXISTS public.v_player_current_team_resolved;

CREATE VIEW public.v_player_current_team_resolved AS
WITH inferred_team AS (
    SELECT DISTINCT ON (playerid)
        playerid::text   AS playerid,
        teamid::text     AS teamid,
        'inferred'::text AS source
    FROM (
        SELECT
            playerid,
            teamid,
            CASE WHEN trim(year) ~ '^[0-9]+$' THEN trim(year)::int ELSE 0 END AS yr,
            CASE WHEN trim(g)    ~ '^[0-9]+$' THEN trim(g)::int    ELSE 0 END AS games
        FROM tbc_batting_raw
        UNION ALL
        SELECT
            playerid,
            teamid,
            CASE WHEN trim(year) ~ '^[0-9]+$' THEN trim(year)::int ELSE 0 END AS yr,
            CASE WHEN trim(g)    ~ '^[0-9]+$' THEN trim(g)::int    ELSE 0 END AS games
        FROM tbc_pitching_raw
    ) x
    ORDER BY playerid, yr DESC, games DESC, teamid
),
all_players AS (
    SELECT playerid::text AS playerid FROM tbc_players_raw
    UNION
    SELECT playerid FROM player_current_team
    UNION
    SELECT playerid FROM player_team_override
    UNION
    SELECT playerid FROM inferred_team
)
SELECT
    ap.playerid,
    COALESCE(o.teamid,     r.teamid,     i.teamid) AS teamid,
    COALESCE(o.team_name,  r.team_name,  NULL)      AS team_name,
    COALESCE(o.level,      r.level,      'inferred') AS level,
    CASE
        WHEN o.playerid IS NOT NULL THEN 'override'
        WHEN r.playerid IS NOT NULL THEN r.source
        ELSE 'inferred'
    END AS source,
    CASE
        WHEN o.playerid IS NOT NULL THEN o.updated_at
        WHEN r.playerid IS NOT NULL THEN r.last_verified
        ELSE NULL::timestamptz
    END AS last_verified
FROM all_players ap
LEFT JOIN player_team_override o
    ON o.playerid = ap.playerid
LEFT JOIN player_current_team r
    ON r.playerid = ap.playerid
LEFT JOIN inferred_team i
    ON i.playerid = ap.playerid;
