#!/usr/bin/env ts-node
// scripts/bootstrap-mlb-player-ids.ts
// YAT?STATS — One-Time MLB Player ID Bootstrap
//
// WHY THIS SCRIPT EXISTS
// ──────────────────────
// Every MLB player has a unique, permanent numeric person ID in the MLB Stats
// API (e.g. Dom Hamel = 687589).  YAT?STATS players have their own internal
// playerid values.  These two ID spaces are completely different, exactly like
// how MLB team IDs and our team IDs are different (we solved that with a team
// mapping table).
//
// This script builds the equivalent mapping table for PLAYERS by writing rows
// to `player_source_map` (source='mlb_api').  Once that table is populated:
//   • The sync script uses stored MLB IDs directly — zero name matching needed.
//   • The player profile page looks up the MLB ID instantly — zero API search.
//   • Team updates are 100% accurate regardless of nickname/legal name diffs.
//
// NAME MATCHING (done here ONCE, then never again at runtime)
// ────────────────────────────────────────────────────────────
// Three tiers — all require exact last-name match:
//   Tier A — useName exact:  MLB useName="Dom"   → our firstName="Dom"  ✓
//   Tier B — firstName exact: MLB firstName="Dom" → our firstName="Dom"  ✓
//   Tier C — prefix fallback: "Dominic".startsWith("Dom")               ✓
//
// When names truly differ (e.g. "TJ" vs "T.J.") or two players share a name,
// the script logs those players as UNMATCHED so they can be resolved manually
// via a one-line SQL UPDATE, not by patching code.
//
// USAGE
// ─────
//   npm run sync:bootstrap-ids             # match & save all unmatched players
//   npm run sync:bootstrap-ids:dry         # preview only, no DB writes
//   npm run sync:bootstrap-ids -- --season 2025   # use a specific season
//
// Safe to re-run — already-mapped players are counted and skipped.
//
// Required env vars:
//   DATABASE_URL  — Neon Postgres connection string

import { Pool } from "pg";
import { upsertSourceMap } from "./lib/player-source-map";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("ERROR: DATABASE_URL environment variable is not set.");
  process.exit(1);
}

const MLB_API_BASE = "https://statsapi.mlb.com/api/v1";
const DELAY_MS = 300;

// All professional sport IDs (MLB + all MiLB levels)
const ALL_SPORT_IDS = [1, 11, 12, 13, 14, 15, 16];
// 1=MLB, 11=Triple-A, 12=Double-A, 13=High-A, 14=Single-A, 15=Rookie+, 16=Rookie

// Parse CLI args
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const seasonIdx = args.indexOf("--season");
const SEASON =
  seasonIdx !== -1
    ? args[seasonIdx + 1]
    : String(new Date().getFullYear());
const SEASON_PREV = String(Number(SEASON) - 1);

const pool = new Pool({ connectionString: DATABASE_URL });

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DbPlayerRow {
  playerid: string;
  firstname: string;
  lastname: string;
}

interface MlbPlayerEntry {
  id: number;
  firstName?: string;
  useName?: string;
  lastName?: string;
  fullName?: string;
}

// ---------------------------------------------------------------------------
// MLB API helpers
// ---------------------------------------------------------------------------

async function fetchPlayersForSport(
  sportId: number,
  season: string
): Promise<MlbPlayerEntry[]> {
  try {
    const url =
      `${MLB_API_BASE}/sports/${sportId}/players` +
      `?season=${season}` +
      `&fields=people,id,firstName,lastName,useName,fullName`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = (await res.json()) as { people?: MlbPlayerEntry[] };
    return data.people ?? [];
  } catch {
    return [];
  }
}

/** Fetch all active MLB players across all sport levels for a given season. */
async function fetchAllMlbPlayers(season: string): Promise<MlbPlayerEntry[]> {
  console.log(`  Fetching MLB players for season ${season}…`);
  const results = await Promise.all(
    ALL_SPORT_IDS.map((id) => fetchPlayersForSport(id, season))
  );
  const flat = results.flat();
  // Deduplicate by person ID
  const seen = new Set<number>();
  return flat.filter((p) => {
    if (seen.has(p.id)) return false;
    seen.add(p.id);
    return true;
  });
}

