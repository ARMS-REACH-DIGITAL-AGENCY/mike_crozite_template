#!/usr/bin/env ts-node
// scripts/apply-mlb-transaction-status.ts
// YAT?STATS — Apply MLB Transaction Status to Flip Cards
//
// Pipeline responsibility:
//   player_transactions (populated by scripts/sync-mlb-transactions.ts)
//     -> public.flip_card_front_stage (last_transaction_* columns + team_affiliation_status)
//
// For each player, looks at their single most recent transaction (by
// effective_date). If that transaction is a *terminal* departure event
// (Released, Declared Free Agency, Retired), records the specific sourced
// fact on their flip card and marks them with the real playing-status the
// rest of the app already uses — 'FREE AGENT' or 'RETIRED' — not a made-up
// generic label. There is no third bucket: every player is either ACTIVE,
// a FREE AGENT, or RETIRED.
//
// Deliberately NOT treated as departure on their own: "Designated for
// Assignment" and "Outright Assignment" / "Outrighted". Both are
// transitional — a DFA'd player is very often outrighted back to a
// full-season minor-league roster and stays within the organization
// (this is exactly what happened to Scott Kingery on 2026-04-24/04-27,
// months before his actual release on 2026-07-19). Treating either as a
// departure signal on its own would produce false positives. Only the
// terminal outcome — Released / Declared Free Agency / Retired — is
// trusted here. Everything else is left to the roster-presence pipeline
// (scripts/refresh-flip-card-front-stage-from-mlb.ts) to resolve.
//
// NOTE: "Signed as Free Agent" is MLB's typeDesc for a player being HIRED
// (a free agent gets signed) — the opposite of a departure. A naive
// substring match on "free agent" wrongly catches it; classifyDeparture()
// below matches on "declared free agency" specifically to avoid this.
//
// Usage:
//   npx tsx scripts/apply-mlb-transaction-status.ts
//   npx tsx scripts/apply-mlb-transaction-status.ts --dry-run

import { Pool } from "pg";

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error("ERROR: DATABASE_URL environment variable is not set.");
  process.exit(1);
}

const dryRun = process.argv.slice(2).includes("--dry-run");

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

type DepartureStatus = "FREE AGENT" | "RETIRED";

// Terminal, non-ambiguous departure signals, matched case-insensitively
// against MLB's own typeDesc strings (see scripts/sync-mlb-transactions.ts),
// classified into the real statuses the app already displays and filters
// by (see the baseline list in src/app/[hsid]/layout.tsx). Deliberately
// does NOT match on the bare substring "free agent" — that also appears
// in "Signed as Free Agent", which is an arrival, not a departure.
function classifyDeparture(transactionType: string | null): DepartureStatus | null {
  if (!transactionType) return null;
  const normalized = transactionType.toLowerCase();
  if (normalized.includes("retired")) return "RETIRED";
  if (normalized.includes("released") || normalized.includes("declared free agency")) {
    return "FREE AGENT";
  }
  return null;
}

