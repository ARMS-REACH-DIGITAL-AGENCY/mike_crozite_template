#!/usr/bin/env ts-node
// scripts/refresh-flip-card-front-stage-from-mlb.ts
// Updates fan-facing flip_card_front_stage from matched MLB roster resolution rows.
//
// Fan-facing SOP:
// - roster_type='active' owns current team, level, and roster status when present.
// - roster_type='40Man' is context only; it must not override active team/level.
// - A true MLB 40-man context row must come from the MLB parent club endpoint:
//   source_team_id = org_source_team_id.
// - roster_type='fullRoster' is fallback only, but it outranks 40-man fallback because IL/optioned minor-league assignments often live there.
// - If a player is active at a non-MLB level and also on the true MLB 40-man roster,
//   display level becomes e.g. TRIPLE-A (40-MAN), while level_label stays TRIPLE-A for filters.
// - Rehab/injured roster status overrides plain ACTIVE, but level remains the actual assigned level.

import { Pool } from "pg";

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error("ERROR: DATABASE_URL environment variable is not set.");
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function ensureStageColumns(): Promise<void> {
  // last_transaction_*/previous_*/team_affiliation_status are also declared
  // in scripts/apply-mlb-transaction-status.ts's own ensureStageColumns() -
  // duplicated here (all IF NOT EXISTS, so harmless either order) because
  // this script's own UPDATE queries reference stage.last_transaction_applied_at
  // directly. The two workflows run independently (mlb_roster-sync.yml at
  // minute 0, mlb-transactions-sync.yml at minute 10) and on a freshly
  // provisioned database the roster sync could run first; without this,
  // that first run would fail outright with "column does not exist" and
  // block every roster/card refresh until the other workflow happened to
  // run and create the column.
  await pool.query(`
    ALTER TABLE public.flip_card_front_stage
      ADD COLUMN IF NOT EXISTS current_team_name text,
      ADD COLUMN IF NOT EXISTS current_team_level text,
      ADD COLUMN IF NOT EXISTS current_teamid text,
      ADD COLUMN IF NOT EXISTS current_level_label text,
      ADD COLUMN IF NOT EXISTS current_team_source text,
      ADD COLUMN IF NOT EXISTS current_team_source_player_id text,
      ADD COLUMN IF NOT EXISTS current_team_source_team_id text,
      ADD COLUMN IF NOT EXISTS current_team_roster_status text,
      ADD COLUMN IF NOT EXISTS current_team_last_verified timestamptz,
      ADD COLUMN IF NOT EXISTS current_org_or_conference_name text,
      ADD COLUMN IF NOT EXISTS status_label text,
      ADD COLUMN IF NOT EXISTS level_label text,
      ADD COLUMN IF NOT EXISTS display_status_label text,
      ADD COLUMN IF NOT EXISTS display_level_label text,
      ADD COLUMN IF NOT EXISTS is_on_40man boolean,
      ADD COLUMN IF NOT EXISTS forty_man_org_name text,
      ADD COLUMN IF NOT EXISTS forty_man_org_abbr text,
      ADD COLUMN IF NOT EXISTS stage_updated_at timestamptz,
      ADD COLUMN IF NOT EXISTS current_team_absent_since timestamptz,
      ADD COLUMN IF NOT EXISTS team_affiliation_status text,
      ADD COLUMN IF NOT EXISTS last_transaction_type text,
      ADD COLUMN IF NOT EXISTS last_transaction_date date,
      ADD COLUMN IF NOT EXISTS last_transaction_team_name text,
      ADD COLUMN IF NOT EXISTS last_transaction_applied_at timestamptz,
      ADD COLUMN IF NOT EXISTS previous_team_name text,
      ADD COLUMN IF NOT EXISTS previous_org_or_conference_name text,
      ADD COLUMN IF NOT EXISTS previous_level_label text
  `);
}

// Where MLB itself says each linked player is right now.
//
// The roster pull's fullRoster listing is season-long: a player traded
// away (Jameson Taillon, Cubs -> Blue Jays) or retired (Casey Opitz, on
// the Voluntarily Retired List since July) still appears there as
// "Active", and whichever org's listing happened to be read last won.
// MLB's /people rosterEntries carry the real answer: the entry with no
// endDate is the player's current assignment; no open entry at all means
// he has left affiliated baseball.
type MlbCurrent = {
  mlb_id: string;
  team_id: string | null; // open roster entry's team
  status: string | null; // open roster entry's status ("Injured 15-Day")
  departed: "RETIRED" | "FREE AGENT" | null; // no open entry, last one says so
  departed_detail: string | null;
  departed_team_name: string | null;
};

type MlbRosterEntryInfo = {
  team?: { id?: number; name?: string };
  status?: { description?: string };
  startDate?: string;
  endDate?: string;
  statusDate?: string;
};

const MLB_API_BASE = "https://statsapi.mlb.com/api/v1";

function classifyDeparture(description: string | null | undefined): "RETIRED" | "FREE AGENT" | null {
  const text = (description ?? "").toLowerCase();
  if (text.includes("retired")) return "RETIRED";
  if (text.includes("released") || text.includes("declared free agency") || text === "free agent") {
    return "FREE AGENT";
  }
  return null;
}

// TBC-safe-ingest normally creates baseline cards first. MLB roster discovery can
// arrive before that twice-daily job, so this is a guarded fallback - not a
// "no match => create a card" rule.
//
// A card is eligible only when MLB has already resolved the roster identity to
// a YAT?STATS/TBC playerid, that playerid resolves through player_hsids to a
// real school, and no stage row exists. Before inserting we repeat the same
// identity guard used by tbc-safe-ingest: an existing TBC crosswalk or a
// same-name YAT-only card at the same school is quarantined instead of created.
// This closes the timing window where MLB could run before TBC had written the
// player_hsid_exclusion row.
//
// Every successful automatic baseline is stamped in source_notes so operations
// can notify Pete and audit exactly which cards were created automatically.
type MlbBaselineHeldPlayer = {
  tbc_playerid: string;
  hsid: string;
  name: string;
  reason: "crosswalk" | "same_name_yat_card";
  matched_playerid: string;
};

type MlbBaselineCreatedPlayer = {
  playerid: string;
  hsid: string;
  name: string;
};

