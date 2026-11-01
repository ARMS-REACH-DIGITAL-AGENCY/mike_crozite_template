import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { syncWhereYatSubmissionToArms } from '@/lib/whereYatArmsSync';
import { notifyWhereYatReviewers } from '@/lib/whereYatReviewNotifications';
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
 // Retry reviewer alerts separately from CRM sync. A missing audit or an incomplete
 // email/SMS result is not a successful notification.
 const alertRows=await query<{id:number;hsid:string;playerid:string;display_name:string}>(`
   SELECT a.id,a.hsid,a.playerid,a.display_name FROM public.alumni_where_yat_now a
   WHERE a.status='pending' AND a.proof_confirmed_at IS NOT NULL
     AND a.created_at >= now()-interval '30 days'
     AND NOT EXISTS (
       SELECT 1 FROM public.fan_activity fa
       WHERE fa.action='where_yat_notification'
         AND fa.details->>'submissionId'=a.id::text
         AND fa.details->>'emailQueued'='true'
         AND fa.details->>'smsQueued'='true'
     )
     AND (SELECT count(*) FROM public.fan_activity fa
       WHERE fa.action='where_yat_notification'
         AND fa.details->>'submissionId'=a.id::text
         AND fa.created_at > now()-interval '24 hours') < 6
   ORDER BY a.created_at ASC LIMIT 10`);
 const alerts=[];
 for(const item of alertRows.rows){
   const result=await notifyWhereYatReviewers({id:Number(item.id),hsid:item.hsid,playerId:item.playerid,displayName:item.display_name});
   alerts.push({id:item.id,...result});
 }
 return NextResponse.json({ok:true,attempted:outcomes.length,results:outcomes,reviewAlerts:alerts});
}