// This player's own flip_card_front_stage.level_label can be stale at the
// moment of departure: the roster-sync pipeline processes each org's
// affiliates as separate API calls, and a player who's just been released
// from his actual (often minor-league) team can still linger for a run or
// two on the parent MLB club's own full-roster listing before that catches
// up too — so the LAST successful match before he vanishes from all
// rosters entirely can be that stale MLB-level straggler, not his real
// last level (confirmed live for Scott Kingery: level_label froze at
// 'MLB' even though his actual last team, Iowa Cubs, is Triple-A).
// Look up the level from this player's own most recent roster snapshot
// specifically at the team that released him — a precise, per-player,
// per-team fact — rather than trusting the row's own possibly-drifted
// level_label.
async function lookupLevelForPlayerAtTeam(
  playerid: string,
  teamName: string | null
): Promise<string | null> {
  if (!teamName) return null;
  const { rows } = await pool.query<{ normalized_level: string | null }>(
    `SELECT
       CASE UPPER(COALESCE(raw.level, ''))
         WHEN 'MLB' THEN 'MLB'
         WHEN 'AAA' THEN 'TRIPLE-A'
         WHEN 'TRIPLE-A' THEN 'TRIPLE-A'
         WHEN 'AA' THEN 'DOUBLE-A'
         WHEN 'DOUBLE-A' THEN 'DOUBLE-A'
         WHEN 'HIGH-A' THEN 'HIGH-A'
         WHEN 'SINGLE-A' THEN 'SINGLE-A'
         WHEN 'LOW-A' THEN 'SINGLE-A'
         WHEN 'A' THEN 'SINGLE-A'
         WHEN 'ROOKIE' THEN 'ROOKIE'
         ELSE NULLIF(UPPER(COALESCE(raw.level, '')), '')
       END AS normalized_level
     FROM public.mlb_org_roster_raw raw
     JOIN public.mlb_org_roster_resolution res ON res.raw_id = raw.id
     WHERE res.playerid = $1
       AND raw.source_team_name = $2
     ORDER BY raw.seen_at DESC NULLS LAST
     LIMIT 1`,
    [playerid, teamName]
  );
  return rows[0]?.normalized_level ?? null;
}

async function ensureStageColumns(): Promise<void> {
  // previous_*/team_affiliation_status are also declared in
  // refresh-flip-card-front-stage-from-mlb.ts's own ensureStageColumns()
  // (all IF NOT EXISTS, harmless either order) — this script's own UPDATE
  // references previous_team_name/previous_org_or_conference_name/
  // previous_level_label directly, and the two workflows are
  // independently dispatchable, so this script needs to be able to
  // create its own columns rather than depend on the other one having
  // run first.
  await pool.query(`
    ALTER TABLE public.flip_card_front_stage
      ADD COLUMN IF NOT EXISTS last_transaction_type text,
      ADD COLUMN IF NOT EXISTS last_transaction_date date,
      ADD COLUMN IF NOT EXISTS last_transaction_team_name text,
      ADD COLUMN IF NOT EXISTS last_transaction_applied_at timestamptz,
      ADD COLUMN IF NOT EXISTS team_affiliation_status text,
      ADD COLUMN IF NOT EXISTS previous_teamid text,
      ADD COLUMN IF NOT EXISTS previous_team_name text,
      ADD COLUMN IF NOT EXISTS previous_org_or_conference_name text,
      ADD COLUMN IF NOT EXISTS previous_level_label text,
      ADD COLUMN IF NOT EXISTS highest_level_label text,
      ADD COLUMN IF NOT EXISTS highest_level_checked_at timestamptz
  `);
}

interface LatestTransactionRow {
  playerid: string;
  transaction_type: string | null;
  from_team_name: string | null;
  to_team_name: string | null;
  effective_date: string | null;
  mlb_person_id: string | null;
}

async function getLatestTransactionPerPlayer(): Promise<LatestTransactionRow[]> {
  const { rows } = await pool.query<LatestTransactionRow>(`
    SELECT DISTINCT ON (playerid)
      playerid,
      transaction_type,
      from_team_name,
      to_team_name,
      effective_date::text AS effective_date,
      payload#>>'{person,id}' AS mlb_person_id
    FROM public.player_transactions
    WHERE source='mlb_api'
    ORDER BY playerid, effective_date DESC NULLS LAST, created_at DESC
  `);
  return rows;
}

