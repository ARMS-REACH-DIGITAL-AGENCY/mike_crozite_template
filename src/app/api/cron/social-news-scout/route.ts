import { NextRequest, NextResponse } from 'next/server';
import { scoutSocialNews } from '@/lib/socialNewsScout';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Existing Meta Business Discovery sync stores authorized public posts.
// This independent cron classifies their captions and queues reviewed tips.
export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET || req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const dryRun = process.env.VERCEL_ENV === 'preview';
    const report = await scoutSocialNews({ dryRun });
    return NextResponse.json({ ok: report.failures === 0, dryRun, ...report });
  } catch (error) {
    console.error('[social-news-scout] run failed', error);
    return NextResponse.json({ ok: false, error: 'Scout failed' }, { status: 500 });
  }
}
