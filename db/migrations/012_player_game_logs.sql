-- db/migrations/012_player_game_logs.sql
-- ---------------------------------------------------------------------------
-- Canonical, source-agnostic per-game log table.
--
-- Replaces two half-finished predecessors that never got populated:
--   - batting_game_log / pitching_game_log (008_game_logs.sql)
--   - the sportsblaze_mlb_player_gamelogs table PlayerSevenDaySnapshot.tsx
--     queried but that was never created by any migration
--
-- One row per player, per game, per stat type (a two-way player can have
-- both a batting and a pitching row for the same game). `source` keys the
-- row to whichever feed produced it so multiple providers can coexist:
--   'mlb_api'        - MLB Stats API (statsapi.mlb.com), free, no key
--   'presto_sports'  - Presto Sports (JUCO/NAIA/D2/D3), pending partnership
--
-- Consumers:
--   - getPlayerGameLogs() in src/lib/db.ts, used by the player profile
--     page's SCHEDULE tab (merges into the season schedule by game_date)
--     and by PlayerSevenDaySnapshot.tsx (the flip-card-back 7-Day Snapshot).
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.player_game_logs (
    id               BIGSERIAL   PRIMARY KEY,
    playerid         TEXT        NOT NULL,
    source           TEXT        NOT NULL,
    source_game_id   TEXT        NOT NULL,
    source_team_id   TEXT        NULL,
    stat_type        TEXT        NOT NULL CHECK (stat_type IN ('batting', 'pitching')),
    game_date        DATE        NOT NULL,
    game_status      TEXT        NULL,   -- 'Final' | 'In Progress' | 'Postponed' | ...
    team_name        TEXT        NULL,
    opponent_name    TEXT        NULL,
    home_away        TEXT        NULL,   -- 'home' | 'away'
    started          BOOLEAN     NULL,
    line_summary     TEXT        NULL,   -- pre-formatted, e.g. "2-4, HR, 3 RBI"
    stats            JSONB       NULL,   -- raw per-stat numeric fields
    raw_payload      JSONB       NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (playerid, source, source_game_id, stat_type)
);

CREATE INDEX IF NOT EXISTS idx_player_game_logs_playerid_date
    ON public.player_game_logs (playerid, game_date DESC);
