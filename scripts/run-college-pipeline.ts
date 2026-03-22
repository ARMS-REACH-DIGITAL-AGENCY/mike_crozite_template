#!/usr/bin/env ts-node
// scripts/run-college-pipeline.ts
// Orchestrates discovery -> roster ingest -> conservative match for college teams.

import { spawn } from "child_process";
import { Pool } from "pg";

type TeamRow = {
  teamid: string;
  team: string;
};

type TeamSummary = {
  teamid: string;
  team: string;
  rosterRowsParsed: number;
  rowsInserted: number;
  rowsUpdated: number;
  matchedCount: number;
  unmatchedCount: number;
  headshotUrlCount: number;
  errorsWarnings: string[];
};

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("DATABASE_URL is required");

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const discover = args.includes("--discover");
const teamIdIdx = args.indexOf("--teamid");
const onlyTeamId = teamIdIdx >= 0 ? args[teamIdIdx + 1] : null;

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

function parseMetric(output: string, regex: RegExp): number {
  const match = output.match(regex);
  if (!match) return 0;
  return Number(match[1] ?? 0);
}

function runScript(scriptPath: string, scriptArgs: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      ["--loader", "ts-node/esm", scriptPath, ...scriptArgs],
      {
        env: process.env,
        stdio: ["ignore", "pipe", "pipe"],
      }
    );

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      const text = String(chunk);
      stdout += text;
      process.stdout.write(text);
    });

    child.stderr.on("data", (chunk) => {
      const text = String(chunk);
      stderr += text;
      process.stderr.write(text);
    });

    child.on("close", (exitCode) => {
      resolve({ stdout, stderr, exitCode: exitCode ?? 1 });
    });
  });
}

async function getTeams(): Promise<TeamRow[]> {
  const params: string[] = [];
  const where = ["ingest_enabled = true"];

  if (onlyTeamId) {
    params.push(onlyTeamId);
    where.push(`teamid = $${params.length}`);
  }

  const { rows } = await pool.query<TeamRow>(
    `
      SELECT teamid, team
      FROM college_team_sources
      WHERE ${where.join(" AND ")}
      ORDER BY teamid
    `,
    params
  );

  return rows;
}

async function getHeadshotCount(teamid: string): Promise<number> {
  const { rows } = await pool.query<{ count: string }>(
    `
      SELECT count(*)::text as count
      FROM college_roster_players_raw
      WHERE teamid = $1
        AND headshot_url IS NOT NULL
        AND trim(headshot_url) <> ''
    `,
    [teamid]
  );
  return Number(rows[0]?.count ?? 0);
}

async function processTeam(team: TeamRow): Promise<TeamSummary> {
  const errorsWarnings: string[] = [];

  if (discover) {
    const discovery = await runScript("scripts/discover-college-team-sources.ts", ["--teamid", team.teamid]);
    if (discovery.exitCode !== 0) {
      errorsWarnings.push(`discover exit=${discovery.exitCode}`);
    }
    if (discovery.stderr.trim()) {
      errorsWarnings.push(`discover stderr: ${discovery.stderr.trim()}`);
    }
  }

  const ingestArgs = ["--teamid", team.teamid];
  if (dryRun) ingestArgs.push("--dry-run");
  const ingest = await runScript("scripts/ingest-college-rosters.ts", ingestArgs);

  if (ingest.exitCode !== 0) {
    errorsWarnings.push(`ingest exit=${ingest.exitCode}`);
  }
  if (ingest.stderr.trim()) {
    errorsWarnings.push(`ingest stderr: ${ingest.stderr.trim()}`);
  }

  const rosterRowsParsed = parseMetric(ingest.stdout, /Parsed\s+(\d+)\s+roster candidates/i);
  const rowsInserted = parseMetric(ingest.stdout, /Inserted:\s+(\d+)/i);
  const rowsUpdated = parseMetric(ingest.stdout, /Updated:\s+(\d+)/i);

  const matchArgs = ["--teamid", team.teamid];
  if (dryRun) matchArgs.push("--dry-run");
  const match = await runScript("scripts/match-college-roster-players.ts", matchArgs);

  if (match.exitCode !== 0) {
    errorsWarnings.push(`match exit=${match.exitCode}`);
  }
  if (match.stderr.trim()) {
    errorsWarnings.push(`match stderr: ${match.stderr.trim()}`);
  }

  const matchedCount = parseMetric(match.stdout, /MATCHED:\s+(\d+)/i);
  const unmatchedCount = parseMetric(match.stdout, /UNMATCHED:\s+(\d+)/i);
  const headshotUrlCount = await getHeadshotCount(team.teamid);

  return {
    teamid: team.teamid,
    team: team.team,
    rosterRowsParsed,
    rowsInserted,
    rowsUpdated,
    matchedCount,
    unmatchedCount,
    headshotUrlCount,
    errorsWarnings,
  };
}

function printFinalReport(results: TeamSummary[]) {
  console.log("\n=== Final College Pipeline Report ===");

  for (const result of results) {
    console.log(
      JSON.stringify(
        {
          teamid: result.teamid,
          team: result.team,
          roster_rows_parsed: result.rosterRowsParsed,
          rows_inserted: result.rowsInserted,
          rows_updated: result.rowsUpdated,
          matched_count: result.matchedCount,
          unmatched_count: result.unmatchedCount,
          headshot_url_count: result.headshotUrlCount,
          errors_warnings: result.errorsWarnings,
        },
        null,
        2
      )
    );
  }
}

async function main() {
  console.log("=== College pipeline orchestrator ===");
  console.log(`Mode: ${dryRun ? "DRY RUN" : "LIVE"}`);
  console.log(`Discovery step: ${discover ? "ON" : "OFF"}`);

  const teams = await getTeams();
  if (!teams.length) {
    throw new Error("No ingest_enabled teams found for pipeline run");
  }

  const results: TeamSummary[] = [];
  for (const team of teams) {
    console.log(`\n--- Team ${team.teamid} (${team.team}) ---`);
    const summary = await processTeam(team);
    results.push(summary);
  }

  printFinalReport(results);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
