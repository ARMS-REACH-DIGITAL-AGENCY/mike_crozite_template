#!/usr/bin/env ts-node
// scripts/sync-mlb-full-org-rosters.ts
// YAT?STATS — MLB Full-Season Org Roster Sync
//
// Pulls the fullSeason roster for all 30 MLB organizations from the MLB Stats
// API, capturing MLB and MiLB affiliate assignments for each player.  Each
// entry is matched to a canonical YAT?STATS playerid (via player_source_map
// first, then conservative exact-name fallback) and upserted into
// player_current_team with the assigned team name, level, and MLB API team id.
//
// Usage:
//   npx ts-node scripts/sync-mlb-full-org-rosters.ts               # all orgs, current season
//   npx ts-node scripts/sync-mlb-full-org-rosters.ts --season 2024 # specific season
//   npx ts-node scripts/sync-mlb-full-org-rosters.ts --dry-run     # preview, no writes
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
const DELAY_MS = 250;

// All sport IDs covered by fullSeason rosters (MLB through Rookie ball).
const ALL_SPORT_IDS = "1,11,12,13,14,15,16";

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

interface MlbTeamWithSport extends MlbTeam {
  sport?: { id?: number; name?: string };
  parentOrgId?: number;
}

interface MlbRosterEntry {
  person: {
    id: number;
    fullName?: string;
    firstName?: string;
    lastName?: string;
  };
  position?: { name?: string; abbreviation?: string };
  status?: { code?: string; description?: string };
  /** The specific affiliate team the player is assigned to. */
  team?: { id?: number; name?: string };
  parentTeamId?: number;
}

interface MlbTeamsResponse {
  teams: MlbTeamWithSport[];
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

// Level label derived from the MLB API sport name.
type LevelLabel =
  | "MLB"
  | "AAA"
  | "AA"
  | "High-A"
  | "Single-A"
  | "Rookie"
  | "Unknown";

// ---------------------------------------------------------------------------
// Database pool
// ---------------------------------------------------------------------------
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function safePlayerName(p: MlbRosterEntry["person"]): string {
  return (
    p.fullName ??
    (`${p.firstName ?? ""} ${p.lastName ?? ""}`.trim() || "Unknown Player")
  );
}

/** Map an MLB API sport name to a short level label. */
function sportNameToLevel(sportName?: string): LevelLabel {
  if (!sportName) return "Unknown";
  const s = sportName.toLowerCase();
  if (s.includes("major")) return "MLB";
  if (s.includes("triple") || s.includes("triple-a") || s === "aaa")
    return "AAA";
  if (s.includes("double") || s.includes("double-a") || s === "aa")
    return "AA";
  if (s.includes("high")) return "High-A";
  if (s.includes("single") || s.includes("class a")) return "Single-A";
  if (s.includes("rookie")) return "Rookie";
  return "Unknown";
}

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

/**
 * Fetch all teams across all sport levels so we can resolve the level label
 * for any affiliated team encountered in a fullSeason roster.
 */
async function fetchAllTeamsWithSport(): Promise<
  Map<number, { name: string; level: LevelLabel }>
> {
  const url = `${MLB_API_BASE}/teams?sportIds=${ALL_SPORT_IDS}&season=${SEASON}&hydrate=sport`;
  const map = new Map<number, { name: string; level: LevelLabel }>();
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const data = (await res.json()) as MlbTeamsResponse;
    for (const t of data.teams ?? []) {
      map.set(t.id, {
        name: t.name,
        level: sportNameToLevel(t.sport?.name),
      });
    }
  } catch (err) {
    console.error("fetchAllTeamsWithSport error:", err);
  }
  return map;
}

