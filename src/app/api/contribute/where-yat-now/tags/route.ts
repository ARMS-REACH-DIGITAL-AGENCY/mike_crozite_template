import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { identifyContributor } from '@/lib/contributeServer';

export const runtime='nodejs';
const validKeys=['favoriteHs','favoriteAfter','family','story','business'] as const;
type StoryKey=typeof validKeys[number];
function bad(error:string,status=400){return NextResponse.json({error},{status});}
function parseId(raw:string|null){const n=Number(raw);return Number.isSafeInteger(n)&&n>0?n:null;}
function parseKey(raw:string|null):StoryKey|null{return validKeys.find(k=>k===raw)||null;}

async function approved(id:number,key:StoryKey){
  const {rows}=await query<{id:number;playerid:string;contributor_uid:string|null}>(
    "SELECT id,playerid,contributor_uid FROM alumni_where_yat_now WHERE id=$1 AND status='approved' AND (CASE $2 WHEN 'favoriteHs' THEN NULLIF(trim(favorite_hs_memory),'') WHEN 'favoriteAfter' THEN NULLIF(trim(favorite_post_hs_memory),'') WHEN 'family' THEN NULLIF(trim(family_life),'') WHEN 'story' THEN NULLIF(trim(story),'') WHEN 'business' THEN CASE WHEN business_public_opt_in THEN NULLIF(trim(business_message),'') ELSE NULL END END) IS NOT NULL LIMIT 1",
    [id,key]
  );return rows[0]||null;
}
async function players(id:number,key:StoryKey,uid:string|null,owner:string|null){
  const {rows}=await query<{playerid:string;name:string|null;hsid:string|null;tagged_by_me:boolean;can_remove:boolean}>(
    "SELECT t.playerid,f.display_name AS name,f.hsid::text AS hsid,t.tagged_by_firebase_uid=$3 AS tagged_by_me,(t.tagged_by_firebase_uid=$3 OR $3=$4) AS can_remove FROM alumni_where_yat_memory_tags t LEFT JOIN LATERAL (SELECT display_name,hsid FROM flip_card_front_stage WHERE playerid::text=t.playerid ORDER BY hsid LIMIT 1) f ON true WHERE t.submission_id=$1 AND t.story_key=$2 ORDER BY f.display_name,t.playerid",
    [id,key,uid||'',owner||'']
  );
  return rows.map(r=>({playerId:r.playerid,name:r.name||'Player',hsid:r.hsid,isPrimary:false,taggedByMe:r.tagged_by_me,canRemove:r.can_remove}));
}
export async function GET(req:NextRequest){
  const id=parseId(req.nextUrl.searchParams.get('id'));
  const key=parseKey(req.nextUrl.searchParams.get('storyKey'));
  if(!id||!key)return bad('Invalid memory.');
  const post=await approved(id,key);if(!post)return bad('Memory not available.',404);
  const fan=await identifyContributor(req,req.headers.get('x-firebase-token'));
  return NextResponse.json({players:await players(id,key,fan?.uid||null,post.contributor_uid)},{headers:{'Cache-Control':'no-store'}});
}
export async function POST(req:NextRequest){
  const fan=await identifyContributor(req,req.headers.get('x-firebase-token'));
  if(!fan)return bad('Sign in to tag players.',401);
  const body=await req.json().catch(()=>null);
  const id=parseId(String(body?.id||''));
  const key=parseKey(typeof body?.storyKey==='string'?body.storyKey:null);
  const playerId=typeof body?.playerId==='string'?body.playerId.trim():'';
  if(!id||!key||!/^[0-9]{1,18}$/.test(playerId))return bad('Choose a player from search.');
  if(body?.action!=='tag'&&body?.action!=='untag')return bad('Unknown tag action.');
  try{
    const post=await approved(id,key);if(!post)return bad('Memory unavailable.',404);
    if(post.playerid===playerId)return bad('This player already owns this memory.');
    if(body.action==='tag'){
      const {rows:known}=await query<{playerid:string}>('SELECT playerid::text FROM flip_card_front_stage WHERE playerid::text=$1 LIMIT 1',[playerId]);
      if(!known.length)return bad('Choose a player from search.');
      const {rows:result}=await query<{inserted:string|null;already:boolean}>(
        "WITH locked AS (SELECT id FROM alumni_where_yat_now WHERE id=$1 AND status='approved' FOR UPDATE), capacity AS (SELECT count(*)::int AS n FROM alumni_where_yat_memory_tags WHERE submission_id=$1 AND story_key=$2), ins AS (INSERT INTO alumni_where_yat_memory_tags(submission_id,story_key,playerid,tagged_by_firebase_uid) SELECT locked.id,$2,$3,$4 FROM locked,capacity WHERE capacity.n<20 ON CONFLICT(submission_id,story_key,playerid) DO NOTHING RETURNING playerid) SELECT (SELECT playerid FROM ins) AS inserted, EXISTS(SELECT 1 FROM alumni_where_yat_memory_tags WHERE submission_id=$1 AND story_key=$2 AND playerid=$3) AS already",
        [id,key,playerId,fan.uid]
      );
      if(!result[0]?.inserted&&!result[0]?.already)return bad('Up to 20 players can be tagged per memory.',409);
    }else{
      const {rows:deleted}=await query<{playerid:string}>(
        "DELETE FROM alumni_where_yat_memory_tags t USING alumni_where_yat_now m WHERE t.submission_id=m.id AND m.id=$1 AND t.story_key=$2 AND t.playerid=$3 AND m.status='approved' AND (t.tagged_by_firebase_uid=$4 OR m.contributor_uid=$4) RETURNING t.playerid",
        [id,key,playerId,fan.uid]
      );
      if(!deleted.length)return bad('Only the tagger or original author can remove this tag.',403);
    }
    return NextResponse.json({players:await players(id,key,fan.uid,post.contributor_uid)},{headers:{'Cache-Control':'no-store'}});
  }catch(error){console.error('[where-yat-tags] error',error);return bad('Could not update tags.',500);}
}
