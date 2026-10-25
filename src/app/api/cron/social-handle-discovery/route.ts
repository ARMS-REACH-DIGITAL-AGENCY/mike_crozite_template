import { NextRequest,NextResponse } from 'next/server';
import { discoverSocialHandles } from '@/lib/socialHandleDiscovery';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=300;

export async function GET(req:NextRequest){
  if(!process.env.CRON_SECRET || req.headers.get('authorization')!==`Bearer ${process.env.CRON_SECRET}`)
    return NextResponse.json({ok:false,error:'Unauthorized'},{status:401});
  try{
    const result=await discoverSocialHandles(200);
    return NextResponse.json({ok:true,...result});
  }catch(error){
    console.error('[social-handle-discovery] failed',error);
    return NextResponse.json({ok:false,error:'Discovery failed'},{status:500});
  }
}
