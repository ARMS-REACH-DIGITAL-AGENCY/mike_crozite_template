-- Migration 005: Player source-ID bridge
-- Maps MLB source player IDs (e.g. MLB Stats API person.id) to canonical
-- YAT?STATS playerid values so roster and transaction ingestion can resolve
-- players deterministically without relying on fragile name matching.
--
-- source            — identifier for the external system (e.g. 'mlb_api')
-- source_player_id  — the ID assigned by that external system (e.g. MLB person.id as text)
-- playerid          — canonical YAT?STATS playerid from tbc_players_raw / player_hsids
-- source_player_name — display name captured at the time the mapping was created (informational only)

CREATE TABLE IF NOT EXISTS player_source_map (
    playerid          TEXT NOT NULL,
    source            TEXT NOT NULL,
    source_player_id  TEXT NOT NULL,
    source_player_name TEXT NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (source, source_player_id)
);

CREATE INDEX IF NOT EXISTS idx_player_source_map_playerid
    ON player_source_map(playerid);
