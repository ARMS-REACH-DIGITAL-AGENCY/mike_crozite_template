#!/usr/bin/env ts-node
// scripts/sync-mlb-player-gamelogs.ts
// YAT?STATS — MLB Player Game Log Sync
//
// Pipeline responsibility:
//   MLB Stats API (statsapi.mlb.com, free, no key)
//     -> public.player_game_logs (source = 'mlb_api')
//
// Only players already resolved in player_source_map (source = 'mlb_api'),
// via scripts/sync-mlb-full-org-rosters.ts, are eligible — this script does
// no name matching of its own, it just walks the existing crosswalk.
//
// For each player it pulls the player's FULL season game log (both hitting
// and pitching splits — two-way players get rows in both) and upserts into
// player_game_logs, one row per (playerid, source_game_id, stat_type). This
// feeds:
//   - the player profile page SCHEDULE tab (merges by game_date)
//   - PlayerSevenDaySnapshot.tsx (the flip-card-back 7-Day Snapshot)
//
// A player's level can change mid-season (call-ups/demotions) and the
// gameLog endpoint only returns games for the sportId you ask it for, so
// each player's current sportId is resolved once per run via their current
// team, then used for both hitting and pitching gameLog requests. This
// misses games played at a since-departed level within the same season;
// re-running after a demotion/promotion backfills the new level's games,
// but a player who was in AAA earlier this season and is in MLB now will
// not get their AAA games until this script is extended to walk every
// sportId a player touched this season.
//
// Usage:
//   npx tsx scripts/sync-mlb-player-gamelogs.ts                  # all mapped players, current season
//   npx tsx scripts/sync-mlb-player-gamelogs.ts --season 2026
//   npx tsx scripts/sync-mlb-player-gamelogs.ts --player 12345   # single MLB person.id, for testing
//   npx tsx scripts/sync-mlb-player-gamelogs.ts --dry-run
//
// Required env vars:
//   DATABASE_URL — Neon Postgres connection string

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
const DELAY_MS = 200;

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");

const seasonIdx = args.indexOf("--season");
const SEASON = seasonIdx !== -1 ? args[seasonIdx + 1] : String(new Date().getFullYear());

const playerIdx = args.indexOf("--player");
const SINGLE_PERSON_ID = playerIdx !== -1 ? args[playerIdx + 1] : null;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SourceMapRow {
  playerid: string;
  source_player_id: string;
}

interface MlbGameLogSplit {
  date?: string;
  isHome?: boolean;
  team?: { id?: number; name?: string };
  opponent?: { id?: number; name?: string };
  game?: { gamePk?: number };
  stat?: Record<string, unknown>;
}

interface MlbStatsGroup {
  group?: { displayName?: string };
  splits?: MlbGameLogSplit[];
}

interface MlbStatsResponse {
  stats?: MlbStatsGroup[];
}

interface GameLogRow {
  playerid: string;
  sourceGameId: string;
  sourceTeamId: string | null;
  statType: "batting" | "pitching";
  gameDate: string;
  teamName: string | null;
  opponentName: string | null;
  homeAway: "home" | "away" | null;
  lineSummary: string;
  stats: Record<string, unknown>;
  rawPayload: MlbGameLogSplit;
}

// ---------------------------------------------------------------------------
// Database
// ---------------------------------------------------------------------------

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function getMappedPlayers(): Promise<SourceMapRow[]> {
  if (SINGLE_PERSON_ID) {
    const { rows } = await pool.query<SourceMapRow>(
      `SELECT playerid, source_player_id
         FROM public.player_source_map
        WHERE source = 'mlb_api' AND source_player_id = $1
          AND match_method IS DISTINCT FROM 'rejected_bad_identity_match'`,
      [SINGLE_PERSON_ID]
    );
    return rows;
  }

  const { rows } = await pool.query<SourceMapRow>(
    `SELECT playerid, source_player_id
       FROM public.player_source_map
      WHERE source = 'mlb_api'
        -- a link rejected as a different person (same name) never pulls games
        AND match_method IS DISTINCT FROM 'rejected_bad_identity_match'`
  );
  return rows;
}

