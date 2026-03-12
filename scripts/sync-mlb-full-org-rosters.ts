#!/usr/bin/env ts-node
// scripts/sync-mlb-full-org-rosters.ts
// YAT?STATS — MLB Full-Season Org Roster Sync  (THE ONE CANONICAL SYNC SCRIPT)
//
// WHY THIS SCRIPT EXISTS
// ──────────────────────
// Our canonical player records (tbc_players_raw) carry stats from
// tbc_batting_raw / tbc_pitching_raw.  Those stat rows reflect the team a
// player appeared for most often in a season — NOT the team they currently
// play for.  Dom Hamel, for example, accumulated most of his 2025 AB with the
// Syracuse Mets even though he later moved to the SWB RailRiders (Yankees AAA).
// Stats-based team lookup therefore always lags reality, sometimes by months.
//
// The MLB Stats API `fullSeason` roster type returns EVERY player assigned to
// any team in an organization's system for the full season — from the MLB
// 26-man active roster all the way down to Rookie ball.  This is the only
// reliable, real-time source for "where is this player YAT?"
//
// WHY NOT THE 40-MAN / fullRoster SCRIPT?
// ─────────────────────────────────────────
// A separate "org roster" script was written that uses rosterType=fullRoster
// (the MLB 40-man roster) and hardcodes level='MLB' for every entry.  That
// script misses every player below 40-man status — the majority of tracked
// YAT?STATS alumni — and would overwrite accurate minor-league data with wrong
// data.  It has been removed.  This script is the one to run.
//
// NICKNAME / LEGAL-NAME MISMATCH FIX
// ───────────────────────────────────
// Our DB stores preferred/nickname first names (e.g. "Dom" for Dominic Hamel).
// The MLB Stats API returns legal first names ("Dominic").  Exact-string
// matching therefore silently skips those players (logged as UNMATCHED).
// This script now adds a Step 2.5 prefix-based nickname fallback:
//   "dominic".startsWith("dom")  →  matches  ✓
//   "dom".startsWith("dom")      →  exact, already matched in Step 2
// Only unambiguous (single-candidate) nickname matches are accepted.
//
// ENDPOINTS USED  (verified against official MLB Stats API docs)
// ──────────────────────────────────────────────────────────────
//   GET /teams?sportId=1&season=               → 30 MLB orgs
//   GET /teams?sportIds=1,11-16&hydrate=sport  → affiliate team/level map
//   GET /teams/{teamId}/roster?rosterType=fullSeason&season=&hydrate=person,team
//
// Usage:
//   npm run sync:rosters                   # all orgs, current season
//   npm run sync:rosters -- --season 2024  # specific season
//   npm run sync:rosters:dry               # preview, no DB writes
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
    /** useName is the MLB API's preferred/nickname field (e.g. "Dom" for
     *  Dominic Hamel).  Our canonical DB stores the same preferred name, so
     *  this is the primary key for name matching — not firstName. */
    useName?: string;
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
  const url = `${MLB_API_BASE}/teams/${teamId}/roster?rosterType=fullSeason&season=${SEASON}&hydrate=person(useName,firstName,lastName,fullName),team`;
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

/**
 * Secondary index keyed by lowercase lastName for prefix-based fallback.
 * Used only when both firstName and useName exact matches fail.
 */
function buildLastNameIndex(
  players: DbPlayerRow[]
): Map<string, DbPlayerRow[]> {
  const index = new Map<string, DbPlayerRow[]>();
  for (const p of players) {
    const key = p.lastname.toLowerCase();
    const bucket = index.get(key) ?? [];
    bucket.push(p);
    index.set(key, bucket);
  }
  return index;
}

/**
 * Last-resort prefix match: MLB firstName/useName starts with our stored name
 * or vice-versa.  Returns only a single unambiguous result.
 *
 * This fires only when both the firstName-key and useName-key exact lookups
 * miss.  Real-world example (should now be rare): our DB has "TJ" but MLB
 * API has useName="T.J." and firstName="Thomas".
 */