async function ensureLatestMatchedPlayersInStage(): Promise<{
  created: number;
  eligible: number;
  createdPlayers: MlbBaselineCreatedPlayer[];
  held: MlbBaselineHeldPlayer[];
}> {
  const { rows } = await pool.query<{
    created: string;
    eligible: string;
    created_players: MlbBaselineCreatedPlayer[];
    held: MlbBaselineHeldPlayer[];
  }>(`
    WITH latest_completed_run AS (
      SELECT run_id
      FROM public.source_ingest_runs
      WHERE source = 'mlb_api'
        AND feed_name = 'mlb_full_org_roster'
        AND status = 'completed'
      ORDER BY completed_at DESC NULLS LAST, started_at DESC
      LIMIT 1
    ),
    matched AS MATERIALIZED (
      SELECT DISTINCT res.playerid::text AS playerid
      FROM public.mlb_org_roster_resolution res
      JOIN public.mlb_org_roster_raw raw ON raw.id = res.raw_id
      JOIN latest_completed_run lr ON lr.run_id = raw.run_id
      WHERE res.match_status = 'matched'
        AND res.playerid IS NOT NULL
    ),
    candidates AS MATERIALIZED (
      SELECT DISTINCT ON (m.playerid)
        m.playerid,
        ph.hsid::text AS hsid,
        p.firstname,
        p.lastname
      FROM matched m
      JOIN public.player_hsids ph ON ph.playerid::text = m.playerid
      LEFT JOIN public.tbc_players_raw p ON p.playerid::text = m.playerid
      LEFT JOIN public.flip_card_front_stage f ON f.playerid::text = m.playerid
      WHERE f.playerid IS NULL
        AND ph.hsid IS NOT NULL
      ORDER BY m.playerid, ph.hsid::text
    ),
    checked AS MATERIALIZED (
      SELECT c.*,
        (
          SELECT m.playerid
          FROM public.player_source_map m
          WHERE m.source = 'tbc'
            AND m.source_player_id = c.playerid::text
            AND COALESCE(m.match_method, '') <> 'rejected_bad_identity_match'
          LIMIT 1
        ) AS crosswalk_playerid,
        (
          SELECT e.playerid::text
          FROM public.flip_card_front_stage e
          WHERE e.hsid::text = c.hsid
            AND e.playerid::text <> c.playerid::text
            AND regexp_replace(lower(COALESCE(c.lastname, '')), '[^a-z]', '', 'g') <> ''
            AND regexp_replace(lower(COALESCE(e.first_name, '')), '[^a-z]', '', 'g')
              = regexp_replace(lower(COALESCE(c.firstname, '')), '[^a-z]', '', 'g')
            AND regexp_replace(lower(COALESCE(e.last_name, '')), '[^a-z]', '', 'g')
              = regexp_replace(lower(COALESCE(c.lastname, '')), '[^a-z]', '', 'g')
            AND NOT EXISTS (
              SELECT 1 FROM public.tbc_players_raw tt WHERE tt.playerid::text = e.playerid::text
            )
            AND NOT EXISTS (
              SELECT 1
              FROM public.player_source_map r
              WHERE r.source = 'tbc'
                AND r.source_player_id = c.playerid::text
                AND r.playerid = e.playerid::text
                AND r.match_method = 'rejected_bad_identity_match'
            )
          LIMIT 1
        ) AS yat_match_playerid
      FROM candidates c
    ),
    excluded AS (
      INSERT INTO public.player_hsid_exclusion (playerid, hsid, reason, source)
      SELECT
        playerid::text,
        hsid,
        'Held for identity review before MLB auto-baseline: ' ||
          CASE
            WHEN crosswalk_playerid IS NOT NULL THEN 'crosswalk names ' || crosswalk_playerid
            ELSE 'same name as ' || yat_match_playerid || ' at this school'
          END,
        'mlb_auto_baseline_identity_guard'
      FROM checked
      WHERE crosswalk_playerid IS NOT NULL
         OR yat_match_playerid IS NOT NULL
      ON CONFLICT DO NOTHING
      RETURNING playerid
    ),
    inserted AS (
      INSERT INTO public.flip_card_front_stage (
        playerid,
        hsid,
        display_name,
        first_name,
        last_name,
        source_notes,
        stage_updated_at
      )
      SELECT
        playerid,
        hsid,
        TRIM(COALESCE(firstname, '') || ' ' || COALESCE(lastname, '')),
        firstname,
        lastname,
        'AUTO_BASELINE:mlb_roster_sync',
        NOW()
      FROM checked
      WHERE crosswalk_playerid IS NULL
        AND yat_match_playerid IS NULL
      ON CONFLICT (playerid) DO NOTHING
      RETURNING playerid, hsid, display_name
    )
    SELECT
      (SELECT COUNT(*)::text FROM inserted) AS created,
      (SELECT COUNT(*)::text FROM candidates) AS eligible,
      COALESCE(
        (
          SELECT json_agg(json_build_object(
            'playerid', playerid::text,
            'hsid', hsid::text,
            'name', display_name
          ) ORDER BY hsid::text, display_name, playerid::text)
          FROM inserted
        ),
        '[]'::json
      ) AS created_players,
      COALESCE(
        (
          SELECT json_agg(json_build_object(
            'tbc_playerid', playerid::text,
            'hsid', hsid,
            'name', TRIM(COALESCE(firstname, '') || ' ' || COALESCE(lastname, '')),
            'reason', CASE
              WHEN crosswalk_playerid IS NOT NULL THEN 'crosswalk'
              ELSE 'same_name_yat_card'
            END,
            'matched_playerid', COALESCE(crosswalk_playerid, yat_match_playerid)
          ) ORDER BY hsid, lastname, firstname)
          FROM checked
          WHERE crosswalk_playerid IS NOT NULL
             OR yat_match_playerid IS NOT NULL
        ),
        '[]'::json
      ) AS held
  `);

  return {
    created: Number(rows[0]?.created ?? 0),
    eligible: Number(rows[0]?.eligible ?? 0),
    createdPlayers: rows[0]?.created_players ?? [],
    held: rows[0]?.held ?? [],
  };
}

