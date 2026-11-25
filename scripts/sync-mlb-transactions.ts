#!/usr/bin/env ts-node
// scripts/sync-mlb-transactions.ts
// YAT?STATS — MLB Transactions Ingest Pipeline
//
// Pulls transaction records from the MLB Stats API for a given date range,
// matches each player by name to `tbc_players_raw`, and inserts into the
// `player_transactions` table. Inserts are idempotent via a deduplication
// index that distinguishes MLB event/person IDs even when date/type/team coincide.
// Every verified received transaction is immediately published as its shared
// news card after persistence. No email, webhook, or roster mutation runs here.
//
// Usage:
//   npx ts-node scripts/sync-mlb-transactions.ts                             # last 30 days
//   npx ts-node scripts/sync-mlb-transactions.ts --start 2025-01-01 --end 2025-03-10
//   npx ts-node scripts/sync-mlb-transactions.ts --dry-run                   # preview, no writes
//
// Required env vars:
//   DATABASE_URL  — Neon Postgres connection string

import { Pool } from "pg";
import {
  resolvePlayerFromSourceMap,
  upsertSourceMap,
} from "./lib/player-source-map";
import { identityVerdict, type IdentityVerdict } from "./lib/player-identity";
import { receiveMlbTransaction, mlbTransactionFetchKey } from "./lib/transaction-news-receipt";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("ERROR: DATABASE_URL environment variable is not set.");
  process.exit(1);
}

const MLB_API_BASE = "https://statsapi.mlb.com/api/v1";

// Parse CLI args
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const startIdx = args.indexOf("--start");
const endIdx = args.indexOf("--end");
if (startIdx !== -1 && !args[startIdx + 1]) {
  console.error("ERROR: --start requires a date value (e.g. --start 2025-01-01).");
  process.exit(1);
}
if (endIdx !== -1 && !args[endIdx + 1]) {
  console.error("ERROR: --end requires a date value (e.g. --end 2025-03-10).");
  process.exit(1);
}

function isoDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

const defaultEnd = new Date();
const defaultStart = new Date(defaultEnd.getTime() - 30 * 24 * 60 * 60 * 1000);
const START_DATE = startIdx !== -1 ? args[startIdx + 1] : isoDate(defaultStart);
const END_DATE = endIdx !== -1 ? args[endIdx + 1] : isoDate(defaultEnd);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface MlbPerson {
  id: number;
  fullName: string;
  firstName?: string;
  lastName?: string;
}

interface MlbTeamRef {
  id?: number;
  name?: string;
}

interface MlbTransaction {
  id?: number;
  person?: MlbPerson;
  typeDesc?: string;
  typeCode?: string;
  fromTeam?: MlbTeamRef;
  toTeam?: MlbTeamRef;
  date?: string;
  effectiveDate?: string;
  description?: string;
}

interface MlbTransactionsResponse {
  transactions?: MlbTransaction[];
}

interface DbPlayerRow {
  playerid: string;
  firstname: string;
  lastname: string;
  borndate: string | null;
  place: string | null;
}

// ---------------------------------------------------------------------------
// Database pool
// ---------------------------------------------------------------------------
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// ---------------------------------------------------------------------------
// Ensure idempotency index
// ---------------------------------------------------------------------------

/**
 * effective_date's real column type varies by deployment — this live
 * database has it as `timestamp with time zone`, but the original
 * migration comment describes it as `date`, and a differently-seeded
 * database could genuinely have either. Converting between `date` and
 * `timestamptz` is timezone-dependent in *either* direction (both the
 * date->timestamptz and timestamptz->date casts are STABLE, not
 * IMMUTABLE), so there is no single literal type that works for both —
 * hardcoding one just breaks the other case the same way the original
 * bug did. Detect the column's actual type at runtime and match it,
 * instead of assuming.
 */
async function getEffectiveDateCastType(): Promise<"date" | "timestamptz"> {
  const { rows } = await pool.query<{ data_type: string }>(
    `SELECT data_type
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'player_transactions'
       AND column_name = 'effective_date'`
  );
  return rows[0]?.data_type === "date" ? "date" : "timestamptz";
}

/**
 * Distinct MLB events for one player may share date, type and destination.
 * Extend the old key with source event/person IDs, preserving existing rows,
 * article UUIDs, and the old uniqueness rule for legacy events without IDs.
 * Install the replacement before retiring the old index, atomically.
 */
