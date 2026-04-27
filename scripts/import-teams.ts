#!/usr/bin/env ts-node
// scripts/import-teams.ts
// Bulk-load team names from a CSV file into the `teams` table.
//
// Usage:
//   npx ts-node scripts/import-teams.ts <path-to-csv>
//
// CSV format:
//   teamid,team_name
//   LAD,Los Angeles Dodgers
//   NYY,New York Yankees
//   ...
//
// The script upserts rows so it is safe to re-run.
// Canonical schema uses `teamid`, not `team_id`.

import fs from "fs";
import path from "path";
import { Pool } from "pg";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("ERROR: DATABASE_URL environment variable is not set.");
  process.exit(1);
}

const csvPath = process.argv[2];
if (!csvPath) {
  console.error("Usage: npx ts-node scripts/import-teams.ts <path-to-csv>");
  process.exit(1);
}

const resolvedPath = path.resolve(csvPath);
if (!fs.existsSync(resolvedPath)) {
  console.error(`ERROR: File not found: ${resolvedPath}`);
  process.exit(1);
}

function parseCSV(raw: string): Array<{ teamid: string; team_name: string }> {
  const lines = raw
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    throw new Error("CSV must have a header row and at least one data row.");
  }

  const header = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/^\"|\"$/g, ""));
  const teamidIdx = header.findIndex((h) => h === "teamid");
  const teamNameIdx = header.findIndex((h) => h === "team_name" || h === "teamname" || h === "name");

  if (teamidIdx === -1) throw new Error("CSV header must include a `teamid` column.");
  if (teamNameIdx === -1) throw new Error("CSV header must include a `team_name` or `name` column.");

  const rows: Array<{ teamid: string; team_name: string }> = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].match(/(\".*?\"|[^,]+)(?=,|$)/g) || [];
    const teamid = (cols[teamidIdx] || "").replace(/^\"|\"$/g, "").trim();
    const team_name = (cols[teamNameIdx] || "").replace(/^\"|\"$/g, "").trim();
    if (teamid && team_name) {
      rows.push({ teamid, team_name });
    }
  }
  return rows;
}

async function main() {
  const raw = fs.readFileSync(resolvedPath, "utf-8");
  const rows = parseCSV(raw);
  console.log(`Parsed ${rows.length} team rows from ${resolvedPath}`);

  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS teams (
        teamid TEXT PRIMARY KEY,
        team_name TEXT NOT NULL
      )
    `);

    let inserted = 0;
    const BATCH = 100;
    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH);
      const values = batch
        .map((_, j) => `($${j * 2 + 1}, $${j * 2 + 2})`)
        .join(", ");
      const params = batch.flatMap((r) => [r.teamid, r.team_name]);
      await pool.query(
        `INSERT INTO teams (teamid, team_name)
         VALUES ${values}
         ON CONFLICT (teamid) DO UPDATE SET team_name = EXCLUDED.team_name`,
        params
      );
      inserted += batch.length;
      process.stdout.write(`\rUpserted ${inserted}/${rows.length}...`);
    }
    console.log(`\nDone — ${inserted} team names loaded.`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
