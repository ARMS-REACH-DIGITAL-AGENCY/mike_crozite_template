// src/app/api/news/[hsid]/route.ts
// YAT?STATS — News API route (DB-backed)
//
// Serves news articles from the news_articles table in Neon Postgres.
// The table is populated by scripts/ingest-news.ts (cron or manual).
// This route NEVER calls Webz.io directly — it is a pure DB read.
//
// Supports:
//   GET /api/news/:hsid              — all news for a school
//   GET /api/news/:hsid?player=123   — news for a specific player
//   GET /api/news/:hsid?limit=5      — limit results

import { NextRequest, NextResponse } from 'next/server';
import { getNewsByHsid, getNewsByPlayer } from '@/lib/db';

export const runtime = 'nodejs';

// ---------------------------------------------------------------------------
// CORS helper (same pattern as other API routes)
// ---------------------------------------------------------------------------
function buildCorsHeaders(req: NextRequest) {
  const origin = req.headers.get('origin') || '*';
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: buildCorsHeaders(req) });
}

// ---------------------------------------------------------------------------
// GET /api/news/:hsid
// ---------------------------------------------------------------------------
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ hsid: string }> }
) {
  const cors = buildCorsHeaders(req);
  const { hsid } = await context.params;

  if (!hsid) {
    return NextResponse.json(
      { error: 'Missing hsid parameter' },
      { status: 400, headers: cors }
    );
  }

  // Optional query params
  const { searchParams } = new URL(req.url);
  const playerId = searchParams.get('player');
  const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 100);

  try {
    let articles: any[];

    if (playerId) {
      // Player-scoped query (for player profile pages and flip card teasers)
      articles = await getNewsByPlayer(playerId, limit);
    } else {
      // School-scoped query (for Alumni News page)
      articles = await getNewsByHsid(hsid, limit);
    }

    // Normalize into the NewsItem contract from the spec:
    // { title, source, published_at, url, image_url? }
    // Plus additional fields for richer UI
    const posts = articles.map((row) => ({
      uuid: row.uuid,
      title: row.title,
      source: row.source,
      sourceFull: row.source_full,
      publishedAt: row.published_at,
      url: row.url,
      imageUrl: row.image_url,
      snippet: row.snippet,
      sentiment: row.sentiment,
      categories: row.categories || [],
      playerName: row.player_name || null,
      playerId: row.playerid || null,
      country: row.country,
    }));

    return NextResponse.json(
      { posts, total: posts.length },
      {
        status: 200,
        headers: { ...cors, 'Cache-Control': 'public, max-age=300, s-maxage=300' },
      }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('News API route error:', message);
    return NextResponse.json(
      { error: 'Server error', message },
      { status: 500, headers: cors }
    );
  }
}
