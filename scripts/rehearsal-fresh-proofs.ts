// TEST-ONLY: construct new personalized copies of completed editions. No score,
// ingestion, publication, archive mutation, or email operation is available here.
import { Pool } from 'pg';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { readNewsletterReview } from '@/lib/newsletter/scheduledPublication';
import { liveNewsletterPreferenceLoader } from '@/lib/newsletter/liveNewsletterPreferences';
async function main(){
 const date=process.argv[2],out=process.argv[3];
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date||'')||!out)throw Error('Usage: rehearsal-fresh-proofs YYYY-MM-DD output-directory');
 if(process.env.VERCEL_ENV==='production'||process.env.REHEARSAL_NEON_BRANCH!=='br-falling-wind-a4ew8f1p'||!process.env.DATABASE_URL||process.env.DATABASE_URL!==process.env.PLAYERS_DATABASE_URL)throw Error('Verified isolated QA source required');
 const endpoint=new URL(process.env.DATABASE_URL).hostname;
 if(endpoint.split('.')[0].replace(/-pooler$/,'')!=='ep-shy-forest-a4s3qsv6')throw Error('Wrong QA endpoint');
 execFileSync('git',['diff','--quiet','origin/Easter-NEWS','HEAD','--','src/lib/newsletter/finishedPublication.ts','src/lib/newsletter/scheduledPublication.ts','src/lib/newsletter/liveNewsletterPreferences.ts']);
 const load=liveNewsletterPreferenceLoader(process.env.REHEARSAL_LIVE_FAN_TOKEN);
 const pool=new Pool({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false},max:1});
 try{
  const identity=(await pool.query("SELECT current_setting('neon.endpoint_id',true) AS endpoint")).rows[0];
  if(identity.endpoint!=='ep-shy-forest-a4s3qsv6')throw Error('Connected to wrong database');
  const cp=(await pool.query('SELECT phase FROM bracket_rehearsal_days WHERE season_key=$1 AND report_date=$2',['2027',date])).rows[0];
  if(cp?.phase!=='awaiting_review')throw Error('Only completed days can be reviewed');
  const periods:Array<{cadence:'daily'|'weekly';date:string}>=[{cadence:'daily',date}];
  const d=new Date(date+'T00:00:00Z');
  if(d.getUTCDay()===0) periods.push({cadence:'weekly',date:new Date(+d-6*86400000).toISOString().slice(0,10)});
  mkdirSync(out,{recursive:true});
  for(const period of periods){
   const edition=await readNewsletterReview(pool,{...period,email:'pcdaction@gmail.com',seasonKey:'2027',reviewBaseUrl:'https://mike-crozite-template-git-test-a81a21-arms-reach-digital-agency.vercel.app'},load);
   if(!edition.facts.recipient.is_superfan)throw Error('Live SuperFan required');
   writeFileSync(join(out,period.cadence+'.html'),edition.html);
   writeFileSync(join(out,period.cadence+'.txt'),edition.text);
   writeFileSync(join(out,period.cadence+'-manifest.json'),JSON.stringify({hashes:edition.hashes,favoriteCount:edition.facts.selection.favorites.length,played:edition.facts.rows.daily_stat_lines.map(r=>({name:r.player_name,yatid:r.yatid,line:r.line})),source:'live production preferences',period},null,2));
   console.log(JSON.stringify({cadence:period.cadence,favoriteCount:edition.facts.selection.favorites.length,played:edition.facts.rows.daily_stat_lines.length}));
  }
 }finally{await pool.end();}
}
main().catch(e=>{console.error(e instanceof Error?e.message:String(e));process.exitCode=1;});
