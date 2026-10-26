import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { identifyFan } from '@/lib/fanIdentity';
import { getUserProfile } from '@/lib/userProfile';

export const runtime = 'nodejs';
type Ctx = { params: Promise<{ uuid: string }> };
const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });
const validUuid = (uuid: string) => /^[A-Za-z0-9_-]{1,100}$/.test(uuid);
const keys = ['news_liked','news_unliked','news_commented','news_tagged','news_untagged','news_shared'];
const editableText = (x: unknown, max: number) =>
  typeof x === 'string' ? x.replace(/<[^>]*>/g, ' ').trim().slice(0, max) : '';
function reviewerEmail(email: string | null | undefined) {
  const allowed = (process.env.CONTRIBUTE_REVIEWER_EMAILS || '').split(',')
    .map(x => x.trim().toLowerCase()).filter(Boolean);
  return Boolean(email && allowed.includes(email.toLowerCase()));
}
type NewsOwner = {playerid:string|null;hsid:string;author_uid:string|null;discovery_source:string|null};
function canEdit(owner:NewsOwner, fan:{uid:string;email:string}|null):boolean {
  return Boolean(fan && ((owner.author_uid && owner.author_uid === fan.uid)
    || reviewerEmail(fan.email)));
}
async function storyFor(uuid: string):Promise<NewsOwner|null> {
  const { rows } = await query<NewsOwner>(
    `SELECT na.playerid,na.hsid,na.discovery_source,
       COALESCE(NULLIF(na.raw_payload->>'contributor_uid',''),q.sender_contact_id) AS author_uid
     FROM news_articles na
     LEFT JOIN news_tip_queue q ON q.id::text=na.raw_payload->>'contribution_id'
     WHERE na.uuid=$1 AND na.verification_status='VERIFIED' LIMIT 1`,[uuid]);
  return rows[0] || null;
}
async function registered(req: NextRequest) {
  const fan = await identifyFan(req);
  if (!fan) return null;
  const profile = await getUserProfile(fan.uid);
  return profile?.firebase_uid && profile.email ? { ...fan, email: profile.email } : null;
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
    const owner = await storyFor(uuid);
    if (!owner) return fail('News story not found.',404);
    // Reuse existing indexed activity log rather than creating a second
    // social-activity schema. Each interaction is associated by news UUID
    // in fan_activity.details, not the numeric timeline moment_id.
    const {rows}=await query<{id:string;firebase_uid:string;action:string;details:any;created_at:string;first_name:string|null;last_name:string|null}>(
      `SELECT a.id::text,a.firebase_uid,a.action,a.details,a.created_at,p.first_name,p.last_name
       FROM fan_activity a LEFT JOIN user_profiles p ON p.firebase_uid=a.firebase_uid
       WHERE a.action=ANY($2::text[]) AND a.details->>'news_uuid'=$1
       ORDER BY a.id DESC LIMIT 2000`,[uuid,keys]);
    const likes=new Set<string>(),comments: Array<{id:string;text:string;createdAt:string;author:string}>=[],tags=new Map<string,{name:string;uid:string}>();
    // Read the bounded events newest-first for efficiency, then replay
    // oldest-first so the last tag/untag event determines membership.
    for(const row of [...rows].reverse()) {
      if(row.action==='news_liked')likes.add(row.firebase_uid);
      if(row.action==='news_unliked')likes.delete(row.firebase_uid);
      if(row.action==='news_commented')comments.push({id:row.id,text:String(row.details?.text||''),createdAt:row.created_at,author:[row.first_name,row.last_name].filter(Boolean).join(' ')||'A YAT?STATS fan'});
      const playerId=String(row.details?.playerId||'');
      if(row.action==='news_tagged' && playerId)tags.set(playerId,{name:String(row.details.playerName||playerId),uid:row.firebase_uid});
      if(row.action==='news_untagged' && playerId)tags.delete(playerId);
    }
    const viewer=await registered(req);
    const ownerMayEdit=canEdit(owner,viewer);
    return NextResponse.json({likeCount:likes.size,commentCount:comments.length,likedByMe:viewer?likes.has(viewer.uid):false,comments:comments.slice(-100),canEdit:ownerMayEdit,
      tags:[...tags].map(([playerid,info])=>({playerid,name:info.name,canRemove:ownerMayEdit || Boolean(viewer?.uid && viewer.uid===info.uid)}))},{headers:{'Cache-Control':'no-store'}});
  } catch(e) {console.error('[news interaction] read',e);return fail('News interactions are unavailable.',503);}
}
export async function POST(req:NextRequest,{params}:Ctx) {
  const {uuid}=await params;
  if(!validUuid(uuid))return fail('Invalid news story.');
  const data=await req.json().catch(()=>null) as {action?:string;text?:string;playerId?:string;method?:string}|null;
  if(!data||!['like','comment','tag','untag','share'].includes(data.action||''))return fail('Invalid interaction.');
  try {
    const story=await storyFor(uuid);
    if(!story)return fail('News story not found.',404);
    const fan=await registered(req);
    if(!fan)return fail('Register or log in to interact with News.',401);
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
    const {rows:latest}=await query<{action:string;firebase_uid:string}>(
      `SELECT action,firebase_uid FROM fan_activity WHERE action IN ('news_tagged','news_untagged')
       AND details->>'news_uuid'=$1 AND details->>'playerId'=$2
       ORDER BY id DESC LIMIT 1`,[uuid,playerId]);
    const currentlyTagged=latest[0]?.action==='news_tagged';
    if(data.action==='untag') {
      if(!currentlyTagged)return NextResponse.json({ok:true,tagged:false});
      if(latest[0].firebase_uid!==fan.uid && !canEdit(story,fan))
        return fail('Only the person who tagged this player or the post owner can remove the tag.',403);
      await activity(fan.uid,'news_untagged',uuid,story,{playerId,playerName:rows[0].display_name});
      return NextResponse.json({ok:true,tagged:false});
    }
    if(!currentlyTagged)
      await activity(fan.uid,'news_tagged',uuid,story,{playerId,playerName:rows[0].display_name});
    return NextResponse.json({ok:true,tagged:true});
  }catch(e){console.error('[news interaction] write',e);return fail('Could not save News interaction.',503);}
}

