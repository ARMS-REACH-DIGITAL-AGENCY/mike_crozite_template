import {NextRequest,NextResponse} from 'next/server';
import {query} from '@/lib/db';
import {identifyContributor} from '@/lib/contributeServer';
export const runtime='nodejs';
export async function GET(req:NextRequest){
 const playerId=req.nextUrl.searchParams.get('playerId')||'';
 const hsid=req.nextUrl.searchParams.get('hsid')||'';
 if(!/^[A-Za-z0-9_-]{1,40}$/.test(playerId)||!/^\d{1,10}$/.test(hsid))return NextResponse.json({error:'Invalid player'},{status:400});
 const who=await identifyContributor(req,req.headers.get('x-firebase-token'));
 const {rows}=await query<{status:string;display_name:string;location_city:string|null;location_state:string|null;occupation:string|null;company_name:string|null;business_website:string|null;linkedin_url:string|null;instagram_url:string|null;facebook_url:string|null;x_url:string|null;story:string|null;photo_url:string|null;company_logo_url:string|null;business_public_opt_in:boolean;businesses_json:Array<{name:string;website:string;logoUrl?:string}>;business_headshot_url:string|null;featured_memory_key:string|null;favorite_hs_memory:string|null;favorite_post_hs_memory:string|null;family_life:string|null;memory_photos_json:Record<string,Array<{web:string|null;full:string|null;thumb:string|null}>>}>(
 `SELECT status,display_name,location_city,location_state,occupation,company_name,business_website,linkedin_url,instagram_url,facebook_url,x_url,story,photo_url,CASE WHEN business_public_opt_in THEN company_logo_url ELSE NULL END AS company_logo_url,business_public_opt_in,CASE WHEN business_public_opt_in THEN businesses_json ELSE '[]'::jsonb END AS businesses_json,CASE WHEN business_public_opt_in THEN business_headshot_url ELSE NULL END AS business_headshot_url,featured_memory_key,favorite_hs_memory,favorite_post_hs_memory,family_life,memory_photos_json
 FROM public.alumni_where_yat_now
 WHERE playerid=$1 AND hsid=$2 AND (status='approved' OR (contributor_uid=$3 AND status='pending'))
 ORDER BY CASE WHEN status='approved' THEN 0 ELSE 1 END, reviewed_at DESC NULLS LAST,created_at DESC LIMIT 1`,
 [playerId,hsid,who?.uid||'']
 );
 return NextResponse.json({update:rows[0]||null},{headers:{'Cache-Control':'no-store'}});
}
