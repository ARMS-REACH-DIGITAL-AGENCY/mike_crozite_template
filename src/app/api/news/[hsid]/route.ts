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

  const { searchParams } = new URL(req.url);
  const playerId = searchParams.get('player');
  const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 100);

  try {
    let articles: any[];

    if (playerId) {
      articles = await getNewsByPlayer(playerId, limit);
    } else {
      articles = await getNewsByHsid(hsid, limit);
    }

    const posts = articles.map((row) => {
      const tease = row.tease_json ?? null;
      const galleryFront = row.gallery_front_json ?? null;
      const galleryBack = row.gallery_back_json ?? null;
      const profile = row.profile_json ?? null;
      const share = row.share_json ?? null;

      return {
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
        country: row.country,
        localRecap: row.local_recap ?? null,

        playerName: row.player_name ?? null,
        playerId: row.playerid ?? null,
        playerDbName: row.player_name ?? null,

        level: row.level_label ?? null,
        gradClass: row.class_of ?? null,
        rosterYears: row.roster_years ?? [],
        status: row.status_label ?? 'ACTIVE',
        teamName: row.current_team_name ?? null,
        orgName: row.current_org_or_conference_name ?? null,
        active: row.status_label === 'ACTIVE',

        tease,
        galleryFront,
        galleryBack,
        profile,
        share,

        storyGrade: row.story_grade ?? null,
        storyScope: row.story_scope ?? null,
        playerRelevance: row.player_relevance ?? null,
        matchConfidence: row.match_confidence ?? null,
        generationStatus: row.generation_status ?? null,
        approvalStatus: row.approval_status ?? null,

        displayHeadline: galleryFront?.headline ?? row.title,
        displaySourceLabel: galleryFront?.source_label ?? row.source_full ?? row.source,
        displayPublishedAt: galleryFront?.published_at ?? row.published_at,
        displayMetaPills:
          galleryFront?.meta_pills ??
          [
            row.level_label ?? '',
            row.status_label ?? '',
            row.class_of ? `Class of ${row.class_of}` : '',
          ].filter(Boolean),

        displayRecap: galleryBack?.yati_recap ?? row.local_recap ?? row.snippet ?? null,
        displayWhyLocal: galleryBack?.why_local ?? null,
        displayProfileBody: profile?.body ?? row.local_recap ?? row.snippet ?? null,
      };
    });

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