// ---------------------------------------------------------------------------
// DB helpers
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

// ---------------------------------------------------------------------------
// Name-matching helpers (identical logic to sync-mlb-full-org-rosters.ts)
// ---------------------------------------------------------------------------

function buildNameKey(first: string, last: string): string {
  return `${first.toLowerCase()} ${last.toLowerCase()}`.trim();
}

/** Index: "firstname lastname" (lowercase) → DbPlayerRow[] */
function buildNameIndex(players: DbPlayerRow[]): Map<string, DbPlayerRow[]> {
  const m = new Map<string, DbPlayerRow[]>();
  for (const p of players) {
    const key = buildNameKey(p.firstname, p.lastname);
    const bucket = m.get(key) ?? [];
    bucket.push(p);
    m.set(key, bucket);
  }
  return m;
}

/** Index: lastName (lowercase) → DbPlayerRow[] — for prefix fallback */
function buildLastNameIndex(
  players: DbPlayerRow[]
): Map<string, DbPlayerRow[]> {
  const m = new Map<string, DbPlayerRow[]>();
  for (const p of players) {
    const key = p.lastname.toLowerCase();
    const bucket = m.get(key) ?? [];
    bucket.push(p);
    m.set(key, bucket);
  }
  return m;
}

/**
 * Tier-C prefix fallback.
 * "Dominic".startsWith("Dom") → true  →  a candidate is returned only when
 * exactly one player with that last name has a matching prefix.
 */
