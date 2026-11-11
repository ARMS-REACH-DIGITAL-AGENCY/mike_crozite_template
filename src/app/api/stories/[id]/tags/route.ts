import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { identifyFan } from '@/lib/fanIdentity';
import { STORY_MAX_TAGS } from '@/lib/stories';
import { fail, loadLiveStory, logFanActivity, parseStoryId } from '@/lib/storySocial';

export const runtime = 'nodejs';
type Params={params:Promise<{id:string}>};

async function players(id:string,uid:string){
  const {rows}=await query<{playerid:string;hsid:string|null;name:string|null;is_primary:boolean;tagged_by_me:boolean}>(
    "SELECT mp.playerid, f.hsid::text, COALESCE(NULLIF(trim(f.display_name),''),'Player') AS name, mp.is_primary, mp.tagged_by_firebase_uid=$2 AS tagged_by_me FROM player_moment_players mp LEFT JOIN LATERAL (SELECT hsid,display_name FROM flip_card_front_stage WHERE playerid::text=mp.playerid ORDER BY hsid LIMIT 1) f ON true WHERE mp.moment_id=$1 ORDER BY mp.is_primary DESC, name, mp.playerid",
    [id,uid]);
  return rows.map(r=>({playerId:r.playerid,hsid:r.hsid,name:r.name||'Player',isPrimary:r.is_primary,taggedByMe:r.tagged_by_me}));
}

export async function POST(req:NextRequest,{params}:Params){
  const id=parseStoryId((await params).id);
  if(!id)return fail('Story not found.',404);
  const fan=await identifyFan(req);
  if(!fan)return fail('Sign in to tag players.',401);
  const data=await req.json().catch(()=>null);
  const playerId=typeof data?.playerId==='string'?data.playerId.trim():'';
  if(!/^[0-9]{1,18}$/.test(playerId))return fail('Select a player from search.');
  if(data?.action!=='tag'&&data?.action!=='untag')return fail('Unknown tag action.');
  try{
    const story=await loadLiveStory(id);
    if(!story)return fail('Story not found.',404);
    const {rows:access}=await query<{ok:boolean}>("SELECT NOT COALESCE(is_private,false) AS ok FROM player_moment_submissions WHERE id=$1 AND status='live'",[id]);
    if(!access[0]?.ok)return fail('Story unavailable.',404);
    if(playerId===story.playerId)return fail('Player is already in this story.');
    if(data.action==='tag'){
      const {rows:known}=await query<{playerid:string}>('SELECT playerid::text FROM flip_card_front_stage WHERE playerid::text=$1 LIMIT 1',[playerId]);
      if(!known.length)return fail('Choose a player from search.');
      const {rows:result}=await query<{inserted:string|null;already:boolean}>(
        "WITH locked AS (SELECT id,playerid FROM player_moment_submissions WHERE id=$1 AND status='live' AND NOT COALESCE(is_private,false) FOR UPDATE), capacity AS (SELECT count(*)::int AS n FROM player_moment_players WHERE moment_id=$1 AND NOT is_primary), added AS (INSERT INTO player_moment_players(moment_id,playerid,is_primary,tagged_by_firebase_uid) SELECT locked.id,$2,false,$3 FROM locked,capacity WHERE locked.playerid<>$2 AND capacity.n<$4 ON CONFLICT(moment_id,playerid) DO NOTHING RETURNING playerid) SELECT (SELECT playerid FROM added) AS inserted, EXISTS(SELECT 1 FROM player_moment_players WHERE moment_id=$1 AND playerid=$2) AS already",
        [id,playerId,fan.uid,STORY_MAX_TAGS]);
      if(!result[0]?.inserted&&!result[0]?.already)return fail('This story has reached the 20-player tag limit.',409);
      if(result[0]?.inserted)await logFanActivity(fan.uid,'story_player_tagged',story,{playerId});
    }else{
      const {rows:deleted}=await query<{playerid:string}>(
        "DELETE FROM player_moment_players mp USING player_moment_submissions m WHERE mp.moment_id=m.id AND m.id=$1 AND m.status='live' AND NOT COALESCE(m.is_private,false) AND mp.playerid=$2 AND NOT mp.is_primary AND (mp.tagged_by_firebase_uid=$3 OR m.contributor_firebase_uid=$3) RETURNING mp.playerid",
        [id,playerId,fan.uid]);
      if(!deleted.length)return fail('Only the tagger or original author can remove this tag.',403);
      await logFanActivity(fan.uid,'story_player_untagged',story,{playerId});
    }
    return NextResponse.json({players:await players(id,fan.uid)},{headers:{'Cache-Control':'no-store'}});
  }catch(error){console.error('[stories/tags] failed',error);return fail('Tags could not be saved.',500);}
}
