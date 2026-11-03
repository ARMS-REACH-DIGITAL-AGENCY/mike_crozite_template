// Fill missing HSID records without modifying existing school_success rows.
// Default: dry-run. Applying requires explicit isolation + exact DB host guard.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { Pool } = require('pg');

function loadRouting() {
  const src=fs.readFileSync(path.resolve(__dirname,'../src/lib/schoolDirectoryRouting.ts'),'utf8');
  const js=ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2021}}).outputText;
  const mod={exports:{}};
  vm.runInNewContext(js,{exports:mod.exports,URL,console});
  return mod.exports;
}
async function prepare(client) {
  const { rows: missing }=await client.query(`
    WITH eligible AS (
      SELECT DISTINCT hsid FROM (
        SELECT hsid::integer FROM public.player_hsids WHERE hsid IS NOT NULL
        UNION SELECT hsid::integer FROM public.flip_card_front_stage
          WHERE hsid ~ '^[1-9][0-9]*$' AND hsid::numeric <= 2147483647
      ) all_ids
    )
    SELECT t.hsid,t.hsname,t.hslocation,t.cityname,t.regionid,t.regionname,t.nickname
    FROM eligible e JOIN public.tbc_schools_raw t USING(hsid)
    LEFT JOIN public.school_success s USING(hsid)
    WHERE s.hsid IS NULL
    ORDER BY t.hsid
  `);
  const {rows: existing}=await client.query(
    'SELECT hs_lookup_key, hsid, microsite_url FROM public.school_success'
  );
  const {rows: keyCounts}=await client.query(`
    SELECT hsname || ' (' || hslocation || ')' AS display_key,
           count(*)::integer AS count
    FROM public.tbc_schools_raw GROUP BY 1
  `);
  const routing=loadRouting();
  const reader=async(sql,params=[])=>({rows:(await client.query(sql,params)).rows});
  const urls=new Map();
  for(let i=0;i<missing.length;i+=150) {
    const batch=missing.slice(i,i+150).map(x=>String(x.hsid));
    for(const [id,url] of await routing.canonicalSchoolUrls(batch,reader)) urls.set(id,url);
  }
  const keys=new Set(existing.map(x=>String(x.hs_lookup_key)));
  const takenUrls=new Set(existing.map(x=>routing.normalizeSchoolHost(String(x.microsite_url||''))).filter(Boolean));
  const multiplicities=new Map(keyCounts.map(x=>[x.display_key,Number(x.count)]));
  const seenUrls=new Set(), records=[],blocked=[];
  for(const row of missing) {
    const id=String(row.hsid);
    const url=urls.get(id)||'';
    const host=routing.normalizeSchoolHost(url);
    const valid=Boolean(url && url==='https://'+host &&
      routing.schoolHostnamePattern(host)?.type==='named' &&
      !takenUrls.has(host) && !seenUrls.has(host));
    const display=row.hsname+' ('+row.hslocation+')';
    const key=display+((multiplicities.get(display)>1 || keys.has(display))?' [HSID:'+id+']':'');
    if(!valid || !row.hsname || !row.hslocation || !/^[a-z]{2}$/i.test(row.regionid||'') || keys.has(key)) {
      blocked.push({hsid:id,reason:valid?'school key/metadata':'invalid or claimed URL'});
      continue;
    }
    keys.add(key);
    seenUrls.add(host);
    records.push({
      hs_lookup_key:key,high_school:display,hsid:Number(id),hsname:row.hsname,
      hslocation:row.hslocation,cityname:row.cityname,
      regionname:row.regionname,regionid:row.regionid,nickname:row.nickname,
      staging_url:'https://'+id+'.yatstats.com',microsite_url:url
    });
  }
  return {missing:missing.length,records,blocked};
}
async function main() {
  const apply=process.argv.includes('--apply');
  const connection=process.env.DATABASE_URL;
  if(!connection)throw Error('DATABASE_URL is required');
  if(apply) {
    if(process.env.YATSTATS_URL_SEED_ISOLATED!=='1')throw Error('Write denied outside isolated test');
    if(!process.env.YATSTATS_URL_SEED_EXPECTED_DB_HOST ||
       new URL(connection).hostname!==process.env.YATSTATS_URL_SEED_EXPECTED_DB_HOST)
      throw Error('Write denied: database host mismatch');
  }
  const pool=new Pool({connectionString:connection,max:1,connectionTimeoutMillis:15000,ssl:{rejectUnauthorized:false}});
  const client=await pool.connect();
  try {
    const plan=await prepare(client);
    console.log(JSON.stringify({missing:plan.missing,ready:plan.records.length,
      blocked:plan.blocked,examples:plan.records.slice(0,4)},null,2));
    if(!apply)return;
    if(plan.missing!==746 || plan.records.length!==746 || plan.blocked.length)
      throw Error('Insert disabled: validation count differs from verified snapshot');
    await client.query('BEGIN');
    try {
      await client.query("SET LOCAL lock_timeout = '5s'");
      const result=await client.query(`
        WITH incoming AS (
          SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(
            hs_lookup_key text,high_school text,hsid integer,hsname text,hslocation text,
            cityname text,regionname text,regionid text,nickname text,
            staging_url text,microsite_url text
          )
        ), inserted AS (
          INSERT INTO public.school_success (
            hs_lookup_key,high_school,hsid,hsname,hslocation,cityname,regionname,
            regionid,nickname,staging_url,microsite_url
          )
          SELECT i.hs_lookup_key,i.high_school,i.hsid,i.hsname,i.hslocation,i.cityname,
                 i.regionname,i.regionid,i.nickname,i.staging_url,i.microsite_url
          FROM incoming i
          WHERE NOT EXISTS (SELECT 1 FROM public.school_success x WHERE x.hsid=i.hsid)
            AND NOT EXISTS (SELECT 1 FROM public.school_success x WHERE x.hs_lookup_key=i.hs_lookup_key)
          ON CONFLICT (hs_lookup_key) DO NOTHING
          RETURNING hsid
        )
        SELECT count(*)::integer AS inserted_count FROM inserted
      `,[JSON.stringify(plan.records)]);
      assert.equal(result.rows[0].inserted_count,746,'Insert must match verified missing count');
      await client.query('COMMIT');
      console.log('ISOLATED VERIFIED: inserted 746 new HSID records; existing rows unchanged');
    } catch(error){await client.query('ROLLBACK');throw error;}
  }finally{client.release();await pool.end();}
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={prepare};
