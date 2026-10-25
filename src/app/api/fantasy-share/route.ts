import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { writerQuery } from '@/lib/dbWriter';
import { identifyRegisteredFan } from '@/lib/fanIdentity';
export const runtime = 'nodejs';
export async function POST(req:NextRequest) {
  const fan=await identifyRegisteredFan(req);
  if(!fan) return NextResponse.json({error:'Register or log in to share a game.'},{status:401});
  try {
    const body=await req.json();
    const raw=String(body.url||'');
    if(raw.length>2500) return NextResponse.json({error:'Invalid URL'},{status:400});
    const u=new URL(raw,req.nextUrl.origin);
    const schoolHost = /(?:^|\.)yatstats\.com$/i.test(req.nextUrl.hostname) && req.nextUrl.hostname !== 'yatstats.com';
    const validPath = /^\/\d+$/.test(u.pathname) || (u.pathname === '/' && schoolHost);
    if(u.origin!==req.nextUrl.origin || !validPath || u.searchParams.get('snapshot')!=='1' || !/^(?:\d{1,3},){17}\d{1,3}$/.test(u.searchParams.get('scoreInnings')||'')) return NextResponse.json({error:'Invalid scoreboard snapshot'},{status:400});
    const id=randomBytes(6).toString('base64url');
    await writerQuery('INSERT INTO fantasy_share_links (id,target_path) VALUES ($1,$2)',[id,u.pathname+u.search]);
    return NextResponse.json({url:`${req.nextUrl.origin}/g/${id}`});
  } catch(e) {console.error('Short share creation failed',e);return NextResponse.json({error:'Short link unavailable'},{status:500});}
}
