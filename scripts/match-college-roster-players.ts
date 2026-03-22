#!/usr/bin/env ts-node
// scripts/match-college-roster-players.ts
//
// Strict first-pass matcher from college_roster_players_raw into
// matched_playerid/matched_hsid/match_status fields.
//
// IMPORTANT: this pass is intentionally conservative and is NOT the final
// truth resolver. Ambiguous/non-exact candidates must remain unmatched and
// be resolved by downstream review workflows before any image promotion.

import { Pool } from "pg";

type RawRosterRow = {
  roster_player_key: string;
  player_name: string | null;
  first_name: string | null;
  last_name: string | null;
  bats: string | null;
  throws: string | null;
  matched_playerid: string | null;
  match_status: string | null;
};

type CandidateRow = {
  playerid: string;
  hsid: string | null;
  firstname: string | null;
  lastname: string | null;
  bats: string | null;
  throws: string | null;
};

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("DATABASE_URL is required");

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const limitIdx = args.indexOf("--limit");
const limit = limitIdx >= 0 ? Number(args[limitIdx + 1]) : null;
const teamIdIdx = args.indexOf("--teamid");
const onlyTeamId = teamIdIdx >= 0 ? args[teamIdIdx + 1] : null;

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

function clean(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length ? normalized : null;
}

function normalizeName(name: string | null): string | null {
  if (!name) return null;
  return name
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeHandedness(value: string | null): string | null {
  const normalized = normalizeName(value);
  if (!normalized) return null;
  if (["r", "rh", "right"].includes(normalized)) return "R";
  if (["l", "lh", "left"].includes(normalized)) return "L";
  if (["s", "switch"].includes(normalized)) return "S";
  return null;
}

function isCompatibleHandedness(rawValue: string | null, dbValue: string | null): boolean {
  const a = normalizeHandedness(rawValue);
  const b = normalizeHandedness(dbValue);
  if (!a || !b) return true;
  return a === b;
}

async function findConservativeMatch(row: RawRosterRow): Promise<CandidateRow | null> {
  const first = normalizeName(clean(row.first_name));
  const last = normalizeName(clean(row.last_name));

  if (!first || !last) return null;

  const { rows } = await pool.query<CandidateRow>(
    `
      SELECT
        p.playerid::text AS playerid,
        ph.hsid::text AS hsid,
        p.firstname,
        p.lastname,
        p.bats,
        p.throws
      FROM tbc_players_raw p
      LEFT JOIN player_hsids ph ON ph.playerid::text = p.playerid::text
      WHERE lower(regexp_replace(coalesce(p.firstname, ''), '[^a-zA-Z0-9 ]', '', 'g')) = $1
        AND lower(regexp_replace(coalesce(p.lastname, ''),  '[^a-zA-Z0-9 ]', '', 'g')) = $2
    `,
    [first, last]
  );

  if (rows.length !== 1) return null;

  const only = rows[0];
  if (!isCompatibleHandedness(row.bats, only.bats)) return null;
  if (!isCompatibleHandedness(row.throws, only.throws)) return null;

  return only;
}

async function main() {
  console.log("=== Conservative college roster matching ===");
  console.log(`Mode: ${dryRun ? "DRY RUN" : "LIVE"}`);

  const limitClause = limit && Number.isFinite(limit) ? `LIMIT ${Math.max(limit, 1)}` : "";

  const params: string[] = [];
  const where = ["coalesce(match_status, '') NOT IN ('MATCHED_LOCKED', 'MATCHED')"];

  if (onlyTeamId) {
    params.push(onlyTeamId);
    where.push(`teamid = $${params.length}`);
  }

  const { rows } = await pool.query<RawRosterRow>(
    `
      SELECT
        roster_player_key,
        player_name,
        first_name,
        last_name,
        bats,
        throws,
        matched_playerid,
        match_status
      FROM college_roster_players_raw
      WHERE ${where.join(" AND ")}
      ORDER BY updated_at DESC NULLS LAST, roster_player_key
      ${limitClause}
    `,
    params
  );

  let matched = 0;
  let review = 0;

  for (const row of rows) {
    const match = await findConservativeMatch(row);

    const next = match
      ? {
          matched_playerid: match.playerid,
          matched_hsid: match.hsid,
          match_status: "MATCHED",
        }
      : {
          matched_playerid: null,
          matched_hsid: null,
          match_status: "UNMATCHED",
        };

    if (!dryRun) {
      await pool.query(
        `
          UPDATE college_roster_players_raw
          SET
            matched_playerid = $2,
            matched_hsid = $3,
            match_status = $4,
            updated_at = now()
          WHERE roster_player_key = $1
        `,
        [
          row.roster_player_key,
          next.matched_playerid,
          next.matched_hsid,
          next.match_status,
        ]
      );
    }

    if (match) matched += 1;
    else review += 1;
  }

  console.log(`Rows evaluated: ${rows.length}`);
  console.log(`MATCHED: ${matched}`);
  console.log(`UNMATCHED: ${review}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
