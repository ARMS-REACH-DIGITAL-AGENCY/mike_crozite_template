import { NextRequest, NextResponse } from 'next/server';
import { getPlayerSevenDayWindow } from '@/components/yatstats/PlayerSevenDaySnapshot';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(req:NextRequest,{params}:{params:Promise<{playerId:string}>}) {
 const {playerId}=await params;
 const hsid=req.nextUrl.searchParams.get('hsid')||'';
 if(!/^[A-Za-z0-9_-]{1,32}$/.test(playerId)||!/^[1-9][0-9]{0,9}$/.test(hsid))
   return NextResponse.json({error:'Invalid game log request'},{status:400});
 try {
   const {rows}=await (await import('@/lib/db')).query<{hsid:string}>('SELECT hsid FROM flip_card_front_stage WHERE playerid=$1 LIMIT 1',[playerId]);
   if(!rows.length||String(rows[0].hsid)!==hsid) return NextResponse.json({error:'Player not at school'},{status:404});
   const result=await getPlayerSevenDayWindow(playerId);
   return NextResponse.json(result,{headers:{'Cache-Control':'public,s-maxage=90,stale-while-revalidate=300'}});
 }catch(error){console.error('[card-game-log] failed',error);return NextResponse.json({error:'Game log unavailable'},{status:503});}
}
