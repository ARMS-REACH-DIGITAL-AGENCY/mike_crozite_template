-- 011_sportsblaze_mlb_gamelogs.sql
-- SportsBlaze MLB player mapping + daily gamelog ingestion foundation.
-- SportsBlaze uses UUIDs, so this table maps provider IDs back to the stable YAT/TBC playerid.

create table if not exists public.sportsblaze_mlb_player_map (
  id bigserial primary key,
  yatstats_playerid text not null,
  sportsblaze_player_id text not null,
  sportsblaze_team_id text,
  sportsblaze_team_name text,
  player_name text,
  first_name text,
  last_name text,
  birthdate date,
  position text,
  headshot_url text,
  confidence_score numeric(5,2) not null default 0,
  match_method text not null default 'name_team',
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  last_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (yatstats_playerid),
  unique (sportsblaze_player_id)
);

create table if not exists public.sportsblaze_mlb_player_gamelogs (
  id bigserial primary key,
  yatstats_playerid text not null,
  sportsblaze_player_id text not null,
  sportsblaze_game_id text not null,
  season_year int not null,
  season_type text,
  game_date timestamptz,
  game_status text,
  played_team_id text,
  position text,
  started boolean,
  away_team_id text,
  away_team_name text,
  home_team_id text,
  home_team_name text,
  batting_summary text,
  stats jsonb not null default '{}'::jsonb,
  raw_game jsonb not null default '{}'::jsonb,
  source_updated_at timestamptz,
  ingested_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (sportsblaze_player_id, sportsblaze_game_id)
);

create index if not exists sportsblaze_mlb_player_map_yatstats_idx
  on public.sportsblaze_mlb_player_map (yatstats_playerid);

create index if not exists sportsblaze_mlb_player_map_team_idx
  on public.sportsblaze_mlb_player_map (sportsblaze_team_name, active);

create index if not exists sportsblaze_gamelogs_yatstats_player_idx
  on public.sportsblaze_mlb_player_gamelogs (yatstats_playerid, game_date desc nulls last);

create index if not exists sportsblaze_gamelogs_season_idx
  on public.sportsblaze_mlb_player_gamelogs (season_year, game_status, game_date desc nulls last);

create index if not exists sportsblaze_gamelogs_stats_gin_idx
  on public.sportsblaze_mlb_player_gamelogs using gin (stats);

comment on table public.sportsblaze_mlb_player_map is 'Maps YAT?STATS/TBC playerid to SportsBlaze MLB player UUIDs from SportsBlaze rosters.';
comment on table public.sportsblaze_mlb_player_gamelogs is 'Raw and normalized SportsBlaze MLB player gamelogs by YAT?STATS player.';
