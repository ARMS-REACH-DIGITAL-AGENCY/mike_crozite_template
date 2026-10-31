import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { syncWhereYatSubmissionToArms } from '@/lib/whereYatArmsSync';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=120;

export async function GET(req:NextRequest){
 const secret=process.env.CRON_SECRET;
 if(!secret||req.headers.get('authorization')!=='Bearer '+secret)
  return NextResponse.json({error:'Unauthorized'},{status:401});
 if(process.env.VERCEL_ENV!=='production')return NextResponse.json({skipped:'production only'});
 const {rows}=await query<{id:number}>(`SELECT id FROM public.alumni_where_yat_now
   WHERE proof_confirmed_at IS NOT NULL AND created_at >= now()-interval '30 days'
   AND (arms_sync_status IN ('not_sent','failed') OR (arms_sync_status='syncing' AND arms_sync_started_at<now()-interval '10 minutes'))
   AND arms_sync_attempts<15 ORDER BY created_at ASC LIMIT 10`);
 const outcomes=[];
 for(const {id} of rows){outcomes.push({id,ok:await syncWhereYatSubmissionToArms(id)});}
 return NextResponse.json({ok:true,attempted:outcomes.length,results:outcomes});
}
