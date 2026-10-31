import { NextRequest, NextResponse } from 'next/server';
import { identifyContributor } from '@/lib/contributeServer';
import { query } from '@/lib/db';

export const runtime = 'nodejs';
// Never return someone else's private answers or contact information.
export async function GET(req: NextRequest) {
  const who = await identifyContributor(req, req.headers.get('x-firebase-token'));
  if (!who) return NextResponse.json({error:'Sign in to edit your answers.'},{status:401});
  const playerId = req.nextUrl.searchParams.get('playerId') || '';
  const hsid = req.nextUrl.searchParams.get('hsid') || '';
  if (!/^[A-Za-z0-9_-]{1,40}$/.test(playerId) || !/^\d{1,10}$/.test(hsid))
    return NextResponse.json({error:'Invalid player.'},{status:400});
  const requestedId = req.nextUrl.searchParams.get('submissionId');
  if(requestedId && !/^[1-9]\\d*$/.test(requestedId))return NextResponse.json({error:'Invalid submission.'},{status:400});
  const { rows } = await query(
    `SELECT id, status, display_name, contact_email, location_city, location_state, occupation,
      company_name, business_website, linkedin_url, instagram_url, facebook_url, x_url,
      story, photo_url, company_logo_url, business_public_opt_in,
      business_message, business_offer, business_contact_email, business_contact_phone,
      retirement_year, favorite_hs_memory, favorite_post_hs_memory, family_life,
      private_teammate_tips, life_photos_json, businesses_json, business_headshot_url
     FROM public.alumni_where_yat_now
     WHERE playerid=$1 AND hsid=$2 AND contributor_uid=$3 AND status IN ('approved','pending') AND ($4::bigint IS NULL OR id=$4)
     ORDER BY created_at DESC, id DESC LIMIT 1`,
    [playerId, hsid, who.uid, requestedId||null]
  );
  return NextResponse.json({submission:rows[0]||null},{headers:{'Cache-Control':'private, no-store'}});
}
