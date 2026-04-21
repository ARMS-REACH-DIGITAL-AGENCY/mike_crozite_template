// src/lib/db.ts
// YAT?STATS — Database helpers
// Connects to Neon Postgres via DATABASE_URL env var.
// All player data is sourced from TheBaseballCube tables.
//
// Key tables:
//   tbc_players_raw              — player identity, position, bats/throws, height/weight, highlevel
//   tbc_batting_raw             — historical season batting stats archive
//   tbc_pitching_raw            — historical season pitching stats archive
//   tbc_batting_2026_season_raw — live 2026 batting season stats
//   tbc_pitching_2026_season_raw— live 2026 pitching season stats
//   player_hsids                — links playerid -> hsid (high school)
//   tbc_schools_raw             — high school info (hsid, hsname, colors, nickname) — NOT pro/college teams
//   school_success              — per-school metadata (rank, counts, staging/microsite URLs, colors)
//   teams                       — team_id → team_name lookup; populated via scripts/import-teams.ts
//
// "Active" = player has batting or pitching stats from 2026
// "All-time" = all players ever tagged to a school in player_hsids

'use server';
import { Pool, QueryResult, QueryResultRow } from 'pg';
import 'server-only';

const pool = new Pool({
  connectionString: process.env.PLAYERS_DATABASE_URL || process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 15000,
  ssl: { rejectUnauthorized: false },
});

// Generic query helper
export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: any[] = []
): Promise<QueryResult<T>> {
  try {
    return await pool.query<T>(text, params);
  } catch (error) {
    console.error('Database query error:', error);
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Normalize host/URL input -> { hostOnly, httpsUrl }
// ---------------------------------------------------------------------------
function normalizeHostOrUrl(input: string) {
  const raw = (input || '').trim();
  if (!raw) return { hostOnly: '', httpsUrl: '' };

  const withProto = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  let host = '';

  try {
    const u = new URL(withProto);
    host = (u.hostname || '').toLowerCase();
  } catch {
    host = raw
      .replace(/^https?:\/\//i, '')
      .split('/')[0]
      .split('?')[0]
      .split('#')[0]
      .split(':')[0]
      .toLowerCase();
  }

  const hostOnly = host;
  const httpsUrl = hostOnly ? `https://${hostOnly}` : '';
  return { hostOnly, httpsUrl };
}

// ---------------------------------------------------------------------------
// SINGLE PLAYER — full player identity for profile page
// Falls back to flip_card_front_stage for YAT-only players not in TBC.
// ---------------------------------------------------------------------------
export async function getPlayerById(playerId: string): Promise<any | null> {
  const sql = `
    with tbc_player as (
      select
        tp.playerid::text as playerid,
        tp.firstname as firstname,
        tp.lastname as lastname,
        trim(coalesce(tp.firstname, '') || ' ' || coalesce(tp.lastname, '')) as display_name,
        tp.highlevel as career_highlevel,
        tp.ht as height,
        tp.wt as weight,
        tp.bats,
        tp.throws,
        tp.posit as position,
        null::text as hsid,
        null::text as class_of,
        null::text[] as roster_years,
        null::text as status_label,
        null::text as level_label,
        null::text as current_team_name,
        null::text as current_org_or_conference_name,
        'tbc_players_raw'::text as identity_source
      from tbc_players_raw tp
      where tp.playerid::text = $1
      limit 1
    ),
    stage_player as (
      select
        f.playerid::text as playerid,
        f.first_name as firstname,
        f.last_name as lastname,
        coalesce(
          nullif(f.display_name, ''),
          trim(coalesce(f.first_name, '') || ' ' || coalesce(f.last_name, ''))
        ) as display_name,
        null::text as career_highlevel,
        null::text as height,
        null::text as weight,
        null::text as bats,
        null::text as throws,
        f.position,
        f.hsid::text as hsid,
        f.class_of::text as class_of,
        f.roster_years,
        f.status_label,
        f.level_label,
        f.current_team_name,
        f.current_org_or_conference_name,
        'flip_card_front_stage'::text as identity_source
      from flip_card_front_stage f
      where f.playerid::text = $1
      limit 1
    )
    select * from tbc_player
    union all
    select * from stage_player
    limit 1
  `;
  const { rows } = await query(sql, [playerId]);
  return rows[0] || null;
}