function findPrefixMatch(
  apiFirst: string,
  apiUseName: string,
  apiLast: string,
  lastNameIndex: Map<string, DbPlayerRow[]>
): DbPlayerRow | null {
  const candidates = lastNameIndex.get(apiLast.toLowerCase()) ?? [];
  if (candidates.length === 0) return null;

  const apiFirstL = apiFirst.toLowerCase();
  const apiUseL = apiUseName.toLowerCase();

  const prefixMatches = candidates.filter((c) => {
    const dbFirst = c.firstname.toLowerCase();
    return (
      apiFirstL.startsWith(dbFirst) ||
      dbFirst.startsWith(apiFirstL) ||
      apiUseL.startsWith(dbFirst) ||
      dbFirst.startsWith(apiUseL)
    );
  });

  return prefixMatches.length === 1 ? prefixMatches[0] : null;
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log("=".repeat(60));
  console.log("YAT?STATS — MLB Player ID Bootstrap");
  console.log(
    dryRun
      ? "  MODE: DRY RUN (no DB writes)"
      : "  MODE: LIVE (writes to player_source_map)"
  );
  console.log(`  Primary season:  ${SEASON}`);
  console.log(`  Fallback season: ${SEASON_PREV}`);
  console.log("=".repeat(60));
  console.log("");

  // --- 1. Load our canonical players ---------------------------------------
  console.log("Step 1: Loading YAT?STATS players from DB…");
  const dbPlayers = await getAllDbPlayers();
  console.log(`  ✓ ${dbPlayers.length} players loaded`);
  const nameIndex = buildNameIndex(dbPlayers);
  const lastNameIndex = buildLastNameIndex(dbPlayers);
  console.log(`  ✓ Name indexes built (${nameIndex.size} unique name keys)`);
  console.log("");

  // --- 2. Load all MLB players (current season + prior season fallback) -----
  console.log("Step 2: Fetching MLB player roster from Stats API…");
  const currentSeasonPlayers = await fetchAllMlbPlayers(SEASON);
  console.log(`  ✓ ${currentSeasonPlayers.length} players found in ${SEASON}`);

  let allMlbPlayers = currentSeasonPlayers;
  if (currentSeasonPlayers.length < 1000) {
    // If current season is thin (early spring training), add prior season
    console.log(
      `  Current season has < 1,000 players — adding prior season fallback…`
    );
    const prevSeasonPlayers = await fetchAllMlbPlayers(SEASON_PREV);
    console.log(
      `  ✓ ${prevSeasonPlayers.length} players found in ${SEASON_PREV}`
    );
    // Merge, deduplicating by ID (current season takes precedence)
    const seen = new Set(currentSeasonPlayers.map((p) => p.id));
    const newFromPrev = prevSeasonPlayers.filter((p) => !seen.has(p.id));
    allMlbPlayers = [...currentSeasonPlayers, ...newFromPrev];
    console.log(
      `  ✓ Combined unique MLB players: ${allMlbPlayers.length}`
    );
  }
  console.log("");

  // --- 3. Check which players are already mapped ---------------------------
  console.log("Step 3: Checking existing mappings in player_source_map…");
  let alreadyMapped = 0;
  const unmappedDbPlayers: DbPlayerRow[] = [];

  for (const p of dbPlayers) {
    // Check by playerid (reverse lookup via a direct query)
    const { rows } = await pool.query<{ source_player_id: string }>(
      `SELECT source_player_id FROM player_source_map
       WHERE playerid::text = $1 AND source = 'mlb_api'
       LIMIT 1`,
      [p.playerid]
    );
    if (rows.length > 0) {
      alreadyMapped++;
    } else {
      unmappedDbPlayers.push(p);
    }
  }

  console.log(`  ✓ Already mapped: ${alreadyMapped} players`);
  console.log(`  ✓ Need mapping:   ${unmappedDbPlayers.length} players`);
  console.log("");

  if (unmappedDbPlayers.length === 0) {
    console.log("✓ All players already have MLB IDs stored. Nothing to do.");
    await pool.end();
    return;
  }

  // --- 4. Match unmapped players --------------------------------------------
  console.log(
    `Step 4: Matching ${unmappedDbPlayers.length} unmapped players against MLB player list…`
  );
  console.log("");

  // Build reverse index: our DB players keyed by name
  // (already built above as nameIndex + lastNameIndex)

  let newlyMatched = 0;
  let matchedViaUseName = 0;
  let matchedViaFirstName = 0;
  let matchedViaPrefix = 0;
  let ambiguous = 0;
  let unmatched = 0;
  const unmatchedList: string[] = [];

  // Build a quick lookup: dbPlayerid → true, for the unmapped subset
  const unmappedIds = new Set(unmappedDbPlayers.map((p) => p.playerid));

  for (const mlbPlayer of allMlbPlayers) {
    const useNameKey = buildNameKey(
      mlbPlayer.useName ?? "",
      mlbPlayer.lastName ?? ""
    );
    const firstNameKey = buildNameKey(
      mlbPlayer.firstName ?? "",
      mlbPlayer.lastName ?? ""
    );

    // Tier A: useName exact
    let matches = mlbPlayer.useName
      ? (nameIndex.get(useNameKey) ?? []).filter((p) =>
          unmappedIds.has(p.playerid)
        )
      : [];
    let tier = "useName";

    // Tier B: firstName exact
    if (matches.length === 0) {
      matches = (nameIndex.get(firstNameKey) ?? []).filter((p) =>
        unmappedIds.has(p.playerid)
      );
      tier = "firstName";
    }

    // Tier C: prefix fallback
    if (matches.length === 0) {
      const pfx = findPrefixMatch(
        mlbPlayer.firstName ?? "",
        mlbPlayer.useName ?? "",
        mlbPlayer.lastName ?? "",
        lastNameIndex
      );
      if (pfx && unmappedIds.has(pfx.playerid)) {
        matches = [pfx];
        tier = "prefix";
      }
    }

    if (matches.length === 0) continue; // MLB player not in our DB — that's fine
    if (matches.length > 1) {
      ambiguous++;
      // Log ambiguous but continue (both candidates stay unmapped)
      const names = matches
        .map((m) => `${m.firstname} ${m.lastname} (${m.playerid})`)
        .join(", ");
      console.log(
        `  AMBIGUOUS [tier=${tier}]: ${mlbPlayer.fullName}` +
          ` (mlbId=${mlbPlayer.id}) — candidates: ${names}`
      );
      continue;
    }

    // Exactly one unambiguous match
    const dbPlayer = matches[0];
    const displayMlb = mlbPlayer.fullName ?? `${mlbPlayer.firstName} ${mlbPlayer.lastName}`;

    if (tier === "useName") matchedViaUseName++;
    else if (tier === "firstName") matchedViaFirstName++;
    else matchedViaPrefix++;
    newlyMatched++;

    // Remove from unmapped set so we don't double-match
    unmappedIds.delete(dbPlayer.playerid);

    if (!dryRun) {
      await upsertSourceMap(
        pool,
        dbPlayer.playerid,
        "mlb_api",
        String(mlbPlayer.id),
        displayMlb
      );
      console.log(
        `  ✓ [${tier}] ${dbPlayer.firstname} ${dbPlayer.lastname} (playerid=${dbPlayer.playerid}) → mlbId=${mlbPlayer.id} "${displayMlb}"`
      );
    } else {
      console.log(
        `  [DRY RUN][${tier}] ${dbPlayer.firstname} ${dbPlayer.lastname} (playerid=${dbPlayer.playerid}) → mlbId=${mlbPlayer.id} "${displayMlb}"`
      );
    }

    await delay(DELAY_MS);
  }

  // Any still in unmappedIds after iterating all MLB players = truly unmatched
  unmatched = unmappedIds.size;
  for (const pid of unmappedIds) {
    const p = unmappedDbPlayers.find((x) => x.playerid === pid)!;
    unmatchedList.push(
      `  playerid=${p.playerid}  name="${p.firstname} ${p.lastname}"`
    );
  }

  // --- 5. Summary -----------------------------------------------------------
  console.log("");
  console.log("=".repeat(60));
  console.log("Bootstrap Summary");
  console.log("=".repeat(60));
  console.log(`Total YAT?STATS players:         ${dbPlayers.length}`);
  console.log(`Already had MLB ID:              ${alreadyMapped}`);
  console.log(`Newly matched:                   ${newlyMatched}${dryRun ? " (dry run — not saved)" : ""}`);
  console.log(`  └─ via useName exact:          ${matchedViaUseName}`);
  console.log(`  └─ via firstName exact:        ${matchedViaFirstName}`);
  console.log(`  └─ via prefix fallback:        ${matchedViaPrefix}`);
  console.log(`Ambiguous (skipped):             ${ambiguous}`);
  console.log(`Unmatched (need manual review):  ${unmatched}`);
  console.log("");

  if (unmatchedList.length > 0) {
    console.log("─".repeat(60));
    console.log(
      "UNMATCHED PLAYERS — these players need manual MLB ID entry:"
    );
    console.log(
      "  (Run: UPDATE player_source_map SET ... WHERE playerid=...)"
    );
    console.log("─".repeat(60));
    for (const line of unmatchedList) {
      console.log(line);
    }
    console.log("");
    console.log(
      "  Tip: Find the MLB ID at mlb.com/player/<name>-<id>"
    );
    console.log(
      "  Then insert with:"
    );
    console.log(
      "  INSERT INTO player_source_map (playerid, source, source_player_id, source_player_name, updated_at)"
    );
    console.log(
      "  VALUES ('<playerid>', 'mlb_api', '<mlbPersonId>', '<Full Name>', NOW())"
    );
    console.log(
      "  ON CONFLICT (source, source_player_id) DO UPDATE SET playerid=EXCLUDED.playerid, updated_at=NOW();"
    );
  }

  if (!dryRun && newlyMatched > 0) {
    console.log("");
    console.log(
      `✓ ${newlyMatched} new MLB ID mappings written to player_source_map.`
    );
    console.log(
      "  Next step: run 'npm run sync:rosters' to update current teams using these IDs."
    );
  }

  await pool.end();
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
