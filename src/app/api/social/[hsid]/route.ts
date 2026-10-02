// src/app/api/social/[hsid]/route.ts
// YAT?STATS — Instagram school/player feed API

import { NextRequest, NextResponse } from 'next/server';
import { getSocialFeedPosts } from '@/lib/instagramSocial';

export const runtime = 'nodejs';

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ hsid: string }> }
) {
  const { hsid } = await context.params;

  if (!hsid) {
    return NextResponse.json({ error: 'Missing hsid parameter' }, { status: 400 });
  }

  const { searchParams } = new URL(req.url);
  const playerid = searchParams.get('playerid');
  const parsedLimit = parseInt(searchParams.get('limit') || '10', 10);
  const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 100) : 10;

  try {
    const posts = await getSocialFeedPosts(hsid, playerid, limit);

    return NextResponse.json(
      { posts, total: posts.length },
      {
        status: 200,
        headers: { 'Cache-Control': 'public, max-age=300, s-maxage=300' },
      }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Social API route error:', message);
    return NextResponse.json(
      { error: 'Server error', message },
      { status: 500 }
    );
  }
}
