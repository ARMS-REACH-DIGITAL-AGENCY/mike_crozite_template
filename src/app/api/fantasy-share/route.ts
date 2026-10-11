import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { query } from '@/lib/db';
export const runtime = 'nodejs';
export async function POST(req:NextRequest) {
  try {
    const body=await req.json();
    const raw=String(body.url||'');
    if(raw.length>2500) return NextResponse.json({error:'Invalid URL'},{status:400});
    const u=new URL(raw,req.nextUrl.origin);
    if(u.origin!==req.nextUrl.origin || !/^\/\d+$/.test(u.pathname) || u.searchParams.get('snapshot')!=='1' || !/^(?:\d{1,3},){17}\d{1,3}$/.test(u.searchParams.get('scoreInnings')||'')) return NextResponse.json({error:'Invalid scoreboard snapshot'},{status:400});
    const id=randomBytes(6).toString('base64url');
    await query('INSERT INTO fantasy_share_links (id,target_path) VALUES ($1,$2)',[id,u.pathname+u.search]);
    return NextResponse.json({url:`${req.nextUrl.origin}/g/${id}`});
  } catch(e) {console.error('Short share creation failed',e);return NextResponse.json({error:'Short link unavailable'},{status:500});}
}