export async function PATCH(req: NextRequest,{params}:Ctx) {
  const {uuid}=await params;
  if(!validUuid(uuid))return fail('Invalid news story.');
  const body=await req.json().catch(()=>null) as {title?:unknown;description?:unknown}|null;
  if(!body || typeof body.title!=='string' || typeof body.description!=='string')
    return fail('Enter a title and description.');
  const title=editableText(body.title,500),description=editableText(body.description,2000);
  if(title.length<3 || title.length>500)return fail('Enter a title between 3 and 500 characters.');
  try {
    const fan=await registered(req);
    if(!fan)return fail('Please sign in to edit your post.',401);
    const story=await storyFor(uuid);
    if(!story)return fail('News story not found.',404);
    if(!canEdit(story,fan))return fail('Only the original contributor or an authorized reviewer can edit this post.',403);
    // Preserve the original linked media, verification and player mapping.
    // An explicit author edit overrides previously generated headlines.
    await query(`UPDATE news_articles SET title=$2,snippet=$3,local_recap=$3,
      raw_payload=jsonb_set(COALESCE(raw_payload,'{}'::jsonb),'{title_edited}','true'::jsonb,true)
      WHERE uuid=$1 AND verification_status='VERIFIED'`,[uuid,title,description||null]);
    await activity(fan.uid,'news_edited',uuid,story,{fields:['title','description']});
    return NextResponse.json({ok:true,title,description},{headers:{'Cache-Control':'no-store'}});
  }catch(e){console.error('[news interaction] edit',e);return fail('Could not save the edited post.',503);}
}
