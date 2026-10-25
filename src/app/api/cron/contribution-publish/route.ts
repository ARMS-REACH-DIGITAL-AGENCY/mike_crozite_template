import { NextRequest, NextResponse } from 'next/server';
import { publishPendingContributions } from '@/lib/contributionPublisher';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=300;
export async function GET(req:NextRequest){
 if(!process.env.CRON_SECRET || req.headers.get('authorization')!==`Bearer ${process.env.CRON_SECRET}`)
  return NextResponse.json({ok:false,error:'Unauthorized'},{status:401});
 try{const result=await publishPendingContributions(40);return NextResponse.json({ok:true,...result});}
 catch(error){console.error('[contribution-publisher] job failed',error);return NextResponse.json({ok:false,error:'Publishing failed'},{status:500});}
}
