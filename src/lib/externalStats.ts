import crypto from 'crypto';
import { query } from '@/lib/db';

export type ExternalStatTeamConfig = {
  id?: number;
  league_code: string;
  team_name: string;
  source_system: string;
  source_team_identifier?: string | null;
  source_team_id?: string | null;
  stats_url?: string | null;
  api_password_secret_name?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type ExternalStatSummary = {
  team: string;
  sourceSystem: string;
  rosterPlayers: number;
  gamesFound: number;
  gamesIngested: number;
  playerStatRows: number;
  skippedGames: number;
  errors: string[];
};

type RawPayloadInput = {
  sourceSystem: string;
  sourceUrl: string;
  leagueCode?: string | null;
  teamIdentifier?: string | null;
  gameGuid?: string | null;
  payload: unknown;
};

type UpsertExternalPlayerInput = {
  sourceSystem: string;
  sourcePlayerGuid: string;
  firstName?: string | null;
  lastName?: string | null;
  jersey?: string | null;
  position?: string | null;
  headshotUrl?: string | null;
  rawPayload?: unknown;
};

type UpsertExternalGameInput = {
  sourceSystem: string;
  sourceGameGuid: string;
  sourceTeamIdentifier?: string | null;
  scheduledAt?: string | null;
  startedAt?: string | null;
  endedAt?: string | null;
  homeTeamName?: string | null;
  visitorTeamName?: string | null;
  homeScore?: number | null;
  visitorScore?: number | null;
  result?: string | null;
  status?: string | null;
  rawPayloadId?: number | null;
};

type UpsertExternalPlayerGameStatInput = {
  sourceSystem: string;
  sourceGameGuid: string;
  sourcePlayerGuid: string;
  teamIdentifier?: string | null;
  seasonYear?: number | null;
  statType?: string | null;
  stats: Record<string, unknown>;
  rawPayloadId?: number | null;
};

export function payloadHash(payload: unknown) {
  return crypto.createHash('sha256').update(JSON.stringify(payload ?? null)).digest('hex');
}

export function envValue(name?: string | null) {
  if (!name) return null;
  const value = process.env[name];
  return value && value.trim() ? value.trim() : null;
}

export function normalizeInt(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(String(value).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

export function normalizeString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s || null;
}

export function safeIsoDate(value: unknown): string | null {
  const s = normalizeString(value);
  if (!s) return null;
  const parsed = new Date(s);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

export async function ensureExternalStatsTables() {
  await query(`
    create table if not exists public.raw_stat_ingest_payloads (
      id bigserial primary key,
      source_system text not null,
      source_url text not null,
      league_code text,
      team_identifier text,
      game_guid text,
      payload jsonb not null,
      payload_hash text not null,
      fetched_at timestamptz not null default now(),
      unique (source_system, source_url, payload_hash)
    )
  `);

  await query(`
    create table if not exists public.external_stat_source_teams (
      id bigserial primary key,
      league_code text not null,
      team_name text not null,
      source_system text not null,
      source_team_identifier text,
      source_team_id text,
      stats_url text,
      api_password_secret_name text,
      active boolean not null default true,
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (league_code, team_name, source_system)
    )
  `);

  await query(`
    create table if not exists public.external_games (
      id bigserial primary key,
      source_system text not null,
      source_game_guid text not null,
      source_team_identifier text,
      scheduled_at timestamptz,
      started_at timestamptz,
      ended_at timestamptz,
      home_team_name text,
      visitor_team_name text,
      home_score int,
      visitor_score int,
      result text,
      status text,
      raw_payload_id bigint references public.raw_stat_ingest_payloads(id),
      updated_at timestamptz not null default now(),
      unique (source_system, source_game_guid)
    )
  `);

  await query(`
    create table if not exists public.external_players (
      id bigserial primary key,
      source_system text not null,
      source_player_guid text not null,
      first_name text,
      last_name text,
      jersey text,
      position text,
      headshot_url text,
      yatstats_playerid text,
      raw_payload jsonb not null default '{}'::jsonb,
      updated_at timestamptz not null default now(),
      unique (source_system, source_player_guid)
    )
  `);

  await query(`
    create table if not exists public.external_player_game_stats (
      id bigserial primary key,
      source_system text not null,
      source_game_guid text not null,
      source_player_guid text not null,
      team_identifier text,
      season_year int,
      stat_type text,
      stats jsonb not null,
      raw_payload_id bigint references public.raw_stat_ingest_payloads(id),
      ingested_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (source_system, source_game_guid, source_player_guid)
    )
  `);
}

export async function loadActiveExternalStatTeams(leagueCode = 'ALPB') {
  await ensureExternalStatsTables();
  const { rows } = await query<ExternalStatTeamConfig>(
    `select *
     from public.external_stat_source_teams
     where league_code = $1
       and active is true
     order by case when team_name = 'Gastonia Ghost Peppers' then 0 else 1 end,
              team_name`,
    [leagueCode]
  );
  return rows;
}

export async function saveRawPayload(input: RawPayloadInput): Promise<number> {
  const hash = payloadHash(input.payload);
  const { rows } = await query<{ id: number }>(
    `insert into public.raw_stat_ingest_payloads (
       source_system, source_url, league_code, team_identifier, game_guid, payload, payload_hash
     ) values ($1, $2, $3, $4, $5, $6::jsonb, $7)
     on conflict (source_system, source_url, payload_hash) do update set fetched_at = now()
     returning id`,
    [
      input.sourceSystem,
      input.sourceUrl,
      input.leagueCode || null,
      input.teamIdentifier || null,
      input.gameGuid || null,
      JSON.stringify(input.payload ?? null),
      hash,
    ]
  );
  return rows[0].id;
}

export async function upsertExternalPlayer(input: UpsertExternalPlayerInput) {
  await query(
    `insert into public.external_players (
       source_system, source_player_guid, first_name, last_name, jersey, position, headshot_url, raw_payload, updated_at
     ) values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, now())
     on conflict (source_system, source_player_guid) do update set
       first_name = coalesce(excluded.first_name, public.external_players.first_name),
       last_name = coalesce(excluded.last_name, public.external_players.last_name),
       jersey = coalesce(excluded.jersey, public.external_players.jersey),
       position = coalesce(excluded.position, public.external_players.position),
       headshot_url = coalesce(excluded.headshot_url, public.external_players.headshot_url),
       raw_payload = excluded.raw_payload,
       updated_at = now()`,
    [
      input.sourceSystem,
      input.sourcePlayerGuid,
      input.firstName || null,
      input.lastName || null,
      input.jersey || null,
      input.position || null,
      input.headshotUrl || null,
      JSON.stringify(input.rawPayload ?? {}),
    ]
  );
}

export async function upsertExternalGame(input: UpsertExternalGameInput) {
  await query(
    `insert into public.external_games (
       source_system, source_game_guid, source_team_identifier, scheduled_at, started_at, ended_at,
       home_team_name, visitor_team_name, home_score, visitor_score, result, status, raw_payload_id, updated_at
     ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, now())
     on conflict (source_system, source_game_guid) do update set
       source_team_identifier = coalesce(excluded.source_team_identifier, public.external_games.source_team_identifier),
       scheduled_at = coalesce(excluded.scheduled_at, public.external_games.scheduled_at),
       started_at = coalesce(excluded.started_at, public.external_games.started_at),
       ended_at = coalesce(excluded.ended_at, public.external_games.ended_at),
       home_team_name = coalesce(excluded.home_team_name, public.external_games.home_team_name),
       visitor_team_name = coalesce(excluded.visitor_team_name, public.external_games.visitor_team_name),
       home_score = coalesce(excluded.home_score, public.external_games.home_score),
       visitor_score = coalesce(excluded.visitor_score, public.external_games.visitor_score),
       result = coalesce(excluded.result, public.external_games.result),
       status = coalesce(excluded.status, public.external_games.status),
       raw_payload_id = coalesce(excluded.raw_payload_id, public.external_games.raw_payload_id),
       updated_at = now()`,
    [
      input.sourceSystem,
      input.sourceGameGuid,
      input.sourceTeamIdentifier || null,
      input.scheduledAt || null,
      input.startedAt || null,
      input.endedAt || null,
      input.homeTeamName || null,
      input.visitorTeamName || null,
      input.homeScore ?? null,
      input.visitorScore ?? null,
      input.result || null,
      input.status || null,
      input.rawPayloadId || null,
    ]
  );
}

export async function hasGameStats(sourceSystem: string, sourceGameGuid: string) {
  const { rows } = await query<{ exists: boolean }>(
    `select exists(
       select 1 from public.external_player_game_stats
       where source_system = $1 and source_game_guid = $2
     ) as exists`,
    [sourceSystem, sourceGameGuid]
  );
  return Boolean(rows[0]?.exists);
}

export async function upsertExternalPlayerGameStat(input: UpsertExternalPlayerGameStatInput) {
  await query(
    `insert into public.external_player_game_stats (
       source_system, source_game_guid, source_player_guid, team_identifier, season_year, stat_type, stats, raw_payload_id, updated_at
     ) values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, now())
     on conflict (source_system, source_game_guid, source_player_guid) do update set
       team_identifier = coalesce(excluded.team_identifier, public.external_player_game_stats.team_identifier),
       season_year = coalesce(excluded.season_year, public.external_player_game_stats.season_year),
       stat_type = coalesce(excluded.stat_type, public.external_player_game_stats.stat_type),
       stats = excluded.stats,
       raw_payload_id = coalesce(excluded.raw_payload_id, public.external_player_game_stats.raw_payload_id),
       updated_at = now()`,
    [
      input.sourceSystem,
      input.sourceGameGuid,
      input.sourcePlayerGuid,
      input.teamIdentifier || null,
      input.seasonYear || null,
      input.statType || null,
      JSON.stringify(input.stats || {}),
      input.rawPayloadId || null,
    ]
  );
}

export async function getRecentExternalStatsForPlayer(playerId: string, limit = 5) {
  await ensureExternalStatsTables();
  const { rows } = await query(
    `select
       epgs.source_system,
       epgs.source_game_guid,
       epgs.team_identifier,
       epgs.season_year,
       epgs.stat_type,
       epgs.stats,
       epgs.ingested_at,
       eg.scheduled_at,
       eg.home_team_name,
       eg.visitor_team_name,
       eg.home_score,
       eg.visitor_score,
       eg.status,
       ep.first_name,
       ep.last_name
     from public.external_player_game_stats epgs
     join public.external_players ep
       on ep.source_system = epgs.source_system
      and ep.source_player_guid = epgs.source_player_guid
     left join public.external_games eg
       on eg.source_system = epgs.source_system
      and eg.source_game_guid = epgs.source_game_guid
     where ep.yatstats_playerid::text = $1
     order by coalesce(eg.scheduled_at, epgs.ingested_at) desc
     limit $2`,
    [playerId, limit]
  );
  return rows;
}