async function applyDepartureFact(row: LatestTransactionRow, status: DepartureStatus): Promise<void> {
  // The team that actioned a departure-type transaction is recorded as
  // from_team_name (e.g. "Iowa Cubs released SS Scott Kingery" ->
  // fromTeam = Iowa Cubs). Fall back to to_team_name defensively in case
  // a future MLB typeDesc we're matching on populates the team on the
  // other side.
  const teamName = row.from_team_name ?? row.to_team_name ?? null;
  const resolvedLevel = await lookupLevelForPlayerAtTeam(row.playerid, teamName);

  await pool.query(
    `UPDATE public.flip_card_front_stage
        SET last_transaction_type = $2,
            last_transaction_date = $3::date,
            last_transaction_team_name = $4,
            -- Only advance the watermark when the underlying fact actually
            -- changed (or is being recorded for the first time). Bumping it
            -- to NOW() on every run — even a no-op re-application of the
            -- same departure — would make it perpetually "fresher" than any
            -- roster observation, permanently defeating the freshness guard
            -- in refresh-flip-card-front-stage-from-mlb.ts that lets a
            -- genuinely newer roster reappearance clear a stale status.
            last_transaction_applied_at = CASE
              WHEN last_transaction_applied_at IS NULL
                OR last_transaction_type IS DISTINCT FROM $2
                OR last_transaction_date IS DISTINCT FROM $3::date
                OR last_transaction_team_name IS DISTINCT FROM $4
                OR status_label IS DISTINCT FROM $5
              THEN NOW()
              ELSE last_transaction_applied_at
            END,
            team_affiliation_status = $5,
            status_label = $5,
            display_status_label = $5,
            highest_level_label = CASE
              WHEN $5 = 'RETIRED' AND highest_level_checked_at IS NULL
              THEN public.compute_player_highest_level(playerid::text)
              ELSE highest_level_label
            END,
            highest_level_checked_at = CASE
              WHEN $5 = 'RETIRED' AND highest_level_checked_at IS NULL
              THEN NOW()
              ELSE highest_level_checked_at
            END,
            -- Preserve the departing MLB team's identity without copying
            -- the organization of a different, stale roster assignment.
            -- Never overwrite an earlier verified previous-team value with NULL.
            previous_team_name = COALESCE($4, current_team_name, previous_team_name),
            previous_teamid = CASE
              WHEN current_team_name IS NOT DISTINCT FROM $4
                OR (current_team_name IS NULL AND current_teamid IS NOT NULL
                  AND EXISTS (SELECT 1 FROM public.teamid_universe_mapping m
                    WHERE m.teamid = current_teamid
                      AND m.current_team_name IS NOT DISTINCT FROM $4))
              THEN COALESCE(current_teamid, previous_teamid)
              ELSE previous_teamid
            END,
            previous_org_or_conference_name = CASE
              WHEN current_team_name IS NOT DISTINCT FROM $4
                OR (current_team_name IS NULL AND current_teamid IS NOT NULL
                  AND EXISTS (SELECT 1 FROM public.teamid_universe_mapping m
                    WHERE m.teamid = current_teamid
                      AND m.current_team_name IS NOT DISTINCT FROM $4))
              THEN COALESCE(current_org_or_conference_name,
                (SELECT m.current_org_or_conference_name
                 FROM public.teamid_universe_mapping m WHERE m.teamid=current_teamid),
                previous_org_or_conference_name)
              ELSE previous_org_or_conference_name
            END,
            previous_level_label = COALESCE($6, level_label, previous_level_label),
            -- level_label/display_level_label are what PlayerCardFront's
            -- visible LEVEL chip actually reads (not previous_level_label,
            -- which nothing displays) — deliberately NOT nulled like
            -- current_team_name (matching the existing retired-player
            -- convention, where level_label stays populated), but
            -- corrected in place to the reliable per-team lookup when one
            -- was found, since the row's existing value can be stale (see
            -- lookupLevelForPlayerAtTeam's comment).
            level_label = COALESCE($6, level_label),
            display_level_label = COALESCE($6, display_level_label),
            current_teamid = NULL,
            current_team_name = NULL,
            current_org_or_conference_name = NULL,
            current_team_level = NULL,
            current_level_label = NULL,
            current_team_source = NULL,
            current_team_source_player_id = NULL,
            current_team_source_team_id = NULL,
            current_team_roster_status = NULL,
            current_team_last_verified = NULL,
            current_team_absent_since = COALESCE(current_team_absent_since, $3::timestamptz),
            -- A departed player can't still be on the 40-man roster.
            -- Without this, PlayerCardFront's 40-MAN chip (which takes
            -- priority over the RELEASED note) would keep claiming a
            -- released/retired player is on the 40-man indefinitely,
            -- since refresh-flip-card-front-stage-from-mlb.ts now freezes
            -- is_on_40man/forty_man_org_* for any transaction-owned row.
            is_on_40man = false,
            forty_man_org_name = NULL,
            forty_man_org_abbr = NULL,
            stage_updated_at = NOW(),
            updated_at = NOW()
      WHERE playerid::text = $1
        AND NOT EXISTS (SELECT 1 FROM public.player_team_override manual WHERE manual.playerid = $1)
        AND (EXISTS (SELECT 1 FROM public.player_source_map s
                     WHERE s.playerid = $1 AND s.source = 'mlb_api'
                       AND s.source_player_id = $7 AND s.is_verified = TRUE)
             OR EXISTS (SELECT 1 FROM public.mlb_org_roster_resolution r
                        WHERE r.playerid = $1 AND r.source_player_id = $7
                          AND r.match_status = 'matched'))
        AND (last_transaction_type IS DISTINCT FROM $2
             OR last_transaction_date IS DISTINCT FROM $3::date
             OR last_transaction_team_name IS DISTINCT FROM $4
             OR status_label IS DISTINCT FROM $5
             OR team_affiliation_status IS DISTINCT FROM $5
             OR current_team_name IS NOT NULL OR current_teamid IS NOT NULL
             OR current_team_source IS NOT NULL OR is_on_40man IS TRUE)`,
    [row.playerid, row.transaction_type, row.effective_date, teamName, status, resolvedLevel, row.mlb_person_id]
  );
}

