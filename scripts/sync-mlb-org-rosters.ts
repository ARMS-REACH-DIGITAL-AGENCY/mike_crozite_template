#!/usr/bin/env ts-node
// scripts/sync-mlb-org-rosters.ts
// YAT?STATS — MLB Organization Roster Sync
//
// Pulls the 40-man roster for all 30 MLB teams from the MLB Stats API,
// matches each player by name to `tbc_players_raw`, and upserts their
// current team into the `player_current_team` table.
//
// Usage:
//   npx ts-node scripts/sync-mlb-org-rosters.ts              # all teams, current season
//   npx ts-node scripts/sync-mlb-org-rosters.ts --season 2024 # specific season
//   npx ts-node scripts/sync-mlb-org-rosters.ts --dry-run    # preview, no writes
//
// Required env vars:
//   DATABASE_URL  — Neon Postgres connection string

import { Pool } from "pg";
import {
  resolvePlayerFromSourceMap,
  upsertSourceMap,
} from "./lib/player-source-map";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("ERROR: DATABASE_URL environment variable is not set.");
  process.exit(1);
}

const MLB_API_BASE = "https://statsapi.mlb.com/api/v1";
const DELAY_MS = 250; // courtesy delay between roster API calls

// Parse CLI args
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const seasonIdx = args.indexOf("--season");
if (seasonIdx !== -1 && !args[seasonIdx + 1]) {
  console.error("ERROR: --season requires a value (e.g. --season 2025).");
  process.exit(1);
}
const SEASON =
  seasonIdx !== -1 ? args[seasonIdx + 1] : String(new Date().getFullYear());

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface MlbTeam {
  id: number;
  name: string;
  abbreviation: string;
}

interface MlbRosterEntry {
  person: {
    id: number;
    fullName: string;
    firstName: string;
    lastName: string;
  };
  position: { name: string; abbreviation: string };
  status: { code: string; description: string };
}

interface MlbTeamsResponse {
  teams: MlbTeam[];
}

interface MlbRosterResponse {
  roster: MlbRosterEntry[];
  team: { id: number; name: string };
}

interface DbPlayerRow {
  playerid: string;
  firstname: string;
  lastname: string;
}

// ---------------------------------------------------------------------------
// Database pool
// ---------------------------------------------------------------------------
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// ---------------------------------------------------------------------------
// MLB Stats API helpers
// ---------------------------------------------------------------------------
async function fetchMlbTeams(): Promise<MlbTeam[]> {
  const url = `${MLB_API_BASE}/teams?sportId=1&season=${SEASON}`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const data = (await res.json()) as MlbTeamsResponse;
    return data.teams ?? [];
  } catch (err) {
    console.error("fetchMlbTeams error:", err);
    return [];
  }
}

