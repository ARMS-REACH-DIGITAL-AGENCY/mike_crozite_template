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
// Level label normalization (mirrors playerUtils.levelLabel)
// ---------------------------------------------------------------------------
function normLevel(raw: string | null): string {
  if (!raw) return '';
  const map: Record<string, string> = {
    'MLB': 'MLB', 'TRIPLE-A': 'AAA', 'AAA': 'AAA',
    'DOUBLE-A': 'AA', 'AA': 'AA',
    'HIGH-A': 'A+', 'A+': 'A+',
    'LOW-A': 'A', 'A': 'A', 'A-': 'A-',
    'Indy': 'INDY', 'INDY': 'INDY',
    'NCAA': 'NCAA', 'JrCollege': 'JUCO', 'JUCO': 'JUCO',
    'NAIA': 'NAIA', 'Rk': 'RK',
  };
  return map[raw] ?? raw.toUpperCase();
}

// ---------------------------------------------------------------------------
// Grad class derivation (mirrors playerUtils.gradClass)
// ---------------------------------------------------------------------------
function deriveGradClass(draftInfo: string | null, playYears: string | null): string {
  if (draftInfo) {
    const yr = String(draftInfo).split('-')[0];
    if (yr && /^\d{4}$/.test(yr)) return yr;
  }
  if (playYears) {
    const years = String(playYears).split(',').map((y: string) => y.trim()).filter(Boolean);
    if (years.length) return years[0];
  }
  return '';
}

// ---------------------------------------------------------------------------
// Confidence scoring
//
// Rules (applied when playerid is present):
//   HIGH  (≥ 0.7) — playerid set + article player_name fuzzy-matches DB name
//   MEDIUM (0.4)  — playerid set but player name not in DB (data gap, keep)
//   LOW   (< 0.4) — playerid set BUT article name clearly mismatches DB name
//                   → suppress to prevent false-positive display
//
// Articles with no playerid are "unmatched" school-level news → always shown.
// ---------------------------------------------------------------------------
function computeConfidence(row: Record<string, unknown>): {
  score: number;
  label: 'high' | 'medium' | 'low' | 'unmatched';
} {
  const playerId = row.playerid as string | null;

  if (!playerId) return { score: 1.0, label: 'unmatched' };

  const dbFirst = String(row.player_firstname ?? '').trim().toLowerCase();
  const dbLast  = String(row.player_lastname  ?? '').trim().toLowerCase();

  // No DB record found for this playerid — treat as data gap, not false positive
  if (!dbFirst && !dbLast) return { score: 0.5, label: 'medium' };

  // Compare article player_name against DB name
  const articleName = String(row.player_name ?? '').trim().toLowerCase();
  const dbFull = `${dbFirst} ${dbLast}`.trim();

  if (!articleName) return { score: 0.5, label: 'medium' };

  // Exact or near-exact match
  if (articleName === dbFull) return { score: 1.0, label: 'high' };

  // Partial match — at least last name must match
  const articleParts = articleName.split(/\s+/);
  const articleLastWord = articleParts[articleParts.length - 1];
  if (dbLast && articleLastWord === dbLast) return { score: 0.75, label: 'high' };

  // Name mismatch — flag as low confidence (likely a false positive)
  return { score: 0.2, label: 'low' };
}

// Minimum confidence score to include in the public feed
// TODO: lower to 0 + add admin curation layer so editors can manually approve/reject
const CONFIDENCE_THRESHOLD = 0.4;

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
      // School-scoped query (for Alumni News page) — enriched with player data
      articles = await getNewsByHsid(hsid, limit);
    }

    const posts = articles
      .map((row) => {
        const { score: confScore, label: confLabel } = computeConfidence(row);

        const level = normLevel(
          (row.player_highlevel as string | null) ?? null
        );
        const gradClass = deriveGradClass(
          (row.player_draft_info as string | null) ?? null,
          (row.player_playyears as string | null) ?? null
        );

        return {
          // Raw article fields
          uuid:            row.uuid,
          title:           row.title,
          source:          row.source,
          sourceFull:      row.source_full,
          publishedAt:     row.published_at,
          url:             row.url,
          imageUrl:        row.image_url,
          snippet:         row.snippet,
          sentiment:       row.sentiment,
          categories:      row.categories || [],
          country:         row.country,

          // Matched player fields
          playerName:      row.player_name   ?? null,
          playerId:        row.playerid      ?? null,
          playerDbName:    (row.player_firstname || row.player_lastname)
            ? `${row.player_firstname ?? ''} ${row.player_lastname ?? ''}`.trim()
            : null,

          // Normalized metadata (from player join)
          level,
          gradClass,
          active:          (row.player_active as boolean | null) ?? null,

          // Confidence
          confidence:      confScore,
          confidenceLabel: confLabel,
        };
      })
      // Suppress clearly incorrect player-name matches (false positives)
      .filter((post) => post.confidence >= CONFIDENCE_THRESHOLD);

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
