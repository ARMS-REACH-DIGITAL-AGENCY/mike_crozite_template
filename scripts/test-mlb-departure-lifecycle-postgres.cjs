'use strict';
// PR #721: real SQL lifecycle test in the isolated GitHub Actions PostgreSQL service.
// This deliberately extracts executable SQL from production source, not a reimplementation.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {Client} = require('pg');

const code = fs.readFileSync(path.join(__dirname,'apply-mlb-transaction-status.ts'),'utf8');
function sqlFrom(functionHead, nextHead, opening, closing) {
  const start = code.indexOf(functionHead);
  const stop = code.indexOf(nextHead,start);
  assert(start >= 0 && stop > start,'Missing SQL function boundaries: '+functionHead);
  const piece = code.slice(start,stop);
  const i = piece.indexOf(opening);
  const j = piece.indexOf(closing,i+opening.length);
  assert(i >= 0 && j > i,'Missing actual query literal in '+functionHead);
  return piece.slice(i+1,j);
}
const clearSql = sqlFrom('async function clearStaleDepartureFlags(', 
  'async function reconcileStaleTransactionDepartureTeamIds(',
  '`UPDATE public.flip_card_front_stage', '`,\n    [playerIds]');
const departureSql = sqlFrom('async function applyDepartureFact(',
  '// Self-healing:', '`WITH departure_identity AS MATERIALIZED',
  '`,\n    [row.playerid');
const cleanupSql = sqlFrom('async function reconcileStaleTransactionDepartureTeamIds(',
  'async function retireStaleFreeAgents()', '`\n    WITH source_backed AS MATERIALIZED',
  '`);');

const fixture = `
CREATE TABLE public.teamid_universe_mapping (
  teamid text PRIMARY KEY, current_team_name text,
  current_org_or_conference_name text, level_label text
);
CREATE TABLE public.flip_card_front_stage (
  playerid text PRIMARY KEY, status_label text, display_status_label text,
  team_affiliation_status text, last_transaction_type text,
  last_transaction_date date, last_transaction_team_name text,
  last_transaction_applied_at timestamptz,
  current_teamid text, current_team_name text,
  current_org_or_conference_name text, current_team_level text,
  current_level_label text, current_team_source text,
  current_team_source_player_id text, current_team_source_team_id text,
  current_team_roster_status text, current_team_last_verified timestamptz,
  current_team_absent_since timestamptz, previous_teamid text,
  previous_team_name text, previous_org_or_conference_name text,
  previous_level_label text, highest_level_label text,
  highest_level_checked_at timestamptz, level_label text,
  display_level_label text, is_on_40man boolean,
  forty_man_org_name text, forty_man_org_abbr text,
  next_game_date text, next_game_time_local text,
  next_game_time_utc timestamptz, next_game_home_away text,
  next_game_opponent text, next_game_status_label text,
  source_summary jsonb DEFAULT '{}'::jsonb,
  updated_at timestamptz, stage_updated_at timestamptz
);
CREATE TABLE public.player_team_override(playerid text PRIMARY KEY);
CREATE TABLE public.player_source_map(
  playerid text,source text,source_player_id text,is_verified boolean
);
CREATE TABLE public.mlb_org_roster_resolution(
  playerid text,source_player_id text,match_status text
);
CREATE TABLE public.player_transactions(
  playerid text,source text,transaction_type text,effective_date timestamptz
);
CREATE FUNCTION public.compute_player_highest_level(text)
  RETURNS text LANGUAGE sql AS $$ SELECT 'MLB'::text $$;
INSERT INTO public.teamid_universe_mapping VALUES
  ('20','New York Yankees','New York Yankees','MLB'),
  ('30','Toronto Blue Jays','Toronto Blue Jays','MLB');
INSERT INTO public.player_source_map VALUES
  ('life','mlb_api','mlb-life',true);
INSERT INTO public.flip_card_front_stage (
 playerid,status_label,display_status_label,team_affiliation_status,
 last_transaction_type,last_transaction_date,last_transaction_team_name,
 last_transaction_applied_at,previous_teamid,previous_team_name,
 previous_org_or_conference_name,previous_level_label,
 highest_level_label,highest_level_checked_at,
 level_label,display_level_label
) VALUES (
 'life','FREE AGENT','FREE AGENT','FREE AGENT',
 'Declared Free Agency','2026-10-29','New York Yankees',NOW(),
 '20','New York Yankees','New York Yankees','MLB',
 'DOUBLE-A','2026-10-29'::timestamptz,'MLB','MLB'
);
`;

async function row(db,id) {
  const result = await db.query('SELECT * FROM public.flip_card_front_stage WHERE playerid=$1',[id]);
  assert.equal(result.rows.length,1,'Missing fixture '+id);
  return result.rows[0];
}

