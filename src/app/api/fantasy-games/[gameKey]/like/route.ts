import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { VISITOR_COOKIE, identifyFan, likerKey } from '@/lib/fanIdentity';
import { ensureFantasyGameSocialTables, gameKey } from '@/lib/fantasyGameSocial';

export const runtime='nodejs';

export async function POST(req:NextRequest,{params}:{params:Promise<{gameKey:string}>}) {
  const key=gameKey(decodeURIComponent((await params).gameKey||''));
  if(!key) return NextResponse.json({error:'Game not found.'},{status:404});
  const fan=await identifyFan(req);
  let liker=likerKey(req,fan?.uid), visitor:string|null=null;
  if(!liker){ visitor=randomUUID(); liker=`anon:${visitor}`; }
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
    const res=NextResponse.json({liked:Boolean(rows[0]?.liked),likeCount:rows[0]?.like_count||0});
    if(visitor) res.cookies.set({name:VISITOR_COOKIE,value:visitor,path:'/',httpOnly:true,secure:true,sameSite:'lax',maxAge:60*60*24*365});
    return res;
  } catch(error){ console.error('[fantasy-game] like failed',error); return NextResponse.json({error:'That like did not go through.'},{status:500}); }
}
