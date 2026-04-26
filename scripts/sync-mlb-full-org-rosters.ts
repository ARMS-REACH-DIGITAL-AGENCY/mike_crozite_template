#!/usr/bin/env ts-node
// scripts/sync-mlb-full-org-rosters.ts
// YAT?STATS — MLB Org Roster Raw Landing Sync
//
// Pipeline responsibility:
//   MLB API -> public.mlb_org_roster_raw
//
// This script intentionally does NOT write to:
//   - player_current_team
//   - flip_card_front_stage
//
// The next workflow step refreshes flip_card_front_stage from raw.

import { randomUUID } from "crypto";
import { Pool } from "pg";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("ERROR: DATABASE_URL environment variable is not set.");
  process.exit(1);
}

const MLB_API_BASE = "https://statsapi.mlb.com/api/v1";
const DELAY_MS = 250;
const ALL_SPORT_IDS = "1,11,12,13,14,15,16";
const ROSTER_TYPES = ["active", "40Man", "fullRoster"];

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");

const seasonIdx = args.indexOf("--season");
if (seasonIdx !== -1 && !args[seasonIdx + 1]) {
  console.error("ERROR: --season requires a value, e.g. --season 2026.");
  process.exit(1);
}

const SEASON =
  seasonIdx !== -1 ? args[seasonIdx + 1] : String(new Date().getFullYear());

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

interface MlbTeam {
  id: number;
  name: string;
  abbreviation: string;
}

interface MlbTeamWithSport extends MlbTeam {
  sport?: { id?: number; name?: string };
  parentOrgId?: number;
}

interface MlbTeamsResponse {
  teams: MlbTeamWithSport[];
}

interface MlbRosterEntry {
  person: {
    id: number;
    fullName?: string;
    firstName?: string;
    lastName?: string;
    useName?: string;
    birthDate?: string;
    birthCity?: string;
    birthStateProvince?: string;
    primaryPosition?: {
      code?: string;
      name?: string;
      type?: string;
      abbreviation?: string;
    };
  };
  position?: { name?: string; abbreviation?: string };
  status?: { code?: string; description?: string };
  team?: { id?: number; name?: string };
  parentTeamId?: number;
}

interface MlbRosterResponse {
  roster: MlbRosterEntry[];
  team: { id: number; name: string };
}

type LevelLabel =
  | "MLB"
  | "AAA"
  | "AA"
  | "High-A"
  | "Single-A"
  | "Rookie"
  | "Unknown";

interface TeamInfo {
  id: number;
  name: string;
  abbreviation: string;
  level: LevelLabel;
  parentOrgId: number | null;
  sportId: number | null;
}

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function safePlayerName(p: MlbRosterEntry["person"]): string {
  return (
    p.fullName ??
    `${p.firstName ?? ""} ${p.lastName ?? ""}`.trim() ??
    "Unknown Player"
  );
}

function sportNameToLevel(sportName?: string): LevelLabel {
  if (!sportName) return "Unknown";

  const s = sportName.toLowerCase();

  if (s.includes("major")) return "MLB";
  if (s.includes("triple") || s.includes("triple-a") || s === "aaa") return "AAA";
  if (s.includes("double") || s.includes("double-a") || s === "aa") return "AA";
  if (s.includes("high")) return "High-A";
  if (s.includes("single") || s.includes("class a")) return "Single-A";
  if (s.includes("rookie")) return "Rookie";

  return "Unknown";
}

async function ensureSchema(): Promise<void> {
  await pool.query(`
    ALTER TABLE public.mlb_org_roster_raw
      ADD COLUMN IF NOT EXISTS roster_type text
  `);
}

async function createIngestRun(runId: string): Promise<void> {
  await pool.query(
    `INSERT INTO public.source_ingest_runs
       (run_id, source, feed_name, season, status, started_at)
     VALUES ($1, 'mlb_api', 'mlb_full_org_roster', $2, 'running', NOW())`,
    [runId, SEASON]
  );
}

async function finalizeIngestRun(args: {
  runId: string;
  status: "completed" | "failed";
  rowsReceived: number;
  rowsStored: number;
  notes?: string | null;
}): Promise<void> {
  await pool.query(
    `UPDATE public.source_ingest_runs
        SET status = $2,
            completed_at = NOW(),
            rows_received = $3,
            rows_stored = $4,
            rows_matched = 0,
            rows_ambiguous = 0,
            rows_unmatched = 0,
            rows_published = 0,
            notes = $5
      WHERE run_id = $1`,
    [
      args.runId,
      args.status,
      args.rowsReceived,
      args.rowsStored,
      args.notes ?? null,
    ]
  );
}

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

async function fetchAllTeamsWithSport(): Promise<Map<number, TeamInfo>> {
  const url = `${MLB_API_BASE}/teams?sportIds=${ALL_SPORT_IDS}&season=${SEASON}&hydrate=sport`;
  const map = new Map<number, TeamInfo>();

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);

    const data = (await res.json()) as MlbTeamsResponse;

    for (const t of data.teams ?? []) {
      map.set(t.id, {
        id: t.id,
        name: t.name,
        abbreviation: t.abbreviation,
        level: sportNameToLevel(t.sport?.name),
        parentOrgId: t.parentOrgId ?? null,
        sportId: t.sport?.id ?? null,
      });
    }
  } catch (err) {
    console.error("fetchAllTeamsWithSport error:", err);
  }

  return map;
}

