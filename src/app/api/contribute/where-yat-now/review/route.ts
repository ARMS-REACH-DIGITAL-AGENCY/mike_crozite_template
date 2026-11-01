import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { identifyContributor, isReviewer } from '@/lib/contributeServer';
import { notifyWhereYatContributor } from '@/lib/whereYatContributorNotifications';

export const runtime = 'nodejs';
// Restricted to verified, configured contribution reviewers. No public approval.
async function reviewer(req: NextRequest) {
  const token = req.headers.get('x-firebase-token');
  return isReviewer(await identifyContributor(req, token));
}
export async function GET(req: NextRequest) {
  if (!await reviewer(req)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const result = await query(
    `SELECT id, playerid, hsid, contact_email, display_name, location_city,
       location_state, occupation, company_name, business_website,
       linkedin_url, instagram_url, facebook_url, x_url, story, photo_url, company_logo_url,
       sponsorship_interest, retirement_year,favorite_hs_memory,favorite_post_hs_memory,family_life,business_message,business_offer,business_contact_email,business_contact_phone,business_public_opt_in,private_teammate_tips,life_photos_json,alumni_claim_attested,created_at, proof_confirmed_at, identity_review_method, identity_review_note,arms_sync_status,arms_sync_attempts,arms_synced_at,arms_sync_error,arms_contact_id,arms_task_id
     FROM public.alumni_where_yat_now WHERE status='pending'
     ORDER BY created_at ASC LIMIT 100`);
  return NextResponse.json({ submissions: result.rows });
}
export async function POST(req: NextRequest) {
  if (!await reviewer(req)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  // Isolated previews (own database copy, no outside deliveries) may approve for testing.
  if (process.env.VERCEL_ENV === 'preview' && process.env.YATSTATS_ISOLATED_PREVIEW !== '1') return NextResponse.json({ error: 'Approval is disabled on preview deployments.' }, { status: 409 });
  let data: { id?: number; status?: string; identityMethod?: string; identityNote?: string };
  try { data = await req.json(); } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }); }
  if (!Number.isSafeInteger(data.id) || !['approved', 'rejected'].includes(data.status || ''))
    return NextResponse.json({ error: 'Invalid review action' }, { status: 400 });
  const reviewerIdentity=await identifyContributor(req,req.headers.get('x-firebase-token'));
  const method=String(data.identityMethod||'').trim().slice(0,120);
  const note=String(data.identityNote||'').trim().slice(0,1000);
  if(data.status==='approved'&&(!['known-person','coach-roster','verified-school-contact','verified-direct-contact'].includes(method)||note.length<12))
    return NextResponse.json({error:'Choose an independent identity check and record supporting evidence (at least 12 characters).'}, {status:400});
  const result = await query<{id:number;playerid:string;hsid:string;contact_email:string;display_name:string;status:string}>(
    `UPDATE public.alumni_where_yat_now
       SET status=$2,reviewed_at=now(), reviewed_by_uid=$3,identity_review_method=$4,identity_review_note=$5
       WHERE id=$1 AND status='pending' AND ($2='rejected' OR proof_confirmed_at IS NOT NULL)
       RETURNING id,playerid,hsid,contact_email,display_name,status`,
    [data.id,data.status,reviewerIdentity?.uid||'',method||null,note||null]
  );
  const item=result.rows[0];
  if(!item)return NextResponse.json({error:'Record not found, already reviewed, or contributor proof not confirmed.'},{status:409});
  await notifyWhereYatContributor({id:item.id,hsid:item.hsid,email:item.contact_email,name:item.display_name,outcome:item.status as 'approved'|'rejected'}).catch(error=>console.error('[where-yat-review] contributor notification failed',error));
  return NextResponse.json({ok:true,item});
}