async function upsertGameLogRow(row: GameLogRow): Promise<void> {
  await pool.query(
    `INSERT INTO public.player_game_logs (
       playerid, source, source_game_id, source_team_id, stat_type,
       game_date, game_status, team_name, opponent_name, home_away,
       line_summary, stats, raw_payload, updated_at
     )
     VALUES (
       $1, 'mlb_api', $2, $3, $4,
       $5, 'Final', $6, $7, $8,
       $9, $10::jsonb, $11::jsonb, NOW()
     )
     ON CONFLICT (playerid, source, source_game_id, stat_type) DO UPDATE SET
       source_team_id = EXCLUDED.source_team_id,
       game_date      = EXCLUDED.game_date,
       team_name      = EXCLUDED.team_name,
       opponent_name  = EXCLUDED.opponent_name,
       home_away      = EXCLUDED.home_away,
       line_summary   = EXCLUDED.line_summary,
       stats          = EXCLUDED.stats,
       raw_payload    = EXCLUDED.raw_payload,
       updated_at     = NOW()`,
    [
      row.playerid,
      row.sourceGameId,
      row.sourceTeamId,
      row.statType,
      row.gameDate,
      row.teamName,
      row.opponentName,
      row.homeAway,
      row.lineSummary,
      JSON.stringify(row.stats),
      JSON.stringify(row.rawPayload),
    ]
  );
}

// ---------------------------------------------------------------------------
// MLB API
// ---------------------------------------------------------------------------

async function fetchCurrentSportId(personId: string): Promise<number> {
  try {
    const res = await fetch(`${MLB_API_BASE}/people/${personId}?hydrate=currentTeam`);
    if (!res.ok) return 1;

    const data = await res.json();
    const teamId = data?.people?.[0]?.currentTeam?.id;
    if (!teamId) return 1;

    const teamRes = await fetch(`${MLB_API_BASE}/teams/${teamId}`);
    if (!teamRes.ok) return 1;

    const teamData = await teamRes.json();
    return teamData?.teams?.[0]?.sport?.id ?? 1;
  } catch {
    return 1;
  }
}