async function fetchTeamRoster(
  teamId: number,
  rosterType: string
): Promise<MlbRosterResponse | null> {
  const url =
    `${MLB_API_BASE}/teams/${teamId}/roster` +
    `?rosterType=${rosterType}` +
    `&season=${SEASON}` +
    `&hydrate=person,team`;

  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`  Roster type ${rosterType} failed for team ${teamId}: HTTP ${res.status}`);
      return null;
    }

    return (await res.json()) as MlbRosterResponse;
  } catch (err) {
    console.error(`fetchTeamRoster(${teamId}, ${rosterType}) error:`, err);
    return null;
  }
}

async function insertMlbOrgRosterRaw(args: {
  runId: string;
  org: MlbTeam;
  entry: MlbRosterEntry;
  assignedTeamId: number;
  assignedTeamName: string;
  level: LevelLabel;
  rosterStatus: string;
  rosterType: string;
}): Promise<void> {
  const p = args.entry.person;
  const fullName = safePlayerName(p);

  await pool.query(
    `INSERT INTO public.mlb_org_roster_raw (
       run_id,
       source,
       feed_name,
       season,
       roster_type,
       org_source_team_id,
       org_name,
       org_abbr,
       source_player_id,
       source_player_name,
       source_team_id,
       source_team_name,
       roster_status,
       level,
       raw_payload,
       seen_at,
       updated_at
     )
     VALUES (
       $1,
       'mlb_api',
       'mlb_full_org_roster',
       $2,
       $3,
       $4,
       $5,
       $6,
       $7,
       $8,
       $9,
       $10,
       $11,
       $12,
       $13::jsonb,
       NOW(),
       NOW()
     )`,
    [
      args.runId,
      SEASON,
      args.rosterType,
      String(args.org.id),
      args.org.name,
      args.org.abbreviation,
      String(p.id),
      fullName,
      String(args.assignedTeamId),
      args.assignedTeamName,
      args.rosterStatus,
      args.level,
      JSON.stringify(args.entry),
    ]
  );
}

async function main() {
  const runId = randomUUID();

  console.log("=== YAT?STATS MLB Org Roster Raw Sync ===");
  console.log(`Season: ${SEASON}`);
  console.log(`Mode:   ${dryRun ? "DRY RUN" : "LIVE"}`);
  console.log(`Run ID: ${runId}`);
  console.log("");

  let rowsReceived = 0;
  let rowsStored = 0;

  try {
    if (!dryRun) {
      await ensureSchema();
      await createIngestRun(runId);
    }

    const mlbOrgs = await fetchMlbTeams();
    if (mlbOrgs.length === 0) {
      throw new Error("No MLB teams returned from MLB Stats API.");
    }

    console.log(`Fetched ${mlbOrgs.length} MLB organizations`);

    const allTeamInfo = await fetchAllTeamsWithSport();
    console.log(`Fetched ${allTeamInfo.size} MLB/MiLB teams across all levels`);
    console.log("");

    for (const org of mlbOrgs) {
      console.log(`-- ${org.name} id=${org.id} abbr=${org.abbreviation} --`);

      const affiliateTeams = Array.from(allTeamInfo.values())
        .filter((team) => team.parentOrgId === org.id)
        .sort((a, b) => a.name.localeCompare(b.name));

      const teamsToProcess: TeamInfo[] = [
        {
          id: org.id,
          name: org.name,
          abbreviation: org.abbreviation,
          level: "MLB",
          parentOrgId: org.id,
          sportId: 1,
        },
        ...affiliateTeams,
      ];

      console.log(`  ${teamsToProcess.length} teams to process`);

      for (const team of teamsToProcess) {
        for (const rosterType of ROSTER_TYPES) {
          const rosterData = await fetchTeamRoster(team.id, rosterType);

          if (!rosterData || !rosterData.roster?.length) {
            console.log(`  No ${rosterType} roster for ${team.name} (${team.level})`);
            await delay(DELAY_MS);
            continue;
          }

          const roster = rosterData.roster;
          console.log(`  ${team.name} (${team.level}) ${rosterType} -> ${roster.length} entries`);

          for (const entry of roster) {
            rowsReceived++;

            const assignedTeamId = entry.team?.id ?? team.id;
            const assignedTeamLookup = allTeamInfo.get(assignedTeamId);

            const assignedTeamName =
              entry.team?.name ?? assignedTeamLookup?.name ?? team.name;

            const level = assignedTeamLookup?.level ?? team.level ?? "Unknown";
            const rosterStatus = entry.status?.description ?? "Active";

            if (!dryRun) {
              await insertMlbOrgRosterRaw({
                runId,
                org,
                entry,
                assignedTeamId,
                assignedTeamName,
                level,
                rosterStatus,
                rosterType,
              });

              rowsStored++;
            }
          }

          await delay(DELAY_MS);
        }
      }
    }

    if (!dryRun) {
      await finalizeIngestRun({
        runId,
        status: "completed",
        rowsReceived,
        rowsStored,
        notes: "Raw roster landing only. No player_current_team or flip_card_front_stage writes.",
      });
    }

    console.log("");
    console.log("=== Raw roster sync complete ===");
    console.log(`Rows received: ${rowsReceived}`);
    console.log(`Rows stored:   ${rowsStored}`);
  } catch (err) {
    console.error("ERROR during MLB raw roster sync:", err);

    if (!dryRun) {
      await finalizeIngestRun({
        runId,
        status: "failed",
        rowsReceived,
        rowsStored,
        notes: err instanceof Error ? err.message : String(err),
      });
    }

    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