// Self-healing: a player previously marked FREE AGENT/RETIRED by this script whose
// *latest* transaction is no longer a departure type (e.g. he signed
// again, and MLB's transactions feed now shows "Signed"/"Assigned" as
// the most recent record) should have that flag cleared. Without this,
// a comeback signing would stay stuck showing "Released" forever, the
// same class of bug this whole pipeline exists to fix.
async function clearStaleDepartureFlags(
  nonDepartures: LatestTransactionRow[]
): Promise<number> {
  if (nonDepartures.length === 0) return 0;

  const playerIds = nonDepartures.map((row) => row.playerid);

  // Clearing status_label/display_status_label back to NULL rather than
  // guessing a replacement — this script only knows he's no longer
  // departed, not what he actually is now (ACTIVE, INJURED, etc.). The
  // roster-presence pipeline (refresh-flip-card-front-stage-from-mlb.ts)
  // will fill in the real value the next time it finds him on a roster.
  //
  // Scoped by `last_transaction_applied_at IS NOT NULL` — proof this row's
  // FREE AGENT/RETIRED status was set by *this* pipeline — rather than by
  // status value. 'RETIRED' and 'FREE AGENT' are also set by an untracked,
  // separate process (confirmed live: rows with those status_label values
  // and last_transaction_applied_at IS NULL); matching on status alone
  // would clear facts this script never wrote.
  const result = await pool.query(
    `UPDATE public.flip_card_front_stage
        SET last_transaction_type = NULL,
            last_transaction_date = NULL,
            last_transaction_team_name = NULL,
            last_transaction_applied_at = NULL,
            team_affiliation_status = NULL,
            status_label = NULL,
            display_status_label = NULL,
            -- A new signing clears a stale departure status, not historical
            -- team identity or the player's verified career-high level.
            stage_updated_at = NOW(),
            updated_at = NOW()
      WHERE playerid::text = ANY($1::text[])
        AND last_transaction_applied_at IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM public.player_team_override manual WHERE manual.playerid = flip_card_front_stage.playerid::text)`,
    [playerIds]
  );

  return result.rowCount ?? 0;
}