// team_id_map is the canonical MLB Stats API id -> Baseball Cube teamid
// crosswalk used by the card/logo and game-log readers. Keep it current before
// writing the stage row. Exact-name additions are deliberately fail-closed;
// aliases below are limited to reviewed one-to-one renames. MLB's consolidated
// rookie clubs that correspond to two TBC split squads remain unresolved rather
// than receiving a fabricated teamid.
async function ensureCurrentProTeamMappings(): Promise<{
  exactInserted: number;
  aliasInserted: number;
  unresolved: { mlb_id: string; team_name: string; level: string | null }[];
}> {
  const exact = await pool.query(`
    WITH latest_completed_run AS (
      SELECT run_id
      FROM public.source_ingest_runs
      WHERE source = 'mlb_api'
        AND feed_name = 'mlb_full_org_roster'
        AND status = 'completed'
      ORDER BY completed_at DESC NULLS LAST, started_at DESC
      LIMIT 1
    ),
    current_teams AS MATERIALIZED (
      SELECT DISTINCT
        raw.source_team_id::int AS mlb_id,
        raw.source_team_name AS team_name
      FROM public.mlb_org_roster_resolution res
      JOIN public.mlb_org_roster_raw raw ON raw.id = res.raw_id
      JOIN latest_completed_run lr ON lr.run_id = raw.run_id
      WHERE res.match_status = 'matched'
        AND res.playerid IS NOT NULL
        AND raw.source_team_id IS NOT NULL
        AND NULLIF(BTRIM(raw.source_team_name), '') IS NOT NULL
    ),
    mapping_references AS (
      SELECT LOWER(BTRIM(current_team)) AS team_key, teamid::text AS tbc_teamid
      FROM public."150-pro_team_look_up_tbc_mlb"
      WHERE NULLIF(BTRIM(current_team), '') IS NOT NULL
        AND NULLIF(BTRIM(teamid), '') IS NOT NULL
      UNION ALL
      SELECT LOWER(BTRIM(teamname)) AS team_key, teamid::text AS tbc_teamid
      FROM public.tbc_pro_teams_map_raw
      WHERE NULLIF(BTRIM(teamname), '') IS NOT NULL
        AND NULLIF(BTRIM(teamid), '') IS NOT NULL
    ),
    unique_reference AS (
      SELECT team_key, MIN(tbc_teamid) AS tbc_teamid
      FROM mapping_references
      GROUP BY team_key
      HAVING COUNT(DISTINCT tbc_teamid) = 1
    ),
    candidates AS (
      SELECT ct.mlb_id, ct.team_name, ur.tbc_teamid
      FROM current_teams ct
      JOIN unique_reference ur ON ur.team_key = LOWER(BTRIM(ct.team_name))
      WHERE NOT EXISTS (
        SELECT 1 FROM public.team_id_map m WHERE m.mlb_stats_api_id = ct.mlb_id
      )
        AND NOT EXISTS (
          SELECT 1 FROM public.team_id_map m WHERE m.tbc_teamid = ur.tbc_teamid
        )
    )
    INSERT INTO public.team_id_map (
      tbc_teamid, team_name, mlb_stats_api_id, source, updated_at
    )
    SELECT tbc_teamid, team_name, mlb_id, 'mlb_roster_exact_name', NOW()
    FROM candidates
    ON CONFLICT (tbc_teamid) DO NOTHING
    RETURNING tbc_teamid
  `);

  const aliases = await pool.query(`
    WITH aliases(mlb_id, tbc_teamid, team_name) AS (
      VALUES
        (1991, '14130'::text, 'ACL D-backs'::text),
        (5374, '14134'::text, 'ACL Guardians'::text)
    ),
    eligible AS (
      SELECT a.*
      FROM aliases a
      WHERE EXISTS (
        SELECT 1
        FROM public.mlb_org_roster_raw raw
        WHERE raw.source_team_id::text = a.mlb_id::text
          AND LOWER(BTRIM(raw.source_team_name)) = LOWER(BTRIM(a.team_name))
      )
        AND NOT EXISTS (
          SELECT 1 FROM public.team_id_map m WHERE m.mlb_stats_api_id = a.mlb_id
        )
        AND NOT EXISTS (
          SELECT 1 FROM public.team_id_map m WHERE m.tbc_teamid = a.tbc_teamid
        )
    )
    INSERT INTO public.team_id_map (
      tbc_teamid, team_name, mlb_stats_api_id, source, updated_at
    )
    SELECT tbc_teamid, team_name, mlb_id, 'mlb_roster_verified_alias', NOW()
    FROM eligible
    ON CONFLICT (tbc_teamid) DO NOTHING
    RETURNING tbc_teamid
  `);

  const gaps = await pool.query<{ mlb_id: string; team_name: string; level: string | null }>(`
    WITH latest_completed_run AS (
      SELECT run_id
      FROM public.source_ingest_runs
      WHERE source = 'mlb_api'
        AND feed_name = 'mlb_full_org_roster'
        AND status = 'completed'
      ORDER BY completed_at DESC NULLS LAST, started_at DESC
      LIMIT 1
    ),
    current_teams AS (
      SELECT DISTINCT
        raw.source_team_id::text AS mlb_id,
        raw.source_team_name AS team_name,
        raw.level
      FROM public.mlb_org_roster_resolution res
      JOIN public.mlb_org_roster_raw raw ON raw.id = res.raw_id
      JOIN latest_completed_run lr ON lr.run_id = raw.run_id
      WHERE res.match_status = 'matched'
        AND res.playerid IS NOT NULL
        AND raw.source_team_id IS NOT NULL
        AND NULLIF(BTRIM(raw.source_team_name), '') IS NOT NULL
    )
    SELECT ct.mlb_id, ct.team_name, MIN(ct.level) AS level
    FROM current_teams ct
    LEFT JOIN public.team_id_map m
      ON m.mlb_stats_api_id::text = ct.mlb_id
    WHERE m.mlb_stats_api_id IS NULL
    GROUP BY ct.mlb_id, ct.team_name
    ORDER BY MIN(ct.level), ct.team_name
  `);

  return {
    exactInserted: exact.rowCount ?? 0,
    aliasInserted: aliases.rowCount ?? 0,
    unresolved: gaps.rows,
  };
}


// Backfill every existing MLB-owned stage row from the canonical team map.
// The roster refresh only touches players present in the newest source run;
// mappings can be added later, so older rows otherwise stay null/stale forever.
// This pass is safe because it keys on MLB's stable source_team_id and only
// writes the authoritative TBC team id plus a missing organization label.
async function backfillMappedCurrentTeamIdentity(): Promise<{
  teamIds: number;
  orgs: number;
}> {
  const teamIds = await pool.query(`
    WITH mapped AS (
      SELECT f.ctid, m.tbc_teamid::text AS tbc_teamid
      FROM public.flip_card_front_stage f
      JOIN public.team_id_map m
        ON m.mlb_stats_api_id::text = f.current_team_source_team_id::text
      WHERE f.current_team_source = 'mlb_api'
        AND NULLIF(BTRIM(f.current_team_source_team_id::text), '') IS NOT NULL
    )
    UPDATE public.flip_card_front_stage f
       SET current_teamid = mapped.tbc_teamid,
           stage_updated_at = NOW()
      FROM mapped
     WHERE f.ctid = mapped.ctid
       AND f.current_teamid IS DISTINCT FROM mapped.tbc_teamid
  `);

  const orgs = await pool.query(`
    WITH org_ref AS (
      SELECT
        m.mlb_stats_api_id::text AS mlb_id,
        NULLIF(BTRIM(MAX(l.organization)), '') AS organization
      FROM public.team_id_map m
      LEFT JOIN public."150-pro_team_look_up_tbc_mlb" l
        ON l.teamid::text = m.tbc_teamid::text
      GROUP BY m.mlb_stats_api_id
    )
    UPDATE public.flip_card_front_stage f
       SET current_org_or_conference_name = org_ref.organization,
           stage_updated_at = NOW()
      FROM org_ref
     WHERE f.current_team_source = 'mlb_api'
       AND f.current_team_source_team_id::text = org_ref.mlb_id
       AND NULLIF(BTRIM(f.current_org_or_conference_name), '') IS NULL
       AND org_ref.organization IS NOT NULL
  `);

  return {
    teamIds: teamIds.rowCount ?? 0,
    orgs: orgs.rowCount ?? 0,
  };
}

