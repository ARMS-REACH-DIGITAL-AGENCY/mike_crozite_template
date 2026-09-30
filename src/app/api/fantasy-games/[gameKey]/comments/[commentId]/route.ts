import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { identifyFan } from '@/lib/fanIdentity';
import { ensureFantasyGameSocialTables, gameKey } from '@/lib/fantasyGameSocial';

export const runtime='nodejs';

export async function DELETE(req:NextRequest,{params}:{params:Promise<{gameKey:string;commentId:string}>}){
  const p=await params;
  const key=gameKey(decodeURIComponent(p.gameKey||''));
  const id=String(p.commentId||'');
  if(!key||!/^[0-9]+$/.test(id)) return NextResponse.json({error:'Comment not found.'},{status:404});
  const fan=await identifyFan(req);
  if(!fan) return NextResponse.json({error:'Sign in to delete your comment.'},{status:401});
  try{
    await ensureFantasyGameSocialTables();
    const {rowCount}=await query(
      `delete from fantasy_game_comments where id=$1::bigint and game_key=$2 and firebase_uid=$3`,
      [id,key,fan.uid]
    );
    if(!rowCount) return NextResponse.json({error:'Comment not found.'},{status:404});
    return NextResponse.json({ok:true});
  }catch(error){
    console.error('[fantasy-game] delete comment failed',error);
    return NextResponse.json({error:'The comment could not be deleted.'},{status:500});
  }
}