// Repair legacy transaction-owned departures whose team name was already
// cleared while a stale current_teamid survived. This is a single write-time
// batch, never a fan-facing query. It never infers a new player status or
// alters MLB/TBC crosswalk identities.
async function reconcileStaleTransactionDepartureTeamIds(): Promise<number> {
  const result = await pool.query(`
    WITH eligible AS MATERIALIZED (
      SELECT f.playerid, f.current_teamid,
             m.current_team_name AS mapped_team,
             m.current_org_or_conference_name AS mapped_org,
             m.level_label AS mapped_level
      FROM public.flip_card_front_stage f
      JOIN public.teamid_universe_mapping m ON m.teamid=f.current_teamid
      WHERE f.status_label='FREE AGENT'
        AND f.team_affiliation_status='FREE AGENT'
        AND f.last_transaction_applied_at IS NOT NULL
        AND f.last_transaction_date IS NOT NULL
        AND f.last_transaction_type IS NOT NULL
        AND f.current_teamid IS NOT NULL
        AND f.current_team_name IS NULL
        AND f.previous_teamid IS NULL
        AND f.previous_team_name IS NOT NULL
        AND f.previous_team_name = m.current_team_name
        AND f.last_transaction_team_name = m.current_team_name
        AND NOT EXISTS (
          SELECT 1 FROM public.player_team_override o WHERE o.playerid=f.playerid
        )
        AND EXISTS (
          SELECT 1 FROM public.player_transactions t
          WHERE t.playerid=f.playerid
            AND t.source='mlb_api'
            AND t.transaction_type=f.last_transaction_type
            AND t.effective_date::date=f.last_transaction_date
        )
        AND NOT EXISTS (
          SELECT 1 FROM public.player_transactions newer
          WHERE newer.playerid=f.playerid
            AND newer.source='mlb_api'
            AND newer.effective_date::date>f.last_transaction_date
        )
    ),
    changed AS (
      UPDATE public.flip_card_front_stage f SET
        previous_teamid=e.current_teamid,
        previous_org_or_conference_name=COALESCE(
          f.previous_org_or_conference_name,e.mapped_org),
        previous_level_label=COALESCE(f.previous_level_label,e.mapped_level),
        current_teamid=NULL,
        current_team_source=NULL,
        current_team_source_player_id=NULL,
        current_team_source_team_id=NULL,
        current_team_roster_status=NULL,
        current_team_last_verified=NULL,
        current_team_level=NULL,
        current_level_label=NULL,
        current_team_absent_since=NULL,
        current_org_or_conference_name=NULL,
        next_game_date=NULL,
        next_game_time_local=NULL,
        next_game_time_utc=NULL,
        next_game_home_away=NULL,
        next_game_opponent=NULL,
        next_game_status_label=NULL,
        is_on_40man=FALSE,
        forty_man_org_name=NULL,
        forty_man_org_abbr=NULL,
        source_summary=COALESCE(f.source_summary,'{}'::jsonb)||
          jsonb_build_object('stale_departure_teamid_repair',
            jsonb_build_object('source','mlb_transaction_canonical_last_team',
              'former_teamid',e.current_teamid,
              'former_team_name',e.mapped_team,
              'status_preserved',TRUE,
              'applied_at',NOW())),
        updated_at=NOW(),
        stage_updated_at=NOW()
      FROM eligible e
      WHERE f.playerid=e.playerid
        AND f.status_label='FREE AGENT'
        AND f.team_affiliation_status='FREE AGENT'
        AND f.current_teamid=e.current_teamid
        AND f.current_team_name IS NULL
        AND f.previous_teamid IS NULL
        AND f.last_transaction_applied_at IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM public.player_team_override o WHERE o.playerid=f.playerid
        )
      RETURNING f.playerid
    )
    SELECT COUNT(*)::int AS recovered FROM changed
  `);
  return Number(result.rows[0]?.recovered ?? 0);
}

