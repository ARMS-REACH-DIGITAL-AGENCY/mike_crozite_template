#!/usr/bin/env ts-node
// scripts/sync-mlb-full-org-rosters.ts
// YAT?STATS — MLB Full-Season Org Roster Sync
//
// Pulls MLB + MiLB affiliate rosters across all 30 MLB organizations.
// Every processed player row is:
//
//   1) optionally stored in mlb_org_roster_raw
//   2) resolved first via player_source_map
//   3) then matched using candidate name keys
//      (legal name, preferred/use name, full name)
//   4) disambiguated using borndate and place from tbc_players_raw
//   5) written to mlb_org_roster_resolution
//   6) published to player_current_team only when confidently matched
//
// When a player is confidently matched, the script also writes back to
// player_source_map so future runs can resolve directly from the stable
// MLB source player ID instead of repeating fallback matching.
//
// Usage:
//   npx ts-node scripts/sync-mlb-full-org-rosters.ts
//   npx ts-node scripts/sync-mlb-full-org-rosters.ts --season 2025
//   npx ts-node scripts/sync-mlb-full-org-rosters.ts --dry-run
//
// Required env vars:
//   DATABASE_URL

import { randomUUID } from "crypto";
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
    useName?: string;
    middleName?: string;
    birthDate?: string;
    birthCity?: string;
    birthStateProvince?: string;
    batSide?: { code?: string; description?: string };
    pitchHand?: { code?: string; description?: string };
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
  borndate: string | null;
  place: string | null;
  bats: string | null;
  throws: string | null;
  posit: string | null;
  highlevel: string | null;
  high_school: string | null;
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

type MatchStatus =
  | "matched"
  | "ambiguous"
  | "unmatched"
  | "error";

interface ResolutionArgs {
  runId: string;
  rawId: number;
  playerid: string | null;
  sourcePlayerId: string;
  sourcePlayerName: string;
  sourceTeamId: string;
  sourceTeamName: string;
  matchStatus: MatchStatus;
  matchMethod: string | null;
  matchConfidence: number | null;
  candidatePlayerIds: string[];
  notes: string | null;
}

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

function sportNameToLevel(sportName?: string): LevelLabel {
  if (!sportName) return "Unknown";
  const s = sportName.toLowerCase();
  if (s.includes("major")) return "MLB";
  if (s.includes("triple") || s.includes("triple-a") || s === "aaa") {
    return "AAA";
  }
  if (s.includes("double") || s.includes("double-a") || s === "aa") {
    return "AA";
  }
  if (s.includes("high")) return "High-A";
  if (s.includes("single") || s.includes("class a")) return "Single-A";
  if (s.includes("rookie")) return "Rookie";
  return "Unknown";
}

function buildNameKey(firstName: string, lastName: string): string {
  return `${firstName.toLowerCase()} ${lastName.toLowerCase()}`.trim();
}

function normalizeText(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function parsePlace(value: string | null | undefined): {
  city: string | null;
  state: string | null;
} {
  const raw = (value ?? "").trim();
  if (!raw) return { city: null, state: null };

  const parts = raw.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return { city: null, state: null };
  if (parts.length === 1) return { city: parts[0], state: null };

  return {
    city: parts[0],
    state: parts[1],
  };
}

function buildCandidateNameKeys(person: MlbRosterEntry["person"]): string[] {
  const keys = new Set<string>();

  if (person.firstName && person.lastName) {
    keys.add(buildNameKey(person.firstName, person.lastName));
  }

  if (person.useName && person.lastName) {
    keys.add(buildNameKey(person.useName, person.lastName));
  }

  if (person.fullName) {
    const parts = person.fullName.trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      keys.add(buildNameKey(parts[0], parts[parts.length - 1]));
    }
  }

  return Array.from(keys);
}

