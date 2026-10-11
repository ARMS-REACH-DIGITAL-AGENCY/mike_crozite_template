import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
export const runtime='nodejs';
export async function GET(req:NextRequest,{params}:{params:Promise<{id:string}>}) {
  const {id}=await params;
  if(!/^[A-Za-z0-9_-]{8}$/.test(id))return new NextResponse('Not found',{status:404});
  let path:string;
  try {const r=await query<{target_path:string}>('SELECT target_path FROM fantasy_share_links WHERE id=$1',[id]);if(!r.rows[0])return new NextResponse('Not found',{status:404});path=r.rows[0].target_path;}catch{return new NextResponse('Unavailable',{status:503});}
  const target=new URL(path,req.nextUrl.origin);
  const p=target.searchParams;
  const image=new URL('/api/og/fantasy-game',req.nextUrl.origin);
  for(const [a,b] of [['fantasyGame','gameId'],['snapshot','snapshot'],['homeName','homeName'],['awayName','awayName'],['scoreInnings','scoreInnings'],['scoreStatus','scoreStatus'],['week','week'],['round','round'],['gameNo','gameNo'],['sharedAt','sharedAt']]){const v=p.get(a);if(v)image.searchParams.set(b,v);}
  const esc=(v:string)=>v.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
  const title=`${p.get('awayName')||'Away'} vs ${p.get('homeName')||'Home'} | YAT?STATS`;
  const bot=/bot|crawler|spider|facebookexternalhit|twitterbot|slackbot|discord|whatsapp|telegram|linkedinbot|google-structured-data/i.test(req.headers.get('user-agent')||'');
  if(!bot)return NextResponse.redirect(new URL(path+'#sec-fantasy',req.nextUrl.origin),307);
  const html=`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><meta name="description" content="Frozen fantasy scoreboard snapshot"><meta property="og:type" content="website"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="YAT?STATS fantasy scoreboard snapshot"><meta property="og:url" content="${esc(req.nextUrl.origin+'/g/'+id)}"><meta property="og:image" content="${esc(image.toString())}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:image" content="${esc(image.toString())}"></head><body><a href="${esc(target.toString()+'#sec-fantasy')}">View live game</a></body></html>`;
  return new NextResponse(html,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'public, max-age=60'}});
}
