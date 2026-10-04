-- YAT?STATS real tournament scoring staging
-- Real scoring and prototype/simulation data are deliberately separated.
-- Production readers MUST require data_source = 'REAL'.

create table if not exists public.bracket_real_matchup_week (
  matchup_id text not null,
  season_year integer not null,
  round_no integer not null,
  region text,
  week_no integer not null,
  week_start date not null,
  week_end date not null,
  home_hsid text not null,
  away_hsid text not null,
  data_source text not null default 'REAL' check (data_source = 'REAL'),
  status text not null default 'PROVISIONAL'
    check (status in ('PROVISIONAL','LOCKED','FINAL')),
  home_runs integer not null default 0,
  away_runs integer not null default 0,
  home_week_ops_plus numeric,
  away_week_ops_plus numeric,
  home_week_fip_minus numeric,
  away_week_fip_minus numeric,
  home_real_wins integer,
  home_real_losses integer,
  away_real_wins integer,
  away_real_losses integer,
  winner_hsid text,
  calculated_at timestamptz not null default now(),
  locked_at timestamptz,
  calculation_version text not null,
  calculation_payload jsonb not null default '{}'::jsonb,
  primary key (matchup_id, week_no)
);

create table if not exists public.bracket_real_inning (
  matchup_id text not null,
  week_no integer not null,
  inning_no integer not null check (inning_no >= 1),
  scoring_date date,
  status text not null default 'PROVISIONAL'
    check (status in ('PROVISIONAL','LOCKED','FINAL')),
  home_value numeric,
  away_value numeric,
  winner_hsid text,
  run_home integer not null default 0 check (run_home in (0,1)),
  run_away integer not null default 0 check (run_away in (0,1)),
  data_source text not null default 'REAL' check (data_source = 'REAL'),
  calculated_at timestamptz not null default now(),
  locked_at timestamptz,
  calculation_version text not null,
  calculation_payload jsonb not null default '{}'::jsonb,
  primary key (matchup_id, week_no, inning_no),
  foreign key (matchup_id, week_no)
    references public.bracket_real_matchup_week(matchup_id, week_no)
    on delete cascade
);

create table if not exists public.bracket_real_player_tally (
  matchup_id text not null,
  week_no integer not null,
  scoring_date date not null,
  hsid text not null,
  playerid text not null,
  stat_type text not null check (stat_type in ('batting','pitching','team_result')),
  source text not null,
  source_game_id text,
  competition_level text,
  verified_at timestamptz,
  received_at timestamptz not null default now(),
  daily_lock_at timestamptz,
  weekly_lock_at timestamptz,
  late_for_daily boolean not null default false,
  eligible_daily boolean not null default true,
  eligible_weekly boolean not null default true,
  data_source text not null default 'REAL' check (data_source = 'REAL'),
  stats jsonb not null default '{}'::jsonb,
  provenance jsonb not null default '{}'::jsonb,
  primary key (matchup_id, week_no, scoring_date, hsid, playerid, stat_type, source, source_game_id)
);

create index if not exists bracket_real_player_tally_player_date_idx
  on public.bracket_real_player_tally(playerid, scoring_date);
create index if not exists bracket_real_player_tally_matchup_idx
  on public.bracket_real_player_tally(matchup_id, week_no, scoring_date, hsid);

comment on table public.bracket_real_player_tally is
  'Verified real-data ledger. Late daily stats remain visible and weekly-eligible when received before weekly lock; never rewrites a locked daily inning.';
comment on table public.bracket_real_inning is
  'Authoritative persisted fantasy inning result. Frontend renders this result; it does not recalculate it.';
comment on table public.bracket_real_matchup_week is
  'Authoritative persisted matchup/week result used by both scoreboard and drawer. REAL data only.';
