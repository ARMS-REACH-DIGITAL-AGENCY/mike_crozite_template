'use strict';
// Pete, Nov 18 2026: released by MLB on date R -> FREE AGENT from R. A game line
// for an INDY team dated AFTER R makes him ACTIVE with that team. Evidence dated
// before R never counts (Max Viera). Runs the actual query from
// scripts/apply-mlb-transaction-status.ts against isolated PostgreSQL.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');

const code = fs.readFileSync(path.join(__dirname, 'apply-mlb-transaction-status.ts'), 'utf8');
const start = code.indexOf('async function releasedThenPlayedElsewhere(');
const piece = code.slice(start, code.indexOf('async function applyMovedOn(', start));
const open = piece.indexOf('`WITH released AS (');
const close = piece.indexOf('`,\n    [JSON.stringify(released)]', open);
assert(start >= 0 && open >= 0 && close > open, 'released-then-INDY query not found');
const movedSql = piece.slice(open + 1, close);
assert.doesNotMatch(movedSql, /_season_raw/, 'season totals carry no dates and are not evidence');

const fixture = `
CREATE FUNCTION public.yat_id_for(p text) RETURNS text LANGUAGE sql AS $$ SELECT 'YAT' || lpad(p, 6, '0') $$;
CREATE TABLE public.teamid_universe_mapping(teamid text, current_team_name text, current_org_or_conference_name text, level_label text);
CREATE TABLE public.indy_iscore_player_source_map(source_system text, league_code text, season_id text, source_player_id text,
  source_team_abbrev text, teamid text, yatstats_playerid text, yatid text);
CREATE TABLE public.indy_iscore_player_game_stats_raw(source_system text, league_code text, season_id text, source_game_id text,
  source_player_id text, stat_type text, game_date date, team_abbrev text);
CREATE TABLE public.indy_iscore_games_raw(source_system text, league_code text, season_id text, source_game_id text,
  home_team_abbrev text, away_team_abbrev text, home_source_team_id text, away_source_team_id text);
CREATE TABLE public.indy_iscore_team_source_map(source_system text, league_code text, season_id text, source_team_id text, teamid text);
INSERT INTO public.teamid_universe_mapping VALUES
  ('12347','High Point Rockers','Atlantic League','INDY'), ('12387','Lexington Legends','Atlantic League','INDY'),
  ('12400','Gastonia Ghost Peppers','Atlantic League','INDY'), ('500','Oklahoma City Comets','Los Angeles Dodgers','TRIPLE-A');
-- Max Viera (229807): High Point game in May; released by MLB Nov 13.
INSERT INTO public.indy_iscore_player_source_map VALUES ('iscore','ALPB','2026','v1','HP','12347',NULL,'YAT229807');
INSERT INTO public.indy_iscore_player_game_stats_raw VALUES ('iscore','ALPB','2026','g1','v1','pitching','2026-05-30','HP');
-- Nick Senzel (185120): released May 11; Lexington games in June (team from his own roster row).
INSERT INTO public.indy_iscore_player_source_map VALUES ('iscore','ALPB','2026','s1','LEX','12387','185120',NULL);
INSERT INTO public.indy_iscore_player_game_stats_raw VALUES ('iscore','ALPB','2026','g2','s1','batting','2026-05-01','LEX'),
  ('iscore','ALPB','2026','g3','s1','batting','2026-06-20','LEX');
-- A third player: released Apr 1; Lexington in April, then Gastonia in July (team from the game's sides) -> latest wins.
INSERT INTO public.indy_iscore_player_source_map VALUES ('iscore','ALPB','2026','t1','LEX','12387','300001',NULL);
INSERT INTO public.indy_iscore_player_game_stats_raw VALUES ('iscore','ALPB','2026','g4','t1','batting','2026-04-20','LEX'),
  ('iscore','ALPB','2026','g5','t1','batting','2026-07-04','GAS');
INSERT INTO public.indy_iscore_games_raw VALUES ('iscore','ALPB','2026','g5','GAS','LEX','gas-id','lex-id');
INSERT INTO public.indy_iscore_team_source_map VALUES ('iscore','ALPB','2026','gas-id','12400');
`;

(async () => {
  assert.equal(process.env.YATSTATS_SQL_FIXTURE, 'isolated-local-postgres', 'Isolated Postgres fixture required');
  const db = new Client({ host: process.env.PGHOST || '127.0.0.1', port: Number(process.env.PGPORT || 5432),
    database: process.env.PGDATABASE || 'yatstats_ci', user: process.env.PGUSER || 'postgres', password: process.env.PGPASSWORD });
  await db.connect();
  try {
    await db.query('BEGIN');
    await db.query(fixture);
    const released = [
      { playerid: '229807', released: '2026-11-13 00:00:00+00' },
      { playerid: '185120', released: '2026-05-11 00:00:00+00' },
      { playerid: '300001', released: '2026-04-01 00:00:00+00' },
    ];
    const { rows } = await db.query(movedSql, [JSON.stringify(released)]);
    const by = Object.fromEntries(rows.map(r => [r.playerid, r]));
    assert.equal(by['229807'], undefined, 'Max Viera: INDY games before his Nov 13 release never count -> FREE AGENT');
    assert.equal(by['185120']?.team, 'Lexington Legends', 'Nick Senzel: Lexington game after his May 11 release -> ACTIVE, Lexington');
    assert.equal(by['185120']?.level, 'INDY');
    assert.equal(by['300001']?.team, 'Gastonia Ghost Peppers', 'two INDY teams after the release: the latest game wins');
    await db.query('ROLLBACK');
    console.log('PASS released then INDY: only game lines dated after the release count; latest team wins');
  } finally { await db.end(); }
})().catch(e => { console.error(e); process.exit(1); });