// Everyone matched in the latest roster run, plus every card whose team
// still comes from this pipeline - a player who has dropped off every
// roster (retired, released) isn't in the run but his card still shows
// his old team until MLB's roster entries say where he went.
async function linkedMlbIds(): Promise<string[]> {
  const { rows } = await pool.query<{ source_player_id: string }>(`
    SELECT current_team_source_player_id::text AS source_player_id
      FROM public.flip_card_front_stage
     WHERE current_team_source = 'mlb_api'
       AND NULLIF(TRIM(current_team_source_player_id::text), '') IS NOT NULL
    UNION
    SELECT DISTINCT raw.source_player_id::text AS source_player_id
      FROM public.mlb_org_roster_resolution res
      JOIN public.mlb_org_roster_raw raw ON raw.id = res.raw_id
     WHERE res.match_status = 'matched'
       AND res.playerid IS NOT NULL
       AND raw.run_id = (
         SELECT run_id FROM public.source_ingest_runs
          WHERE source = 'mlb_api' AND feed_name = 'mlb_full_org_roster' AND status = 'completed'
          ORDER BY completed_at DESC NULLS LAST, started_at DESC
          LIMIT 1
       )
  `);
  return rows.map((r) => r.source_player_id);
}

// Best effort: a failed batch just leaves those players on the roster-only
// logic below, exactly as before.
async function fetchMlbCurrent(ids: string[]): Promise<MlbCurrent[]> {
  const out: MlbCurrent[] = [];
  for (let i = 0; i < ids.length; i += 100) {
    const batch = ids.slice(i, i + 100);
    try {
      const res = await fetch(
        `${MLB_API_BASE}/people?personIds=${batch.join(",")}&hydrate=rosterEntries`
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as {
        people?: { id: number; rosterEntries?: MlbRosterEntryInfo[] }[];
      };
      for (const person of data.people ?? []) {
        const entries = person.rosterEntries ?? [];
        const when = (e: MlbRosterEntryInfo) => e.statusDate || e.endDate || e.startDate || "";
        const open = entries
          .filter((e) => !e.endDate)
          .sort((a, b) => when(b).localeCompare(when(a)))[0];
        if (open) {
          out.push({
            mlb_id: String(person.id),
            team_id: open.team?.id != null ? String(open.team.id) : null,
            status: open.status?.description ?? null,
            departed: null,
            departed_detail: null,
            departed_team_name: null,
          });
          continue;
        }
        const last = [...entries].sort((a, b) => when(b).localeCompare(when(a)))[0];
        out.push({
          mlb_id: String(person.id),
          team_id: null,
          status: null,
          departed: classifyDeparture(last?.status?.description),
          departed_detail: last?.status?.description ?? null,
          departed_team_name: last?.team?.name ?? null,
        });
      }
    } catch (err) {
      console.error(`  MLB /people batch starting ${batch[0]} failed:`, err);
    }
  }
  return out;
}

async function refreshStage(mlbCurrent: MlbCurrent[]): Promise<number> {
  const result = await pool.query(`
    WITH mlb_current AS (
      SELECT *
        FROM jsonb_to_recordset($1::jsonb) AS x(
          mlb_id text, team_id text, status text, departed text,
          departed_detail text, departed_team_name text
        )
    ),
    latest_completed_run AS (
      SELECT run_id
      FROM public.source_ingest_runs
      WHERE source = 'mlb_api'
        AND feed_name = 'mlb_full_org_roster'
        AND status = 'completed'
      ORDER BY completed_at DESC NULLS LAST, started_at DESC
      LIMIT 1
    ),
    matched_rows AS (
      SELECT
        res.playerid,
        raw.source_player_id,
        raw.source_player_name,
        raw.source_team_id,
        raw.source_team_name,
        raw.org_source_team_id,
        raw.level,
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
          ELSE UPPER(COALESCE(raw.level, ''))
        END AS normalized_level,
        COALESCE(CASE WHEN raw.source_team_id::text = mc.team_id THEN mc.status END, raw.roster_status) AS roster_status,
        (mc.team_id IS NOT NULL AND raw.source_team_id::text = mc.team_id) AS at_current_team,
        CASE
          -- Departures first: the '%IL%' test below also matches the "il"
          -- in "Voluntarily Retired List".
          WHEN UPPER(COALESCE(COALESCE(CASE WHEN raw.source_team_id::text = mc.team_id THEN mc.status END, raw.roster_status), '')) LIKE '%RETIRED%' THEN 'RETIRED'
          WHEN UPPER(COALESCE(COALESCE(CASE WHEN raw.source_team_id::text = mc.team_id THEN mc.status END, raw.roster_status), '')) LIKE '%RELEASED%' THEN 'FREE AGENT'
          WHEN UPPER(COALESCE(COALESCE(CASE WHEN raw.source_team_id::text = mc.team_id THEN mc.status END, raw.roster_status), '')) = 'FREE AGENT' THEN 'FREE AGENT'
          WHEN UPPER(COALESCE(COALESCE(CASE WHEN raw.source_team_id::text = mc.team_id THEN mc.status END, raw.roster_status), '')) LIKE '%DEVELOPMENT%' THEN 'DEVELOPMENT LIST'
          WHEN UPPER(COALESCE(COALESCE(CASE WHEN raw.source_team_id::text = mc.team_id THEN mc.status END, raw.roster_status), '')) LIKE '%DESIGNATED%' THEN 'DFA'
          WHEN UPPER(COALESCE(COALESCE(CASE WHEN raw.source_team_id::text = mc.team_id THEN mc.status END, raw.roster_status), '')) LIKE '%REHAB%' THEN 'REHAB ASSIGNMENT'
          WHEN UPPER(COALESCE(COALESCE(CASE WHEN raw.source_team_id::text = mc.team_id THEN mc.status END, raw.roster_status), '')) LIKE '%OPTION%' THEN 'OPTIONED'
          -- "Forty Man" is a tag, not a status: a 40-man player can be
          -- active, injured, optioned... (is_on_40man carries the tag). A row
          -- that only says "Forty Man" tells us nothing about his status, so
          -- his other roster rows decide it (see chosen_truth).
          WHEN UPPER(TRIM(COALESCE(COALESCE(CASE WHEN raw.source_team_id::text = mc.team_id THEN mc.status END, raw.roster_status), ''))) = 'FORTY MAN' THEN NULL
          -- Every other status MLB gives a player in its organization is a
          -- status of ours, under MLB's own name (Injured 15-Day, Paternity
          -- List, Military Leave, Restricted List, Reassigned to Minors...).
          WHEN UPPER(TRIM(COALESCE(COALESCE(CASE WHEN raw.source_team_id::text = mc.team_id THEN mc.status END, raw.roster_status), ''))) NOT IN ('', 'ACTIVE') THEN UPPER(TRIM(COALESCE(CASE WHEN raw.source_team_id::text = mc.team_id THEN mc.status END, raw.roster_status)))
          ELSE 'ACTIVE'
        END AS normalized_status,
        raw.roster_type,
        raw.org_name,
        raw.org_abbr,
        raw.seen_at,
        raw.updated_at,
        raw.id AS raw_id,
        (
          LOWER(COALESCE(raw.roster_type, '')) = '40man'
          AND raw.source_team_id::text = raw.org_source_team_id::text
        ) AS is_true_mlb_40man_row
      FROM public.mlb_org_roster_resolution res
      JOIN public.mlb_org_roster_raw raw
        ON raw.id = res.raw_id
      JOIN latest_completed_run lr
        ON lr.run_id = raw.run_id
      LEFT JOIN mlb_current mc
        ON mc.mlb_id = raw.source_player_id::text
      WHERE res.match_status = 'matched'
        AND res.playerid IS NOT NULL
        -- Left affiliated baseball per MLB (no open roster entry); his
        -- stale season-long listings must not resurrect him.
        -- applyDepartures() handles these.
        AND mc.departed IS NULL
    ),
    active_truth AS (
      SELECT DISTINCT ON (playerid)
        *
      FROM matched_rows
      WHERE LOWER(COALESCE(roster_type, '')) = 'active'
      ORDER BY playerid, at_current_team DESC, seen_at DESC NULLS LAST, updated_at DESC NULLS LAST, raw_id DESC
    ),
    forty_man_context AS (
      SELECT DISTINCT ON (playerid)
        playerid,
        true AS is_on_40man,
        org_name AS forty_man_org_name,
        org_abbr AS forty_man_org_abbr
      FROM matched_rows
      WHERE is_true_mlb_40man_row IS TRUE
      ORDER BY playerid, at_current_team DESC, seen_at DESC NULLS LAST, updated_at DESC NULLS LAST, raw_id DESC
    ),
    -- A row whose only status is "Forty Man" is the 40-man TAG (usually a
    -- Triple-A or Double-A player the club can call up), not where he plays
    -- or how: it never sets his team, level or status. In season his
    -- affiliate's full roster does ("Active", AAA); a 40-man player on the
    -- IL stays on the 40-man with a real "Injured ..." status. In the
    -- offseason the affiliate rosters are empty, so a tag-only player keeps
    -- his last real team, level and status (not "MLB / ACTIVE").
    full_roster_truth AS (
      SELECT DISTINCT ON (playerid)
        *
      FROM matched_rows
      WHERE LOWER(COALESCE(roster_type, '')) = 'fullroster'
        AND UPPER(TRIM(COALESCE(roster_status, ''))) <> 'FORTY MAN'
      ORDER BY
        playerid,
        -- The org MLB says he's with now beats a season-long listing at
        -- an org he has left.
        at_current_team DESC,
        CASE
          -- Affiliate fullRoster rows carry the actual assignment for optioned/IL minor leaguers.
          -- Parent-club fullRoster rows can still describe 40-man context, so keep them behind
          -- non-MLB assigned teams when both rows are present for the same player.
          WHEN normalized_level IS NOT NULL
           AND normalized_level <> ''
           AND normalized_level <> 'MLB' THEN 1
          ELSE 2
        END,
        seen_at DESC NULLS LAST,
        updated_at DESC NULLS LAST,
        raw_id DESC
    ),
    forty_man_fallback_truth AS (
      SELECT DISTINCT ON (playerid)
        *
      FROM matched_rows
      WHERE is_true_mlb_40man_row IS TRUE
        AND UPPER(TRIM(COALESCE(roster_status, ''))) <> 'FORTY MAN'
      ORDER BY playerid, seen_at DESC NULLS LAST, updated_at DESC NULLS LAST, raw_id DESC
    ),
    player_universe AS (
      SELECT playerid FROM active_truth
      UNION
      SELECT playerid FROM full_roster_truth
      UNION
      SELECT playerid FROM forty_man_fallback_truth
      -- (forty_man_context alone - the tag with no real roster row - doesn't
      -- put a player in this update: his card keeps its last real values.)
    ),
    chosen_truth AS (
      SELECT
        u.playerid,
        COALESCE(a.source_player_id, fr.source_player_id, ff.source_player_id) AS source_player_id,
        COALESCE(a.source_player_name, fr.source_player_name, ff.source_player_name) AS source_player_name,
        COALESCE(a.source_team_id, fr.source_team_id, ff.source_team_id) AS source_team_id,
        COALESCE(a.source_team_name, fr.source_team_name, ff.source_team_name) AS source_team_name,
        COALESCE(a.level, fr.level, ff.level) AS raw_level,
        COALESCE(a.normalized_level, fr.normalized_level, ff.normalized_level) AS normalized_level,
        COALESCE(a.roster_status, fr.roster_status, ff.roster_status) AS roster_status,
        -- No default: with no real status on any roster row (only the
        -- 40-man tag), the card keeps the status it has (see the UPDATE).
        COALESCE(a.normalized_status, fr.normalized_status, ff.normalized_status) AS normalized_status,
        COALESCE(a.roster_type, fr.roster_type, ff.roster_type) AS chosen_roster_type,
        COALESCE(a.org_name, fr.org_name, ff.org_name) AS org_name,
        COALESCE(a.org_abbr, fr.org_abbr, ff.org_abbr) AS org_abbr,
        COALESCE(a.seen_at, fr.seen_at, ff.seen_at, a.updated_at, fr.updated_at, ff.updated_at, NOW()) AS verified_at,
        COALESCE(fm.is_on_40man, false) AS is_on_40man,
        fm.forty_man_org_name,
        fm.forty_man_org_abbr
      FROM player_universe u
      LEFT JOIN active_truth a
        ON a.playerid = u.playerid
      LEFT JOIN full_roster_truth fr
        ON fr.playerid = u.playerid
      LEFT JOIN forty_man_fallback_truth ff
        ON ff.playerid = u.playerid
      LEFT JOIN forty_man_context fm
        ON fm.playerid = u.playerid
    ),
    display_truth AS (
      SELECT
        *,
        CASE
          WHEN normalized_level IS NULL OR normalized_level = '' THEN NULL
          WHEN normalized_level <> 'MLB' AND is_on_40man IS TRUE THEN normalized_level || ' (40-MAN)'
          ELSE normalized_level
        END AS display_level,
        normalized_status AS display_status
      FROM chosen_truth
    ),
    -- A team's organization (MiLB affiliate -> its MLB club, college ->
    -- its conference), from the hand-maintained teamid_universe_mapping,
    -- by exact team name. A name that maps to more than one org is left
    -- out rather than guessed.
    team_org AS (
      SELECT LOWER(TRIM(current_team_name)) AS team_key,
             MIN(current_org_or_conference_name) AS org_name
        FROM public.teamid_universe_mapping
       WHERE COALESCE(TRIM(current_org_or_conference_name), '') <> ''
       GROUP BY 1
      HAVING COUNT(DISTINCT current_org_or_conference_name) = 1
    )
    UPDATE public.flip_card_front_stage stage
       -- Being matched on a live roster this run is normally proof he's
       -- back, so this whole block resurrects current_team_name/level and
       -- clears any FREE AGENT/RETIRED state — EXCEPT when the row is
       -- owned by the transactions pipeline (last_transaction_applied_at
       -- IS NOT NULL). That ownership is permanent here: an earlier
       -- version tried to let a "fresher" roster poll override it, but
       -- display_truth.verified_at only proves we polled again, not that
       -- the player's actual roster membership changed — MLB's roster
       -- listing can keep showing a released player for a while, so a
       -- stale-but-current poll would falsely win every time and silently
       -- resurrect him. A transaction-owned row can only be cleared by
       -- real evidence: a newer, different transaction record showing the
       -- player is no longer departed
       -- (scripts/apply-mlb-transaction-status.ts's own self-healing,
       -- clearStaleDepartureFlags). Until then this roster pipeline
       -- leaves current_team_name/current_org_or_conference_name/etc.
       -- alone (they were already nulled out there in favor of
       -- previous_team_name/previous_org_or_conference_name).
       SET current_team_name = CASE
             WHEN stage.last_transaction_applied_at IS NULL
             THEN display_truth.source_team_name
             ELSE stage.current_team_name
           END,
           current_team_level = CASE
             WHEN stage.last_transaction_applied_at IS NULL
             THEN display_truth.normalized_level
             ELSE stage.current_team_level
           END,
           current_team_source = CASE
             WHEN stage.last_transaction_applied_at IS NULL
             THEN 'mlb_api'
             ELSE stage.current_team_source
           END,
           current_team_source_player_id = CASE
             WHEN stage.last_transaction_applied_at IS NULL
             THEN display_truth.source_player_id
             ELSE stage.current_team_source_player_id
           END,
           current_team_source_team_id = CASE
             WHEN stage.last_transaction_applied_at IS NULL
             THEN display_truth.source_team_id
             ELSE stage.current_team_source_team_id
           END,
           current_teamid = CASE
             WHEN stage.last_transaction_applied_at IS NOT NULL THEN stage.current_teamid
             WHEN team_map.tbc_teamid IS NOT NULL THEN team_map.tbc_teamid
             WHEN stage.current_team_name IS DISTINCT FROM display_truth.source_team_name THEN NULL
             ELSE stage.current_teamid
           END,
           current_team_roster_status = CASE
             WHEN stage.last_transaction_applied_at IS NULL
             THEN display_truth.roster_status
             ELSE stage.current_team_roster_status
           END,
           current_team_last_verified = CASE
             WHEN stage.last_transaction_applied_at IS NULL
             THEN display_truth.verified_at
             ELSE stage.current_team_last_verified
           END,
           -- org_name is carried on every org-wide MLB roster row and is the
           -- parent MLB organization for both major- and minor-league teams.
           -- Prefer that sourced value, then the 40-man context and our team
           -- directory. Never preserve an old org across an actual team move.
           current_org_or_conference_name = CASE
             WHEN stage.last_transaction_applied_at IS NOT NULL THEN stage.current_org_or_conference_name
             WHEN NULLIF(BTRIM(display_truth.org_name), '') IS NOT NULL THEN display_truth.org_name
             WHEN display_truth.is_on_40man IS TRUE THEN display_truth.forty_man_org_name
             WHEN team_org.org_name IS NOT NULL THEN team_org.org_name
             WHEN stage.current_team_name IS DISTINCT FROM display_truth.source_team_name THEN NULL
             ELSE stage.current_org_or_conference_name
           END,
           current_level_label = CASE
             WHEN stage.last_transaction_applied_at IS NULL
             THEN display_truth.normalized_level
             ELSE stage.current_level_label
           END,
           level_label = CASE
             WHEN stage.last_transaction_applied_at IS NULL
             THEN display_truth.normalized_level
             ELSE stage.level_label
           END,
           display_level_label = CASE
             WHEN stage.last_transaction_applied_at IS NULL
             THEN display_truth.display_level
             ELSE stage.display_level_label
           END,
           is_on_40man = CASE
             WHEN stage.last_transaction_applied_at IS NULL
             THEN display_truth.is_on_40man
             ELSE stage.is_on_40man
           END,
           forty_man_org_name = CASE
             WHEN stage.last_transaction_applied_at IS NULL
             THEN display_truth.forty_man_org_name
             ELSE stage.forty_man_org_name
           END,
           forty_man_org_abbr = CASE
             WHEN stage.last_transaction_applied_at IS NULL
             THEN display_truth.forty_man_org_abbr
             ELSE stage.forty_man_org_abbr
           END,
           status_label = CASE
             WHEN stage.last_transaction_applied_at IS NULL
             THEN COALESCE(display_truth.normalized_status, stage.status_label)
             ELSE stage.status_label
           END,
           display_status_label = CASE
             WHEN stage.last_transaction_applied_at IS NULL
             THEN COALESCE(display_truth.display_status, stage.display_status_label)
             ELSE stage.display_status_label
           END,
           -- Only clears a legacy team_affiliation_status value (from the
           -- untracked external process this table also receives writes
           -- from) back to NULL when this row isn't transaction-owned.
           team_affiliation_status = CASE
             WHEN stage.last_transaction_applied_at IS NULL
             THEN NULL
             ELSE stage.team_affiliation_status
           END,
           current_team_absent_since = NULL,
           stage_updated_at = NOW()
      FROM display_truth
      LEFT JOIN team_org ON team_org.team_key = LOWER(TRIM(display_truth.source_team_name))
      LEFT JOIN public.team_id_map team_map
        ON team_map.mlb_stats_api_id::text = display_truth.source_team_id::text
     WHERE stage.playerid::text = display_truth.playerid::text
  `, [JSON.stringify(mlbCurrent)]);

  return result.rowCount ?? 0;
}

// The daily full-schedule ingest owns schedule acquisition. The 3-hour roster
// sync owns card readiness. Once roster truth changes, immediately attach the
// best game already present in team_schedules so a newly discovered player
// does not wait for the next daily schedule run. Use MLB numeric team IDs,
// which stay authoritative across display-name aliases and rebrands.
async function refreshLoadedNextGames(): Promise<number> {
  const result = await pool.query(`
    WITH eligible_players AS (
      SELECT f.ctid AS row_id, f.current_team_source_team_id
      FROM public.flip_card_front_stage f
      WHERE f.current_team_source = 'mlb_api'
        AND f.current_team_source_team_id ~ '^[0-9]+$'
        AND LOWER(TRIM(COALESCE(f.status_label, ''))) NOT IN ('retired', 'not active', 'free agent')
        AND UPPER(TRIM(COALESCE(f.level_label, ''))) IN (
          'MLB','AAA','TRIPLE-A','AA','DOUBLE-A','HIGH-A','A+','A','LOW-A','SINGLE-A','ROOKIE','ACL','FCL'
        )
    ),
    resolved_next_games AS (
      SELECT ep.row_id, ng.game_time_utc, ng.schedule_status, ng.home_away, ng.opponent
      FROM eligible_players ep
      JOIN LATERAL (
        SELECT
          ts.game_time_utc,
          ts.status AS schedule_status,
          CASE WHEN ts.away_team_id::text = ep.current_team_source_team_id THEN '@' ELSE 'vs.' END AS home_away,
          CASE WHEN ts.away_team_id::text = ep.current_team_source_team_id THEN ts.home_team_name ELSE ts.away_team_name END AS opponent,
          CASE
            WHEN LOWER(TRIM(COALESCE(ts.status, ''))) = 'in progress' THEN 1
            WHEN LOWER(TRIM(COALESCE(ts.status, ''))) = 'pre-game' THEN 2
            WHEN LOWER(TRIM(COALESCE(ts.status, ''))) IN ('delayed','warmup','manager challenge','review') THEN 3
            WHEN LOWER(TRIM(COALESCE(ts.status, ''))) = 'scheduled' THEN 4
            ELSE 9
          END AS status_priority
        FROM public.team_schedules ts
        WHERE ep.current_team_source_team_id IN (ts.home_team_id::text, ts.away_team_id::text)
          AND LOWER(TRIM(COALESCE(ts.status, ''))) NOT IN ('final','game over','completed early','not necessary')
          AND (
            LOWER(TRIM(COALESCE(ts.status, ''))) IN ('pre-game','in progress','delayed','warmup','manager challenge','review')
            OR (LOWER(TRIM(COALESCE(ts.status, ''))) = 'scheduled' AND ts.game_time_utc > NOW())
          )
        ORDER BY status_priority, ts.game_time_utc
        LIMIT 1
      ) ng ON TRUE
    )
    UPDATE public.flip_card_front_stage f
       SET next_game_date = CASE
             WHEN (rng.game_time_utc AT TIME ZONE COALESCE(f.school_timezone, 'America/Phoenix'))::date =
                  (NOW() AT TIME ZONE COALESCE(f.school_timezone, 'America/Phoenix'))::date
             THEN 'TODAY | ' || TO_CHAR(rng.game_time_utc AT TIME ZONE COALESCE(f.school_timezone, 'America/Phoenix'), 'FMMonth DD, YYYY')
             ELSE TO_CHAR(rng.game_time_utc AT TIME ZONE COALESCE(f.school_timezone, 'America/Phoenix'), 'FMDay | FMMonth DD, YYYY')
           END,
           next_game_time_local = TO_CHAR(
             rng.game_time_utc AT TIME ZONE COALESCE(f.school_timezone, 'America/Phoenix'),
             'FMHH12:MI AM'
           ),
           next_game_time_utc = rng.game_time_utc,
           next_game_home_away = rng.home_away,
           next_game_opponent = rng.opponent,
           next_game_status_label = CASE
             WHEN LOWER(TRIM(COALESCE(rng.schedule_status, ''))) = 'scheduled' THEN 'NEXT GAME'
             ELSE rng.schedule_status
           END,
           stage_updated_at = NOW()
      FROM resolved_next_games rng
     WHERE f.ctid = rng.row_id
  `);
  return result.rowCount ?? 0;
}

// A linked player MLB shows with no open roster entry, whose last entry
// was a retirement or release: same card shape as a sourced departure in
// scripts/apply-mlb-transaction-status.ts (status + previous_* team, no
// current team, off the 40-man). It deliberately doesn't set the
// last_transaction_* fields - those belong to the transactions pipeline,
// whose self-healing would clear them - and skips rows that pipeline
// already owns. Only touches rows whose team came from the MLB roster
// pipeline, and only players on no active or 40-man roster this run.
async function applyDepartures(mlbCurrent: MlbCurrent[]): Promise<number> {
  const departed = mlbCurrent.filter((m) => m.departed);
  if (departed.length === 0) return 0;

  const result = await pool.query(
    `WITH departed AS (
       SELECT *
         FROM jsonb_to_recordset($1::jsonb) AS x(
           mlb_id text, departed text, departed_detail text, departed_team_name text
         )
     ),
     latest_completed_run AS (
       SELECT run_id FROM public.source_ingest_runs
        WHERE source = 'mlb_api' AND feed_name = 'mlb_full_org_roster' AND status = 'completed'
        ORDER BY completed_at DESC NULLS LAST, started_at DESC
        LIMIT 1
     ),
     -- Keyed on the MLB id the card's current team came from, so it also
     -- reaches players who have dropped off every roster.
     player_departures AS (
       SELECT stage.playerid::text AS playerid,
              d.departed,
              d.departed_team_name
         FROM public.flip_card_front_stage stage
         JOIN departed d ON d.mlb_id = stage.current_team_source_player_id::text
        WHERE NOT EXISTS (
          SELECT 1
            FROM public.mlb_org_roster_resolution res
            JOIN public.mlb_org_roster_raw raw ON raw.id = res.raw_id
            JOIN latest_completed_run lr ON lr.run_id = raw.run_id
           WHERE res.match_status = 'matched'
             AND res.playerid::text = stage.playerid::text
             AND LOWER(COALESCE(raw.roster_type, '')) IN ('active', '40man')
        )
     )
     UPDATE public.flip_card_front_stage stage
        SET status_label = pd.departed,
            display_status_label = pd.departed,
            team_affiliation_status = pd.departed,
            previous_team_name = CASE
              WHEN stage.current_team_name IS NOT NULL THEN COALESCE(pd.departed_team_name, stage.current_team_name)
              ELSE stage.previous_team_name
            END,
            previous_org_or_conference_name = CASE
              WHEN stage.current_team_name IS NOT NULL THEN stage.current_org_or_conference_name
              ELSE stage.previous_org_or_conference_name
            END,
            previous_level_label = CASE
              WHEN stage.current_team_name IS NOT NULL THEN stage.level_label
              ELSE stage.previous_level_label
            END,
            current_team_name = NULL,
            current_org_or_conference_name = NULL,
            is_on_40man = false,
            forty_man_org_name = NULL,
            forty_man_org_abbr = NULL,
            next_game_date = NULL,
            next_game_time_local = NULL,
            next_game_time_utc = NULL,
            next_game_home_away = NULL,
            next_game_opponent = NULL,
            next_game_status_label = NULL,
            stage_updated_at = NOW()
       FROM player_departures pd
      WHERE stage.playerid::text = pd.playerid
        AND stage.current_team_source = 'mlb_api'
        AND stage.last_transaction_applied_at IS NULL
        AND (
          stage.status_label IS DISTINCT FROM pd.departed
          OR stage.current_team_name IS NOT NULL
        )`,
    [JSON.stringify(departed)]
  );

  return result.rowCount ?? 0;
}

// Roster-exit detection (the Kingery-class bug fix).
//
// refreshStage() above only ever UPDATEs rows for players who matched in
// *this* run's org-wide pull — a player who's dropped off every one of
// the 30 orgs' rosters (released, DFA'd off the 40-man with no outright,
// retired, etc.) simply has no row in display_truth, so the join is a
// structural no-op and his card silently freezes at the last team
// written. This function is the other half: it notices absence.
//
// A single missed run is not proof of departure (a transient MLB API
// hiccup, or mid-transaction limbo, can cause a one-off miss). We track
// two consecutive 3-hourly misses (~3h elapsed since the first miss, ~6h
// since he was actually last confirmed present) via current_team_absent_since
// as the clock, purely for internal bookkeeping/logging.
//
// Deliberately does NOT invent a status for this. There is no real MLB
// playing status for "we polled the roster API and didn't see him" — the
// only real statuses are ACTIVE, FREE AGENT, and RETIRED, and this
// function has no evidence for any of those. Rather than show fans a
// made-up label like "UNCONFIRMED", a confirmed absence with no matching
// sourced transaction just leaves status_label/display_status_label/
// team_affiliation_status untouched — the card keeps showing his last
// known real status until scripts/apply-mlb-transaction-status.ts finds
// an actual dated MLB transaction record, or he reappears on a roster.
async function flagRosterAbsences(): Promise<{
  reappeared: number;
  firstMiss: number;
  confirmedAbsent: number;
}> {
  const result = await pool.query<{
    reappeared_count: string;
    first_miss_count: string;
    confirmed_absent_count: string;
  }>(`
    WITH latest_completed_run AS (
      SELECT run_id
      FROM public.source_ingest_runs
      WHERE source = 'mlb_api'
        AND feed_name = 'mlb_full_org_roster'
        AND status = 'completed'
      ORDER BY completed_at DESC NULLS LAST, started_at DESC
      LIMIT 1
    ),
    matched_playerids AS (
      SELECT DISTINCT res.playerid
      FROM public.mlb_org_roster_resolution res
      JOIN public.mlb_org_roster_raw raw
        ON raw.id = res.raw_id
      JOIN latest_completed_run lr
        ON lr.run_id = raw.run_id
      WHERE res.match_status = 'matched'
        AND res.playerid IS NOT NULL
    ),
    reappeared AS (
      UPDATE public.flip_card_front_stage stage
         SET current_team_absent_since = NULL
       WHERE stage.current_team_source = 'mlb_api'
         AND stage.current_team_absent_since IS NOT NULL
         AND stage.playerid::text IN (SELECT playerid FROM matched_playerids)
      RETURNING stage.playerid
    ),
    first_miss AS (
      UPDATE public.flip_card_front_stage stage
         SET current_team_absent_since = NOW()
       WHERE stage.current_team_source = 'mlb_api'
         AND stage.current_team_absent_since IS NULL
         AND stage.playerid::text NOT IN (SELECT playerid FROM matched_playerids)
         -- Don't start the absence clock for a player who already has a
         -- sourced departure fact from apply-mlb-transaction-status.ts.
         -- last_transaction_applied_at (not the status value) is the
         -- ownership marker: 'RETIRED'/'FREE AGENT' are also set by an
         -- untracked, unrelated process elsewhere in this table, and
         -- checking the value alone would misfire against those rows too.
         AND stage.last_transaction_applied_at IS NULL
      RETURNING stage.playerid
    ),
    confirmed_absent AS (
      -- Logging/diagnostic count only — deliberately not an UPDATE. There
      -- is no real status to set here (see comment above): a confirmed
      -- absence with no sourced transaction record just leaves the
      -- player's existing status_label alone. This threshold (just past
      -- one 3h cycle from the first miss, so it fires on the second
      -- consecutive miss) is only used to report how many players are in
      -- this state, so it's visible operationally even though nothing in
      -- the table changes for them.
      SELECT stage.playerid
      FROM public.flip_card_front_stage stage
      WHERE stage.current_team_source = 'mlb_api'
        AND stage.current_team_absent_since IS NOT NULL
        AND stage.current_team_absent_since <= NOW() - INTERVAL '2 hours 45 minutes'
        AND stage.playerid::text NOT IN (SELECT playerid FROM matched_playerids)
        AND stage.last_transaction_applied_at IS NULL
    )
    SELECT
      (SELECT count(*) FROM reappeared) AS reappeared_count,
      (SELECT count(*) FROM first_miss) AS first_miss_count,
      (SELECT count(*) FROM confirmed_absent) AS confirmed_absent_count
  `);

  const row = result.rows[0];
  return {
    reappeared: Number(row?.reappeared_count ?? 0),
    firstMiss: Number(row?.first_miss_count ?? 0),
    confirmedAbsent: Number(row?.confirmed_absent_count ?? 0),
  };
}

async function main() {
  console.log("=== Refresh flip_card_front_stage from MLB roster resolution ===");

  try {
    await ensureStageColumns();

    const baseline = await ensureLatestMatchedPlayersInStage();
    const mappings = await ensureCurrentProTeamMappings();
    console.log(
      `MLB stage baseline: ${baseline.created} new rows from ${baseline.eligible} currently missing matched cards; ` +
        `${baseline.held.length} held for identity review`
    );
    if (baseline.createdPlayers.length > 0) {
      console.log("AUTO_FLIP_CARD_CREATED " + JSON.stringify({
        source: "mlb_roster_sync",
        count: baseline.createdPlayers.length,
        players: baseline.createdPlayers,
      }));
    }
    if (baseline.held.length > 0) {
      console.warn("AUTO_FLIP_CARD_HELD " + JSON.stringify({
        source: "mlb_roster_sync",
        count: baseline.held.length,
        players: baseline.held,
      }));
    }
    console.log(
      `Team-id mapping refresh: ${mappings.exactInserted} exact additions, ${mappings.aliasInserted} verified aliases, ` +
        `${mappings.unresolved.length} current source teams still unresolved`
    );
    for (const gap of mappings.unresolved) {
      console.log(`  unresolved team map: MLB ${gap.mlb_id} ${gap.team_name} [${gap.level ?? "unknown"}]`);
    }

    const matchedIds = await linkedMlbIds();
    const mlbCurrent = await fetchMlbCurrent(matchedIds);
    console.log(
      `MLB current assignments: ${mlbCurrent.filter((m) => m.team_id).length} open, ` +
        `${mlbCurrent.filter((m) => m.departed).length} departed, of ${matchedIds.length} linked players`
    );

    const updated = await refreshStage(mlbCurrent);
    const backfill = await backfillMappedCurrentTeamIdentity();
    const departed = await applyDepartures(mlbCurrent);
    const scheduled = await refreshLoadedNextGames();
    const absences = await flagRosterAbsences();

    console.log(`Updated flip_card_front_stage rows: ${updated}`);
    console.log(
      `Canonical MLB team backfill: ${backfill.teamIds} team ids, ${backfill.orgs} organization labels`
    );
    console.log(`Departed (retired/released per MLB roster entries): ${departed}`);
    console.log(`Loaded next-game assignments refreshed by MLB team ID: ${scheduled}`);
    console.log(
      `Roster-absence pass: ${absences.reappeared} reappeared (clock cleared), ` +
        `${absences.firstMiss} first miss (clock started), ` +
        `${absences.confirmedAbsent} confirmed absent 2h45m+, no sourced transaction yet (status left unchanged)`
    );
    console.log("Refresh complete.");
  } catch (err) {
    console.error("ERROR refreshing flip_card_front_stage:", err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