async function retireStaleFreeAgents(): Promise<number> {
  // Owner rule: a sourced FREE AGENT remains in Active Alumni for one year.
  // If no newer MLB transaction has changed that status by then, treat the
  // player as retired. The next real signing/assignment transaction still
  // wins: clearStaleDepartureFlags() clears this transaction-owned status
  // before this aging pass can see it.
  const result = await pool.query(
    `UPDATE public.flip_card_front_stage stage
        SET team_affiliation_status = 'RETIRED',
            status_label = 'RETIRED',
            display_status_label = 'RETIRED',
            highest_level_label = CASE
              WHEN stage.highest_level_checked_at IS NULL
              THEN public.compute_player_highest_level(stage.playerid::text)
              ELSE stage.highest_level_label
            END,
            highest_level_checked_at = COALESCE(stage.highest_level_checked_at, NOW()),
            stage_updated_at = NOW()
      WHERE UPPER(TRIM(COALESCE(stage.team_affiliation_status, stage.status_label, ''))) = 'FREE AGENT'
        AND stage.last_transaction_applied_at IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM public.player_team_override manual WHERE manual.playerid = stage.playerid::text)
        AND stage.last_transaction_date IS NOT NULL
        AND stage.last_transaction_date <= CURRENT_DATE - INTERVAL '1 year'
        AND NOT EXISTS (
          SELECT 1
          FROM public.player_transactions newer
          WHERE newer.playerid::text = stage.playerid::text
            AND newer.source = 'mlb_api'
            AND newer.effective_date::date > stage.last_transaction_date
        )`
  );
  return result.rowCount ?? 0;
}

async function main() {
  console.log("=== Apply MLB Transaction Status to Flip Cards ===");
  console.log(`Mode: ${dryRun ? "DRY RUN" : "LIVE"}`);
  console.log("");

  try {
    if (!dryRun) {
      await ensureStageColumns();
    }

    const latestTransactions = await getLatestTransactionPerPlayer();
    console.log(`Loaded latest transaction for ${latestTransactions.length} players`);

    const classified = latestTransactions.map((row) => ({
      row,
      status: classifyDeparture(row.transaction_type),
    }));
    const departures = classified.filter((c) => c.status !== null) as {
      row: LatestTransactionRow;
      status: DepartureStatus;
    }[];
    const nonDepartures = classified
      .filter((c) => c.status === null)
      .map((c) => c.row);
    console.log(`Departure-type latest transactions: ${departures.length}`);

    let applied = 0;

    for (const { row, status } of departures) {
      if (dryRun) {
        console.log(
          `  [DRY RUN] Would mark ${status}: playerid=${row.playerid} type="${row.transaction_type}" date=${row.effective_date} team=${row.from_team_name ?? row.to_team_name ?? "?"}`
        );
        applied++;
        continue;
      }

      await applyDepartureFact(row, status);
      applied++;
    }

    let cleared = 0;
    let agedOut = 0;
    let staleTeamIdsRecovered = 0;
    if (!dryRun) {
      cleared = await clearStaleDepartureFlags(nonDepartures);
      staleTeamIdsRecovered = await reconcileStaleTransactionDepartureTeamIds();
      agedOut = await retireStaleFreeAgents();
    }

    console.log("");
    console.log("=== Complete ===");
    console.log(`Flip cards updated: ${dryRun ? 0 : applied} (would update: ${applied})`);
    console.log(`Stale FREE AGENT/RETIRED flags cleared (player active again per latest transaction): ${cleared}`);
    console.log(`Legacy departed TeamIDs preserved and cleared from current assignment: ${staleTeamIdsRecovered}`);
    console.log(`FREE AGENT rows aged to RETIRED after one year with no newer MLB transaction: ${agedOut}`);
  } catch (err) {
    console.error("ERROR applying MLB transaction status:", err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