function findPrefixMatch(
  mlbFirstName: string,
  mlbUseName: string,
  mlbLastName: string,
  lastNameIndex: Map<string, DbPlayerRow[]>
): DbPlayerRow | null {
  const mlbFirst = mlbFirstName.toLowerCase();
  const mlbUse = mlbUseName.toLowerCase();
  const mlbLast = mlbLastName.toLowerCase();

  const candidates = (lastNameIndex.get(mlbLast) ?? []).filter((p) => {
    const dbFirst = p.firstname.toLowerCase();
    // Prefix match on firstName
    if (mlbFirst.startsWith(dbFirst) || dbFirst.startsWith(mlbFirst)) return true;
    // Prefix match on useName
    if (mlbUse && (mlbUse.startsWith(dbFirst) || dbFirst.startsWith(mlbUse))) return true;
    return false;
  });

  return candidates.length === 1 ? candidates[0] : null;
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
  const lastNameIndex = buildLastNameIndex(dbPlayers);
  console.log(`✓ Name indexes built (${nameIndex.size} unique name keys)`);
  console.log("");

  // --- Per-run counters ------------------------------------------------------
  let orgsProcessed = 0;
  let totalEntries = 0;
  let resolvedViaSourceMap = 0;
  let resolvedViaFirstName = 0;
  let resolvedViaUseName = 0;
  let resolvedViaPrefix = 0;
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

      // ----- Step 2: name matching (three tiers) ----------------------------
      //
      // Tier A — useName exact match (BEST): useName is the MLB API's
      //   preferred/nickname field and matches what our DB stores.
      //   "Dom Hamel" in DB → useName="Dom" in API → exact hit. ✓
      //
      // Tier B — firstName exact match: for players who go by their legal name.
      //   "Michael King" in DB → firstName="Michael" in API → exact hit. ✓
      //
      // Tier C — prefix fallback (LAST RESORT): catches edge cases like "TJ"
      //   vs "T.J." or initialisms where neither name field exactly matches.
      //
      // In all tiers, last names must match exactly.

      const useNameKey = buildNameKey(p.useName ?? "", p.lastName ?? "");
      const firstNameKey = buildNameKey(p.firstName ?? "", p.lastName ?? "");

      // Tier A: useName exact match
      let matches = p.useName ? (nameIndex.get(useNameKey) ?? []) : [];
      let matchTier = "useName";

      // Tier B: firstName exact match (if useName missed or is same as firstName)
      if (matches.length === 0) {
        matches = nameIndex.get(firstNameKey) ?? [];
        matchTier = "firstName";
      }

      if (matches.length === 0) {
        // Tier C: prefix fallback
        const prefixMatch = findPrefixMatch(
          p.firstName ?? "",
          p.useName ?? "",
          p.lastName ?? "",
          lastNameIndex
        );
        if (prefixMatch) {
          matches = [prefixMatch];
          matchTier = "prefix";
        }
      }

      if (matches.length === 0) {
        unmatchedSkipped++;
        console.log(
          `  UNMATCHED: ${displayName} (mlbId=${p.id}, useName=${p.useName ?? "—"}, team=${assignedTeamName})`
        );
        continue;
      }

      if (matches.length > 1) {
        ambiguousSkipped++;
        console.log(
          `  AMBIGUOUS (${matches.length} matches, tier=${matchTier}): ${displayName} (mlbId=${p.id}) — skipping`
        );
        continue;
      }

      // Exactly one match — safe to use.
      const dbPlayer = matches[0];
      if (matchTier === "useName") resolvedViaUseName++;
      else if (matchTier === "firstName") resolvedViaFirstName++;
      else resolvedViaPrefix++;

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
          `  [DRY RUN] ${matchTier}: ${displayName} (useName=${p.useName ?? "—"}) → ${assignedTeamName} (${level}) playerid=${dbPlayer.playerid}`
        );
      }
    }

    await delay(DELAY_MS);
  }

  // --- Summary ---------------------------------------------------------------
  console.log("");
  console.log("=== Full-Season Org Roster Sync Complete ===");
  console.log(`Organizations processed:          ${orgsProcessed}`);
  console.log(`Roster entries processed:         ${totalEntries}`);
  console.log(`Resolved via source map:          ${resolvedViaSourceMap}`);
  console.log(`Resolved via useName match:       ${resolvedViaUseName}`);
  console.log(`Resolved via firstName match:     ${resolvedViaFirstName}`);
  console.log(`Resolved via prefix fallback:     ${resolvedViaPrefix}`);
  console.log(`Ambiguous skipped:                ${ambiguousSkipped}`);
  console.log(`Unmatched skipped:                ${unmatchedSkipped}`);
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
