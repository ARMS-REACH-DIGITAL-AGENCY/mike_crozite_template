'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ts=require('typescript');
const {Client}=require('pg');
const root=path.resolve(__dirname,'..');
function variable(source,name) {
  const matches=[];
  const visit=node=>{if(ts.isVariableDeclaration(node)&&ts.isIdentifier(node.name)&&node.name.text===name&&node.initializer)matches.push(node.initializer.getText(source));ts.forEachChild(node,visit)};
  visit(source);assert.equal(matches.length,1,'Missing source variable '+name);return matches[0];
}
function sqlQueries() {
  const parse=file=>ts.createSourceFile(file,fs.readFileSync(path.join(root,file),'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
  const identity=parse('src/lib/playerStageIdentity.ts'),stage=parse('src/lib/db.ts'),ctx={};
  for(const name of ['PLAYER_STAGE_IDENTITY_CTES','PLAYER_STAGE_IDENTITY_SOURCE','PLAYER_STAGE_SINGLE_PLAYER_IDENTITY_CTES'])
    ctx[name]=vm.runInNewContext('('+variable(identity,name)+')',ctx,{timeout:1500});
  ctx.FLIP_CARD_STAGE_SELECT=vm.runInNewContext('('+variable(stage,'FLIP_CARD_STAGE_SELECT')+')',ctx,{timeout:1500});
  const expressions=[];
  const visit=node=>{if(ts.isVariableDeclaration(node)&&ts.isIdentifier(node.name)&&node.name.text==='sql'&&node.initializer&&ts.isTemplateExpression(node.initializer)){
    const expr=node.initializer.getText(stage);
    if(expr.includes('FLIP_CARD_STAGE_SELECT')&&expr.includes('PLAYER_STAGE_'))expressions.push(vm.runInNewContext('('+expr+')',ctx,{timeout:1500}));
  }ts.forEachChild(node,visit)};
  visit(stage);
  assert.equal(expressions.length,2,'Both actual roster and player SQL readers must be tested');
  const school=expressions.find(q=>/WHERE\s+fs\.hsid\s*=\s*\$1/.test(q));
  const player=expressions.find(q=>/WHERE\s+fs\.playerid\s*=\s*\$1/.test(q));
  assert.ok(school&&player,'Cannot identify stage reader SQL');
  return {school,player};
}
const fixture=`
CREATE TABLE public.flip_card_front_stage (
  playerid text PRIMARY KEY,hsid text,first_name text,last_name text,position text,
  level_label text,display_level_label text,status_label text,display_status_label text,
  committed_teamid text,committed_team_name text,current_team_name text,current_teamid text,
  current_team_source text,current_team_source_player_id text,source_notes text,
  last_transaction_applied_at timestamptz,team_affiliation_status text
);
CREATE TABLE public.player_current_team(playerid text,source text,last_verified timestamptz,source_team_id text,team_name text);
CREATE TABLE public.player_source_map(playerid text,source text,match_method text);
CREATE TABLE public.player_team_override(playerid text);
CREATE TABLE public.school_player_profile_submission_raw(approved_playerid text,is_reviewed boolean,is_verified boolean);
CREATE TABLE public.tbc_batting_2026_season_raw(playerid text,year text,teamid text);
CREATE TABLE public.tbc_pitching_2026_season_raw(playerid text,year text,teamid text);
CREATE TABLE public.teamid_universe_mapping(teamid text PRIMARY KEY,current_team_name text,current_org_or_conference_name text,level_label text,current_team_short_name text);
CREATE TABLE public.tbc_players_raw(playerid text PRIMARY KEY,posit text,bats text,throws text);
INSERT INTO public.teamid_universe_mapping VALUES
('20588','Morehead State University','OVC','NCAA-D1','Morehead State'),('20106','Cal State Northridge','Big West','NCAA-D1','CSUN');
INSERT INTO public.flip_card_front_stage
(playerid,hsid,first_name,last_name,status_label,display_status_label,level_label,display_level_label,committed_teamid,committed_team_name,current_team_name)
VALUES
('YAT000063','5004','Dean','Thompson','COMMIT','COMMIT','HIGH SCHOOL','HIGH SCHOOL','20588',NULL,'Hamilton Huskies'),
('YAT000055','5004','Cory','Wuttke','COMMIT','','HIGH SCHOOL','HIGH SCHOOL','20106','Cal State Northridge','Hamilton Huskies'),
('YAT000070','5004','Active','Alumnus','ACTIVE','ACTIVE','NCAA-D1','NCAA-D1',NULL,NULL,'Example College'),
('YAT900001','9001','Another','Player','UNCOMMITTED','UNCOMMITTED','HIGH SCHOOL','HIGH SCHOOL',NULL,NULL,'Another School');
`;
async function run(){
 assert.equal(process.env.YATSTATS_SQL_FIXTURE,'isolated-local-postgres','Must use isolated fixture');
 const host=process.env.PGHOST||'127.0.0.1';
 assert.ok(['localhost','127.0.0.1','::1'].includes(host),'Remote database prohibited');
 const db=new Client({host,port:Number(process.env.PGPORT||5432),database:process.env.PGDATABASE||'yatstats_ci',user:process.env.PGUSER||'postgres',password:process.env.PGPASSWORD});
 const q=sqlQueries();await db.connect();
 try {
   await db.query('BEGIN');await db.query(fixture);
   const school=(await db.query(q.school,['5004'])).rows;
   assert.equal(school.length,3,'Shared school roster must return 3 fixtures');
   assert.equal(school.filter(x=>x.status_label==='ACTIVE').length,1,'Active players retained');
   assert.equal(school.find(x=>x.playerid==='YAT000063').resolved_committed_team_name,'Morehead State University');
   assert.equal(school.find(x=>x.playerid==='YAT000055').resolved_committed_team_name,'Cal State Northridge');
   assert.equal(school.find(x=>x.playerid==='YAT000063').resolved_committed_team_short_name,'Morehead State');
   assert.equal(school.find(x=>x.playerid==='YAT000055').resolved_committed_team_short_name,'CSUN');
   assert.equal((await db.query(q.school,['9001'])).rows.length,1,'Other schools load');
   assert.equal((await db.query(q.player,['YAT000063'])).rows[0].resolved_committed_team_name,'Morehead State University');
   const bad=q.school.replace("COALESCE(fs.level_label, '')","COALESCE(level_label, '')");
   assert.notEqual(bad,q.school,'Mutant must alter real source SQL');
   await assert.rejects(db.query(bad,['5004']),e=>e.code==='42702','Old ambiguous query must fail');
   console.log('PASS: school/player queries, both colleges, active roster, all schools, and SQLSTATE 42702 regression');
 }finally{await db.query('ROLLBACK').catch(()=>{});await db.end()}
}
run().catch(err=>{console.error(err);process.exitCode=1});
