#!/usr/bin/env ts-node
// scripts/sync-mlb-full-org-rosters.ts
// YAT?STATS — MLB Full-Season Org Roster Sync
//
// Pulls the fullSeason roster for all 30 MLB organizations from the MLB Stats
// API, capturing MLB and MiLB affiliate assignments for each player. Each
// entry is matched to a canonical YAT?STATS playerid via:
//   1) player_source_map
//   2) normalized exact first+last
//   3) normalized full name
//   4) nickname-aware fallback
// and upserts into player_current_team.
//
// Usage:
//   npx tsx ./scripts/sync-mlb-full-org-rosters.ts
//   npx tsx ./scripts/sync-mlb-full-org-rosters.ts --season 2025
//   npx tsx ./scripts/sync-mlb-full-org-rosters.ts --dry-run

import { Pool } from "pg";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("ERROR: DATABASE_URL environment variable is not set.");
  process.exit(1);
}

const MLB_API_BASE = "https://statsapi.mlb.com/api/v1";
const DELAY_MS = 250;
const ALL_SPORT_IDS = "1,11,12,13,14,15,16";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const seasonIdx = args.indexOf("--season");
if (seasonIdx !== -1 && !args[seasonIdx + 1]) {
  console.error("ERROR: --season requires a value (e.g. --season 2025).");
  process.exit(1);
}
const SEASON =
  seasonIdx !== -1 ? args[seasonIdx + 1] : String(new Date().getFullYear());

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

type LevelLabel =
  | "MLB"
  | "AAA"
  | "AA"
  | "High-A"
  | "Single-A"
  | "Rookie"
  | "Unknown";

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

function safePlayerName(p: MlbRosterEntry["person"]): string {
  return (
    p.fullName ??
    (`${p.firstName ?? ""} ${p.lastName ?? ""}`.trim() || "Unknown Player")
  );
}

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[.'`’\-]/g, "")
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function normalizeFirstName(value: string): string {
  return normalizeText(value);
}

function normalizeLastName(value: string): string {
  return normalizeText(value);
}

function buildNameKey(firstName: string, lastName: string): string {
  return `${normalizeFirstName(firstName)} ${normalizeLastName(lastName)}`.trim();
}

function buildFullNameKey(fullName: string): string {
  return normalizeText(fullName);
}

function parseFullName(fullName?: string): { firstName: string; lastName: string } {
  const cleaned = normalizeText(fullName ?? "");
  if (!cleaned) return { firstName: "", lastName: "" };
  const parts = cleaned.split(" ").filter(Boolean);
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return {
    firstName: parts.slice(0, -1).join(" "),
    lastName: parts[parts.length - 1],
  };
}

const nicknameMap: Record<string, string[]> = {
  dom: ["dominic"],
  dominic: ["dom"],
  nick: ["nicholas", "nicolas"],
  nicholas: ["nick"],
  nicolas: ["nick"],
  mike: ["michael"],
  michael: ["mike"],
  matt: ["matthew"],
  matthew: ["matt"],
  josh: ["joshua"],
  joshua: ["josh"],
  will: ["william"],
  william: ["will"],
  alex: ["alexander"],
  alexander: ["alex"],
  ben: ["benjamin"],
  benjamin: ["ben"],
  jake: ["jacob"],
  jacob: ["jake"],
  joe: ["joseph"],
  joseph: ["joe"],
  jon: ["john", "jonathan"],
  john: ["jon"],
  jonathan: ["jon"],
  kike: ["enrique"],
  enrique: ["kike"],
};

function expandFirstNameVariants(firstName: string): string[] {
  const normalized = normalizeFirstName(firstName);
  const variants = new Set<string>();
  if (!normalized) return [];
  variants.add(normalized);
  for (const alt of nicknameMap[normalized] ?? []) {
    variants.add(normalizeFirstName(alt));
  }
  return Array.from(variants);
}

function sportNameToLevel(sportName?: string): LevelLabel {
  if (!sportName) return "Unknown";
  const s = sportName.toLowerCase();
  if (s.includes("major")) return "MLB";
  if (s.includes("triple")) return "AAA";
  if (s.includes("double")) return "AA";
  if (s.includes("high")) return "High-A";
  if (s.includes("single") || s.includes("class a")) return "Single-A";
  if (s.includes("rookie")) return "Rookie";
  return "Unknown";
}

async function fetchMlbTeams(): Promise<MlbTeam[]> {
  const url = `${MLB_API_BASE}/teams?sportId=1&season=${SEASON}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetchMlbTeams HTTP ${res.status} ${res.statusText}`);
  const data = (await res.json()) as MlbTeamsResponse;
  return data.teams ?? [];
}

async function fetchAllTeamsWithSport(): Promise<
  Map<number, { name: string; level: LevelLabel }>
