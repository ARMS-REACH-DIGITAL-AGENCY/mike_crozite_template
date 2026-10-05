// src/app/api/social/[hsid]/route.ts
// YAT?STATS — stored Instagram school/player feed API

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

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
    const result = await query(
      `SELECT p.id, p.external_post_id, p.media_type, p.caption, p.permalink,
              p.thumbnail_url, p.published_at, s.handle, s.owner_type
         FROM public.social_posts p
         JOIN public.social_sources s ON s.id = p.social_source_id
        WHERE s.platform = 'instagram' AND s.status = 'active'
          AND (s.hsid = $1 OR ($2::text IS NOT NULL AND s.playerid = $2))
        ORDER BY p.published_at DESC LIMIT $3`,
      [hsid, playerid || null, limit]
    );

    return NextResponse.json(
      { posts: result.rows, total: result.rows.length },
      { status: 200, headers: { 'Cache-Control': 'public, max-age=300, s-maxage=300' } }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Social API route error:', message);
    return NextResponse.json({ error: 'Server error', message }, { status: 500 });
  }
}
