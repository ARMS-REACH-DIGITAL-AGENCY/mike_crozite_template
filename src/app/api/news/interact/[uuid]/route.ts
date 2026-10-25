import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { query } from '@/lib/db';
import { identifyFan, likerKey, VISITOR_COOKIE } from '@/lib/fanIdentity';
export const runtime = 'nodejs';
type Ctx={params:Promise<{uuid:string}>};
const bad=(msg:string,status=400)=>NextResponse.json({error:msg},{status});
const valid=(s:string)=>/^[A-Za-z0-9_-]{1,100}$/.test(s);
async function news(uuid:string){const {rows}=await query<{playerid:string|null;hsid:string}>('SELECT playerid,hsid FROM news_articles WHERE uuid=$1 AND verification_status=$2 LIMIT 1',[uuid,'VERIFIED']);return rows[0]||null;}
export async function GET(req:NextRequest,{params}:Ctx){
 const {uuid}=await params;if(!valid(uuid))return bad('Invalid news story.');
 try{if(!await news(uuid))return bad('News story not found.',404);
 const {rows:stats}=await query<{like_count:number;comment_count:number;liked:boolean}>(
  "SELECT (SELECT count(*)::int FROM news_article_likes WHERE news_uuid=$1) AS like_count,(SELECT count(*)::int FROM news_article_comments WHERE news_uuid=$1 AND status='visible') AS comment_count,EXISTS(SELECT 1 FROM news_article_likes WHERE news_uuid=$1 AND actor_uid=$2) AS liked",[uuid,likerKey(req)]);
 const {rows:comments}=await query<{id:string;body:string;created_at:string;first_name:string|null;last_name:string|null}>(
  "SELECT c.id::text,c.body,c.created_at,u.first_name,u.last_name FROM news_article_comments c LEFT JOIN user_profiles u ON u.firebase_uid=c.firebase_uid WHERE c.news_uuid=$1 AND c.status='visible' ORDER BY c.created_at DESC,c.id DESC LIMIT 100",[uuid]);
 const {rows:tags}=await query<{playerid:string;name:string}>(
  "SELECT t.playerid,COALESCE(NULLIF(f.display_name,''),t.playerid) AS name FROM news_article_player_tags t LEFT JOIN flip_card_front_stage f ON f.playerid=t.playerid WHERE t.news_uuid=$1 ORDER BY t.created_at LIMIT 20",[uuid]);
 return NextResponse.json({likeCount:stats[0]?.like_count||0,commentCount:stats[0]?.comment_count||0,likedByMe:Boolean(stats[0]?.liked),comments:comments.reverse().map(c=>({id:c.id,text:c.body,createdAt:c.created_at,author:[c.first_name,c.last_name].filter(Boolean).join(' ')||'A YAT?STATS fan'})),tags},{headers:{'Cache-Control':'no-store'}});
 }catch(e){console.error('[news engagement] read',e);return bad('News interactions are not available.',503);}
}
export async function POST(req:NextRequest,{params}:Ctx){
 const {uuid}=await params;if(!valid(uuid))return bad('Invalid news story.');
 const body=(await req.json().catch(()=>null)) as {action?:string;text?:string;playerId?:string}|null;
 if(!body || !['like','comment','tag'].includes(body.action||''))return bad('Invalid interaction.');
 try{const story=await news(uuid);if(!story)return bad('News story not found.',404);
 const fan=await identifyFan(req);
 if(body.action==='like'){let uid=likerKey(req,fan?.uid);let visitor:string|null=null;if(!uid){visitor=randomUUID();uid='anon:'+visitor;}
  const {rows}=await query<{liked:boolean}>("WITH removed AS (DELETE FROM news_article_likes WHERE news_uuid=$1 AND actor_uid=$2 RETURNING 1),added AS (INSERT INTO news_article_likes(news_uuid,actor_uid) SELECT $1,$2 WHERE NOT EXISTS(SELECT 1 FROM removed) ON CONFLICT DO NOTHING RETURNING 1) SELECT EXISTS(SELECT 1 FROM added) AS liked",[uuid,uid]);
  const result=NextResponse.json({ok:true,liked:Boolean(rows[0]?.liked)});
  if(visitor)result.cookies.set({name:VISITOR_COOKIE,value:visitor,httpOnly:true,sameSite:'lax',secure:true,path:'/',maxAge:31536000});return result;}
 if(!fan)return bad('Sign in to contribute.',401);
 if(body.action==='comment'){const text=String(body.text||'').trim();if(!text||text.length>2000)return bad('Enter 1–2000 characters.');
  const {rows}=await query<{id:string}>('INSERT INTO news_article_comments(news_uuid,firebase_uid,body) VALUES($1,$2,$3) RETURNING id::text',[uuid,fan.uid,text]);return NextResponse.json({ok:true,id:rows[0]?.id},{status:201});}
 const playerId=String(body.playerId||'').trim();if(!/^[A-Za-z0-9_-]{1,40}$/.test(playerId))return bad('Choose a player.');
 const {rows:known}=await query<{playerid:string}>('SELECT playerid FROM flip_card_front_stage WHERE playerid=$1 AND hsid=$2 LIMIT 1',[playerId,story.hsid]);if(!known.length)return bad('Choose a player from this school.');
 await query('INSERT INTO news_article_player_tags(news_uuid,playerid,tagged_by_uid) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[uuid,playerId,fan.uid]);return NextResponse.json({ok:true});
 }catch(e){console.error('[news engagement] write',e);return bad('News interaction could not be saved.',503);}
}