> {
  const url = `${MLB_API_BASE}/teams?sportIds=${ALL_SPORT_IDS}&season=${SEASON}&hydrate=sport`;
  const map = new Map<number, { name: string; level: LevelLabel }>();
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetchAllTeamsWithSport HTTP ${res.status} ${res.statusText}`);
  const data = (await res.json()) as MlbTeamsResponse;
  for (const t of data.teams ?? []) {
    map.set(t.id, {
      name: t.name,
      level: sportNameToLevel(t.sport?.name),
    });
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

async function getAllDbPlayers(): Promise<DbPlayerRow[]> {
  const { rows } = await pool.query<DbPlayerRow>(`
    SELECT
      playerid::text AS playerid,
      TRIM(firstname) AS firstname,
      TRIM(lastname)  AS lastname
    FROM tbc_players_raw
    WHERE TRIM(firstname) <> '' AND TRIM(lastname) <> ''
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

function buildFullNameIndex(players: DbPlayerRow[]): Map<string, DbPlayerRow[]> {
  const index = new Map<string, DbPlayerRow[]>();
  for (const p of players) {
    const key = buildFullNameKey(`${p.firstname} ${p.lastname}`);
    const bucket = index.get(key) ?? [];
    bucket.push(p);
    index.set(key, bucket);
  }
  return index;
}

async function resolveFromSourceMap(
  mlbPersonId: number
): Promise<string | null> {
  const { rows } = await pool.query<{ playerid: string }>(
    `SELECT playerid
     FROM player_source_map
     WHERE source = 'mlb_api' AND source_player_id = $1
     LIMIT 1`,
    [String(mlbPersonId)]
  );
  return rows[0]?.playerid ?? null;
}

async function saveSourceMap(
  playerid: string,
  mlbPersonId: number,
  fullName: string
): Promise<void> {
  await pool.query(
    `INSERT INTO player_source_map
       (playerid, source, source_player_id, source_player_name, updated_at)
     VALUES ($1, 'mlb_api', $2, $3, NOW())
     ON CONFLICT (source, source_player_id) DO UPDATE SET
       playerid           = EXCLUDED.playerid,
       source_player_name = EXCLUDED.source_player_name,
       updated_at         = EXCLUDED.updated_at`,
    [playerid, String(mlbPersonId), fullName]
  );
}

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

function findCandidateMatches(
  entry: MlbRosterEntry,
  nameIndex: Map<string, DbPlayerRow[]>,
  fullNameIndex: Map<string, DbPlayerRow[]>
): DbPlayerRow[] {
  const p = entry.person;
  const candidates = new Map<string, DbPlayerRow>();

  const firstName = p.firstName ?? "";
  const lastName = p.lastName ?? "";
  const fullName = safePlayerName(p);

  const exactKey = buildNameKey(firstName, lastName);
  for (const row of nameIndex.get(exactKey) ?? []) {
    candidates.set(row.playerid, row);
  }

  const parsed = parseFullName(fullName);
  if (parsed.firstName && parsed.lastName) {
    const parsedKey = buildNameKey(parsed.firstName, parsed.lastName);
    for (const row of nameIndex.get(parsedKey) ?? []) {
      candidates.set(row.playerid, row);
    }
  }

  const fullNameKey = buildFullNameKey(fullName);
  for (const row of fullNameIndex.get(fullNameKey) ?? []) {
    candidates.set(row.playerid, row);
  }

  const lastNameNorm = normalizeLastName(lastName || parsed.lastName);
  const variantBases = [
    ...(firstName ? [firstName] : []),
    ...(parsed.firstName ? [parsed.firstName] : []),
  ];

  const variants = new Set<string>();
  for (const base of variantBases) {
    for (const v of expandFirstNameVariants(base)) {
      variants.add(v);
    }
  }

  for (const variant of variants) {
    const key = `${variant} ${lastNameNorm}`.trim();
    for (const row of nameIndex.get(key) ?? []) {
      candidates.set(row.playerid, row);
    }
  }

  const all = Array.from(candidates.values());
  if (all.length <= 1) return all;

  const exactFullNameMatches = all.filter(
    (row) => buildFullNameKey(`${row.firstname} ${row.lastname}`) === fullNameKey
  );
  if (exactFullNameMatches.length === 1) return exactFullNameMatches;

  return all;
}

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function main() {
  console.log("=== YAT?STATS MLB Full-Season Org Roster Sync ===");
  console.log(`Season: ${SEASON}`);
  console.log(`Mode:   ${dryRun ? "DRY RUN" : "LIVE"}`);
  console.log("");

  const mlbOrgs = await fetchMlbTeams();
  if (mlbOrgs.length === 0) {
    console.error("No MLB teams returned from MLB Stats API. Aborting.");
    process.exit(1);
  }
  console.log(`✓ Fetched ${mlbOrgs.length} MLB organizations`);

  const allTeamInfo = await fetchAllTeamsWithSport();
  console.log(
    `✓ Fetched affiliate team info (${allTeamInfo.size} teams across all levels)`
  );

  const dbPlayers = await getAllDbPlayers();
  console.log(`✓ Loaded ${dbPlayers.length} players from DB`);
  const nameIndex = buildNameIndex(dbPlayers);
  const fullNameIndex = buildFullNameIndex(dbPlayers);
  console.log(`✓ Name index built (${nameIndex.size} unique normalized name keys)`);
  console.log(`✓ Full-name index built (${fullNameIndex.size} unique normalized full-name keys)`);
  console.log("");

  let orgsProcessed = 0;
  let totalEntries = 0;
  let resolvedViaSourceMap = 0;
  let resolvedViaName = 0;
  let ambiguousSkipped = 0;
  let unmatchedSkipped = 0;
  let rowsWritten = 0;

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
      
if (String(p.id) === "701762" || displayName.toLowerCase().includes("hamel")) {
  console.log("DEBUG PLAYER", {
    mlbId: p.id,
    fullName: p.fullName,
    firstName: p.firstName,
    lastName: p.lastName,
    displayName,
    exactKey: buildNameKey(p.firstName ?? "", p.lastName ?? ""),
    parsed: parseFullName(displayName),
  });
}
      const assignedTeamId: number =
        entry.team?.id ?? entry.parentTeamId ?? org.id;
      const teamLookup = allTeamInfo.get(assignedTeamId);
      const assignedTeamName: string =
        entry.team?.name ?? teamLookup?.name ?? org.name;
      const level: LevelLabel = teamLookup?.level ?? "Unknown";
      const rosterStatus = entry.status?.description ?? "Active";

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
        }
        continue;
      }

      const matches = findCandidateMatches(entry, nameIndex, fullNameIndex);

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
