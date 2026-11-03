// Seed missing school_success URLs using the production canonical routing logic.
// Default mode is strictly read-only. --apply is permitted only with
// YATSTATS_URL_SEED_ISOLATED=1 and a deliberately supplied database connection.
// This script never overwrites a nonblank URL or modifies original 1,024 rows.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const vm = require('node:vm');
const { Pool } = require('pg');

function routingModule() {
  const source = fs.readFileSync(path.resolve(__dirname,'../src/lib/schoolDirectoryRouting.ts'),'utf8');
  const js = ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2021}}).outputText;
  const mod={exports:{}};
  vm.runInNewContext(js,{exports:mod.exports,URL,console},{filename:'schoolDirectoryRouting.js'});
  return mod.exports;
}

async function prepare(client, routing) {
  const run = async (sql,params=[]) => ({ rows:(await client.query(sql,params)).rows });
  const {rows: eligible} = await client.query(`
    SELECT DISTINCT hs.hsid::integer AS hsid
    FROM (
      SELECT hsid FROM public.player_hsids WHERE hsid IS NOT NULL
      UNION SELECT hsid::integer FROM public.flip_card_front_stage
        WHERE hsid ~ '^[1-9][0-9]*$' AND hsid::numeric <= 2147483647
    ) hs JOIN public.tbc_schools_raw t ON t.hsid=hs.hsid
    WHERE hs.hsid>0 ORDER BY 1
  `);
  const {rows: stored}=await client.query(`
    SELECT hsid::text AS hsid, hs_lookup_key, microsite_url, staging_url,
           "1024_microsites" AS original_rank
    FROM public.school_success WHERE hsid IS NOT NULL
  `);
  const byId=new Map(stored.map(r=>[String(r.hsid),r]));
  const map=new Map();
  const ids=eligible.map(r=>String(r.hsid));
  for(let i=0;i<ids.length;i+=200){
    const partial=await routing.canonicalSchoolUrls(ids.slice(i,i+200),run);
    for(const [hsid,url] of partial)map.set(hsid,url);
  }
  const hostnameIds=new Map();
  for(const [id,url] of map){
    const host=routing.normalizeSchoolHost(url);
    if(!hostnameIds.has(host))hostnameIds.set(host,new Set());
    hostnameIds.get(host).add(id);
  }
  const updates=[],collisions=[],invalid=[],missing=[],originals=[];
  for(const id of ids){
    const row=byId.get(id),url=map.get(id);
    if(!row){missing.push(id);continue;}
    if(row.original_rank!==null && row.original_rank!==undefined){originals.push(id);continue;}
    const blankUrl=!String(row.microsite_url||'').trim();
    const blankStage=!String(row.staging_url||'').trim();
    if(!blankUrl&&!blankStage)continue;
    const host=routing.normalizeSchoolHost(url||'');
    const valid=url && url.toLowerCase()===('https://'+host) && routing.schoolHostnamePattern(host)?.type==='named';
    if(!valid){invalid.push({hsid:id,url:url||null});continue;}
    const claimed=hostnameIds.get(host);
    if(claimed?.size!==1){collisions.push({hsid:id,hostname:host,conflicts:[...claimed||[]]});continue;}
    updates.push({hsid:Number(id),microsite_url:blankUrl?url:null,
      staging_url:blankStage?'https://'+id+'.yatstats.com':null,
      previous_microsite_url:row.microsite_url,previous_staging_url:row.staging_url});
  }
  const conflicts=new Map();
  // A candidate must not reassign an existing curated hostname, including
  // duplicated original URLs. The generated map includes those originals.
  for(const row of stored){
    const current=String(row.microsite_url||'').trim().toLowerCase().replace(/\/+$/,'');
    if(!current)continue;
    const host=routing.normalizeSchoolHost(current);
    if(!conflicts.has(host))conflicts.set(host,new Set());
    conflicts.get(host).add(String(row.hsid));
  }
  const approved=updates.filter(row=>{
    if(!row.microsite_url)return true;
    const host=routing.normalizeSchoolHost(row.microsite_url);
    const other=conflicts.get(host);
    if(other&&([...other].some(id=>id!==String(row.hsid)))) {
      collisions.push({hsid:String(row.hsid),hostname:host,conflicts:[...other]});
      return false;
    }
    return true;
  });
  return {eligible:ids.length,originals:originals.length,existing_success:ids.length-missing.length,
    missing_success:missing.length, generated:map.size, approved, invalid, collisions};
}

async function main(){
  const apply=process.argv.includes('--apply');
  if(apply&&process.env.YATSTATS_URL_SEED_ISOLATED!=='1')throw Error('Refusing write without isolated-preview approval flag');
  const url=process.env.DATABASE_URL;
  if(!url)throw Error('DATABASE_URL required; only connect to the explicitly selected isolated Neon database');
  const pool=new Pool({connectionString:url,max:1,connectionTimeoutMillis:15000,ssl:{rejectUnauthorized:false}});
  const client=await pool.connect();
  try{
    const plan=await prepare(client,routingModule());
    console.log(JSON.stringify({
      eligible:plan.eligible,original_urls_preserved:plan.originals,existing_success_rows:plan.existing_success,
      absent_success_rows_deferred:plan.missing_success,generated:plan.generated,
      safe_rows_to_fill:plan.approved.length,invalid_candidates:plan.invalid.length,
      url_collision_candidates:plan.collisions.length,
      invalid_examples:plan.invalid.slice(0,10),collision_examples:plan.collisions.slice(0,10)
    },null,2));
    if(!apply)return;
    if(plan.generated!==plan.eligible)throw Error('Incomplete URL coverage');
    // Ambiguous or malformed URLs are quarantined, not written. Safe rows
    // can proceed independently; the report lists every deferred candidate.
    await client.query('BEGIN');
    try{
      // Original school rows are never touched, even if their URL is missing.
      let affected=0;
      for(let i=0;i<plan.approved.length;i+=200){
        const batch=plan.approved.slice(i,i+200);
        const result=await client.query(`
          WITH incoming AS (
            SELECT * FROM jsonb_to_recordset($1::jsonb)
              AS x(hsid integer,microsite_url text,staging_url text)
          )
          UPDATE public.school_success s
          SET microsite_url=CASE WHEN NULLIF(BTRIM(s.microsite_url),'') IS NULL
                    THEN COALESCE(i.microsite_url,s.microsite_url) ELSE s.microsite_url END,
              staging_url=CASE WHEN NULLIF(BTRIM(s.staging_url),'') IS NULL
                    THEN COALESCE(i.staging_url,s.staging_url) ELSE s.staging_url END
          FROM incoming i WHERE s.hsid=i.hsid AND s."1024_microsites" IS NULL
            AND ((NULLIF(BTRIM(s.microsite_url),'') IS NULL AND i.microsite_url IS NOT NULL)
              OR (NULLIF(BTRIM(s.staging_url),'') IS NULL AND i.staging_url IS NOT NULL))
        `,[JSON.stringify(batch.map(({hsid,microsite_url,staging_url})=>({hsid,microsite_url,staging_url})))]);
        affected+=result.rowCount;
      }
      assert.equal(affected,plan.approved.length,'Every intended record must update exactly once');
      await client.query('COMMIT');
      console.log('ISOLATED APPLY: '+affected+' school_success rows updated');
    }catch(e){await client.query('ROLLBACK');throw e;}
  }finally{client.release();await pool.end();}
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1});
module.exports={prepare};
