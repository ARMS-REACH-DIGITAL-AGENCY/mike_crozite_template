import { NextRequest, NextResponse } from 'next/server';
import { fetchYouTubeVideoMetadata } from '@/lib/youtubeVideoMetadata';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url') || '';
  if (url.length > 2048) return NextResponse.json({ error: 'Invalid link' }, { status: 400 });
  const metadata = await fetchYouTubeVideoMetadata(url);
  if (!metadata) return NextResponse.json({ error: 'Invalid YouTube link' }, { status: 400 });
  return NextResponse.json(metadata, { headers: { 'Cache-Control': 'private, max-age=120' } });
}
