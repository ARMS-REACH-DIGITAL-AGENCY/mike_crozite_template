import { NextRequest, NextResponse } from 'next/server';
import { POST as sendPilotReports } from '@/app/api/admin/fan-newsletter-pilot/route';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=300;
const recipients=['test1@yatstats.com','test2@yatstats.com','test3@yatstats.com','test4@yatstats.com','test5@yatstats.com','test6@yatstats.com','pcdaction@gmail.com'];
/** Runs at 4:00 AM Arizona (11:00 UTC, no DST), an hour after the 3:00 AM Baseball Cube ingest; reports the prior Phoenix calendar date. */
export async function GET(request:NextRequest){
 const secret=process.env.CRON_SECRET;
 if(!secret||request.headers.get('authorization')!=='Bearer '+secret)
  return NextResponse.json({ok:false,error:'unauthorized'},{status:401});
 const runDate=new Date(Date.now()-24*60*60*1000);
 const date=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Phoenix',year:'numeric',month:'2-digit',day:'2-digit'}).format(runDate);
 const report=new NextRequest(request.url,{
  method:'POST',
  headers:{authorization:'Bearer '+secret,'content-type':'application/json'},
  body:JSON.stringify({date,emails:recipients,send:true}),
 });
 console.log('[fan-daily-pilot] start',JSON.stringify({date,recipients:recipients.length,at:new Date().toISOString()}));
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
 console.log('[fan-daily-pilot] completed',JSON.stringify({date,httpStatus:response.status,recipients:recipients.length,newlyQueued,previouslyQueued,failures:failed.length,results:payload.result?.map((r:{email:string;status:string})=>({email:r.email,status:r.status})),error:payload.error||null}));
 return NextResponse.json({ok:response.ok&&failed.length===0,date,...payload},{status:response.ok&&failed.length===0?200:500});
}
