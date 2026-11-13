'use strict';
// YAT is the ONLY player identity entering live tournament scoring.
// Raw provider IDs remain immutable, independently addressable input keys.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const read = (p) => fs.readFileSync(p, 'utf8');

const schema = read('migrations/20261113_bracket_yatid_game_log_authority.sql');
const route = read('src/app/api/bracket/live/route.ts');
const live = read('src/components/bracket/liveSeason.ts');
const batches = read('src/lib/bracket/fetchLiveBatches.ts');
const resultJob = read('scripts/master-bracket-results.ts');
const gallery = read('src/components/bracket/gallery.tsx');
const favorites = read('src/app/api/favorites/route.ts');

assert.match(schema, /ADD COLUMN IF NOT EXISTS yatid text/);
assert.match(schema, /idx_player_game_logs_yatid_date/);
assert.match(schema, /BEFORE INSERT OR UPDATE OF playerid, source/);
assert.match(schema, /sync_game_log_yatid_on_verified_source/);
assert.match(schema, /yat_bracket_unresolved_game_log_sources/);
assert.match(schema, /p_source='mlb_api' THEN 'tbc'/);
assert.match(schema, /source='tbc' AND ids.source_id=l.playerid/);
assert.doesNotMatch(schema, /UPDATE public.player_game_logs\s+SET playerid/i,
  'Provider identifiers must never be rewritten');

assert.match(route, /roster\[r.hsid\].*\.push\(\[r.yatid,/);
assert.match(route, /schoolOf\.set\(r.yatid, r.hsid\)/);
assert.match(route, /WHERE yatid = ANY\(\$1::text\[\]\)/);
assert.match(route, /SELECT DISTINCT ON \(yatid, source, source_game_id, stat_type\)/);
assert.match(route, /if \(!r.yatid\) throw new Error/);
assert.match(route, /Conflicting active school affiliations/);
assert.doesNotMatch(route, /WHERE playerid::text = ANY\(\$1\)/,
  'Tournament line collection must not use provider source identity');
assert.match(live, /yatIdentityBySourceId\?: Record<string, string>/);
assert.match(batches, /Object\.assign\(into\.yatIdentityBySourceId/);
assert.match(resultJob, /JOIN public.yat_registry_ids ids/);
assert.match(resultJob, /ids.yatid = ANY\(\$1::text\[\]\)/);
assert.match(gallery, /id: String\(r.yatid \|\| r.playerid\)/);
assert.match(gallery, /current.get\(id\) \|\| current.get\(legacyId\)/);
assert.match(gallery, /next\[0\] = id/);
assert.match(favorites, /yatPlayerIds: mapped.map/);

const providerCode = ts.transpileModule(read('src/lib/yatPlayerIdentity.ts'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const providerExports = {};
let queryCalls = 0;
new Function('exports','require', providerCode)(providerExports,(id)=>{
  if(id==='server-only')return {};
  if(id==='@/lib/db')return {query:async(_sql, params)=>{
    queryCalls++;
    assert.equal(params[0], 'presto_sports');
    return {rows:[{source_id:'school-5004:PS123',yatid:'YAT040182'}]};
  }};
  throw Error('Unexpected test dependency '+id);
});
assert.equal(providerExports.externalPlayerKey('presto_sports','PS123','school-5004'),'school-5004:PS123');
assert.throws(()=>providerExports.externalPlayerKey('presto_sports','PS123'),/institution scope/);
assert.throws(()=>providerExports.externalPlayerKey('sidearm','PS123'),/institution scope/);
assert.equal(providerExports.externalPlayerKey('tbc','81346'),'81346');

(async()=>{
  const hit=await providerExports.findYatIdsByProvider('presto_sports',['school-5004:PS123','school-5004:PS123']);
  assert.equal(hit.size,1);
  assert.equal(hit.get('school-5004:PS123'),'YAT040182');
  const miss=await providerExports.findYatIdsByProvider('presto_sports',[]);
  assert.equal(miss.size,0);
  assert.equal(queryCalls,1,'duplicate import source keys require one indexed lookup');
  await assert.rejects(()=>providerExports.findYatIdsByProvider('tbc',Array.from({length:2001},(_,i)=>String(i))),/batches/);
  console.log('PASS YAT-native bracket, preserved provider IDs, future Presto namespace and unresolved holds');
})().catch(err=>{console.error(err);process.exitCode=1;});
