// Run with Node 24+: node scripts/verify-tribune-tournament.mjs
// Verifies the extraction against the original scorer in git HEAD, plus the
// email boundary's roster, unknown-data, duplicate-count and preseason rules.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { registerHooks } from 'node:module';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let dbMockPath;
registerHooks({ resolve(specifier, context, next) {
  if (specifier === '@/lib/db' && dbMockPath) return next(pathToFileURL(dbMockPath).href, context);
  if (specifier === 'next/server') return next(pathToFileURL(join(root,'node_modules/next/server.js')).href, context);
  let path;
  if (specifier.startsWith('@/')) path = join(root, 'src', specifier.slice(2));
  else if (specifier.startsWith('.') && context.parentURL?.startsWith('file:')) path = resolve(dirname(fileURLToPath(context.parentURL)), specifier);
  if (path && !existsSync(path) && existsSync(path + '.ts')) path += '.ts';
  if (path?.endsWith('.ts') && existsSync(path)) return next(pathToFileURL(path).href, context);
  return next(specifier, context);
} });
const scorer = await import(pathToFileURL(join(root, 'src/lib/bracket/scoreLive.ts')).href);
const { toProductionTournamentIndex } = await import(pathToFileURL(join(root, 'src/lib/bracket/productionIndex.ts')).href);
const { toTribuneRoster, toTribuneMatchup, tournamentDateAt, loadTribuneData } = await import(pathToFileURL(join(root, 'src/lib/tribune/tournament.ts')).href);
const temporary = mkdtempSync(join(tmpdir(), 'tribune-parity-'));
try {
  let original = process.env.TRIBUNE_BASELINE_FILE ? readFileSync(process.env.TRIBUNE_BASELINE_FILE, 'utf8') : execFileSync('git', ['show', 'HEAD:src/components/bracket/liveSeason.ts'], { cwd: root, encoding: 'utf8' });
  // Once the refactor is committed HEAD is already shared; parity is captured
  // against its parent by setting TRIBUNE_BASE_REF to the pre-refactor SHA.
  if (!original.includes('function score(')) original = execFileSync('git', ['show', `${process.env.TRIBUNE_BASE_REF || 'HEAD^'}:src/components/bracket/liveSeason.ts`], { cwd: root, encoding: 'utf8' });
  assert.ok(original.includes('function score('), 'pre-refactor scorer must be available');
  original = original.replace("import { type LivePhase, setLiveInning } from './schoolSeason';", "type LivePhase = 'top'|'bottom'|'posted';\nconst originalInnings: Record<string, unknown> = {};\nconst setLiveInning = (id:number,day:number,phase:LivePhase) => {originalInnings[String(id)]={day,phase};};")
    .replace("import { setInAction } from './inAction';", 'const originalAction: Record<string, unknown> = {};\nconst setInAction = (id:number,value:unknown) => {originalAction[String(id)]=value;};');
  original = original.slice(0, original.indexOf('let livePromise:')) + original.slice(original.indexOf('function score('));
  original += '\nexport function baseline(index:Index, live:Live, date:string){const copy=structuredClone(index);const boxes=score(copy,live,date);return {index:copy,boxes,innings:structuredClone(originalInnings),inAction:structuredClone(originalAction)};}';
  const baselineFile = join(temporary, 'original.ts'); writeFileSync(baselineFile, original);
  const { baseline } = await import(pathToFileURL(baselineFile).href);
  const index = { season: 2027, weeks: [['2027-02-01', '2027-02-07']], schools: { '101':['Alpha High School (City, AZ)',1,1], '202':['Beta High School (Town, AZ)',1,2] },
    rounds:[{r:1,name:'Round 1',start:'2027-02-01',end:'2027-02-07',series:[[1,101,202,1,2,0,[0,0],[[1,1,101,202,'',[],null]]]]}], lbt:[],gf:[],champion:0,lbLeaders:[],lbChampion:0,grandChampion:0 };
  const live = { asOf:'2027-02-08T11:00:00Z',start:'2027-02-01',weeks:1,
    roster: { '101':[['a','Active Batter','MLB',0,'Club A'],['b','Two Way','MLB',1,'Club A'],['c','Day Off','MLB',0,'Club C']], '202':[['d','Opponent','MLB',0,'Club B']] },
    lines:[['101','a',0,'b',[4,3,2,1,0,1,1,0,0],'g1','Club A',1,'MLB'],['101','b',0,'p',[18,0,1,0,7,2,0,0],'g1','Club A',1,'MLB'],['101','b',0,'b',[2,2,1,0,0,0,0,0,0],'g1','Club A',1,'MLB'],['202','d',0,'b',[4,4,1,0,0,0,0,0,0],'g2','Club B',1,'MLB']],
    clubs:{'Club A':[[0,'g1',1,3]],'Club B':[[0,'g2',0,-3]]},games:{'Club A':[[0,'g1',1,1,0]],'Club B':[[0,'g2',1,1,0]]},fans:{'101':[5],'202':[4]} };
  const untouched = JSON.stringify({ index, live });
  let cases = 0;
  for (const date of ['2027-02-01','2027-02-02','2027-02-07','2027-02-08']) {
    for (const phase of ['scheduled','started','final']) {
      const data = structuredClone(live);
      for (const list of Object.values(data.games)) for (const g of list) {g[2]=phase==='final'?1:0;g[3]=phase==='scheduled'?0:1;}
      for (const l of data.lines) l[7]=phase==='final'?1:0;
      assert.deepEqual(scorer.scoreLiveIndex(index, data, date), baseline(index, data, date), `scoring parity ${date}/${phase}`);
      cases++;
    }
  }
  assert.equal(JSON.stringify({ index, live }), untouched, 'shared scoring must not mutate inputs');
  const result = scorer.scoreLiveIndex(index, live, '2027-02-08');
  const school = scorer.scoreLiveSchoolWeek(live, {schoolId:'101',weekStart:'2027-02-01',asOf:'2027-02-08'});
  assert.deepEqual(school.side, result.boxes['1'].h, 'standalone real school ledger equals tournament box');
  assert.equal(school.metrics[7].opsPlus, result.boxes['1'].d[7][0]);
  assert.equal(school.metrics[7].fipMinus, result.boxes['1'].d[7][2]);
  const roster = [{playerid:'a',display_name:'Active Batter',is_pitcher:false},{playerid:'b',display_name:'Two Way',is_pitcher:true,is_two_way_2026:true},{playerid:'c',display_name:'Day Off',is_pitcher:false}];
  const table = toTribuneRoster({title:'Alpha',schoolId:'101',roster,sideBox:school.side,metrics:school.metrics[7]});
  assert.equal(table.playerCount,3);
  assert.equal(table.batting.rows.length,3);
  assert.equal(table.pitching.rows.length,1);
  assert.equal(table.batting.rows.find(p=>p.id==='c').state,'no-appearance');
  assert.equal(table.clubRecord,'2-0','two-way player club record counts once');
  assert.equal(table.pitching.rows[0].cells[1],'1-0','pitcher W-L is club record');
  assert.equal(table.batting.rows[0].cells.length,13);
  assert.equal(table.pitching.rows[0].cells.length,13);
  const missing=toTribuneRoster({title:'Alpha',roster,available:false});
  assert.ok(missing.batting.rows.every(p=>p.state==='unavailable' && p.cells.every(c=>c==='—')));
  const daily=toTribuneRoster({title:'Alpha',roster,sideBox:school.side,day:1,metrics:school.metrics[1]});
  assert.ok([...daily.batting.rows,...daily.pitching.rows].every(p=>p.state==='no-appearance'));
  const polluted=structuredClone(index); polluted.season=2026;polluted.rounds[0].series[0][7][0][5]=[7,2];polluted.champion=101;
  const clean=toProductionTournamentIndex(polluted);
  assert.equal(clean.season,2027);assert.equal(clean.champion,0);assert.deepEqual(clean.rounds[0].series[0][7][0][5],[]);
  assert.equal(polluted.champion,101,'production normalization must not mutate seed');
  const upcoming=toTribuneMatchup({game:clean.rounds[0].series[0][7][0],index:clean,asOf:'2026-10-22'});
  assert.equal(upcoming.status,'upcoming');assert.ok(upcoming.home.runs.every(x=>x===null));
  assert.equal(tournamentDateAt(new Date('2027-02-08T10:59:59Z')),'2027-02-07');
  assert.equal(tournamentDateAt(new Date('2027-02-08T11:00:00Z')),'2027-02-08');
  // Full data loading boundary with a frozen source. Extra-school teammates
  // must never enter the personal follows or the delivery's stat-line count.
  const feed=structuredClone(live);
  feed.roster['303']=[['e','Followed Player','MLB',0,'Club E'],['f','Unfollowed Teammate','MLB',0,'Club E']];
  feed.lines.push(['101','a',1,'b',[4,4,1,0,0,0,0,0,0],'g3','Club A',1,'MLB']);
  for (const day of [0,1]) for (const id of ['e','f']) feed.lines.push(['303',id,day,'b',[4,4,2,0,0,0,0,0,0],`e${day}`,'Club E',1,'MLB']);
  feed.clubs['Club E']=[[0,'e0',1,2],[1,'e1',1,2]];
  const calls=[];
  const sources={
    roster:async()=>structuredClone(roster),
    seed:async()=>structuredClone(index),
    now:()=>new Date('2027-02-03T12:00:00Z'),
    live:async(start,weeks,schoolIds)=>{
      calls.push({start,weeks,schoolIds});
      return {...structuredClone(feed),start,weeks,
        roster:Object.fromEntries(Object.entries(feed.roster).filter(([h])=>schoolIds.includes(h))),
        lines:feed.lines.filter(l=>schoolIds.includes(l[0]))};
    },
  };
  const input={request:{nextUrl:new URL('https://example.yatstats.com')},hsid:'101',schoolName:'Alpha',
    period:{cadence:'daily',start:'2027-02-02',end:'2027-02-02',label:'Feb 2'},
    extraFavorites:[{playerid:'e',display_name:'Followed Player',hsid:'303',schoolName:'Gamma',is_pitcher:false}]};
  const editionData=await loadTribuneData(input,sources);
  assert.equal(editionData.dataStatus,'verified');
  assert.equal(editionData.statLineCount,2,'daily count includes only one home line and one followed line');
  assert.deepEqual(editionData.follows.batting.rows.map(p=>p.id),['e']);
  assert.equal(editionData.homeRoster.batting.rows.find(p=>p.id==='a').cells[3],'1','daily hits exclude Monday');
  assert.equal(editionData.matchup.status,'live');
  assert.ok(calls.some(c=>c.schoolIds.includes('202')),'fantasy opponent is in the scoring cohort');
  assert.ok(calls.every(c=>c.schoolIds.length<=64),'no source request exceeds the API limit');
  const weekly=await loadTribuneData({...input,period:{cadence:'weekly',start:'2027-02-01',end:'2027-02-07',label:'Week 1'}},{...sources,now:()=>new Date('2027-02-08T12:00:00Z')});
  assert.equal(weekly.statLineCount,6,'weekly count excludes other-school teammates and opponent');
  assert.equal(weekly.homeRoster.batting.rows.find(p=>p.id==='a').cells[3],'3','weekly hits sum both real days');
  assert.equal(weekly.matchup.status,'final','weekly edition uses its reporting-week final');
  const unavailable=await loadTribuneData(input,{...sources,live:async()=>{throw new Error('fixture unavailable');}});
  assert.equal(unavailable.dataStatus,'unavailable');
  assert.ok(unavailable.homeRoster.batting.rows.every(p=>p.state==='unavailable'));
  const incomplete=await loadTribuneData(input,{...sources,live:async(...args)=>{const data=await sources.live(...args);if(data.roster['101'])data.roster['101']=data.roster['101'].filter(p=>p[0]!=='c');return data;}});
  assert.equal(incomplete.dataStatus,'unavailable');
  assert.equal(incomplete.homeRoster.batting.rows.find(p=>p.id==='c').state,'unavailable','missing active roster coverage is not a day-off zero');
  const expanded=await loadTribuneData(input,{...sources,live:async(...args)=>{const data=await sources.live(...args);if(data.roster['101'])data.roster['101'].push(['extra','Unexpected Player','MLB',0,'Club A']);return data;}});
  assert.equal(expanded.dataStatus,'unavailable','unexpected scoring population must also block delivery');

  // Exercise the actual live API's membership branch against the saved 43-player
  // canonical roster, plus statuses allowed only in the broader gallery.
  const savedRoster=JSON.parse(readFileSync(join(root,'scripts/fixtures/tribune-hamilton-roster.json'),'utf8'));
  assert.equal(savedRoster.length,43);
  const stage=savedRoster.map(p=>({...p,hsid:'101',first_name:p.firstname,last_name:p.lastname,level_label:p.level,display_level_label:p.level}));
  for (const status of ['FREE AGENT','RED SHIRT','REDSHIRT-MEDICAL']) stage.push({playerid:`excluded-${status}`,hsid:'101',display_name:'Excluded',status_label:status,level_label:'NCAA-D1',position:'OF'});
  stage.push({playerid:'excluded-high-school',hsid:'101',display_name:'Excluded HS',status_label:'ACTIVE',level_label:'HIGH SCHOOL',position:'OF'});
  dbMockPath=join(temporary,'db.ts');
  writeFileSync(dbMockPath,`const stage=${JSON.stringify(stage)};\nexport async function getSeasonUsageByPlayerIds(){return {};}\nexport async function query(sql:string){return {rows:sql.includes('FROM flip_card_front_stage')?stage:[]};}`);
  const {GET:liveGET}=await import(pathToFileURL(join(root,'src/app/api/bracket/live/route.ts')).href);
  const sourceResponse=await liveGET({nextUrl:new URL('https://example.yatstats.com/api/bracket/live?start=2027-02-01&weeks=1&h=101')});
  assert.equal(sourceResponse.status,200);
  const sourceData=await sourceResponse.json();
  assert.deepEqual(sourceData.roster['101'].map(p=>p[0]).sort(),savedRoster.map(p=>String(p.playerid)).sort(),'live scorer population exactly equals canonical 43-player ledger');
  console.log(`PASS: ${cases} old/new scoring parity cases; actual live API 43-player roster parity; daily/weekly loader fixtures; club W-L, personal-follow isolation, unknown-feed, seed isolation and Phoenix cutoff contracts.`);
} finally { rmSync(temporary, {recursive:true,force:true}); }
