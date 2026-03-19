-- db/migrations/008_game_logs.sql
-- ---------------------------------------------------------------------------
-- Creates batting_game_log and pitching_game_log tables for per-game stats.
--
-- These tables are queried by getPlayerBattingGameLog() and
-- getPlayerPitchingGameLog() in src/lib/db.ts to populate the schedule
-- section of the player profile page.  Both functions degrade gracefully
-- (returning []) when the tables are absent, so this migration is safe to
-- apply at any time without downtime.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. batting_game_log
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS batting_game_log (
    id          BIGSERIAL   PRIMARY KEY,
    playerid    TEXT        NOT NULL,
    team_id     TEXT        NOT NULL,
    game_date   DATE        NOT NULL,
    h           INTEGER     NULL,
    ab          INTEGER     NULL,
    dbl         INTEGER     NULL,   -- doubles
    tpl         INTEGER     NULL,   -- triples
    hr          INTEGER     NULL,
    rbi         INTEGER     NULL,
    r           INTEGER     NULL,
    so          INTEGER     NULL,
    bb          INTEGER     NULL,
    sf          INTEGER     NULL,
    sb          INTEGER     NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_batting_game_log_player_team
    ON batting_game_log (playerid, team_id, game_date);

-- ---------------------------------------------------------------------------
-- 2. pitching_game_log
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pitching_game_log (
    id          BIGSERIAL   PRIMARY KEY,
    playerid    TEXT        NOT NULL,
    team_id     TEXT        NOT NULL,
    game_date   DATE        NOT NULL,
    ip          NUMERIC(5,1) NULL,  -- innings pitched
    h           INTEGER     NULL,
    r           INTEGER     NULL,
    er          INTEGER     NULL,
    ko          INTEGER     NULL,   -- strikeouts (also stored as "so" in some sources)
    bb          INTEGER     NULL,
    decision    TEXT        NULL,   -- W / L / S / H / ND
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pitching_game_log_player_team
    ON pitching_game_log (playerid, team_id, game_date);