async function ensureDedupeIndex(): Promise<void> {
  const castType = await getEffectiveDateCastType();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('yatstats:mlb-transaction-dedupe-v2'))");
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_player_transactions_dedup_v2
      ON public.player_transactions (
        playerid,
        COALESCE(effective_date, '1900-01-01'::${castType}),
        COALESCE(transaction_type, ''),
        COALESCE(to_team_name, ''),
        COALESCE(CASE WHEN source = 'mlb_api' THEN payload->>'id' END, ''),
        COALESCE(CASE WHEN source = 'mlb_api' AND payload->>'id' IS NOT NULL
                      THEN payload#>>'{person,id}' END, '')
      )
    `);
    const { rows } = await client.query<{ valid: boolean }>(`
      SELECT indisvalid AND indisunique AS valid FROM pg_index
      WHERE indexrelid = to_regclass('public.idx_player_transactions_dedup_v2')
    `);
    if (!rows[0]?.valid) throw new Error("Replacement transaction dedupe index is not valid");
    const { rows: legacy } = await client.query<{ exists: boolean }>(
      "SELECT to_regclass('public.idx_player_transactions_dedup') IS NOT NULL AS exists"
    );
    if (legacy[0]?.exists) {
      // Only the superseded index is removed; no transaction rows are changed.
      await client.query("DROP INDEX public.idx_player_transactions_dedup");
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// MLB Stats API helpers
// ---------------------------------------------------------------------------

// Every level, not just the majors — mirrors ALL_SPORT_IDS in
// scripts/sync-mlb-full-org-rosters.ts. A release/option/assignment
// actioned by an affiliate club (e.g. "Iowa Cubs released SS Scott
// Kingery") is filed under that affiliate's own sportId in MLB's API,
// not sportId=1 (MLB). Querying sportId=1 alone silently misses every
// transaction that happens at the minor-league level — confirmed via a
// live backfill run that fetched 1,746 sportId=1 transactions for
// 2026-07-01..2026-07-25 containing zero mention of Kingery's actual
// 2026-07-19 release.
const ALL_SPORT_IDS = ["1", "11", "12", "13", "14", "15", "16"];
const DELAY_MS = 250;

const delay = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

// Throws on failure — the caller decides how to handle a failed level.
// Swallowing this here (returning []) would make a real API outage for
// one level indistinguishable from that level legitimately having zero
// transactions that day, which is exactly the "silent partial success"
// failure mode this whole pipeline exists to eliminate.
async function fetchTransactionsForSport(
  sportId: string,
  start: string,
  end: string
): Promise<MlbTransaction[]> {
  const url = `${MLB_API_BASE}/transactions?sportId=${sportId}&startDate=${start}&endDate=${end}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  const data = (await res.json()) as MlbTransactionsResponse;
  return data.transactions ?? [];
}

interface FetchTransactionsResult {
  transactions: MlbTransaction[];
  failedSportIds: string[];
}

/**
 * Fetches transactions across every level (MLB through Rookie ball), not
 * just sportId=1. Some transactions are reported under more than one
 * sport context, so results are deduped by event ID AND MLB person ID.
 * A multi-player trade can legitimately share one MLB transaction ID.
 *
 * A failure on one sport ID does not abort the others — we still want
 * whatever data we can get — but every failure is tracked and returned
 * to the caller so an incomplete sync can never be reported as a full
 * success (see main()).
 */
