import { NextRequest, NextResponse } from 'next/server';
import { POST as sendPilotReports } from '@/app/api/admin/fan-newsletter-pilot/route';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=300;
const recipients=['test1@yatstats.com','test2@yatstats.com','test3@yatstats.com','test4@yatstats.com','test5@yatstats.com','test6@yatstats.com','pcdaction@gmail.com'];
/** Midnight in Arizona is always 07:00 UTC; use the prior Phoenix calendar date. */
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
 const response=await sendPilotReports(report);
 const payload=await response.json();
 const failed=Array.isArray(payload.result)?payload.result.filter((r:{status:string})=>!['queued','previously_attempted'].includes(r.status)):[];
 console.log('[fan-daily-pilot]',JSON.stringify({date,recipients:recipients.length,failures:failed.length,results:payload.result?.map((r:{email:string;status:string})=>({email:r.email,status:r.status}))}));
 return NextResponse.json({ok:response.ok&&failed.length===0,date,...payload},{status:response.ok&&failed.length===0?200:500});
}
