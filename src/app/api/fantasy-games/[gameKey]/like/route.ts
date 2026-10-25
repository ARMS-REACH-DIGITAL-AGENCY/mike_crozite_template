import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { identifyRegisteredFan } from '@/lib/fanIdentity';
import { ensureFantasyGameSocialTables, gameKey } from '@/lib/fantasyGameSocial';

export const runtime='nodejs';

export async function POST(req:NextRequest,{params}:{params:Promise<{gameKey:string}>}) {
  const key=gameKey(decodeURIComponent((await params).gameKey||''));
  if(!key) return NextResponse.json({error:'Game not found.'},{status:404});
  const fan=await identifyRegisteredFan(req);
  if(!fan) return NextResponse.json({error:'Register or log in to like this game.'},{status:401});
  const liker=fan.uid;
  try {
    await ensureFantasyGameSocialTables();
    const {rows}=await query<{liked:boolean;like_count:number}>(`
      with removed as (
        delete from fantasy_game_likes where game_key=$1 and liker_uid=$2 returning 1
      ), added as (
        insert into fantasy_game_likes(game_key,liker_uid)
        select $1,$2 where not exists(select 1 from removed)
        on conflict do nothing returning 1
      )
      select exists(select 1 from added) liked,
             ((select count(*) from fantasy_game_likes where game_key=$1)
              -(select count(*) from removed)+(select count(*) from added))::int like_count
    `,[key,liker]);
    return NextResponse.json({liked:Boolean(rows[0]?.liked),likeCount:rows[0]?.like_count||0});
  } catch(error){ console.error('[fantasy-game] like failed',error); return NextResponse.json({error:'That like did not go through.'},{status:500}); }
}
