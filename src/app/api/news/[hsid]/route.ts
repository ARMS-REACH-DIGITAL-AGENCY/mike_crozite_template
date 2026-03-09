// src/app/api/news/[hsid]/route.ts
// YAT?STATS — News API route
// Fetches active alumni names for a school, builds a Webz.io News API Lite
// query, and returns matching news articles.  Results are cached in-memory
// for 15 minutes to conserve the 1,000 monthly API-call budget.

import { NextRequest, NextResponse } from 'next/server';
import { getActiveRosterByHsid } from '@/lib/db';

export const runtime = 'nodejs';

// ---------------------------------------------------------------------------
// In-memory cache: hsid -> { data, ts }
// ---------------------------------------------------------------------------
const cache = new Map<string, { data: unknown; ts: number }>();
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

// ---------------------------------------------------------------------------
// CORS helper (same pattern as /api/players/search)
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

  // Check cache
  const cached = cache.get(hsid);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return NextResponse.json(cached.data, {
      status: 200,
      headers: { ...cors, 'Cache-Control': 'public, max-age=900, s-maxage=900' },
    });
  }

  try {
    // 1. Get active roster player names for this school
    const roster = await getActiveRosterByHsid(hsid);
    const playerNames: string[] = (roster as Record<string, unknown>[])
      .map((p) => {
        const first = String(p.firstname || '').trim();
        const last = String(p.lastname || '').trim();
        return first && last ? `${first} ${last}` : '';
      })
      .filter(Boolean);

    if (playerNames.length === 0) {
      const empty = { posts: [], totalResults: 0, playerNames: [], query: '' };
      cache.set(hsid, { data: empty, ts: Date.now() });
      return NextResponse.json(empty, {
        status: 200,
        headers: { ...cors, 'Cache-Control': 'public, max-age=900' },
      });
    }

    // 2. Build Webz.io query
    // Use up to 8 player names to keep the query URL manageable.
    // Wrap each name in quotes for exact-match, join with OR, and add
    // "baseball" as a required context keyword to improve relevance.
    const namesToUse = playerNames.slice(0, 8);
    const nameClause = namesToUse.map((n) => `"${n}"`).join(' OR ');
    const queryString = `(${nameClause}) baseball`;

    // 3. Call Webz.io News API Lite
    const WEBZ_TOKEN = process.env.WEBZ_API_TOKEN || 'e293311e-b089-4595-bb2c-1ea330fe1c81';
    // Look back 30 days for maximum coverage
    const ts = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const apiUrl = `https://api.webz.io/newsApiLite?token=${encodeURIComponent(WEBZ_TOKEN)}&q=${encodeURIComponent(queryString)}&ts=${ts}`;

    const webzRes = await fetch(apiUrl, { next: { revalidate: 900 } });

    if (!webzRes.ok) {
      console.error(`Webz.io API error: ${webzRes.status} ${webzRes.statusText}`);
      return NextResponse.json(
        { error: 'News API request failed', status: webzRes.status },
        { status: 502, headers: cors }
      );
    }

    const webzData = await webzRes.json();

    // 4. Normalize posts into a leaner shape for the frontend
    const posts = ((webzData.posts || []) as Record<string, unknown>[]).map((post: Record<string, unknown>) => {
      const thread = (post.thread || {}) as Record<string, unknown>;
      return {
        uuid: post.uuid,
        url: post.url,
        title: post.title || thread.title || '',
        text: post.highlightText || post.text || '',
        author: post.author || null,
        published: post.published,
        sentiment: post.sentiment || 'neutral',
        categories: post.categories || [],
        source: {
          site: thread.site || '',
          siteFull: thread.site_full || '',
          country: thread.country || '',
          domainRank: thread.domain_rank || null,
        },
        mainImage: thread.main_image || null,
        entities: post.entities || { persons: [], organizations: [], locations: [] },
      };
    });

    const result = {
      posts,
      totalResults: webzData.totalResults || 0,
      moreResultsAvailable: webzData.moreResultsAvailable || 0,
      requestsLeft: webzData.requestsLeft,
      playerNames: namesToUse,
      query: queryString,
    };

    // 5. Cache the result
    cache.set(hsid, { data: result, ts: Date.now() });

    return NextResponse.json(result, {
      status: 200,
      headers: { ...cors, 'Cache-Control': 'public, max-age=900, s-maxage=900' },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('News API route error:', message);
    return NextResponse.json(
      { error: 'Server error', message },
      { status: 500, headers: cors }
    );
  }
}
