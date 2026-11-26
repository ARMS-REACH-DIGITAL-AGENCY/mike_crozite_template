'use strict';
// PIPELINE: known rescheduled games must not fall back to the old log date.
// The four game IDs, old dates, scheduled dates and final scores below come
// from the isolated production copy. Auxiliary statuses are boundary fixtures.
// This test invokes the actual live route with read-only query responses.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
function compile(file, dependencies) {
  const out = {};
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function('exports', 'require', 'console', code)(out, id => {
    assert.ok(Object.hasOwn(dependencies, id), 'Unexpected dependency ' + id);
    return dependencies[id];
  }, { error() {} });
  return out;
}
const stages = [], sourceLines = [], sourceClubs = [], schedules = [];
function addPlayer(team, game, day, won, withResult = true) {
  const id = 'YAT' + String(900000 + stages.length);
  stages.push({playerid:id,yatid:id,hsid:'5004',display_name:'Fixture '+id,status_label:'ACTIVE',level_label:'AA',position:'OF',current_team_name:team});
  sourceLines.push({playerid:id,day,stat_type:'batting',stats:{},game,team,status:'Final',level:'AA'});
  if(withResult) sourceClubs.push({team,game,day,is_win:won});
}
function addSchedule(game, day, status, home, away, home_runs, away_runs) {
  schedules.push({game,day,status,home,away,home_runs,away_runs,start:null});
}
addPlayer('Montgomery Biscuits','817757',111,false);
addPlayer('Brooklyn Cyclones','822277',104,false);
addPlayer('Palm Beach Cardinals','820716',111,true);
addPlayer('Hickory Crawdads','827116',118,false);
addPlayer('Wilson Warbirds','827116',118,true);
addSchedule('817757',134,'Final','Pensacola Blue Wahoos','Montgomery Biscuits',3,2);
addSchedule('822277',162,'Final','Frederick Keys','Brooklyn Cyclones',3,2);
addSchedule('820716',141,'Final','Daytona Tortugas','Palm Beach Cardinals',7,9);
addSchedule('827116',155,'Final','Hickory Crawdads','Wilson Warbirds',4,12);
let calls = [], failLookup = false;
async function query(sql, params) {
  calls.push({sql,params});
  if(sql.includes('FROM flip_card_front_stage')) return {rows:stages};
  // Which alumni have a game line in the period (a stat line beats any status).
  if (sql.includes('array_agg(DISTINCT (game_date')) { const by = {}; for (const r of sourceLines) if (params[0].includes(r.playerid) && r.day >= 0 && r.day < params[2]) (by[r.playerid] ||= new Set()).add(r.day); return { rows: Object.entries(by).map(([yatid, days]) => ({ yatid, days: [...days] })) }; }
  if(sql.includes('SELECT DISTINCT ON (yatid,')) return {rows:sourceLines.filter(r=>r.day>=0 && r.day<params[2])};
  if(sql.includes('SELECT DISTINCT ON (team_name,')) return {rows:sourceClubs.filter(r=>r.day>=0 && r.day<params[2])};
  if(sql.includes('FROM team_schedules')) {
    if(sql.includes('game_pk = ANY')) {
      if(failLookup) throw Error('schedule lookup unavailable');
      return {rows:schedules.filter(r=>params[0].includes(r.game))};
    }
    return {rows:schedules.filter(r=>r.day>=0 && r.day<params[2] && (params[0].includes(r.home)||params[0].includes(r.away)))};
  }
  if(sql.includes('FROM user_profiles')) return {rows:[]};
  if (sql.includes('FROM public.player_team_stints')) return { rows: [] };
  throw Error('Unexpected query '+sql);
}
const helperPath = 'src/lib/bracket/scheduleAuthority.ts';
const dependencies = {
  'next/server':{NextResponse:{json:(body,init={})=>({body,status:init.status||200})}},
  '@/lib/db':{query,getSeasonUsageByPlayerIds:async()=>({})},
  '@/lib/galleryStatuses':compile('src/lib/galleryStatuses.ts',{}),
  '@/lib/bracket/fetchLiveBatches':{BRACKET_LIVE_BATCH_SIZE:64},
};
if(fs.existsSync(helperPath)) dependencies['@/lib/bracket/scheduleAuthority']=compile(helperPath,{});
const {GET}=compile('src/app/api/bracket/live/route.ts',dependencies);
const request=weeks=>GET({nextUrl:new URL('https://test.invalid/api/bracket/live?start=2026-03-23&weeks='+weeks+'&h=5004')});
const clubRows=body=>Object.entries(body.clubs).flatMap(([club,rows])=>rows.map(row=>[club,...row])).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
(async()=>{
  const full=await request(34), prefix=await request(17);
  assert.equal(full.status,200);assert.equal(prefix.status,200);
  assert.deepEqual(clubRows(prefix.body),clubRows(full.body).filter(row=>row[1]<119),
    'Week17 direct club results must equal the full-season response trimmed to Week17');
  assert.deepEqual(clubRows(prefix.body),[], 'Known later games cannot create an old-date W-L fallback');
  assert.equal(clubRows(full.body).length,5,'Each real scheduled club outcome appears once');
  assert.deepEqual(full.body.clubs['Montgomery Biscuits'],[[134,'817757',0,-1]]);
  assert.deepEqual(full.body.clubs['Wilson Warbirds'],[[155,'827116',1,8]]);
  assert.deepEqual(prefix.body.lines.map(l=>[l[1],l[2],l[5]]),full.body.lines.map(l=>[l[1],l[2],l[5]]),'Player game-log dates are unchanged');
  assert.equal(Object.keys(prefix.body.games).length,0,'Out-of-window schedule metadata is not emitted as current games');
  const lookup=calls.find(c=>c.sql.includes('game_pk = ANY'));
  assert.deepEqual([...lookup.params[0]].sort(),['817757','820716','822277','827116'],'Lookup is bounded and deduplicates both sides of a game');

  addPlayer('No-result source','990001',10,false,false);
  addSchedule('990001',150,'In Progress','No-result source','Other',null,null);
  addPlayer('Postponed source','990002',10,false);
  addSchedule('990002',150,'Postponed','Postponed source','Other',null,null);
  addPlayer('Cancelled source','990003',10,false);
  addSchedule('990003',150,'Cancelled','Cancelled source','Other',null,null);
  addPlayer('Unknown schedule','990004',10,true);
  addPlayer('Non-numeric source','external-game',10,false);
  const edge=await request(17);
  assert.equal(edge.status,200);
  assert.equal(edge.body.lines.find(l=>l[5]==='990001')[7],0,'A line without isWin still uses known schedule state');
  assert.equal(edge.body.lines.find(l=>l[5]==='990002')[7],1);
  assert.equal(edge.body.lines.find(l=>l[5]==='990003')[7],1);
  assert.equal(edge.body.clubs['No-result source'],undefined);
  assert.equal(edge.body.clubs['Postponed source'],undefined);
  assert.equal(edge.body.clubs['Cancelled source'],undefined);
  assert.deepEqual(edge.body.clubs['Unknown schedule'],[[10,'990004',1,0]],'Genuinely unknown schedule retains the sourced isWin fallback');
  assert.deepEqual(edge.body.clubs['Non-numeric source'],[[10,'external-game',0,0]],'Non-MLB key is not coerced into an invalid bigint query');
  assert.ok(calls.filter(c=>c.sql.includes('game_pk = ANY')).every(c=>c.params[0].every(id=>/^\d+$/.test(id))));
  failLookup=true;
  assert.equal((await request(17)).status,500,'Failed schedule verification must not silently produce fallback results');
  console.log('PASS schedule-authoritative reschedules, prefix parity, unchanged stat dates, status boundaries and unknown-source fallback');
})().catch(error=>{console.error(error);process.exitCode=1});
