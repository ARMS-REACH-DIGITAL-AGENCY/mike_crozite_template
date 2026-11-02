import { NextRequest,NextResponse } from 'next/server';
import {identifyContributor,isReviewer} from '@/lib/contributeServer';
import {query} from '@/lib/db';
export const runtime='nodejs';
export async function GET(req:NextRequest){
 const who=await identifyContributor(req,req.headers.get('x-firebase-token'));
 if(!who)return NextResponse.json({error:'Sign in to view your private proof.'},{status:401});
 const id=Number(req.nextUrl.searchParams.get('submission'));
 if(!Number.isSafeInteger(id)||id<=0)return NextResponse.json({error:'Invalid proof ID'},{status:400});
 const {rows}=await query(`SELECT id,playerid,hsid,display_name,location_city,location_state,occupation,company_name,business_website,linkedin_url,instagram_url,facebook_url,x_url,story,photo_url,company_logo_url,business_public_opt_in,business_contact_email,business_contact_phone,business_headshot_url,businesses_json,featured_memory_key,favorite_hs_memory,favorite_post_hs_memory,family_life,memory_photos_json,status,created_at,proof_confirmed_at FROM public.alumni_where_yat_now WHERE id=$1 AND (contributor_uid=$2 OR $3::boolean) LIMIT 1`,[id,who.uid,isReviewer(who)]);
 return rows[0]?NextResponse.json({proof:rows[0]},{headers:{'Cache-Control':'private, no-store'}}):NextResponse.json({error:'Proof not found for your account.'},{status:404,headers:{'Cache-Control':'private, no-store'}});
}
