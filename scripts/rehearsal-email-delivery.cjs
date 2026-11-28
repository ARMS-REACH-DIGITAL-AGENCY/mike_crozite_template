// TEST ONLY. Run from the reviewed replay branch. No new mail credential.
// The existing live rehearsal token authenticates the fixed server-side endpoint.
// The server re-renders and claims each permitted newsletter, honoring live opt-outs.
'use strict';
const fs = require('node:fs');
const {Pool} = require('pg');
const endpoint = 'https://hamilton.az.yatstats.com/api/admin/rehearsal-newsletter-delivery';
const QA_BRANCH='br-falling-wind-a4ew8f1p', QA_ENDPOINT='ep-shy-forest-a4s3qsv6';
const okStatus=new Set(['queued','previously_queued','not_subscribed','not_a_registered_fan']);
const nextDay=d=>new Date(Date.parse(d+'T00:00:00Z')+86400000).toISOString().slice(0,10);
const validDay=d=>typeof d==='string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isFinite(Date.parse(d+'T00:00:00Z')) && nextDay(d)===new Date(Date.parse(d+'T00:00:00Z')+86400000).toISOString().slice(0,10);
async function request(payload) {
  const token=process.env.REHEARSAL_LIVE_FAN_TOKEN;
  if(!token||token.length<32)throw Error('Existing rehearsal token unavailable');
  const r=await fetch(endpoint,{method:'POST',redirect:'error',cache:'no-store',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(135000)});
  const result=await r.json().catch(()=>null);
  return {http:r.status,result};
}
async function preflight(){
  const {http,result}=await request({action:'preflight'});
  if(http!==200||!result?.ok||result.mode!=='preflight'||result.approved!==30||result.excluded!==9||result.contactLookupVerified!==true||result.emailsSent!==0) {
    const code=typeof result?.error==='string'&&/^[a-z_]{1,80}$/.test(result.error)?result.error:'unexpected_response';
    throw Error('Existing server sender preflight failed: HTTP '+http+' '+code);
  }
  return result;
}
async function main(){
 const [mode,day]=process.argv.slice(2);
 if(!['activate','send'].includes(mode))throw Error('Use activate or send YYYY-MM-DD');
 if(process.env.REHEARSAL_NEON_BRANCH!==QA_BRANCH||!process.env.DATABASE_URL||process.env.DATABASE_URL!==process.env.PLAYERS_DATABASE_URL||
    new URL(process.env.DATABASE_URL).hostname.split('.')[0].replace(/-pooler$/,'')!==QA_ENDPOINT)throw Error('Verified isolated QA connection required');
 const pool=new Pool({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false},max:1});
 try{
   const {rows:[id]}=await pool.query("SELECT current_setting('neon.endpoint_id',true) AS endpoint");
   if(id?.endpoint!==QA_ENDPOINT)throw Error('Connected to the wrong database');
   if(mode==='activate'){
     const verified=await preflight();
     // If already active, preserve the original cutoff. Otherwise start strictly
     // after the last completed day, even if the prior review run has advanced.
     const db=await pool.connect();
     try{
       await db.query('BEGIN');
       const {rows:[c]}=await db.query('SELECT enabled,first_report_date::text FROM public.rehearsal_email_delivery_control WHERE singleton FOR UPDATE');
       if(!c)throw Error('Missing owner approval');
       if(c.enabled!==verified.enabled || c.first_report_date!==verified.firstReportDate)throw Error('Delivery approval changed since preflight');
       const {rows:[counts]}=await db.query('SELECT count(*) FILTER(WHERE approved)::int AS approved,count(*) FILTER(WHERE NOT approved)::int AS excluded FROM public.rehearsal_email_recipient_policy');
       if(counts.approved!==30||counts.excluded!==9)throw Error('Approved recipient snapshot changed');
       let first=c.first_report_date;
       if(!c.enabled){
         if(first!==null)throw Error('Delivery deliberately paused; do not re-enable automatically');
         const {rows:[last]}=await db.query("SELECT max(report_date)::text AS day FROM public.bracket_rehearsal_days WHERE season_key='2027' AND phase='awaiting_review'");
         first=last.day?nextDay(last.day):'2026-03-23';
         const {rowCount}=await db.query("UPDATE public.rehearsal_email_delivery_control SET enabled=true,first_report_date=$1::date WHERE singleton AND NOT enabled AND first_report_date IS NULL",[first]);
         if(rowCount!==1)throw Error('Activation race');
       }
       await db.query('COMMIT');
       console.log(JSON.stringify({sender:'existing_highlevel',firstReportDate:first,approved:30,excluded:9,backfill:false}));
     }catch(e){await db.query('ROLLBACK').catch(()=>{});throw e;}finally{db.release();}
     return;
   }
   if(!validDay(day))throw Error('Invalid reporting day');
   const {rows:[c]}=await pool.query('SELECT enabled,first_report_date::text FROM public.rehearsal_email_delivery_control WHERE singleton');
   if(!c?.enabled||!c.first_report_date||day<c.first_report_date)throw Error('Day is not authorized for forward-only delivery');
   const {rows:[cp]}=await pool.query("SELECT report_date::text,phase,evidence->'audit'->>'status' AS audit FROM public.bracket_rehearsal_days WHERE season_key='2027' ORDER BY report_date DESC LIMIT 1");
   if(cp?.report_date!==day||cp.phase!=='awaiting_review'||cp.audit!=='passed')throw Error('Latest audited checkpoint required');
   const {rows:addresses}=await pool.query('SELECT email FROM public.rehearsal_email_recipient_policy WHERE approved ORDER BY email');
   if(addresses.length!==30)throw Error('Approved recipient count changed');
   const expectedCadences=new Date(day+'T00:00:00Z').getUTCDay()===0?['daily','weekly']:['daily'];
   const counts={day,approved:addresses.length,excluded:9,expected:addresses.length*expectedCadences.length,statuses:{},transportErrors:0};
   for(const {email} of addresses){
     try{
       const {http,result}=await request({action:'deliver',day,email});
       if(!Array.isArray(result?.statuses)||result.statuses.map(x=>x.cadence).sort().join(',')!==expectedCadences.slice().sort().join(',')){
         counts.transportErrors++;continue;
       }
       for(const row of result.statuses){
         const status=typeof row.status==='string'&&/^[a-z_]{1,80}$/.test(row.status)?row.status:'unexpected_status';
         const key=row.cadence+'/'+status; counts.statuses[key]=(counts.statuses[key]||0)+1;
       }
       if(http!==200 && result.ok===true)counts.transportErrors++;
     }catch{counts.transportErrors++;}
   }
   fs.mkdirSync('reports',{recursive:true});fs.writeFileSync('reports/email-delivery-'+day+'.json',JSON.stringify(counts,null,2));
   console.log(JSON.stringify(counts));
   const covered=Object.values(counts.statuses).reduce((a,b)=>a+b,0);
   const unresolved=Object.entries(counts.statuses).filter(([key])=>!okStatus.has(key.split('/')[1])).reduce((n,[,v])=>n+v,0);
   if(counts.transportErrors||unresolved||covered!==counts.expected)throw Error('Unresolved email delivery attempts; successful sends retained, no duplicate or historical sends');
 }finally{await pool.end();}
}
main().catch(e=>{console.error('Rehearsal delivery:',e instanceof Error?e.message:'unavailable');process.exitCode=1;});
