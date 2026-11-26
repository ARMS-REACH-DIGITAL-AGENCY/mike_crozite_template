import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';
import { POST as sendPilotReports } from '@/app/api/admin/fan-newsletter-pilot/route';
import { SQL_SEASONS, type Season } from '../../../../../scripts/master-bracket-results';
import { runBracketResultsJob } from '@/lib/bracket/resultsJob';
import { publishNewsletterDay, readNewsletterReview, deliverNewsletterEdition } from '@/lib/newsletter/scheduledPublication';
import { lookupGHLContactByEmail } from '@/lib/gohighlevel';
import { sendDailyPilotEmail } from '@/lib/alumniEmailSender';
import { publishNewsletterPictures, type PictureRun } from '@/lib/newsletter/newsletterImagesServer';
import { normalizeNewsletterRecipients } from '@/lib/newsletter/recipientDirectory';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=300;
// The off-season pilot report's list (unchanged). In season, every registered Fan and
// SuperFan gets the editions (Pete, Nov 25 2026): newsletter_recipients, not a list.
const pilotRecipients=['test1@yatstats.com','test2@yatstats.com','test3@yatstats.com','test4@yatstats.com','test5@yatstats.com','test6@yatstats.com','pcdaction@gmail.com'];
/** Runs at 4:00 AM Arizona (11:00 UTC, no DST), an hour after the 3:00 AM Baseball Cube ingest; reports the prior Phoenix calendar date. */
export async function GET(request:NextRequest){
 const secret=process.env.CRON_SECRET;
 if(!secret||request.headers.get('authorization')!=='Bearer '+secret)
  return NextResponse.json({ok:false,error:'unauthorized'},{status:401});
 const now=new Date();
 const runDate=new Date(now.getTime()-24*60*60*1000);
 const date=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Phoenix',year:'numeric',month:'2-digit',day:'2-digit'}).format(runDate);
 const connection=process.env.PLAYERS_DATABASE_URL||process.env.DATABASE_URL;
 if(!connection) return NextResponse.json({ok:false,error:'database_unavailable'},{status:500});
 const pool=new Pool({connectionString:connection,ssl:{rejectUnauthorized:false},max:2});
 try {
  const {rows}=await pool.query<Season>(SQL_SEASONS,[null,date]);
  const seasons=rows.filter(season=>!season.is_test&&season.opening_day<=date&&date<=season.last_day);
  if(!seasons.length) return await sendOffseasonPilot(request,date,secret);
  if(seasons.length!==1) throw new Error('The scheduled edition must resolve to one active production season');
  const base=(process.env.BRACKET_LIVE_BASE_URL||request.nextUrl.origin).replace(/\/$/,'');
  const publication=await publishNewsletterDay(pool,{
   day:date,season:seasons[0].season_key,base,now,
   expectedEndpoint:new URL(connection).hostname,publicationTarget:'live',
  },runBracketResultsJob);
  // The editions' pictures (Pete, Nov 25 2026): each recipient school's Digest board, and
  // after a Sunday the Gazette's banner, team logos and boards, drawn and stored before
  // the emails go out. A picture that fails is logged; the editions still go out.
  const {rows:fans}=await pool.query<{email:string;home_hsid:number|null}>("SELECT email,home_hsid FROM public.newsletter_recipients WHERE coalesce(email,'')<>'' ORDER BY email");
  const directory=normalizeNewsletterRecipients(fans);
  const recipients=directory.map(fan=>fan.email);
  let pictures:PictureRun|{error:string};
  try {
   pictures=await publishNewsletterPictures(pool,{season:seasons[0].season_key,hsids:[...new Set(directory.flatMap(fan=>fan.homeHsids))],periods:publication.periods,base:request.nextUrl.origin});
  } catch(error) {
   pictures={error:error instanceof Error?error.message:String(error)};
  }
  console.log('[fan-daily-pilot] pictures',JSON.stringify({date,...('error' in pictures?pictures:{drawn:pictures.drawn.length,failed:pictures.failed,skipped:pictures.skipped})}));
  const result=[];
  for(const period of publication.periods) for(const email of recipients){
   try {
    const edition=await readNewsletterReview(pool,{cadence:period.cadence,date:period.date,email,seasonKey:seasons[0].season_key});
    result.push(await deliverNewsletterEdition(pool,edition,{
     lookupContact:lookupGHLContactByEmail,
     send:(contact,rendered,format)=>sendDailyPilotEmail(contact,rendered.subject,rendered.html,{format,text:rendered.text}),
     domainVerified:process.env.YATSTATS_SENDING_DOMAIN_VERIFIED==='true',
    }));
   } catch(error) {
    result.push({email,cadence:period.cadence,status:'error',error:error instanceof Error?error.message:String(error)});
   }
  }
  const failures=result.filter(row=>!['queued','previously_queued','not_subscribed'].includes(row.status));
  console.log('[fan-daily-pilot] stored editions',JSON.stringify({date,season:seasons[0].season_key,periods:publication.periods,results:result.map(({email,cadence,status})=>({email,cadence,status}))}));
  return NextResponse.json({ok:failures.length===0,date,season:seasons[0].season_key,periods:publication.periods,result},{status:failures.length?503:200});
 } catch(error) {
  console.error('[fan-daily-pilot] publication failure',error instanceof Error?error.message:String(error));
  return NextResponse.json({ok:false,date,error:'publication_failed'},{status:500});
 } finally {await pool.end();}
}

// Preserve the existing off-season pilot while the February tournament is
// not active. In-season editions always use the shared stored-result path.
async function sendOffseasonPilot(request:NextRequest,date:string,secret:string){
 const report=new NextRequest(request.url,{
  method:'POST',
  headers:{authorization:'Bearer '+secret,'content-type':'application/json'},
  body:JSON.stringify({date,emails:pilotRecipients,send:true}),
 });
 console.log('[fan-daily-pilot] start',JSON.stringify({date,recipients:pilotRecipients.length,at:new Date().toISOString()}));
 let response:NextResponse;
 try {
  response=await sendPilotReports(report);
 } catch(error) {
  console.error('[fan-daily-pilot] unhandled sender failure',JSON.stringify({date,error:error instanceof Error?error.message:String(error)}));
  return NextResponse.json({ok:false,date,error:'sender_failed'},{status:500});
 }
 const payload=await response.json().catch(()=>({error:'invalid_sender_response'}));
 const failed=Array.isArray(payload.result)?payload.result.filter((r:{status:string})=>!['queued','previously_queued'].includes(r.status)):[];
 const newlyQueued=Array.isArray(payload.result)?payload.result.filter((r:{status:string})=>r.status==='queued').length:0;
 const previouslyQueued=Array.isArray(payload.result)?payload.result.filter((r:{status:string})=>r.status==='previously_queued').length:0;
 console.log('[fan-daily-pilot] completed',JSON.stringify({date,httpStatus:response.status,recipients:pilotRecipients.length,newlyQueued,previouslyQueued,failures:failed.length,results:payload.result?.map((r:{email:string;status:string})=>({email:r.email,status:r.status})),error:payload.error||null}));
 return NextResponse.json({ok:response.ok&&failed.length===0,date,...payload},{status:response.ok&&failed.length===0?200:500});
}
