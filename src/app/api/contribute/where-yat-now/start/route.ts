import {NextRequest,NextResponse,after} from 'next/server';
import {query} from '@/lib/db';
import {identifyContributor} from '@/lib/contributeServer';
import {notifyWhereYatReviewers} from '@/lib/whereYatReviewNotifications';
import {notifyWhereYatContributor} from '@/lib/whereYatContributorNotifications';
import {syncWhereYatSubmissionToArms} from '@/lib/whereYatArmsSync';
export const runtime='nodejs';
const error=(message:string,status=400)=>NextResponse.json({error:message},{status});
export async function POST(req:NextRequest){
 const who=await identifyContributor(req,req.headers.get('x-firebase-token'));
 if(!who)return error('Sign in or JOIN YAT?STATS to save your memory.',401);
 const body=await req.json().catch(()=>null);
 const playerId=String(body?.playerId||''),hsid=String(body?.hsid||''),name=String(body?.name||'').trim().slice(0,140);
 if(!/^(?:YAT)?[A-Za-z0-9_-]{1,28}$/.test(playerId)||!/^\d{1,10}$/.test(hsid)||!name)return error('Invalid alumni profile.');
 if(body?.claimAttested!==true)return error('Confirm that you are this alumnus or have permission to contribute.',400);
 const email=String(who.email||'').toLowerCase();
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return error('Add a valid email to your YAT?STATS account first.');
 const r=await query<{status_label:string}>('SELECT status_label FROM public.flip_card_front_stage WHERE playerid::text=$1 AND hsid::text=$2 LIMIT 1',[playerId,hsid]);
 if(!r.rows.some(x=>/\bRETIRED\b/i.test(x.status_label||'')&&!/\bACTIVE\b/i.test(x.status_label||'')))return error('Only retired alumni may claim a Where YAT? profile.',409);
 const existing=await query<{id:number,status:string}>("SELECT id,status FROM public.alumni_where_yat_now WHERE playerid=$1 AND hsid=$2 AND contributor_uid=$3 AND status IN ('pending','approved') ORDER BY created_at DESC LIMIT 1",[playerId,hsid,who.uid]);
 if(existing.rows[0])return NextResponse.json({ok:true,id:existing.rows[0].id,status:existing.rows[0].status});
 const created=await query<{id:number}>(
  "INSERT INTO public.alumni_where_yat_now(playerid,hsid,contributor_uid,contact_email,display_name,alumni_claim_attested,status,questionnaire_version) VALUES($1,$2,$3,$4,$5,true,'pending',3) RETURNING id",
  [playerId,hsid,who.uid,email,name]
 );
 const id=created.rows[0].id;
 // Respond before slow CRM/email operations; the identity claim stays pending.
 after(async()=>{
  await notifyWhereYatReviewers({id,hsid,playerId,displayName:name}).catch(e=>console.error('[where-yat] review notification',e));
  await syncWhereYatSubmissionToArms(id).catch(e=>console.error('[where-yat] crm sync',e));
  await notifyWhereYatContributor({id,hsid,email,name,outcome:'received'}).catch(e=>console.error('[where-yat] receipt',e));
 });
 return NextResponse.json({ok:true,id,status:'pending'},{headers:{'Cache-Control':'no-store'}});
}