function scoreCandidate(
  row: DbPlayerRow,
  person: MlbRosterEntry["person"],
  assignedTeamName: string,
  level: LevelLabel
): number {
  let score = 0;

  const legalKey = buildNameKey(person.firstName ?? "", person.lastName ?? "");
  const preferredKey = buildNameKey(person.useName ?? "", person.lastName ?? "");
  const dbKey = buildNameKey(row.firstname, row.lastname);

  if (preferredKey && dbKey === preferredKey) score += 60;
  if (legalKey && dbKey === legalKey) score += 35;

  if (person.birthDate && row.borndate && row.borndate.startsWith(person.birthDate)) {
    score += 80;
  }

  const parsedPlace = parsePlace(row.place);

  if (person.birthCity && parsedPlace.city) {
    if (normalizeText(person.birthCity) === normalizeText(parsedPlace.city)) {
      score += 25;
    }
  }

  if (person.birthStateProvince && parsedPlace.state) {
    if (normalizeText(person.birthStateProvince) === normalizeText(parsedPlace.state)) {
      score += 10;
    }
  }

  const mlbPos = normalizeText(
    person.primaryPosition?.abbreviation ?? person.primaryPosition?.name
  );
  const rowPos = normalizeText(row.posit);
  if (mlbPos && rowPos && rowPos.includes(mlbPos)) {
    score += 8;
  }

  const rowLevel = normalizeText(row.highlevel);
  const currentLevel = normalizeText(level);
  if (rowLevel && currentLevel && rowLevel.includes(currentLevel.replace("-", ""))) {
    score += 5;
  }

  const lowerTeam = normalizeText(assignedTeamName);
  const lowerSchool = normalizeText(row.high_school);
  if (lowerTeam && lowerSchool && lowerSchool.includes("hamilton")) {
    score += 1;
  }

  return score;
}

function resolveByCandidateScoring(
  candidates: DbPlayerRow[],
  person: MlbRosterEntry["person"],
  assignedTeamName: string,
  level: LevelLabel
): {
  winner: DbPlayerRow | null;
  ranked: { playerid: string; score: number }[];
} {
  const ranked = candidates
    .map((row) => ({
      row,
      score: scoreCandidate(row, person, assignedTeamName, level),
    }))
    .sort((a, b) => b.score - a.score);

  if (ranked.length === 0) {
    return { winner: null, ranked: [] };
  }

  if (ranked.length === 1) {
    return {
      winner: ranked[0].score >= 35 ? ranked[0].row : null,
      ranked: ranked.map((r) => ({ playerid: r.row.playerid, score: r.score })),
    };
  }

  const top = ranked[0];
  const second = ranked[1];

  if (top.score >= 80 && top.score >= second.score + 20) {
    return {
      winner: top.row,
      ranked: ranked.map((r) => ({ playerid: r.row.playerid, score: r.score })),
    };
  }

  return {
    winner: null,
    ranked: ranked.map((r) => ({ playerid: r.row.playerid, score: r.score })),
  };
}

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

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
  rosterType = "active"
): Promise<MlbRosterResponse | null> {
  const url =
    `${MLB_API_BASE}/teams/${teamId}/roster` +
    `?rosterType=${rosterType}` +
    `&season=${SEASON}` +
    `&hydrate=person,team`;

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    return (await res.json()) as MlbRosterResponse;
  } catch (err) {
    console.error(`fetchTeamRoster(${teamId}, ${rosterType}) error:`, err);
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
      TRIM(lastname)  AS lastname,
      borndate::text  AS borndate,
      TRIM(place)     AS place,
      TRIM(bats)      AS bats,
      TRIM(throws)    AS throws,
      TRIM(posit)     AS posit,
      TRIM(highlevel) AS highlevel,
      TRIM(high_school) AS high_school
    FROM tbc_players_raw
    WHERE TRIM(firstname) != '' AND TRIM(lastname) != ''
  `);
  return rows;
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
  fullName: string,
  sourceTeamId?: string | null,
  sourceTeamName?: string | null,
  matchMethod?: string | null,
  matchConfidence?: number | null,
  isVerified?: boolean | null,
  notes?: string | null
): Promise<void> {
  return upsertSourceMap(
    pool,
    playerid,
    "mlb_api",
    String(mlbPersonId),
    fullName,
    sourceTeamId ?? null,
    sourceTeamName ?? null,
    matchMethod ?? null,
    matchConfidence ?? null,
    isVerified ?? null,
    notes ?? null
  );
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
  rowsMatched: number;
  rowsAmbiguous: number;
  rowsUnmatched: number;
  rowsPublished: number;
  notes?: string | null;
}): Promise<void> {
  await pool.query(
    `UPDATE public.source_ingest_runs
        SET status = $2,
            completed_at = NOW(),
            rows_received = $3,
            rows_stored = $4,
            rows_matched = $5,
            rows_ambiguous = $6,
            rows_unmatched = $7,
            rows_published = $8,
            notes = $9
      WHERE run_id = $1`,
    [
      args.runId,
      args.status,
      args.rowsReceived,
      args.rowsStored,
      args.rowsMatched,
      args.rowsAmbiguous,
      args.rowsUnmatched,
      args.rowsPublished,
      args.notes ?? null,
    ]
  );
}

async function insertMlbOrgRosterRaw(
  runId: string,
  org: MlbTeam,
  entry: MlbRosterEntry,
  assignedTeamId: number,
  assignedTeamName: string,
  level: LevelLabel,
  rosterStatus: string
): Promise<number> {
  const p = entry.person;
  const fullName = safePlayerName(p);

  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO public.mlb_org_roster_raw (
       run_id,
       source,
       feed_name,
       season,
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
       $12::jsonb,
       NOW(),
       NOW()
     )
     RETURNING id`,
    [
      runId,
      SEASON,
      String(org.id),
      org.name,
      org.abbreviation,
      String(p.id),
      fullName,
      String(assignedTeamId),
      assignedTeamName,
      rosterStatus,
      level,
      JSON.stringify(entry),
    ]
  );

  return rows[0].id;
}