async function fetchTransactions(
  start: string,
  end: string
): Promise<FetchTransactionsResult> {
  const byId = new Map<string, MlbTransaction>();
  let noIdSequence = 0;
  const failedSportIds: string[] = [];

  for (const sportId of ALL_SPORT_IDS) {
    try {
      const batch = await fetchTransactionsForSport(sportId, start, end);
      for (const txn of batch) {
        // Shared event IDs across different players are not duplicates.
        // No-ID events are left to the legacy database dedupe rule.
        byId.set(mlbTransactionFetchKey(txn, () => ++noIdSequence), txn);
      }
    } catch (err) {
      console.error(`fetchTransactionsForSport(${sportId}) failed:`, err);
      failedSportIds.push(sportId);
    }
    await delay(DELAY_MS);
  }

  return { transactions: Array.from(byId.values()), failedSportIds };
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
      TRIM(lastname)                  AS lastname,
      borndate::text                  AS borndate,
      TRIM(place)                     AS place
    FROM tbc_players_raw
    WHERE TRIM(firstname) != '' AND TRIM(lastname) != ''
  `);
  return rows;
}

/**
 * Build a Map of "firstname lastname" (lowercased) → DbPlayerRow[].
 * Allows O(1) lookups with ambiguity detection.
 */
function buildNameIndex(players: DbPlayerRow[]): Map<string, DbPlayerRow[]> {
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
 * Derive a lowercase "firstname lastname" lookup key from an MlbPerson.
 * Prefers explicit firstName/lastName fields; falls back to parsing fullName.
 */
function resolveNameKey(person: MlbPerson): string {
  if (person.firstName && person.lastName) {
    return `${person.firstName.toLowerCase()} ${person.lastName.toLowerCase()}`;
  }
  // Fallback: split fullName on whitespace
  const parts = (person.fullName ?? "").trim().split(/\s+/);
  if (parts.length >= 2) {
    return parts.join(" ").toLowerCase();
  }
  return (person.fullName ?? "").toLowerCase();
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
  return upsertSourceMap(
    pool,
    playerid,
    "mlb_api",
    String(mlbPersonId),
    fullName,
    null,
    null,
    "name_and_identity",
    0.95,
    true,
    "Transactions sync: name and birthdate/birth city match"
  );
}

// Transaction payloads carry only id + name, so the birthdate/birth city
// needed for the identity check comes from /people (cached per run).
const mlbPersonCache = new Map<number, { birthDate?: string; birthCity?: string } | null>();

async function fetchMlbPersonIdentity(
  personId: number
): Promise<{ birthDate?: string; birthCity?: string } | null> {
  if (mlbPersonCache.has(personId)) return mlbPersonCache.get(personId) ?? null;
  let identity: { birthDate?: string; birthCity?: string } | null = null;
  try {
    const res = await fetch(`${MLB_API_BASE}/people/${personId}`);
    if (res.ok) {
      const data = (await res.json()) as { people?: { birthDate?: string; birthCity?: string }[] };
      const person = data.people?.[0];
      if (person) identity = { birthDate: person.birthDate, birthCity: person.birthCity };
    }
  } catch (err) {
    console.error(`  fetchMlbPersonIdentity(${personId}) failed:`, err);
  }
  mlbPersonCache.set(personId, identity);
  return identity;
}

// ---------------------------------------------------------------------------
// Main pipeline
// ---------------------------------------------------------------------------
async function main() {
  console.log("=== YAT?STATS MLB Transactions Sync ===");
  console.log(`Date range: ${START_DATE} → ${END_DATE}`);
  console.log(`Mode:       ${dryRun ? "DRY RUN" : "LIVE"}`);
  console.log("");

  // 1. Ensure idempotency index exists
  if (!dryRun) {
    await ensureDedupeIndex();
    console.log("✓ Dedupe index ready");
  }

  // 2. Fetch transactions from MLB API
  const { transactions, failedSportIds } = await fetchTransactions(
    START_DATE,
    END_DATE
  );
  console.log(`✓ Fetched ${transactions.length} transactions`);

  if (failedSportIds.length > 0) {
    // Process whatever we did get — partial data is still useful — but
    // this run must not be allowed to read as a clean, complete sync.
    console.error(
      `WARNING: failed to fetch sport ID(s) [${failedSportIds.join(", ")}]. ` +
        `This sync is INCOMPLETE for this run — some transactions may be missing.`
    );
  }

  if (transactions.length === 0) {
    console.log("No transactions to process.");
    if (failedSportIds.length > 0) {
      process.exitCode = 1;
    }
    return;
  }

  // 3. Load all DB players for name matching
  const dbPlayers = await getAllDbPlayers();
  console.log(`✓ Loaded ${dbPlayers.length} players from DB`);
  const nameIndex = buildNameIndex(dbPlayers);
  console.log(`✓ Name index built (${nameIndex.size} unique name keys)`);
  console.log("");

  let totalInserted = 0;
  let totalDuplicates = 0;
  let totalSkipped = 0;
  let totalUnmatched = 0;
  let totalInsertFailures = 0;
  let totalNewsCreated = 0;
  let totalNewsHeld = 0;
  let totalNewsFailures = 0;
  const unmatchedLog: string[] = [];

  async function recordReceivedTransaction(
    playerId: string,
    transaction: MlbTransaction,
    registerIdentity?: () => Promise<void>,
  ): Promise<void> {
    try {
      const receipt = await receiveMlbTransaction(
        (statement, params = []) => pool.query(statement, params),
        playerId, transaction, registerIdentity,
      );
      if (receipt.inserted) totalInserted++;
      else totalDuplicates++;
      totalNewsCreated += receipt.newsCreated;
      if (receipt.newsHeld) totalNewsHeld++;
      if (receipt.publicationError) {
        totalNewsFailures++;
        console.error(`  News publication failed for transaction ${receipt.transactionId ?? transaction.id}: ${receipt.publicationError}`);
      }
    } catch (error) {
      totalInsertFailures++;
      console.error(`  Transaction persistence failed for MLB event ${transaction.id}:`, error);
    }
  }

  // 4. Process each transaction
  for (const txn of transactions) {
    // Skip transactions with no player reference
    if (!txn.person) {
      totalSkipped++;
      continue;
    }

    // ── 1. Try stable source-map lookup (mlb_api person.id → playerid) ──
    let resolvedId: string | null = null;
    if (!dryRun) {
      resolvedId = await resolveFromSourceMap(txn.person.id);
    }

    if (resolvedId) {
      // Fast path: deterministic mapping already exists
      if (dryRun) {
        console.log(
          `  [DRY RUN] Would insert (source-map): ${txn.person.fullName} | ${txn.typeDesc ?? txn.typeCode} | ${txn.effectiveDate ?? txn.date ?? "?"} | ${txn.fromTeam?.name ?? "—"} → ${txn.toTeam?.name ?? "—"}`
        );
        totalInserted++;
      } else {
        await recordReceivedTransaction(resolvedId, txn);
      }
      continue;
    }

    // ── 2. Fallback: conservative exact-name matching ──
    const nameKey = resolveNameKey(txn.person);
    if (!nameKey) {
      totalSkipped++;
      continue;
    }

    const matches = nameIndex.get(nameKey) ?? [];
    if (matches.length === 0) {
      totalUnmatched++;
      unmatchedLog.push(
        `  UNMATCHED: ${txn.person.fullName} (mlbId=${txn.person.id}, type=${txn.typeDesc ?? txn.typeCode ?? "unknown"}, date=${txn.effectiveDate ?? txn.date ?? "?"})`
      );
      continue;
    }

    if (matches.length > 1) {
      // Ambiguous: do not guess — log and skip to avoid wrong mapping
      console.log(
        `  AMBIGUOUS (${matches.length} matches): ${txn.person.fullName} (mlbId=${txn.person.id}) — skipping to avoid incorrect mapping`
      );
      totalUnmatched++;
      unmatchedLog.push(
        `  AMBIGUOUS: ${txn.person.fullName} (mlbId=${txn.person.id}, ${matches.length} name matches, type=${txn.typeDesc ?? txn.typeCode ?? "unknown"})`
      );
      continue;
    }

    // Exactly one name match - still not proof it's the same person
    // (common names collide), so the birthdate / birth city must agree.
    const dbPlayer = matches[0];
    const mlbIdentity = await fetchMlbPersonIdentity(txn.person.id);
    const verdict: IdentityVerdict = mlbIdentity
      ? identityVerdict(dbPlayer, mlbIdentity)
      : "unverified";
    if (verdict !== "confirmed") {
      totalUnmatched++;
      unmatchedLog.push(
        `  IDENTITY ${verdict.toUpperCase()}: ${txn.person.fullName} (mlbId=${txn.person.id}) vs playerid ${dbPlayer.playerid} - same name, not linked`
      );
      continue;
    }

    if (dryRun) {
      console.log(
        `  [DRY RUN] Would insert (name-match): ${txn.person.fullName} | ${txn.typeDesc ?? txn.typeCode} | ${txn.effectiveDate ?? txn.date ?? "?"} | ${txn.fromTeam?.name ?? "—"} → ${txn.toTeam?.name ?? "—"}`
      );
      totalInserted++;
      continue;
    }

    // Registration happens after the transaction commits but before its
    // news card verifies the canonical identity. Retries repair a previously
    // failed registration/publication instead of silently skipping it.
    await recordReceivedTransaction(dbPlayer.playerid, txn, () =>
      saveSourceMap(dbPlayer.playerid, txn.person!.id, txn.person!.fullName));
  }

  // 5. Summary
  console.log("=== Sync Complete ===");
  console.log(`Transactions fetched: ${transactions.length}`);
  console.log(`New rows inserted:    ${totalInserted}`);
  console.log(`Duplicates skipped:   ${totalDuplicates}`);
  console.log(`No-person skipped:    ${totalSkipped}`);
  console.log(`Unmatched players:    ${totalUnmatched}`);
  console.log(`Transaction failures: ${totalInsertFailures}`);
  console.log(`News cards published: ${totalNewsCreated}`);
  console.log(`News awaiting identity/school: ${totalNewsHeld}`);
  console.log(`News publication failures: ${totalNewsFailures}`);

  if (unmatchedLog.length > 0) {
    console.log(
      "\n--- Unmatched Players (not found in tbc_players_raw by name) ---"
    );
    for (const line of unmatchedLog) {
      console.log(line);
    }
  }

  if (failedSportIds.length > 0 || totalInsertFailures > 0 || totalNewsFailures > 0) {
    // Everything that succeeded was still processed and written above —
    // but a run that silently dropped one or more sport levels must exit
    // non-zero so GitHub Actions shows it as failed, not green.
    console.error(
      `\nExiting non-zero: sport fetch failures [${failedSportIds.join(", ")}], ` +
      `${totalInsertFailures} transaction persistence failure(s), ${totalNewsFailures} news publication failure(s).`
    );
    process.exitCode = 1;
  }
}

main()
  .catch((err) => {
    console.error("FATAL:", err);
    process.exit(1);
  })
  .finally(() => pool.end());
