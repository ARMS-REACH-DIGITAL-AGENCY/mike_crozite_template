import { NextRequest, NextResponse } from 'next/server';
import { parseTribunePilotEmails } from '@/lib/tribune/preferences';
import { loadPreparedEdition } from '@/lib/newsletter/preparedResults';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=300;
const EXPECTED=['test1@yatstats.com','test2@yatstats.com','test3@yatstats.com','test4@yatstats.com','test5@yatstats.com','test6@yatstats.com','pcdaction@gmail.com'];
/** Preview diagnostics only. No live bracket scoring, email, delivery claims, or crons. */
export async function POST(request:NextRequest) {
 if (process.env.VERCEL_ENV!=='preview') return NextResponse.json({error:'protected_preview_only'},{status:403});
 if (process.env.TRIBUNE_PREVIEW_DRY_RUN!=='true') return NextResponse.json({error:'dry_run_required'},{status:403});
 const secret=process.env.CRON_SECRET;
 if (!secret||request.headers.get('authorization')!=='Bearer '+secret) return NextResponse.json({error:'unauthorized'},{status:401});
 const audience=parseTribunePilotEmails(process.env.TRIBUNE_PILOT_EMAILS);
 if (!audience.configured||audience.emails.length!==7||EXPECTED.some(e=>!audience.emails.includes(e)))
  return NextResponse.json({error:'pilot_allowlist_mismatch'},{status:403});
 const payload=await request.json().catch(()=>null);
 const daily=payload?.dailyEnd,weekly=payload?.weeklyEnd,season=payload?.season;
 if (typeof daily!=='string'||typeof weekly!=='string'||typeof season!=='string')
  return NextResponse.json({error:'reporting_identity_required'},{status:400});
 const weeklyStart=new Date(weekly+'T12:00:00Z');
 if (!/^\d{4}-\d{2}-\d{2}$/.test(weekly) || !Number.isFinite(weeklyStart.getTime()) || weeklyStart.toISOString().slice(0,10)!==weekly || weeklyStart.getUTCDay()!==0)
  return NextResponse.json({error:'invalid_weekly_end'},{status:400});
 weeklyStart.setUTCDate(weeklyStart.getUTCDate()-6);
 const results=[];
 for (const email of EXPECTED) {
  for (const [cadence,start,end] of [['daily',daily,daily],['weekly',weeklyStart.toISOString().slice(0,10),weekly]] as const) {
   try {
    const e=await loadPreparedEdition({email,cadence,start,end,season});
    results.push({email,cadence,start,end,season,school:e.recipient.home_hsid,
      superfan:e.recipient.is_superfan,favorites:e.favorites.length,
      playerLines:e.playerLines.length,schoolStories:e.schoolStories.length,
      gameScores:e.gameScores.length,homeBoxScores:e.homeBoxScores.length,
      scoreboardSelections:e.scoreBoardPicks.length,status:'source_read_verified'});
   } catch {
    results.push({email,cadence,start,end,season,status:'source_unavailable'});
   }
  }
 }
 const allReady=results.length===14&&results.every(x=>x.status==='source_read_verified');
 return NextResponse.json({dryRun:true,source:'stored_publication_rows_only',rendered:false,
  status:allReady?'source_data_checked':'held_missing_source',results},
  {status:allReady?200:503,headers:{'Cache-Control':'private,no-store'}});
}
