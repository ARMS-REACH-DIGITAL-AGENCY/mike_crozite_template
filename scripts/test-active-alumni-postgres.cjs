const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const ts = require('typescript');
// Optional isolated dependency: @electric-sql/pglite@0.3.14.
// See docs/investigations/2026-10-18-active-verification.md for setup.
const { PGlite } = require('@electric-sql/pglite');
const compile = code => ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 } }).outputText;
const helper = { exports: {} };
vm.runInNewContext(compile(fs.readFileSync(`${root}/src/lib/activeAlumni.ts`, 'utf8')), { exports: helper.exports });
const db = new PGlite();
let checks = 0;
const check = (name, fn) => { fn(); checks++; console.log(`PASS ${name}`); };
(async () => {
  await db.exec(`
    CREATE TABLE tbc_schools_raw(hsid integer PRIMARY KEY,hs_lookup_key text,hsname text,hslocation text,cityname text,regionid text);
    CREATE TABLE tbc_players_raw(playerid text PRIMARY KEY,high_school text);
    CREATE TABLE player_hsid_exclusion(playerid text,hsid text);
    CREATE VIEW player_hsids AS SELECT p.playerid,s.hsid FROM tbc_players_raw p
      LEFT JOIN tbc_schools_raw s ON regexp_replace(lower(trim(p.high_school)),'[.\\s]+',' ','g')=regexp_replace(lower(trim(s.hs_lookup_key)),'[.\\s]+',' ','g')
      WHERE NOT EXISTS(SELECT 1 FROM player_hsid_exclusion x WHERE x.playerid=p.playerid AND x.hsid=s.hsid::text);
    CREATE TABLE tbc_batting_raw(playerid text,year text);
    CREATE TABLE tbc_pitching_raw(playerid text,year text);
    CREATE TABLE tbc_batting_2026_season_raw(playerid text,year text);
    CREATE TABLE tbc_pitching_2026_season_raw(playerid text,year text);
    CREATE TABLE indy_iscore_batting_2026_season_raw(yatstats_playerid text,season_year integer);
    CREATE TABLE indy_iscore_pitching_2026_season_raw(yatstats_playerid text,season_year integer);
    CREATE TABLE player_source_map(playerid text,source text,source_player_id text,is_verified boolean,match_method text);
    CREATE TABLE player_game_logs(playerid text,source text,stat_type text,game_date date,stats jsonb,raw_payload jsonb);
    CREATE TABLE flip_card_front_stage(playerid text PRIMARY KEY,hsid text,status_label text,level_label text);
    CREATE TABLE school_success(hsid integer,hsname text,high_school text,cityname text,hslocation text,regionid text,
      yatstats_national_rank integer,yatstats_state_rank text,mlb integer,atnla integer,drafted_hs integer,drafted integer,microsite_url text,bracket_seeding integer);
    INSERT INTO tbc_schools_raw VALUES
      (1,'Hamilton Chandler AZ','Hamilton','Chandler,AZ','Chandler','AZ'),
      (2,'Saguaro Scottsdale AZ','Saguaro','Scottsdale,AZ','Scottsdale','AZ'),
      (3,'Arizona College Prep Chandler AZ','Arizona College Prep','Chandler,AZ','Chandler','AZ'),
      (4,'Historical Mesa AZ','Historical','Mesa,AZ','Mesa','AZ'),
      (5,'Independent Mesa AZ','Independent','Mesa,AZ','Mesa','AZ'),
      (6,'Stage Only Mesa AZ','Stage Only','Mesa,AZ','Mesa','AZ'),
      (7,'Arizona Prep Dallas TX','Arizona Prep','Dallas,TX','Dallas','TX'),
      (8,'Alexander Hamilton Los Angeles CA','Alexander Hamilton','Los Angeles,CA','Los Angeles','CA'),
      (9,'Recovered Gilbert AZ','Recovered','Gilbert,AZ','Gilbert','AZ');
    INSERT INTO school_success SELECT hsid,hsname,hs_lookup_key,cityname,hslocation,regionid,hsid,'1',0,9,hsid,hsid*2,NULL,CASE WHEN hsid=1 THEN 12 END FROM tbc_schools_raw;
    UPDATE school_success SET hsid=NULL WHERE hsname='Recovered';
    INSERT INTO school_success SELECT n,'School '||n,'School '||n,'Mesa','Mesa,AZ','AZ',n,'1',0,0,0,0,NULL,NULL FROM generate_series(100,164) n;
    INSERT INTO tbc_players_raw VALUES
      ('retired-current','Hamilton Chandler AZ'),('free-current','Hamilton Chandler AZ'),('two-way','Hamilton Chandler AZ'),('historic','Hamilton Chandler AZ'),
      ('cam','Saguaro Scottsdale AZ'),('wrong-person','Saguaro Scottsdale AZ'),('spring','Saguaro Scottsdale AZ'),('old-game','Saguaro Scottsdale AZ'),
      ('future-game','Saguaro Scottsdale AZ'),('wrong-season','Saguaro Scottsdale AZ'),('no-appearance','Saguaro Scottsdale AZ'),
      ('unverified','Saguaro Scottsdale AZ'),('rejected','Saguaro Scottsdale AZ'),('ambiguous','Saguaro Scottsdale AZ'),('missing-person','Saguaro Scottsdale AZ'),
      ('unknown-new','Arizona College Prep Chandler AZ'),('historical-zero','Historical Mesa AZ'),('indy','Independent Mesa AZ'),
      ('tx-active','Arizona Prep Dallas TX'),('excluded','Hamilton Chandler AZ'),('recovered','Recovered Gilbert AZ');
    INSERT INTO player_hsid_exclusion VALUES('excluded','1');
    INSERT INTO tbc_batting_2026_season_raw VALUES('retired-current','2026'),('two-way','2026'),('two-way','2026'),('historic','2025'),('tx-active','2026'),('excluded','2026'),('recovered','2026');
    INSERT INTO tbc_pitching_2026_season_raw VALUES('free-current','2026'),('two-way','2026');
    INSERT INTO tbc_batting_raw VALUES('historic','1999'),('historical-zero','2004');
    INSERT INTO indy_iscore_batting_2026_season_raw VALUES('indy',2026),('indy',2026),(NULL,2026),('historic',2025);
    INSERT INTO indy_iscore_pitching_2026_season_raw VALUES('indy',2026);
    INSERT INTO flip_card_front_stage VALUES('retired-current','1','RETIRED','TRIPLE-A'),('free-current','1','FREE AGENT','MLB'),('two-way','1','UNKNOWN','NCAA'),('historic','1','UNKNOWN','MLB'),('stage-only','6','ACTIVE','MLB');
  `);
  const logs = [
    ['cam','807284',true,'name_and_identity','2026-08-06','2026','R','807284',1],
    ['cam','807284',true,'name_and_identity','2026-08-12','2026','R','807284',1],
    ['wrong-person','500',true,'name_and_identity','2026-08-06','2026','R','501',1],
    ['spring','501',true,'name_and_identity','2026-03-06','2026','S','501',1],
    ['old-game','502',true,'name_and_identity','2025-08-06','2025','R','502',1],
    ['future-game','503',true,'name_and_identity','2027-08-06','2027','R','503',1],
    ['wrong-season','504',true,'name_and_identity','2026-01-06','2025','R','504',1],
    ['no-appearance','505',true,'name_and_identity','2026-08-06','2026','R','505',0],
    ['unverified','506',false,'name_only','2026-08-06','2026','R','506',1],
    ['rejected','507',true,'rejected_bad_identity_match','2026-08-06','2026','R','507',1],
    ['ambiguous','508',true,'name_and_identity','2026-08-06','2026','R','508',1],
    ['missing-person','510',true,'name_and_identity','2026-08-06','2026','R',null,1],
  ];
  const mapped = new Set();
  for (const [id,sourceId,verified,method,date,season,type,person,games] of logs) {
    if (!mapped.has(id)) { await db.query('INSERT INTO player_source_map VALUES($1,$2,$3,$4,$5)',[id,'mlb_api',sourceId,verified,method]); mapped.add(id); }
    const payload = { season, gameType:type, ...(person ? {player:{id:Number(person)}} : {}) };
    await db.query('INSERT INTO player_game_logs VALUES($1,$2,$3,$4,$5,$6)',[id,'mlb_api','pitching',date,JSON.stringify({gamesPlayed:games,gamesPitched:games}),JSON.stringify(payload)]);
  }
  await db.exec("INSERT INTO player_source_map VALUES('ambiguous','mlb_api','509',true,'name_and_identity')");
  const summary = await db.query(`WITH ${helper.exports.activeAlumniSummaryCtes('SELECT hsid FROM tbc_schools_raw')}
    SELECT s.*,ARRAY(SELECT playerid FROM active_alumni a WHERE a.hsid=s.hsid ORDER BY playerid) ids FROM active_alumni_summary s ORDER BY hsid`);
  const byId = new Map(summary.rows.map(row=>[row.hsid,row]));
  check('own2026 retired/free-agent/two-way membership; duplicates countonce',()=>assert.deepEqual(byId.get(1).ids,['free-current','retired-current','two-way']));
  check('2025 statusUNKNOWN and excludedschoollink do not becomeActive',()=>assert.equal(byId.get(1).current_aa,3));
  check('verified partialgame evidence establishes membership without fullcoverage',()=>assert.deepEqual(byId.get(2),{hsid:2,current_aa:1,active_stats_pending:true,ids:['cam']}));
  check('identitymismatch,unverified,rejected,ambiguous and missing person allfailclosed',()=>assert.equal(byId.get(2).ids.length,1));
  check('springtraining,wrongyear,wrongseason,noappearance excluded',()=>assert.equal(byId.get(2).ids.length,1));
  check('newhistoricalschool missingallstats ispending, notverifiedzero',()=>assert.deepEqual(byId.get(3),{hsid:3,current_aa:0,active_stats_pending:true,ids:[]}));
  check('historicalstats with no2026 participation remains realzero',()=>assert.equal(byId.get(4).active_stats_pending,false));
  check('Indy duplicatebat/pitch rows countonce, otherseasons excluded',()=>assert.deepEqual(byId.get(5).ids,['indy']));
  check('stage-only ACTIVE status cannotcreatecanonicalmembership',()=>assert.equal(byId.has(6),false));
  const imports = {
    'next/server': { NextResponse: { json:(body,init={})=>({body,...init}) } },
    '@/lib/db': { query:(sql,params)=>db.query(sql,params) },
    '@/lib/activeAlumni': helper.exports,
    '@/lib/schoolDirectoryRouting': { canonicalSchoolUrls:async(ids)=>new Map(ids.map(id=>[id,`https://school-${id}.example`])) },
  };
  const route={exports:{}};
  vm.runInNewContext(compile(fs.readFileSync(`${root}/src/app/api/schools/search/route.ts`,'utf8')),{exports:route.exports,URL,Map,Set,console,require:name=>{assert.ok(imports[name],name);return imports[name];}});
  const get = async suffix => route.exports.GET({url:`https://example.test/api/schools/search?${suffix}`,headers:new Headers()});
  const state=await get('q=Arizona&limit=30');
  check('actualSQL statewidekeepsall>30 rows',()=>{assert.equal(state.status,200);assert.equal(state.body.programs.length,73);});
  check('stateprefixmatchesoutsideAZ retained andsortedfirst',()=>assert.deepEqual(state.body.programs.slice(0,2).map(x=>x.hsid),[7,3]));
  check('actualstatecounts use2026 data, notstatuses',()=>assert.equal(state.body.programs.find(x=>x.hsid===1).current_aa,3));
  check('historicalpending0school link andbracketeligibility survive',()=>{const x=state.body.programs.find(x=>x.hsid===3);assert.equal(x.active_stats_pending,true);assert.equal(x.microsite_url,'https://school-3.example');assert.equal(x.bracket_eligible,false);});
  check('bracketeligibility stays independentofnewcount',()=>assert.equal(state.body.programs.find(x=>x.hsid===1).bracket_eligible,true));
  const normal=await get('q=Hamilton&limit=30');
  check('normal substringsearch and region/rankordering unchanged',()=>assert.deepEqual(normal.body.programs.map(x=>x.hsid),[1,8]));
  const city=await get('q=&state=AZ&city=Chandler&limit=30');
  check('explicitcity/state filters retain pending and active schools',()=>assert.deepEqual(city.body.programs.map(x=>x.hsid),[1,3]));
  const limited=await get('q=School&limit=30');
  check('normalquery retainslimit30',()=>assert.equal(limited.body.programs.length,30));
  const recovered=await get('q=Recovered&limit=30');
  check('newlyresolvedcanonicalHSID gets samecount andcoverage',()=>{assert.equal(String(recovered.body.programs[0].hsid),'9');assert.equal(recovered.body.programs[0].current_aa,1);assert.equal(recovered.body.programs[0].active_stats_pending,false);});
  console.log(`PASS: ${checks} actual PostgreSQL membership/search contract checks; no live database writes.`);
  await db.close();
})().catch(async error=>{console.error(error);await db.close();process.exitCode=1;});
