import {NextRequest,NextResponse} from 'next/server';
import {query} from '@/lib/db';
import {identifyContributor} from '@/lib/contributeServer';
export const runtime='nodejs';
const bad=(error:string,status=400)=>NextResponse.json({error},{status});
const keyOf=(value:string|null)=>value&&/^(favoriteHs|favoriteAfter|family|story|business)$/.test(value)?value:'legacy';
const idOf=(value:string|null)=>{const n=Number(value);return Number.isSafeInteger(n)&&n>0?n:null};
async function live(id:number){const {rows}=await query('SELECT id FROM public.alumni_where_yat_now WHERE id=$1 AND status=$2 LIMIT 1',[id,'approved']);return !!rows.length}
export async function GET(req:NextRequest){
 const id=idOf(req.nextUrl.searchParams.get('id'));if(!id)return bad('Invalid update');
 if(!await live(id))return bad('Update unavailable',404);
 const storyKey=keyOf(req.nextUrl.searchParams.get('storyKey'));
 const fan=await identifyContributor(req,req.headers.get('x-firebase-token'));
 const [likes,comments,liked]=await Promise.all([
  query<{count:number}>('SELECT count(*)::int AS count FROM public.alumni_where_yat_story_likes WHERE submission_id=$1 AND story_key=$2',[id,storyKey]),
  query<{id:string;body:string;created_at:string;first_name:string|null;last_name:string|null}>(
    `SELECT c.id::text,c.body,c.created_at,p.first_name,p.last_name FROM public.alumni_where_yat_comments c
    LEFT JOIN public.user_profiles p ON p.firebase_uid=c.firebase_uid
    WHERE c.submission_id=$1 AND c.story_key=$2 AND c.status='visible' ORDER BY c.created_at DESC LIMIT 100`,[id,storyKey]),
  fan?query<{exists:boolean}>('SELECT EXISTS(SELECT 1 FROM public.alumni_where_yat_story_likes WHERE submission_id=$1 AND firebase_uid=$2 AND story_key=$3) AS exists',[id,fan.uid,storyKey]):Promise.resolve({rows:[{exists:false}]}),
 ]);
 return NextResponse.json({likes:likes.rows[0]?.count||0,liked:!!liked.rows[0]?.exists,comments:comments.rows.map(c=>({id:c.id,text:c.body,when:c.created_at,author:[c.first_name,c.last_name].filter(Boolean).join(' ')||'YAT?STATS Fan'}))},{headers:{'Cache-Control':'no-store'}});
}
export async function POST(req:NextRequest){
 const fan=await identifyContributor(req,req.headers.get('x-firebase-token'));
 if(!fan)return bad('Sign in to like or comment.',401);
 const body=await req.json().catch(()=>({})) as {id?:number;action?:string;text?:string;storyKey?:string};
 const id=idOf(String(body.id||''));if(!id)return bad('Invalid update');
 if(!await live(id))return bad('Update unavailable',404);
 const storyKey=keyOf(body.storyKey||null);
 if(body.action==='like'){
  const deleted=await query('DELETE FROM public.alumni_where_yat_story_likes WHERE submission_id=$1 AND firebase_uid=$2 AND story_key=$3 RETURNING submission_id',[id,fan.uid,storyKey]);
  if(!deleted.rows.length)await query('INSERT INTO public.alumni_where_yat_story_likes(submission_id,firebase_uid,story_key) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[id,fan.uid,storyKey]);
 }else if(body.action==='comment'){
  const comment=String(body.text||'').trim();
  if(!comment||comment.length>2000)return bad('Write a comment up to 2,000 characters.');
  await query('INSERT INTO public.alumni_where_yat_comments(submission_id,firebase_uid,body,story_key) VALUES($1,$2,$3,$4)',[id,fan.uid,comment,storyKey]);
 }else return bad('Invalid action');
 return NextResponse.json({ok:true});
}