async function fetchTeamRoster(
  teamId: number
): Promise<MlbRosterResponse | null> {
  const url = `${MLB_API_BASE}/teams/${teamId}/roster?rosterType=fullRoster&season=${SEASON}`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    return (await res.json()) as MlbRosterResponse;
  } catch (err) {
    console.error(`fetchTeamRoster(${teamId}) error:`, err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Database helpers
// ---------------------------------------------------------------------------

/** Load all players from tbc_players_raw for in-memory name matching. */
async function getAllDbPlayers(): Promise<DbPlayerRow[]> {
  const { rows } = await pool.query<DbPlayerRow>(`
    SELECT
      playerid::text                  AS playerid,
      TRIM(firstname)                 AS firstname,
      TRIM(lastname)                  AS lastname
    FROM tbc_players_raw
    WHERE TRIM(firstname) != '' AND TRIM(lastname) != ''
  `);
  return rows;
}

/**
 * Build a Map of "firstname lastname" (lowercased) → DbPlayerRow[].
 * Allows O(1) lookups with ambiguity detection.
 */
function buildNameIndex(
  players: DbPlayerRow[]
): Map<string, DbPlayerRow[]> {
  const index = new Map<string, DbPlayerRow[]>();
  for (const p of players) {
    const key = `${p.firstname.toLowerCase()} ${p.lastname.toLowerCase()}`;
    const bucket = index.get(key) ?? [];
    bucket.push(p);
    index.set(key, bucket);
  }
  return index;
}

/**
 * Resolve a canonical playerid from player_source_map using the MLB Stats API
 * person.id. Returns null if no mapping exists yet.
 */
async function resolveFromSourceMap(mlbPersonId: number): Promise<string | null> {
  return resolvePlayerFromSourceMap(pool, "mlb_api", String(mlbPersonId));
}

/**
 * Insert or update a row in player_source_map, recording the stable
 * mlb_api → canonical playerid mapping for future runs.
 */
async function saveSourceMap(
  playerid: string,
  mlbPersonId: number,
  fullName: string
): Promise<void> {
  return upsertSourceMap(pool, playerid, "mlb_api", String(mlbPersonId), fullName);
}

/** Upsert a player's current team into player_current_team. */
async function upsertCurrentTeam(
  playerid: string,
  mlbTeamId: number,
  teamName: string,
  teamAbbreviation: string,
  rosterStatus: string
): Promise<void> {
  await pool.query(
    `INSERT INTO player_current_team
       (playerid, teamid, team_name, level, source, source_team_id, roster_status,
        last_verified, updated_at)
     VALUES ($1, $2, $3, 'MLB', 'mlb_api', $4, $5, NOW(), NOW())
     ON CONFLICT (playerid) DO UPDATE SET
       teamid         = EXCLUDED.teamid,
       team_name      = EXCLUDED.team_name,
       level          = EXCLUDED.level,
       source         = EXCLUDED.source,
       source_team_id = EXCLUDED.source_team_id,
       roster_status  = EXCLUDED.roster_status,
       last_verified  = EXCLUDED.last_verified,
       updated_at     = EXCLUDED.updated_at`,
    [
      playerid,
      teamAbbreviation,
      teamName,
      String(mlbTeamId),
      rosterStatus,
    ]
  );
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------
const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Main pipeline
// ---------------------------------------------------------------------------
async function main() {
  console.log("=== YAT?STATS MLB Org Roster Sync ===");
  console.log(`Season: ${SEASON}`);
  console.log(`Mode:   ${dryRun ? "DRY RUN" : "LIVE"}`);
  console.log("");

  // 1. Fetch all 30 MLB teams
  const teams = await fetchMlbTeams();
  if (teams.length === 0) {
    console.error("No teams returned from MLB Stats API. Aborting.");
    process.exit(1);
  }
  console.log(`✓ Fetched ${teams.length} MLB teams`);

  // 2. Load all players from DB for name matching
  const dbPlayers = await getAllDbPlayers();
  console.log(`✓ Loaded ${dbPlayers.length} players from DB`);
  const nameIndex = buildNameIndex(dbPlayers);
  console.log(`✓ Name index built (${nameIndex.size} unique name keys)`);
  console.log("");

  let totalUpserted = 0;
  let totalUnmatched = 0;
  const unmatchedLog: string[] = [];

  // 3. Process each team
  for (const team of teams) {
    console.log(`── ${team.name} (id=${team.id}, abbr=${team.abbreviation}) ──`);

    const rosterData = await fetchTeamRoster(team.id);
    if (!rosterData || !rosterData.roster?.length) {
      console.log(`  ✗ No roster returned — skipping`);
      await delay(DELAY_MS);
      continue;
    }

    const roster = rosterData.roster;
    console.log(`  ${roster.length} players on roster`);

    for (const entry of roster) {
      const p = entry.person;

      // ── 1. Try stable source-map lookup (mlb_api person.id → playerid) ──
      let resolvedId: string | null = null;
      if (!dryRun) {
        resolvedId = await resolveFromSourceMap(p.id);
      }

      if (resolvedId) {
        // Fast path: deterministic mapping already exists
        if (!dryRun) {
          await upsertCurrentTeam(
            resolvedId,
            team.id,
            team.name,
            team.abbreviation,
            entry.status?.description ?? "Active"
          );
        } else {
          console.log(
            `  [DRY RUN] Would upsert (source-map): ${p.fullName} → ${team.name} (playerid=${resolvedId})`
          );
        }
        totalUpserted++;
        continue;
      }

      // ── 2. Fallback: conservative exact-name matching ──
      const nameKey = `${(p.firstName ?? "").toLowerCase()} ${(p.lastName ?? "").toLowerCase()}`.trim();
      const matches = nameIndex.get(nameKey) ?? [];

      if (matches.length === 0) {
        totalUnmatched++;
        unmatchedLog.push(
  `UNMATCHED: ${p.fullName ?? `${p.firstName ?? ""} ${p.lastName ?? ""}`.trim() || "Unknown Player"} (mlbId=${p.id}, team=${team.name})`
);
        continue;
      }

      if (matches.length > 1) {
        // Ambiguous: do not guess — log and skip to avoid wrong mapping
        console.log(
          `  AMBIGUOUS (${matches.length} matches): ${p.fullName} (mlbId=${p.id}) — skipping to avoid incorrect mapping`
        );
        totalUnmatched++;
        unmatchedLog.push(
          `  AMBIGUOUS: ${p.fullName} (mlbId=${p.id}, team=${team.name}, ${matches.length} name matches)`
        );
        continue;
      }

      // Exactly one name match — safe to use
      const dbPlayer = matches[0];
      if (!dryRun) {
        await upsertCurrentTeam(
          dbPlayer.playerid,
          team.id,
          team.name,
          team.abbreviation,
          entry.status?.description ?? "Active"
        );
        // Record the stable mapping so future runs skip name matching
        await saveSourceMap(dbPlayer.playerid, p.id, p.fullName);
      } else {
        console.log(
          `  [DRY RUN] Would upsert (name-match): ${p.fullName} → ${team.name} (playerid=${dbPlayer.playerid})`
        );
      }
      totalUpserted++;
    }

    await delay(DELAY_MS);
  }

  // 4. Summary
  console.log("");
  console.log("=== Sync Complete ===");
  console.log(`Teams processed:   ${teams.length}`);
  console.log(`Players upserted:  ${totalUpserted}`);
  console.log(`Unmatched players: ${totalUnmatched}`);

  if (unmatchedLog.length > 0) {
    console.log(
      "\n--- Unmatched Players (not found in tbc_players_raw by name) ---"
    );
    for (const line of unmatchedLog) {
      console.log(line);
    }
  }
}

main()
  .catch((err) => {
    console.error("FATAL:", err);
    process.exit(1);
  })
  .finally(() => pool.end());
