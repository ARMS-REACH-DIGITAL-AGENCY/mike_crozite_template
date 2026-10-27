// src/app/api/news/[hsid]/route.ts
// YAT?STATS — News API route (DB-backed)
//
// Serves news articles from the news_articles table in Neon Postgres.
// The table is populated by scripts/ingest-news.ts (cron or manual).
// This route NEVER calls Webz.io directly — it is a pure DB read.
//
// Supports:
//   GET /api/news/:hsid              — all news for a school
//   GET /api/news/:hsid?player=123   — a player's best stories first
//                                      (featured, then most about him, not
//                                      negative) - what the back of his
//                                      flip card shows
//   GET /api/news/:hsid?limit=100&offset=100 — read next page of all verified school stories

import { NextRequest, NextResponse } from 'next/server';
import { getNewsByHsid, getNewsByPlayer } from '@/lib/db';
import { chooseNewsDisplayImage } from '@/lib/playerImage';
import { newsDisplayHeadline } from '@/lib/newsVideo';

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
  // Bound the size of each response; pagination keeps the complete school
  // feed available without loading every article during initial page load.
  const parsedLimit = Number(searchParams.get('limit') || '50');
  const parsedOffset = Number(searchParams.get('offset') || '0');
  const limit = Number.isFinite(parsedLimit) ? Math.max(1, Math.min(100, Math.trunc(parsedLimit))) : 50;
  const offset = Number.isFinite(parsedOffset) ? Math.max(0, Math.trunc(parsedOffset)) : 0;

  try {
    let articles: any[];

    if (playerId) {
      articles = await getNewsByPlayer(playerId, limit, false, searchParams.get("sort") !== "newest");
    } else {
      articles = await getNewsByHsid(hsid, limit, offset);
    }

    const posts = articles.map((row) => {
      const teaser = row.tease_json ?? null;
      const galleryFront = row.gallery_front_json ?? null;
      const galleryBack = row.gallery_back_json ?? null;
      const profile = row.profile_json ?? null;
      const share = row.share_json ?? null;

      // Contribution titles override any stale generated derivative.
      const contributed = row.discovery_source === 'contribute';
      const displayHeadline = newsDisplayHeadline(row);
      const tease = contributed && teaser ? { ...teaser, headline: displayHeadline } : teaser;
      const displayRecap = galleryBack?.yati_recap ?? row.local_recap ?? row.summary ?? null;
      const displaySourceLabel = galleryFront?.source_label ?? row.source_full ?? row.source;

      return {
        id: row.id,
        uuid: row.uuid,
        title: row.title,
        // Compatibility aliases consumed by the flip-card FunZone News teaser.
        headline: displayHeadline,
        summary: displayRecap,
        source: row.source,
        sourceFull: row.source_full,
        publishedAt: row.published_at,
        url: row.url,
        // Use publisher photography only when explicitly approved or when
        // article identity + a distinctive player-matching filename agree.
        imageUrl: chooseNewsDisplayImage({
          playerId: row.associated_playerid ?? row.playerid,
          playerName: row.associated_player_name ?? row.player_name,
          displayImageUrl: row.display_image_url,
          sourceImageUrl: row.image_url,
          verificationStatus: row.verification_status,
          imageVerificationStatus: row.image_verification_status,
        }),
        sourceImageUrl: row.image_url,
        snippet: row.snippet,
        sentiment: row.sentiment,
        categories: row.categories || [],
        country: row.country,
        localRecap: row.local_recap ?? null,

        playerName: row.associated_player_name ?? row.player_name ?? null,
        playerId: row.associated_playerid ?? row.playerid ?? null,
        taggedPlayers: row.tagged_players ?? [],
        taggedStory: Boolean(row.tagged_to_school || row.tagged_to_player),
        originalPlayerName: row.player_name ?? null,
        sourceHsid: row.hsid ?? null,
        playerDbName: row.player_name ?? null,

        level: row.stage_level_label ?? row.level_label ?? null,
        gradClass: row.stage_class_of ?? row.class_of ?? null,
        rosterYears: row.stage_roster_years ?? row.roster_years ?? [],
        status: row.stage_status_label ?? row.status_label ?? 'ACTIVE',
        teamName: row.stage_team_name ?? row.current_team_name ?? null,
        orgName: row.stage_org_name ?? row.current_org_or_conference_name ?? null,
        active: (row.stage_status_label ?? row.status_label) === 'ACTIVE',

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
        verificationStatus: row.verification_status ?? null,
        verificationScore: row.verification_score ?? null,
        verificationReason: row.verification_reason ?? null,
        newsworthiness: row.newsworthiness ?? null,
        imageVerificationStatus: row.image_verification_status ?? null,

        displayHeadline,
        displaySourceLabel,
        displayPublishedAt: galleryFront?.published_at ?? row.published_at,
        displayMetaPills:
          galleryFront?.meta_pills ??
          [
            row.level_label ?? '',
            row.status_label ?? '',
            row.class_of ? `Class of ${row.class_of}` : '',
          ].filter(Boolean),

        displayRecap,
        displayWhyLocal: galleryBack?.why_local ?? null,
        displayProfileBody: profile?.body ?? row.local_recap ?? row.snippet ?? null,
      };
    });

    return NextResponse.json(
      { posts, total: posts.length },
      {
        status: 200,
        headers: { ...cors, 'Cache-Control': 'public, max-age=15, s-maxage=15, stale-while-revalidate=15' },
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
