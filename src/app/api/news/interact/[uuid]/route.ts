import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { identifyFan } from '@/lib/fanIdentity';
import { getUserProfile } from '@/lib/userProfile';
import { isReviewer } from '@/lib/contributeServer';
import { normalizeNewsPublicationDate } from '@/lib/youtubeVideoMetadata';
import { revalidateTag } from 'next/cache';

export const runtime = 'nodejs';
type Ctx = { params: Promise<{ uuid: string }> };
const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });
const validUuid = (uuid: string) => /^[A-Za-z0-9_-]{1,100}$/.test(uuid);
const keys = ['news_liked','news_unliked','news_commented','news_tagged','news_untagged','news_shared'];
async function storyFor(uuid: string) {
  const { rows } = await query<{ playerid: string | null; hsid: string; discovery_source:string|null; contributor_uid:string|null; published_at:string }>(
    "SELECT playerid,hsid,discovery_source,raw_payload->>'contributor_uid' AS contributor_uid,published_at FROM news_articles WHERE uuid=$1 AND verification_status='VERIFIED' LIMIT 1",[uuid]);
  return rows[0] || null;
}
async function registered(req: NextRequest) {
  const fan = await identifyFan(req);
  if (!fan) return null;
  const profile = await getUserProfile(fan.uid);
  return profile?.firebase_uid && profile.email ? fan : null;
}
async function activity(uid: string, action: string, uuid: string, story: {playerid:string|null;hsid:string}, extra: Record<string, unknown> = {}) {
  await query(
    "INSERT INTO fan_activity(firebase_uid,action,playerid,hsid,details) VALUES($1,$2,$3,$4,$5::jsonb)",
    [uid,action,story.playerid,story.hsid,JSON.stringify({ news_uuid:uuid,...extra })]);
}
export async function GET(req: NextRequest,{params}:Ctx) {
  const {uuid}=await params;
  if (!validUuid(uuid)) return fail('Invalid news story.');
  try {
    const story = await storyFor(uuid);
    if (!story) return fail('News story not found.',404);
    // Reuse existing indexed activity log rather than creating a second
    // social-activity schema. Each interaction is associated by news UUID
    // in fan_activity.details, not the numeric timeline moment_id.
    const {rows}=await query<{id:string;firebase_uid:string;action:string;details:any;created_at:string;first_name:string|null;last_name:string|null}>(
      `SELECT a.id::text,a.firebase_uid,a.action,a.details,a.created_at,p.first_name,p.last_name
       FROM fan_activity a LEFT JOIN user_profiles p ON p.firebase_uid=a.firebase_uid
       WHERE a.action=ANY($2::text[]) AND a.details->>'news_uuid'=$1
       ORDER BY a.id ASC LIMIT 1000`,[uuid,keys]);
    const likes=new Set<string>(),comments: Array<{id:string;text:string;createdAt:string;author:string}>=[],tags=new Map<string,{playerid:string;name:string;owners:Set<string>}>();
    for(const row of rows) {
      if(row.action==='news_liked')likes.add(row.firebase_uid);
      if(row.action==='news_unliked')likes.delete(row.firebase_uid);
      if(row.action==='news_commented')comments.push({id:row.id,text:String(row.details?.text||''),createdAt:row.created_at,author:[row.first_name,row.last_name].filter(Boolean).join(' ')||'A YAT?STATS fan'});
      if((row.action==='news_tagged'||row.action==='news_untagged')&&row.details?.playerId){const id=String(row.details.playerId);let tag=tags.get(id);if(!tag){tag={playerid:id,name:String(row.details.playerName||id),owners:new Set()};tags.set(id,tag);}if(row.action==='news_tagged')tag.owners.add(row.firebase_uid);else tag.owners.delete(row.firebase_uid);}
    }
    const viewer=await registered(req);
    const profile=viewer?await getUserProfile(viewer.uid):null;
    const canEditDate=story.discovery_source==='contribute' && Boolean(viewer && (viewer.uid===story.contributor_uid || isReviewer({uid:viewer.uid,email:profile?.email||viewer.email||'',name:'',profile})));
    return NextResponse.json({canEditDate,publishedAt:story.published_at,likeCount:likes.size,commentCount:comments.length,likedByMe:viewer?likes.has(viewer.uid):false,comments:comments.slice(-100),tags:[...tags.values()].filter(t=>t.owners.size>0).map(t=>({playerid:t.playerid,name:t.name,canRemove:viewer? t.owners.has(viewer.uid):false}))},{headers:{'Cache-Control':'no-store'}});
  } catch(e) {console.error('[news interaction] read',e);return fail('News interactions are unavailable.',503);}
}
export async function POST(req:NextRequest,{params}:Ctx) {
  const {uuid}=await params;
  if(!validUuid(uuid))return fail('Invalid news story.');
  const data=await req.json().catch(()=>null) as {action?:string;text?:string;playerId?:string;method?:string;publishedDate?:string}|null;
  if(!data||!['like','comment','tag','untag','share','date'].includes(data.action||''))return fail('Invalid interaction.');
  try {
    const story=await storyFor(uuid);
    if(!story)return fail('News story not found.',404);
    const fan=await registered(req);
    if(!fan)return fail('Register or log in to interact with News.',401);
    if(data.action==='date'){
      if(story.discovery_source!=='contribute')return fail('This source publication date cannot be edited here.',403);
      const profile=await getUserProfile(fan.uid);
      if(story.contributor_uid!==fan.uid && !isReviewer({uid:fan.uid,email:profile?.email||fan.email||'',name:'',profile}))return fail('Only the contributor or an administrator can change this date.',403);
      const original=normalizeNewsPublicationDate(data.publishedDate);
      if(!original)return fail('Enter a valid original publication date.');
      await query("UPDATE news_articles SET published_at=$2::timestamptz,raw_payload=jsonb_set(COALESCE(raw_payload,'{}'::jsonb),'{original_published_at}',to_jsonb($2::text),true) WHERE uuid=$1 AND discovery_source='contribute'",[uuid,original]);
      revalidateTag('school-data:'+story.hsid,{expire:0});
      return NextResponse.json({ok:true,publishedAt:original});
    }
    if(data.action==='like') {
      const {rows}=await query<{action:string}>(
        "SELECT action FROM fan_activity WHERE firebase_uid=$1 AND action IN ('news_liked','news_unliked') AND details->>'news_uuid'=$2 ORDER BY id DESC LIMIT 1",[fan.uid,uuid]);
      const liked=rows[0]?.action!=='news_liked';
      await activity(fan.uid,liked?'news_liked':'news_unliked',uuid,story);
      return NextResponse.json({ok:true,liked});
    }
    if(data.action==='share'){
      await activity(fan.uid,'news_shared',uuid,story,{method:String(data.method||'link').slice(0,25)});
      return NextResponse.json({ok:true});
    }
    if(data.action==='comment') {
      const text=String(data.text||'').trim();
      if(text.length<1||text.length>2000)return fail('Enter 1-2000 characters.');
      await activity(fan.uid,'news_commented',uuid,story,{text});
      return NextResponse.json({ok:true},{status:201});
    }
    const playerId=String(data.playerId||'').trim();
    if(!/^[A-Za-z0-9_-]{1,40}$/.test(playerId))return fail('Choose a player.');
    const {rows}=await query<{display_name:string}>(
      "SELECT display_name FROM flip_card_front_stage WHERE playerid=$1 LIMIT 1",[playerId]);
    if(!rows.length)return fail('Choose a YAT?STATS player.');
    const {rows:history}=await query<{action:string}>(
      "SELECT action FROM fan_activity WHERE firebase_uid=$1 AND action IN ('news_tagged','news_untagged') AND details->>'news_uuid'=$2 AND details->>'playerId'=$3 ORDER BY id DESC LIMIT 1",[fan.uid,uuid,playerId]);
    const active=history[0]?.action==='news_tagged';
    if(data.action==='untag'){if(active)await activity(fan.uid,'news_untagged',uuid,story,{playerId,playerName:rows[0].display_name});}
    else if(!active)await activity(fan.uid,'news_tagged',uuid,story,{playerId,playerName:rows[0].display_name});
    return NextResponse.json({ok:true});
  }catch(e){console.error('[news interaction] write',e);return fail('Could not save News interaction.',503);}
}
