-- Migration 002: Create teams lookup table
-- Maps TBC teamid values to human-readable team names.
-- Populated via scripts/import-teams.ts (CSV from the team-names spreadsheet).

CREATE TABLE IF NOT EXISTS teams (
  teamid    TEXT PRIMARY KEY,
  team_name TEXT NOT NULL
);
