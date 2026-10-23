import { NextRequest, NextResponse } from 'next/server';
import { readTribuneEdition } from '@/lib/tribune/archive';
import { renderTribuneHtml, renderTribuneText } from '@/lib/tribune/render';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const headers={
  'Cache-Control':'private, no-store',
  'Referrer-Policy':'no-referrer',
  'X-Robots-Tag':'noindex, nofollow',
  'X-Content-Type-Options':'nosniff',
  'Content-Security-Policy':"default-src 'none'; img-src https: data:; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
};
export async function GET(req:NextRequest){
  const q=req.nextUrl.searchParams;
  try{
    const edition=await readTribuneEdition({token:q.get('token'),publicId:q.get('public')});
    if(!edition)return new NextResponse('This edition link is invalid or has expired.',{status:404,headers});
    const plain=q.get('format')==='text';
    return new NextResponse(plain?renderTribuneText(edition):renderTribuneHtml(edition),{headers:{...headers,'Content-Type':plain?'text/plain; charset=utf-8':'text/html; charset=utf-8'}});
  }catch{return new NextResponse('This edition is temporarily unavailable. Please try again.',{status:503,headers});}
}
