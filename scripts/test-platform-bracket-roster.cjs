'use strict';
// Contract test for the platform-wide bracket roster reader. It deliberately
// exercises the API without querying production or writing scoring records.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const read = (path) => fs.readFileSync(path, 'utf8');
const compile = (file, dependencies) => {
  const exported = {};
  const js = ts.transpileModule(read(file), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(js, {
    exports: exported,
    require: (id) => {
      assert.ok(Object.hasOwn(dependencies, id), 'Unexpected dependency '+id);
      return dependencies[id];
    },
    console,
  }, { filename: file });
  return exported;
};
const statuses = compile('src/lib/galleryStatuses.ts', {});
let stage = [], usageRows = [], failUsage = false, failStage = false, calls = [];
const routePath = 'src/app/api/players/[hsid]/route.ts';
const source = read(routePath);
assert.doesNotMatch(source, /import[^\n]*getActiveRosterByHsid/,
  'Bracket roster must not depend on expensive full historical stats query');
assert.match(source, /FROM public\.player_game_logs/);
assert.match(source, /yatid=ANY\(\$1::text\[\]\)/);
assert.match(read('src/components/bracket/SchoolBracket.tsx'),
  /card\.state !== 'live' && card\.state !== 'final'/,
  'Unplayed 2027 bracket cards must not prefetch every opponents roster');
const api = compile(routePath, {
  'next/server': { NextResponse: { json: (body, init={}) => ({
    status: init.status || 200,
    headers: init.headers || {},
    json: async () => body,
  }) } },
  '@/lib/db': {
    getFlipCardFrontStageByHsid: async () => {
      if (failStage) throw new Error('stage unavailable');
      return stage;
    },
    query: async (sql, args=[]) => {
      calls.push({ sql, args });
      if (sql.includes('FROM public.player_game_logs')) {
        if (failUsage) throw new Error('game logs timed out');
        return { rows: usageRows };
      }
      if (sql.includes('FROM team_id_map')) return { rows: [] };
      throw new Error('Unexpected query: '+sql);
    },
  },
  '@/lib/galleryStatuses': statuses,
});
const active = Array.from({length:45},(_,i)=>({
  playerid: String(190000+i), yatid: 'YAT'+String(200000+i),
  hsid:'5004', display_name: 'Alumnus '+i, first_name:'Alumnus',
  last_name:String(i), status_label:'ACTIVE', level_label:'NCAA-D1',
  position:i%3===0?'P':'IF', current_team_name:'Test College',
}));
stage = [
  ...active,
  {playerid:'YAT000001',yatid:'YAT000001',hsid:'5004',
   display_name:'Madden Pezzorello',status_label:'ACTIVE',
   level_label:'NCAA-D3',position:'P'},
  {playerid:'YAT000777',yatid:'YAT000777',hsid:'5004',
   display_name:'Two-Way Alumnus',status_label:'ACTIVE',
   level_label:'NCAA-D1',position:'H-P'},
  {playerid:'YAT000778',yatid:'YAT000778',hsid:'5004',
   display_name:'Injured Alumnus',status_label:'INJURED 10-DAY',
   level_label:'MLB',position:'SS'},
  {playerid:'YAT000779',yatid:'YAT000779',hsid:'5004',
   display_name:'Retired Alumnus',status_label:'RETIRED',
   level_label:'MLB',position:'P'},
  {playerid:'YAT000780',yatid:'YAT000780',hsid:'5004',
   display_name:'HS Student',status_label:'ACTIVE',
   level_label:'HIGH SCHOOL',position:'P'},
];
usageRows = [
  {yatid:'YAT200001',has_batting:true,has_pitching:false},
  {yatid:'YAT200003',has_batting:false,has_pitching:true},
  {yatid:'YAT000777',has_batting:true,has_pitching:true},
];
const invoke = async()=> {
  const r=await api.GET({}, {params:Promise.resolve({hsid:'5004'})});
  return {r,body:await r.json()};
};
(async()=>{
  let {r,body}=await invoke();
  assert.equal(r.status,200);
  assert.equal(body.length,48,'Every eligible alum must be listed even with zero stats');
  assert.ok((r.headers['Cache-Control']||'').includes('s-maxage='));
  assert.ok(body.every(x=>x.yatid?.startsWith('YAT')));
  assert.ok(body.find(x=>x.playerid==='YAT000001').is_pitcher,
    'Madden keeps his pitcher role without a game log');
  assert.equal(body.find(x=>x.playerid==='YAT000001').has_2026_stats,false,
    'Missing logs are not invented statistics');
  assert.equal(body.find(x=>x.playerid==='YAT000777').is_two_way_2026,true);
  assert.ok(body.find(x=>x.playerid==='YAT000778'));
  assert.ok(!body.find(x=>x.playerid==='YAT000779'));
  assert.ok(!body.find(x=>x.playerid==='YAT000780'));
  assert.equal(calls.filter(x=>x.sql.includes('player_game_logs')).length,1,
    'Only one school-wide batched game-log lookup is allowed');
  assert.ok(calls.find(x=>x.sql.includes('player_game_logs')).args[0].length===48,
    'Bound the lookup to the exact school roster');
  calls=[]; failUsage=true;
  ({r,body}=await invoke());
  assert.equal(r.status,200,'Optional usage query errors must not fail the roster');
  assert.equal(body.length,48,'Even when stats time out, retain complete roster');
  assert.ok(body.find(x=>x.playerid==='YAT000001').is_pitcher);
  failStage=true;
  ({r,body}=await invoke());
  assert.equal(r.status,500,'Absent canonical roster cannot masquerade as an empty team');
  assert.equal(body.error,'Failed to fetch players');
  console.log('PASS: bracket roster membership, YAT identity, injury/HS filters, bat/pitch groups, zero-stat players, optional stat failure and bounded batch query');
})().catch(e=>{console.error(e);process.exitCode=1;});
