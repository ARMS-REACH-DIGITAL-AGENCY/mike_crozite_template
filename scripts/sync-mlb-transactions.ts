#!/usr/bin/env ts-node
// scripts/sync-mlb-transactions.ts
// YAT?STATS — MLB Transactions Ingest Pipeline
//
// Pulls transaction records from the MLB Stats API for a given date range,
// matches each player by name to `tbc_players_raw`, and inserts into the
// `player_transactions` table. Inserts are idempotent via a deduplication
// index on (playerid, effective_date, transaction_type, to_team_name).
//
// Usage:
//   npx ts-node scripts/sync-mlb-transactions.ts                             # last 30 days
//   npx ts-node scripts/sync-mlb-transactions.ts --start 2025-01-01 --end 2025-03-10
//   npx ts-node scripts/sync-mlb-transactions.ts --dry-run                   # preview, no writes
//
// Required env vars:
//   DATABASE_URL  — Neon Postgres connection string

import { Pool } from "pg";

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
 * Creates a unique index on player_transactions so that ON CONFLICT DO NOTHING
 * silently skips duplicate rows across re-runs.
 *
 * COALESCE handles NULL values for optional fields so that two rows with the
 * same logical identity (but NULL values) still conflict correctly.
 */
async function ensureDedupeIndex(): Promise<void> {
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_player_transactions_dedup
    ON player_transactions (
      playerid,
      COALESCE(effective_date, '1900-01-01'::date),
      COALESCE(transaction_type, ''),
      COALESCE(to_team_name, '')
    )
  `);
}

// ---------------------------------------------------------------------------
// MLB Stats API helpers
// ---------------------------------------------------------------------------
async function fetchTransactions(
  start: string,
  end: string
): Promise<MlbTransaction[]> {
  const url = `${MLB_API_BASE}/transactions?sportId=1&startDate=${start}&endDate=${end}`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const data = (await res.json()) as MlbTransactionsResponse;
    return data.transactions ?? [];
  } catch (err) {
    console.error("fetchTransactions error:", err);
    return [];
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

/** Insert one transaction row. Returns true if a new row was inserted. */
async function insertTransaction(
  playerid: string,
  txn: MlbTransaction
): Promise<boolean> {
  try {
    const result = await pool.query(
      `INSERT INTO player_transactions
         (playerid, transaction_type, from_team_name, to_team_name,
          effective_date, source, payload)
       VALUES ($1, $2, $3, $4, $5, 'mlb_api', $6)
       ON CONFLICT DO NOTHING`,
      [
        playerid,
        txn.typeDesc ?? txn.typeCode ?? null,
        txn.fromTeam?.name ?? null,
        txn.toTeam?.name ?? null,
        txn.effectiveDate ?? txn.date ?? null,
        JSON.stringify(txn),
      ]
    );
    return (result.rowCount ?? 0) > 0;
  } catch (err) {
    console.error(`  DB insert error for txn id=${txn.id}:`, err);
    return false;
  }
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
  const transactions = await fetchTransactions(START_DATE, END_DATE);
  console.log(`✓ Fetched ${transactions.length} transactions`);

  if (transactions.length === 0) {
    console.log("No transactions to process.");
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
  const unmatchedLog: string[] = [];

  // 4. Process each transaction
  for (const txn of transactions) {
    // Skip transactions with no player reference
    if (!txn.person) {
      totalSkipped++;
      continue;
    }

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
      console.log(
        `  AMBIGUOUS (${matches.length} matches): ${txn.person.fullName} — using first match (playerid=${matches[0].playerid})`
      );
    }

    const dbPlayer = matches[0];

    if (dryRun) {
      console.log(
        `  [DRY RUN] Would insert: ${txn.person.fullName} | ${txn.typeDesc ?? txn.typeCode} | ${txn.effectiveDate ?? txn.date ?? "?"} | ${txn.fromTeam?.name ?? "—"} → ${txn.toTeam?.name ?? "—"}`
      );
      totalInserted++;
      continue;
    }

    const inserted = await insertTransaction(dbPlayer.playerid, txn);
    if (inserted) {
      totalInserted++;
    } else {
      totalDuplicates++; // ON CONFLICT DO NOTHING suppressed the row
    }
  }

  // 5. Summary
  console.log("=== Sync Complete ===");
  console.log(`Transactions fetched: ${transactions.length}`);
  console.log(`New rows inserted:    ${totalInserted}`);
  console.log(`Duplicates skipped:   ${totalDuplicates}`);
  console.log(`No-person skipped:    ${totalSkipped}`);
  console.log(`Unmatched players:    ${totalUnmatched}`);

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