async function saveMlbOrgRosterResolution(args: ResolutionArgs): Promise<void> {
  await pool.query(
    `INSERT INTO public.mlb_org_roster_resolution (
       run_id,
       raw_id,
       playerid,
       source,
       source_player_id,
       source_player_name,
       source_team_id,
       source_team_name,
       match_status,
       match_method,
       match_confidence,
       candidate_playerids,
       notes,
       created_at,
       updated_at
     )
     VALUES (
       $1,
       $2,
       $3,
       'mlb_api',
       $4,
       $5,
       $6,
       $7,
       $8,
       $9,
       $10,
       $11::jsonb,
       $12,
       NOW(),
       NOW()
     )`,
    [
      args.runId,
      args.rawId,
      args.playerid,
      args.sourcePlayerId,
      args.sourcePlayerName,
      args.sourceTeamId,
      args.sourceTeamName,
      args.matchStatus,
      args.matchMethod,
      args.matchConfidence,
      JSON.stringify(args.candidatePlayerIds),
      args.notes,
    ]
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
       (
         playerid,
         teamid,
         team_name,
         level,
         source,
         source_team_id,
         roster_status,
         last_verified,
         updated_at
       )
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
// Main pipeline
// ---------------------------------------------------------------------------
async function main() {
  const runId = randomUUID();

  console.log("=== YAT?STATS MLB Full-Season Org Roster Sync ===");
  console.log(`Season: ${SEASON}`);
  console.log(`Mode:   ${dryRun ? "DRY RUN" : "LIVE"}`);
  console.log("");

  let orgsProcessed = 0;
  let totalEntries = 0;
  let rowsReceived = 0;
  let rowsStored = 0;
  let resolvedViaSourceMap = 0;
  let resolvedViaName = 0;
  let ambiguousSkipped = 0;
  let unmatchedSkipped = 0;
  let rowsWritten = 0;

  if (!dryRun) {
    await createIngestRun(runId);
  }

  try {
    const mlbOrgs = await fetchMlbTeams();
    if (mlbOrgs.length === 0) {
      throw new Error("No MLB teams returned from MLB Stats API.");
    }
    console.log(`✓ Fetched ${mlbOrgs.length} MLB organizations`);

    const allTeamInfo = await fetchAllTeamsWithSport();
    console.log(
      `✓ Fetched affiliate team info (${allTeamInfo.size} teams across all levels)`
    );

    const dbPlayers = await getAllDbPlayers();
    console.log(`✓ Loaded ${dbPlayers.length} players from DB`);
    const nameIndex = buildNameIndex(dbPlayers);
    console.log(`✓ Name index built (${nameIndex.size} unique name keys)`);
    console.log("");

    for (const org of mlbOrgs) {
      console.log(`── ${org.name} (id=${org.id}, abbr=${org.abbreviation}) ──`);

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

      console.log(`  ${teamsToProcess.length} teams to process in org`);

      orgsProcessed++;
      const seenMlbIds = new Set<number>();

      for (const team of teamsToProcess) {
        const rosterData = await fetchTeamRoster(team.id, "active");

        if (!rosterData || !rosterData.roster?.length) {
          console.log(`  ✗ No roster returned for ${team.name} (${team.level})`);
          await delay(DELAY_MS);
          continue;
        }

        const roster = rosterData.roster;
        console.log(`  ${team.name} (${team.level}) → ${roster.length} entries`);
        totalEntries += roster.length;

        for (const entry of roster) {
          const p = entry.person;
          const displayName = safePlayerName(p);

          if (seenMlbIds.has(p.id)) {
            continue;
          }
          seenMlbIds.add(p.id);
          rowsReceived++;

          const assignedTeamId: number = entry.team?.id ?? team.id;
          const assignedTeamLookup = allTeamInfo.get(assignedTeamId);

          const assignedTeamName: string =
            entry.team?.name ?? assignedTeamLookup?.name ?? team.name;

          const level: LevelLabel =
            assignedTeamLookup?.level ?? team.level ?? "Unknown";

          const rosterStatus = entry.status?.description ?? "Active";

          let rawId: number | null = null;
          if (!dryRun) {
            rawId = await insertMlbOrgRosterRaw(
              runId,
              org,
              entry,
              assignedTeamId,
              assignedTeamName,
              level,
              rosterStatus
            );
            rowsStored++;
          }

          let resolvedId: string | null = null;

          if (!dryRun) {
            resolvedId = await resolveFromSourceMap(p.id);
          }

          if (resolvedId) {
            resolvedViaSourceMap++;

            if (!dryRun && rawId !== null) {
              await saveMlbOrgRosterResolution({
                runId,
                rawId,
                playerid: resolvedId,
                sourcePlayerId: String(p.id),
                sourcePlayerName: displayName,
                sourceTeamId: String(assignedTeamId),
                sourceTeamName: assignedTeamName,
                matchStatus: "matched",
                matchMethod: "source_map",
                matchConfidence: 1.0,
                candidatePlayerIds: [resolvedId],
                notes: "Resolved via player_source_map",
              });

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

          const candidateKeys = buildCandidateNameKeys(p);
          const candidateMap = new Map<string, DbPlayerRow>();

          for (const key of candidateKeys) {
            for (const match of nameIndex.get(key) ?? []) {
              candidateMap.set(match.playerid, match);
            }
          }

          const candidates = Array.from(candidateMap.values());

          if (candidates.length === 0) {
            unmatchedSkipped++;

            if (!dryRun && rawId !== null) {
              await saveMlbOrgRosterResolution({
                runId,
                rawId,
                playerid: null,
                sourcePlayerId: String(p.id),
                sourcePlayerName: displayName,
                sourceTeamId: String(assignedTeamId),
                sourceTeamName: assignedTeamName,
                matchStatus: "unmatched",
                matchMethod: null,
                matchConfidence: null,
                candidatePlayerIds: [],
                notes: `No canonical player match found. Keys tried: ${candidateKeys.join(" | ")}`,
              });
            } else {
              console.log(
                `  [DRY RUN] UNMATCHED: ${displayName} (mlbId=${p.id}, team=${assignedTeamName}, org=${org.name}, level=${level}, keys=${candidateKeys.join(" | ")})`
              );
            }

            continue;
          }

          if (candidates.length === 1) {
            const dbPlayer = candidates[0];
            resolvedViaName++;

            if (!dryRun && rawId !== null) {
              await saveMlbOrgRosterResolution({
                runId,
                rawId,
                playerid: dbPlayer.playerid,
                sourcePlayerId: String(p.id),
                sourcePlayerName: displayName,
                sourceTeamId: String(assignedTeamId),
                sourceTeamName: assignedTeamName,
                matchStatus: "matched",
                matchMethod: "candidate_key_unique",
                matchConfidence: 0.9,
                candidatePlayerIds: [dbPlayer.playerid],
                notes: `Resolved uniquely via candidate keys: ${candidateKeys.join(", ")}`,
              });

              await upsertFullSeasonTeam(
                dbPlayer.playerid,
                assignedTeamId,
                assignedTeamName,
                level,
                rosterStatus
              );
              await saveSourceMap(
                dbPlayer.playerid,
                p.id,
                displayName,
                String(assignedTeamId),
                assignedTeamName,
                "candidate_key_unique",
                0.9,
                true,
                `Resolved uniquely via candidate keys: ${candidateKeys.join(", ")}`
              );
              rowsWritten++;
            } else {
              console.log(
                `  [DRY RUN] candidate-key unique: ${displayName} → ${assignedTeamName} (${level}) playerid=${dbPlayer.playerid}`
              );
            }

            continue;
          }

          const scored = resolveByCandidateScoring(
            candidates,
            p,
            assignedTeamName,
            level
          );

          if (scored.winner) {
            resolvedViaName++;

            if (!dryRun && rawId !== null) {
              await saveMlbOrgRosterResolution({
                runId,
                rawId,
                playerid: scored.winner.playerid,
                sourcePlayerId: String(p.id),
                sourcePlayerName: displayName,
                sourceTeamId: String(assignedTeamId),
                sourceTeamName: assignedTeamName,
                matchStatus: "matched",
                matchMethod: "candidate_scoring",
                matchConfidence: 0.95,
                candidatePlayerIds: [scored.winner.playerid],
                notes: `Resolved by scoring. Keys=${candidateKeys.join(", ")} Scores=${JSON.stringify(scored.ranked)}`,
              });

              await upsertFullSeasonTeam(
                scored.winner.playerid,
                assignedTeamId,
                assignedTeamName,
                level,
                rosterStatus
              );
              await saveSourceMap(
                scored.winner.playerid,
                p.id,
                displayName,
                String(assignedTeamId),
                assignedTeamName,
                "candidate_scoring",
                0.95,
                true,
                `Resolved by scoring. Keys=${candidateKeys.join(", ")} Scores=${JSON.stringify(scored.ranked)}`
              );
              rowsWritten++;
            } else {
              console.log(
                `  [DRY RUN] scored match: ${displayName} → ${assignedTeamName} (${level}) playerid=${scored.winner.playerid} scores=${JSON.stringify(scored.ranked)}`
              );
            }

            continue;
          }

          ambiguousSkipped++;

          if (!dryRun && rawId !== null) {
            await saveMlbOrgRosterResolution({
              runId,
              rawId,
              playerid: null,
              sourcePlayerId: String(p.id),
              sourcePlayerName: displayName,
              sourceTeamId: String(assignedTeamId),
              sourceTeamName: assignedTeamName,
              matchStatus: "ambiguous",
              matchMethod: "candidate_scoring",
              matchConfidence: null,
              candidatePlayerIds: candidates.map((c) => c.playerid),
              notes: `Multiple canonical matches. Keys=${candidateKeys.join(" | ")} Scores=${JSON.stringify(scored.ranked)}`,
            });
          } else {
            console.log(
              `  [DRY RUN] AMBIGUOUS (${candidates.length} candidates): ${displayName} (mlbId=${p.id}, team=${assignedTeamName}, org=${org.name}, keys=${candidateKeys.join(" | ")}, scores=${JSON.stringify(scored.ranked)})`
            );
          }

          continue;
        }

        await delay(DELAY_MS);
      }
    }

    if (!dryRun) {
      await finalizeIngestRun({
        runId,
        status: "completed",
        rowsReceived,
        rowsStored,
        rowsMatched: resolvedViaSourceMap + resolvedViaName,
        rowsAmbiguous: ambiguousSkipped,
        rowsUnmatched: unmatchedSkipped,
        rowsPublished: rowsWritten,
        notes: null,
      });
    }

    console.log("");
    console.log("=== Full-Season Org Roster Sync Complete ===");
    console.log(`Organizations processed:      ${orgsProcessed}`);
    console.log(`Roster entries processed:     ${totalEntries}`);
    console.log(`Rows received (unique):       ${rowsReceived}`);
    console.log(`Rows stored (raw):            ${dryRun ? "0 (dry run)" : String(rowsStored)}`);
    console.log(`Resolved via source map:      ${resolvedViaSourceMap}`);
    console.log(`Resolved via name match:      ${resolvedViaName}`);
    console.log(`Ambiguous skipped:            ${ambiguousSkipped}`);
    console.log(`Unmatched skipped:            ${unmatchedSkipped}`);
    console.log(
      `Rows written to player_current_team: ${dryRun ? "0 (dry run)" : String(rowsWritten)}`
    );
  } catch (err) {
    if (!dryRun) {
      try {
        await finalizeIngestRun({
          runId,
          status: "failed",
          rowsReceived,
          rowsStored,
          rowsMatched: resolvedViaSourceMap + resolvedViaName,
          rowsAmbiguous: ambiguousSkipped,
          rowsUnmatched: unmatchedSkipped,
          rowsPublished: rowsWritten,
          notes: err instanceof Error ? err.message : "Unknown failure",
        });
      } catch (finalizeErr) {
        console.error("Failed to finalize ingest run after error:", finalizeErr);
      }
    }
    throw err;
  }
}

main()
  .catch((err) => {
    console.error("FATAL:", err);
    process.exit(1);
  })
  .finally(() => pool.end());
