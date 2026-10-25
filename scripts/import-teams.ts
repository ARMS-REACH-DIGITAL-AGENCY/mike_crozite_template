#!/usr/bin/env ts-node
// scripts/import-teams.ts
//
// DEPRECATED / INTENTIONALLY DISABLED (2026-10-23)
//
// public.teamid_universe_mapping is the canonical YAT?STATS team identity table.
// The legacy public.teams lookup must not be repopulated or used as an identity
// source. Team name, organization/conference, and level all belong in the
// canonical universe mapping.
//
// If a source import needs a new Team ID, add/repair that Team ID in
// teamid_universe_mapping instead of reviving the legacy teams table.

throw new Error(
  "scripts/import-teams.ts is disabled: use public.teamid_universe_mapping as the canonical team identity source."
);