async function main() {
  assert.equal(process.env.YATSTATS_SQL_FIXTURE,'isolated-local-postgres','Isolated Postgres fixture required');
  const host=process.env.PGHOST||'127.0.0.1';
  assert(['localhost','127.0.0.1','::1'].includes(host),'Remote database prohibited');
  const db=new Client({
    host,port:Number(process.env.PGPORT||5432),
    database:process.env.PGDATABASE||'yatstats_ci',
    user:process.env.PGUSER||'postgres',password:process.env.PGPASSWORD
  });
  await db.connect();
  try {
    await db.query('BEGIN');
    await db.query(fixture);

    // Existing departure -> new signing: retain former identity and career-high
    // label, invalidate only the career-high computation date.
    await db.query(clearSql,[['life']]);
    let p=await row(db,'life');
    assert.equal(p.status_label,null);
    assert.equal(p.previous_teamid,'20');
    assert.equal(p.previous_team_name,'New York Yankees');
    assert.equal(p.previous_org_or_conference_name,'New York Yankees');
    assert.equal(p.highest_level_label,'DOUBLE-A');
    assert.equal(p.highest_level_checked_at,null);

    // New club has a roster name but no mapped TeamID. A later departure
    // must NOT reuse the older Yankees TeamID beside the new club name.
    await db.query(`
      UPDATE public.flip_card_front_stage
      SET status_label='ACTIVE',display_status_label='ACTIVE',
          team_affiliation_status='ACTIVE',
          current_team_name='Unmapped New Club',current_teamid=NULL,
          current_team_source='mlb_api',next_game_date='FUTURE GAME',
          next_game_opponent='Opponent',next_game_time_utc=NOW()
      WHERE playerid='life'
    `);
    await db.query(departureSql,[
      'life','Released','2026-11-09','Unmapped New Club',
      'FREE AGENT',null,'mlb-life'
    ]);
    p=await row(db,'life');
    assert.equal(p.status_label,'FREE AGENT');
    assert.equal(p.previous_team_name,'Unmapped New Club');
    assert.equal(p.previous_teamid,null,'Never carry old TeamID into new club');
    assert.equal(p.previous_org_or_conference_name,null);
    assert.equal(p.previous_level_label,null);
    assert.equal(p.current_team_name,null);
    assert.equal(p.next_game_date,null);

    // Next signing with mapped team -> retirement at higher level:
    // canonical team identity and organization must move as one unit.
    await db.query(clearSql,[['life']]);
    await db.query(`
      UPDATE public.flip_card_front_stage
      SET status_label='ACTIVE',display_status_label='ACTIVE',
          team_affiliation_status='ACTIVE',current_teamid='30',
          current_team_name='Toronto Blue Jays',
          current_org_or_conference_name='Toronto Blue Jays',
          level_label='MLB',display_level_label='MLB',
          current_team_source='mlb_api',next_game_date='TOMORROW'
      WHERE playerid='life'
    `);
    await db.query(departureSql,[
      'life','Retired','2026-11-10','Toronto Blue Jays','RETIRED','MLB','mlb-life'
    ]);
    p=await row(db,'life');
    assert.equal(p.status_label,'RETIRED');
    assert.equal(p.previous_teamid,'30');
    assert.equal(p.previous_team_name,'Toronto Blue Jays');
    assert.equal(p.previous_org_or_conference_name,'Toronto Blue Jays');
    assert.equal(p.previous_level_label,'MLB');
    assert.equal(p.highest_level_label,'MLB','Recompute career high after comeback');
    assert.ok(p.highest_level_checked_at,'Retirement must mark career high recalculated');
    assert.equal(p.current_teamid,null);
    assert.equal(p.next_game_date,null);

    // Independently, normalize old already-applied departures. One has an
    // old TeamID stranded in the current field; another only an old game.
    await db.query(`
      INSERT INTO public.flip_card_front_stage(
        playerid,status_label,display_status_label,team_affiliation_status,
        last_transaction_type,last_transaction_date,last_transaction_team_name,
        last_transaction_applied_at,current_teamid,previous_teamid,
        previous_team_name,next_game_date,current_team_absent_since
      ) VALUES
        ('legacy-id','FREE AGENT','FREE AGENT','FREE AGENT',
         'Declared Free Agency','2026-10-29','New York Yankees',
         NOW(),'20',NULL,'New York Yankees','OLD',NOW()),
        ('legacy-game','RETIRED','RETIRED','RETIRED',
         'Retired','2026-10-30','New York Yankees',
         NOW(),NULL,'20','New York Yankees','OLD',NOW()),
        ('no-evidence','FREE AGENT','FREE AGENT','FREE AGENT',
         'Declared Free Agency','2026-10-29','New York Yankees',
         NOW(),NULL,'20','New York Yankees','OLD',NOW());
      INSERT INTO public.player_transactions VALUES
        ('legacy-id','mlb_api','Declared Free Agency','2026-10-29'),
        ('legacy-game','mlb_api','Retired','2026-10-30');
    `);
    let result=(await db.query(cleanupSql)).rows[0];
    assert.equal(Number(result.team_ids_recovered),1);
    assert.equal(Number(result.schedules_cleared),2);
    let legacy=await row(db,'legacy-id');
    assert.equal(legacy.status_label,'FREE AGENT');
    assert.equal(legacy.previous_teamid,'20');
    assert.equal(legacy.current_teamid,null);
    assert.equal(legacy.next_game_date,null);
    legacy=await row(db,'legacy-game');
    assert.equal(legacy.status_label,'RETIRED');
    assert.equal(legacy.previous_teamid,'20');
    assert.equal(legacy.next_game_date,null);
    legacy=await row(db,'no-evidence');
    assert.equal(legacy.next_game_date,'OLD','Unverified departure must remain untouched');
    result=(await db.query(cleanupSql)).rows[0];
    assert.equal(Number(result.team_ids_recovered),0);
    assert.equal(Number(result.schedules_cleared),0);
    console.log('PASS: real MLB departure SQL; sign/unmapped departure/re-sign/mapped retirement; career-high invalidation; legacy ID and schedule repair; no unverified edits; idempotent');
  } finally {
    await db.query('ROLLBACK').catch(()=>{});
    await db.end();
  }
}
main().catch(e=>{console.error(e);process.exitCode=1});
