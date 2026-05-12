-- 010_external_alpb_stats.sql
-- Source-flexible external stat ingestion for ALPB / independent-league feeds.

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
);

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
);

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
);

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
);

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
);

create index if not exists raw_stat_payloads_team_game_idx
  on public.raw_stat_ingest_payloads (league_code, team_identifier, game_guid, fetched_at desc);

create index if not exists external_games_status_idx
  on public.external_games (source_system, status, scheduled_at desc nulls last);

create index if not exists external_players_yatstats_playerid_idx
  on public.external_players (yatstats_playerid)
  where yatstats_playerid is not null;

create index if not exists external_player_game_stats_player_idx
  on public.external_player_game_stats (source_system, source_player_guid, ingested_at desc);

create index if not exists external_player_game_stats_stats_gin_idx
  on public.external_player_game_stats using gin (stats);

insert into public.external_stat_source_teams (
  league_code,
  team_name,
  source_system,
  source_team_identifier,
  source_team_id,
  stats_url,
  api_password_secret_name,
  active,
  metadata
) values (
  'ALPB',
  'Gastonia Ghost Peppers',
  'iscore_central',
  'ALPB',
  null,
  'https://pro.iscorecentral.com/ALPB/stats',
  null,
  true,
  jsonb_build_object('pilot', true, 'note', 'League-level iScore Central stats surface; parser/client may need to discover embedded JSON or API calls.')
), (
  'ALPB',
  'Gastonia Ghost Peppers',
  'iscore_team_website',
  null,
  null,
  null,
  'ISCORE_GASTONIA_API_PASSWORD',
  false,
  jsonb_build_object('env_team_identifier', 'ISCORE_GASTONIA_TEAM_IDENTIFIER', 'fallback', true)
)
on conflict (league_code, team_name, source_system) do update set
  source_team_identifier = excluded.source_team_identifier,
  stats_url = excluded.stats_url,
  api_password_secret_name = excluded.api_password_secret_name,
  metadata = public.external_stat_source_teams.metadata || excluded.metadata,
  updated_at = now();
