import { NextRequest,NextResponse } from 'next/server';
import { getTribuneFan,buildTribuneEdition } from '@/lib/tribune/build';
import { tribuneReportingPeriod,parseTribunePilotEmails } from '@/lib/tribune/preferences';
import { renderTribuneHtml,renderTribuneText,tribuneSubject } from '@/lib/tribune/render';
export const runtime='nodejs';export const dynamic='force-dynamic';export const maxDuration=300;
const EXPECTED=['test1@yatstats.com','test2@yatstats.com','test3@yatstats.com','test4@yatstats.com','test5@yatstats.com','test6@yatstats.com','pcdaction@gmail.com'];
/** Preview-only: no provider calls, delivery claims, cron or recipient mutation. */
export async function POST(request:NextRequest){
 if(process.env.VERCEL_ENV==='production') return NextResponse.json({error:'preview_only'},{status:403});
 const secret=process.env.CRON_SECRET;
 if(!secret||request.headers.get('authorization')!=='Bearer '+secret) return NextResponse.json({error:'unauthorized'},{status:401});
 if(process.env.TRIBUNE_PREVIEW_DRY_RUN!=='true') return NextResponse.json({error:'dry_run_required'},{status:403});
 const audience=parseTribunePilotEmails(process.env.TRIBUNE_PILOT_EMAILS);
 if(!audience.configured||audience.emails.length!==7||EXPECTED.some(email=>!audience.emails.includes(email))) return NextResponse.json({error:'pilot_allowlist_mismatch'},{status:403});
 const body=await request.json().catch(()=>null);
 const daily=body?.dailyEnd,weekly=body?.weeklyEnd;
 let periods;
 try{periods=[tribuneReportingPeriod('daily',daily),tribuneReportingPeriod('weekly',weekly)];}catch{return NextResponse.json({error:'invalid_reporting_periods'},{status:400});}
 const results=[];
 for(const email of EXPECTED){
  const fan=await getTribuneFan(email);
  if(!fan){results.push({email,error:'profile_missing'});continue;}
  for(const period of periods){
   try{
    const {edition,statLineCount}=await buildTribuneEdition({request,fan,period,preview:true});
    const html=renderTribuneHtml(edition),plainText=renderTribuneText(edition);
    results.push({email,publication:period.cadence,school:edition.school.name,schoolId:edition.school.id,subject:tribuneSubject(edition),period:edition.period,layoutVersion:edition.layoutVersion,statLineCount,html,plainText,preview:true});
   }catch{results.push({email,publication:period.cadence,error:'render_unavailable'});}
  }
 }
 return NextResponse.json({dryRun:true,expected:14,rendered:results.filter(x=>!('error' in x)).length,results},{headers:{'Cache-Control':'private,no-store'}});
}
