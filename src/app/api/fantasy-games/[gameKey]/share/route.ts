import { NextRequest, NextResponse } from 'next/server';
import { identifyRegisteredFan } from '@/lib/fanIdentity';
export const runtime='nodejs';
export async function POST(req:NextRequest){
  const fan=await identifyRegisteredFan(req);
  if(!fan) return NextResponse.json({error:'Register or log in to share a game.'},{status:401});
  return NextResponse.json({ok:true});
}
