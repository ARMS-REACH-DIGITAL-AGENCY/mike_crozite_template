// TEST ONLY: same production reader, live recipient directory and preferences.
// Never import the delivery function or write to production data. Archive proofs only in verified isolated QA.
import { Pool } from 'pg';
import { mkdirSync,writeFileSync,readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { readNewsletterReview,newsletterPeriods } from '@/lib/newsletter/scheduledPublication';
import { liveNewsletterPreferenceLoader,readLiveNewsletterDirectory } from '@/lib/newsletter/liveNewsletterPreferences';
import { runFanProofs } from './lib/rehearsal-fan-proofs';
async function main(){
 const [date,out,mode]=process.argv.slice(2);
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date||'')||!out)throw Error('Usage: rehearsal-fresh-proofs YYYY-MM-DD output-directory [schools]');
 if(process.env.VERCEL_ENV==='production'||process.env.REHEARSAL_NEON_BRANCH!=='br-falling-wind-a4ew8f1p'||!process.env.DATABASE_URL||process.env.DATABASE_URL!==process.env.PLAYERS_DATABASE_URL)throw Error('Verified isolated QA source required');
 if(new URL(process.env.DATABASE_URL).hostname.split('.')[0].replace(/-pooler$/,'')!=='ep-shy-forest-a4s3qsv6')throw Error('Wrong QA endpoint');
 execFileSync('git',['diff','--quiet','origin/Easter-NEWS','HEAD','--','src/lib/newsletter','src/app/api/cron/fan-daily-pilot/route.ts','src/app/api/admin/rehearsal-newsletter-preferences/route.ts']);
 // Require the reviewed production directory change, never a copied QA list.
 const token=process.env.REHEARSAL_LIVE_FAN_TOKEN;
 if(mode==='schools'){
   const directory=await readLiveNewsletterDirectory(token);
   mkdirSync(out,{recursive:true,mode:0o700});
   writeFileSync(join(out,'schools.txt'),[...new Set(directory.flatMap(x=>x.homeHsids))].sort((a,b)=>a-b).join('\n')+'\n',{mode:0o600});
   return;
 }
 const load=liveNewsletterPreferenceLoader(token);
 const pool=new Pool({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false},max:1});
 try {
  const identity=(await pool.query("SELECT current_setting('neon.endpoint_id',true) AS endpoint")).rows[0];
  if(identity.endpoint!=='ep-shy-forest-a4s3qsv6')throw Error('Connected to wrong database');
  const cp=(await pool.query('SELECT phase FROM bracket_rehearsal_days WHERE season_key=$1 AND report_date=$2',['2027',date])).rows[0];
  if(cp?.phase!=='awaiting_review')throw Error('Only completed days can be reviewed');
  const directory=await readLiveNewsletterDirectory(token);
   await pool.query(`CREATE TABLE IF NOT EXISTS public.rehearsal_fan_proof_runs (
    run_id text NOT NULL, report_date date NOT NULL, summary jsonb NOT NULL,
    editions jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (run_id,report_date)
  )`);
  const result=await runFanProofs(directory,newsletterPeriods(date),out,async(email,period,onPreferences)=>{
   return readNewsletterReview(pool,{...period,email,seasonKey:'2027'},async request=>{
     const prefs=await load(request);onPreferences(prefs.favorites.length,Boolean(prefs.recipient.is_superfan),Number(prefs.recipient.home_hsid));return prefs;
   });
  });
  const editions:Record<string,Record<string,string>>={};
  for(const row of result){
    const key=row.email;
    if(!editions[key]) editions[key]={};
    for(const ext of ['html','txt','manifest.json']){
      const name=row.cadence+(ext==='manifest.json'?'-manifest.json':'.'+ext);
      try{editions[key][name]=readFileSync(join(out,encodeURIComponent(key),name),'utf8');}
      catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
    }
  }
  const run=(process.env.GITHUB_RUN_ID||'manual')+'-'+(process.env.GITHUB_RUN_ATTEMPT||'1');
  await pool.query('INSERT INTO public.rehearsal_fan_proof_runs(run_id,report_date,summary,editions) VALUES($1,$2,$3::jsonb,$4::jsonb) ON CONFLICT(run_id,report_date) DO UPDATE SET summary=EXCLUDED.summary,editions=EXCLUDED.editions',[run,date,JSON.stringify(result),JSON.stringify(editions)]);
  const counts={day:date,mailboxes:directory.length,editions:result.length,failed:result.filter(x=>x.status==='failed').length};
  mkdirSync('reports',{recursive:true});writeFileSync(join('reports','fan-proof-counts-'+date+'.json'),JSON.stringify(counts,null,2));
  console.log(JSON.stringify(counts));
 }finally{await pool.end();}
}
main().catch(e=>{console.error('All-fan rehearsal infrastructure failed:',e instanceof Error?e.message:String(e));process.exitCode=1;});
