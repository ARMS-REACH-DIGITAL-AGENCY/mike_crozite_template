const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const source=fs.readFileSync(`${root}/src/app/[hsid]/page.tsx`,'utf8');
const compile=code=>ts.transpileModule(code,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2021,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const base=(id,status,level='MLB')=>({playerid:id,firstname:id,lastname:'Player',status_label:status,level_label:level,level,roster_years:[2004]});
let fixture={};
const Card=({player,isAllTime})=>React.createElement('article',{'data-playerid':player.playerid,'data-status':player.status_label,'data-has-2026-stats':String(player.has_2026_stats===true),'data-pending':String(player.season_stats_pending===true),'data-tribute':player.tribute_stats_source_playerid||'','data-hr':player.hr??'','data-all-time':String(!!isAllTime)},player.display_name||player.firstname);
const imports={
  'react/jsx-runtime':require('react/jsx-runtime'),
  'next/navigation':{notFound(){throw Error('notFound')},redirect(url){throw Error(`redirect:${url}`)},permanentRedirect(url){throw Error(`redirect:${url}`)}},
  'next/headers':{headers:async()=>new Headers({host:'preview.vercel.app'})},
  '@/lib/db':{
    getSchoolByHsid:async()=>({hsid:fixture.hsid||'1',hsname:'Test School',hslocation:'City,AZ'}),getSchoolByUrl:async()=>null,
    getActiveRosterByHsid:async(hsid)=>hsid==='5004'&&fixture.hsid==='12720'?[{playerid:'317316',hr:20,stat_year:'2026'}]:fixture.active||[],
    getAllTimeRosterByHsid:async()=>fixture.allTime||[],getFlipCardFrontStageByHsid:async()=>fixture.stage||[],
    getBatchDesignatedPlayerImages:async()=>new Map(),getPlayerById:async()=>null,
  },
  '@/lib/playerHeadshots':{getBatchPlayerHeadshots:async()=>new Map()},
  '@/lib/schoolAssets':{getSchoolCrestUrl:()=>'/crest.png'},
  '@/lib/canonicalUrl':{getCanonicalBaseUrl:()=> 'https://test.az.yatstats.com'},
  '@/lib/schoolSegment':{isNeverASchoolSegment:()=>false},
  '@/lib/playerUtils':{formatSchoolName:x=>x,sortActivePlayers:x=>x,sortAllTimePlayers:x=>x,isRetiredAtHighSchoolLevel:p=>p.status_label==='RETIRED'&&p.level_label==='HIGH SCHOOL'},
  '@/lib/bracket/shareGame':{cleanSchoolLabel:x=>x,getSharedFantasyGame:async()=>null},
  '@/lib/teamYearShare':{parseTeamYear:x=>/^\d{4}$/.test(x||'')?String(x):null,teamYearCardOrder:(rows,year)=>rows.map(player=>({player,onTeam:player.roster_years?.map(String).includes(year)}))},
  '@/lib/teamYearShareMeta':{teamYearShareMeta:()=>({})},
  '@/components/yatstats/PlayerCard':{default:Card},
  '@/components/yatstats/NewsGallery':{default:()=>null},
  '@/components/bracket/SchoolBracket':{default:()=>null},
  '@/components/yatstats/PartnerProgramPage':{default:()=>null},
};
const out={exports:{}};
vm.runInNewContext(compile(source),{exports:out.exports,URL,Map,Set,console,React,require:name=>{assert.ok(imports[name],name);return imports[name];}});
// Render the actual server page using the project's existing React runtime.
// Inspect its element output directly so the preserved fixture needs no DOM
// package beyond the repository's existing TypeScript/React dependencies.
function* elements(node) {
  if (Array.isArray(node)) { for (const child of node) yield* elements(child); return; }
  if (!React.isValidElement(node)) return;
  if (typeof node.type === 'function') { yield* elements(node.type(node.props)); return; }
  yield node;
  yield* elements(node.props.children);
}
const find = (tree, predicate) => [...elements(tree)].find(predicate);
const section = (tree, id) => find(tree, node => node.type === 'section' && node.props.id === id);
const articles = (tree, id) => [...elements(section(tree, id))].filter(node => node.type === 'article');
const ids = (tree, id) => articles(tree, id).map(node => node.props['data-playerid']);
const render = async (data, query = {}) => {
  fixture = data;
  const tree = await out.exports.default({
    params: Promise.resolve({ hsid: data.hsid || '1' }), searchParams: Promise.resolve(query),
  });
  renderToStaticMarkup(tree);
  return tree;
};
(async()=>{
  const retired={...base('retired-current','RETIRED'),stat_year:'2026',hr:12};
  const free={...base('free-current','FREE AGENT'),pitch_year:'2026',ip:42,is_pitcher:true};
  const cam={...base('cam','UNKNOWN'),has_2026_stats:true,season_stats_pending:true,is_pitcher:true};
  const historical=base('historical','UNKNOWN');
  const stageOnly=base('stage-only','ACTIVE');
  const current=base('current-team','COMMIT','HIGH SCHOOL');
  const data={active:[retired,free,cam],allTime:[historical,retired,free,cam],stage:[historical,retired,free,cam,stageOnly,current]};
  const doc=await render(data);
  assert.deepEqual(ids(doc,'sec-active'),['retired-current','free-current','cam']);
  assert.deepEqual(ids(doc,'sec-alltime'),['historical','retired-current','free-current','cam','stage-only']);
  assert.equal(find(section(doc, 'sec-active'), node => node.props['data-player-card-wrap'] === 'true' && node.props['data-playerid'] === 'retired-current').props.style?.display, undefined);
  assert.equal(articles(doc, 'sec-active').find(node => node.props['data-playerid'] === 'cam').props['data-pending'], 'true');
  assert.equal(articles(doc, 'sec-active').filter(node => node.props['data-has-2026-stats'] === 'true').length, 3);
  assert.ok(ids(doc, 'sec-current').includes('current-team'));
  console.log('PASS actual SchoolPage separates historical UNKNOWN and stage-only ACTIVE from confirmed 2026 cards, preserving Current Team.');
  const empty=await render({active:[],allTime:[historical],stage:[historical]});
  assert.equal(ids(empty,'sec-active').length,0);assert.deepEqual(ids(empty,'sec-alltime'),['historical']);
  assert.match(renderToStaticMarkup(section(empty, 'sec-active')), /No 2026 stats available/);
  assert.equal(find(section(empty, 'sec-active'), node => node.type === 'a').props.href, '#sec-alltime');
  console.log('PASS empty current-season coverage retains the historical roster and direct All-Time link.');
  const team=await render(data,{team:'2004'});
  assert.ok(section(team, 'sec-alltime').props.className.split(/\s+/).includes('visible'));
  assert.equal(section(team, 'sec-alltime').props['data-alltime-team-year-filter'], '2004');
  console.log('PASS existing shared team-year view and full All-Time membership remain intact.');
  const tribute=await render({hsid:'12720',active:[],allTime:[base('YAT210000','RETIRED')],stage:[base('YAT210000','RETIRED')]});
  assert.equal(ids(tribute,'sec-active').length,0);
  assert.equal(String(articles(tribute, 'sec-alltime')[0].props['data-hr']), '20');
  assert.equal(articles(tribute, 'sec-alltime')[0].props['data-playerid'], 'YAT210000');
  console.log('PASS explicit Nate tribute remains on its historical identity; borrowed stats do not create Active membership.');
})().catch(error=>{console.error(error);process.exitCode=1;});