async function fetchFullSeasonRoster(
  teamId: number
): Promise<MlbRosterResponse | null> {
  const url = `${MLB_API_BASE}/teams/${teamId}/roster?rosterType=fullSeason&season=${SEASON}&hydrate=person,team`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    return (await res.json()) as MlbRosterResponse;
  } catch (err) {
    console.error(`fetchFullSeasonRoster(${teamId}) error:`, err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Database helpers
// ---------------------------------------------------------------------------
async function getAllDbPlayers(): Promise<DbPlayerRow[]> {
  const { rows } = await pool.query<DbPlayerRow>(`
    SELECT
      playerid::text AS playerid,
      TRIM(firstname) AS firstname,
      TRIM(lastname)  AS lastname
    FROM tbc_players_raw
    WHERE TRIM(firstname) != '' AND TRIM(lastname) != ''
  `);
  return rows;
}

function buildNameKey(firstName: string, lastName: string): string {
  return `${firstName.toLowerCase()} ${lastName.toLowerCase()}`.trim();
}

function buildNameIndex(players: DbPlayerRow[]): Map<string, DbPlayerRow[]> {
  const index = new Map<string, DbPlayerRow[]>();
  for (const p of players) {
    const key = buildNameKey(p.firstname, p.lastname);
    const bucket = index.get(key) ?? [];
    bucket.push(p);
    index.set(key, bucket);
  }
  return index;
}

async function resolveFromSourceMap(
  mlbPersonId: number
): Promise<string | null> {
  return resolvePlayerFromSourceMap(pool, "mlb_api", String(mlbPersonId));
}

async function saveSourceMap(
  playerid: string,
  mlbPersonId: number,
  fullName: string
): Promise<void> {
  return upsertSourceMap(
    pool,
    playerid,
    "mlb_api",
    String(mlbPersonId),
    fullName
  );
}

/**
 * Upsert a fullSeason assignment into player_current_team.
 *
 * teamid is intentionally set to NULL — we do not have a canonical YAT/TBC
 * team identifier for affiliate teams. MLB abbreviations must never be stored
 * in teamid.
 */
async function upsertFullSeasonTeam(
  playerid: string,
  assignedTeamId: number,
  assignedTeamName: string,
  level: LevelLabel,
  rosterStatus: string
): Promise<void> {
  await pool.query(
    `INSERT INTO player_current_team
       (playerid, teamid, team_name, level, source, source_team_id, roster_status,
        last_verified, updated_at)
     VALUES ($1, NULL, $2, $3, 'mlb_api', $4, $5, NOW(), NOW())
     ON CONFLICT (playerid) DO UPDATE SET
       teamid         = NULL,
       team_name      = EXCLUDED.team_name,
       level          = EXCLUDED.level,
       source         = EXCLUDED.source,
       source_team_id = EXCLUDED.source_team_id,
       roster_status  = EXCLUDED.roster_status,
       last_verified  = EXCLUDED.last_verified,
       updated_at     = EXCLUDED.updated_at`,
    [playerid, assignedTeamName, level, String(assignedTeamId), rosterStatus]
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
  console.log("=== YAT?STATS MLB Full-Season Org Roster Sync ===");
  console.log(`Season: ${SEASON}`);
  console.log(`Mode:   ${dryRun ? "DRY RUN" : "LIVE"}`);
  console.log("");

  // --- Fetch MLB organizations (30 teams, sportId=1) -----------------------
  const mlbOrgs = await fetchMlbTeams();
  if (mlbOrgs.length === 0) {
    console.error("No MLB teams returned from MLB Stats API. Aborting.");
    process.exit(1);
  }
  console.log(`✓ Fetched ${mlbOrgs.length} MLB organizations`);

  // --- Fetch all teams (all levels) to resolve affiliate levels -------------
  const allTeamInfo = await fetchAllTeamsWithSport();
  console.log(
    `✓ Fetched affiliate team info (${allTeamInfo.size} teams across all levels)`
  );

  // --- Load player DB for name-fallback matching ----------------------------
  const dbPlayers = await getAllDbPlayers();
  console.log(`✓ Loaded ${dbPlayers.length} players from DB`);
  const nameIndex = buildNameIndex(dbPlayers);
  console.log(`✓ Name index built (${nameIndex.size} unique name keys)`);
  console.log("");

  // --- Per-run counters ------------------------------------------------------
  let orgsProcessed = 0;
  let totalEntries = 0;
  let resolvedViaSourceMap = 0;
  let resolvedViaName = 0;
  let ambiguousSkipped = 0;
  let unmatchedSkipped = 0;
  let rowsWritten = 0;

  // --- Process each MLB organization ----------------------------------------
  for (const org of mlbOrgs) {
    console.log(`── ${org.name} (id=${org.id}, abbr=${org.abbreviation}) ──`);

    const rosterData = await fetchFullSeasonRoster(org.id);
    if (!rosterData || !rosterData.roster?.length) {
      console.log(`  ✗ No fullSeason roster returned — skipping`);
      await delay(DELAY_MS);
      continue;
    }

    orgsProcessed++;
    const roster = rosterData.roster;
    console.log(`  ${roster.length} entries in fullSeason roster`);
    totalEntries += roster.length;

    for (const entry of roster) {
      const p = entry.person;
      const displayName = safePlayerName(p);

      // Determine assigned team / level from the entry or the all-teams map.
      const assignedTeamId: number =
        entry.team?.id ?? entry.parentTeamId ?? org.id;
      const teamLookup = allTeamInfo.get(assignedTeamId);
      const assignedTeamName: string =
        entry.team?.name ?? teamLookup?.name ?? org.name;
      const level: LevelLabel = teamLookup?.level ?? "Unknown";
      const rosterStatus = entry.status?.description ?? "Active";

      // ----- Step 1: resolve via player_source_map --------------------------
      let resolvedId: string | null = null;
      if (!dryRun) {
        resolvedId = await resolveFromSourceMap(p.id);
      }

      if (resolvedId) {
        resolvedViaSourceMap++;
        if (!dryRun) {
          await upsertFullSeasonTeam(
            resolvedId,
            assignedTeamId,
            assignedTeamName,
            level,
            rosterStatus
          );
          rowsWritten++;
        } else {
          console.log(
            `  [DRY RUN] source-map: ${displayName} → ${assignedTeamName} (${level}) playerid=${resolvedId}`
          );
        }
        continue;
      }

      // ----- Step 2: conservative exact-name fallback -----------------------
      const nameKey = buildNameKey(p.firstName ?? "", p.lastName ?? "");
      const matches = nameIndex.get(nameKey) ?? [];

      if (matches.length === 0) {
        unmatchedSkipped++;
        console.log(
          `  UNMATCHED: ${displayName} (mlbId=${p.id}, team=${assignedTeamName})`
        );
        continue;
      }

      if (matches.length > 1) {
        ambiguousSkipped++;
        console.log(
          `  AMBIGUOUS (${matches.length} matches): ${displayName} (mlbId=${p.id}) — skipping`
        );
        continue;
      }

      // Exactly one match — safe to use.
      const dbPlayer = matches[0];
      resolvedViaName++;
      if (!dryRun) {
        await upsertFullSeasonTeam(
          dbPlayer.playerid,
          assignedTeamId,
          assignedTeamName,
          level,
          rosterStatus
        );
        await saveSourceMap(dbPlayer.playerid, p.id, displayName);
        rowsWritten++;
      } else {
        console.log(
          `  [DRY RUN] name-match: ${displayName} → ${assignedTeamName} (${level}) playerid=${dbPlayer.playerid}`
        );
      }
    }

    await delay(DELAY_MS);
  }

  // --- Summary ---------------------------------------------------------------
  console.log("");
  console.log("=== Full-Season Org Roster Sync Complete ===");
  console.log(`Organizations processed:      ${orgsProcessed}`);
  console.log(`Roster entries processed:     ${totalEntries}`);
  console.log(`Resolved via source map:      ${resolvedViaSourceMap}`);
  console.log(`Resolved via name match:      ${resolvedViaName}`);
  console.log(`Ambiguous skipped:            ${ambiguousSkipped}`);
  console.log(`Unmatched skipped:            ${unmatchedSkipped}`);
  console.log(
    `Rows written to player_current_team: ${dryRun ? "0 (dry run)" : String(rowsWritten)}`
  );
}

main()
  .catch((err) => {
    console.error("FATAL:", err);
    process.exit(1);
  })
  .finally(() => pool.end());