async function fetchGameLog(
  personId: string,
  sportId: number,
  group: "hitting" | "pitching"
): Promise<MlbGameLogSplit[]> {
  const url =
    `${MLB_API_BASE}/people/${personId}/stats` +
    `?stats=gameLog&group=${group}&season=${SEASON}&sportId=${sportId}`;

  try {
    const res = await fetch(url);
    if (!res.ok) return [];

    const data = (await res.json()) as MlbStatsResponse;
    const group0 = data.stats?.find((s) => s.splits?.length) ?? data.stats?.[0];
    return group0?.splits ?? [];
  } catch (err) {
    console.error(`fetchGameLog(${personId}, ${group}) error:`, err);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

function n(stat: Record<string, unknown>, key: string): number {
  const v = Number(stat[key]);
  return Number.isFinite(v) ? v : 0;
}

function battingLine(stat: Record<string, unknown>): string {
  const ab = stat.atBats ?? 0;
  const h = stat.hits ?? 0;
  const parts = [`${h}-${ab}`];

  const doubles = n(stat, "doubles");
  const triples = n(stat, "triples");
  const hr = n(stat, "homeRuns");
  const rbi = n(stat, "rbi");
  const runs = n(stat, "runs");
  const bb = n(stat, "baseOnBalls");
  const so = n(stat, "strikeOuts");
  const sb = n(stat, "stolenBases");

  if (doubles > 0) parts.push(`${doubles > 1 ? doubles : ""}2B`);
  if (triples > 0) parts.push(`${triples > 1 ? triples : ""}3B`);
  if (hr > 0) parts.push(`${hr > 1 ? hr : ""}HR`);
  if (rbi > 0) parts.push(`${rbi} RBI`);
  if (runs > 0) parts.push(`${runs} R`);
  if (bb > 0) parts.push(`${bb > 1 ? bb : ""}BB`);
  if (so > 0) parts.push(`${so}K`);
  if (sb > 0) parts.push(`${sb > 1 ? sb : ""}SB`);

  return parts.join(" | ");
}

function pitchingLine(stat: Record<string, unknown>): string {
  const ip = stat.inningsPitched ?? "0.0";
  const er = n(stat, "earnedRuns");
  const so = n(stat, "strikeOuts");
  const bb = n(stat, "baseOnBalls");

  const decision = n(stat, "wins") === 1
    ? "W"
    : n(stat, "losses") === 1
      ? "L"
      : n(stat, "saves") === 1
        ? "SV"
        : n(stat, "holds") === 1
          ? "H"
          : null;

  const parts = [`${ip} IP`, `${er} ER`, `${so} K`];
  if (bb > 0) parts.push(`${bb} BB`);
  if (decision) parts.push(`(${decision})`);

  return parts.join(", ");
}

function toGameLogRow(
  playerid: string,
  split: MlbGameLogSplit,
  statType: "batting" | "pitching"
): GameLogRow | null {
  const gameDate = String(split.date || "").trim();
  const gamePk = split.game?.gamePk;
  const stat = split.stat || {};

  if (!gameDate || !gamePk) return null;

  return {
    playerid,
    sourceGameId: String(gamePk),
    sourceTeamId: split.team?.id != null ? String(split.team.id) : null,
    statType,
    gameDate,
    teamName: split.team?.name ?? null,
    opponentName: split.opponent?.name ?? null,
    homeAway: split.isHome === true ? "home" : split.isHome === false ? "away" : null,
    lineSummary: statType === "batting" ? battingLine(stat) : pitchingLine(stat),
    stats: stat,
    rawPayload: split,
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("=== YAT?STATS MLB Player Game Log Sync ===");
  console.log(`Season: ${SEASON}`);
  console.log(`Mode:   ${dryRun ? "DRY RUN" : "LIVE"}`);
  if (SINGLE_PERSON_ID) console.log(`Player: ${SINGLE_PERSON_ID} only`);
  console.log("");

  let playersProcessed = 0;
  let rowsUpserted = 0;

  try {
    const players = await getMappedPlayers();
    console.log(`Found ${players.length} mlb_api-mapped players`);
    console.log("");

    for (const { playerid, source_player_id: personId } of players) {
      const sportId = await fetchCurrentSportId(personId);
      await delay(DELAY_MS);

      const [hitting, pitching] = await Promise.all([
        fetchGameLog(personId, sportId, "hitting"),
        fetchGameLog(personId, sportId, "pitching"),
      ]);
      await delay(DELAY_MS);

      const rows = [
        ...hitting.map((split) => toGameLogRow(playerid, split, "batting")),
        ...pitching.map((split) => toGameLogRow(playerid, split, "pitching")),
      ].filter((row): row is GameLogRow => row !== null);

      if (rows.length > 0) {
        console.log(`  playerid=${playerid} mlbId=${personId} sportId=${sportId} -> ${rows.length} games`);
      }

      if (!dryRun) {
        for (const row of rows) {
          await upsertGameLogRow(row);
          rowsUpserted++;
        }
      } else {
        rowsUpserted += rows.length;
      }

      playersProcessed++;
    }

    console.log("");
    console.log("=== MLB Player Game Log Sync Complete ===");
    console.log(`Players processed: ${playersProcessed}`);
    console.log(`Game log rows ${dryRun ? "would upsert" : "upserted"}: ${rowsUpserted}`);
  } catch (err) {
    console.error("ERROR during MLB player game log sync:", err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
