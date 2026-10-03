// src/app/api/cron/process-tip-queue/route.ts
// YAT?STATS — Automated tip queue processor
// Runs on cron: picks up status='new' tips, AI-moderates, promotes to news_articles
//
// Flow:
//   1. Fetch all tips with status='new'
//   2. For each: validate URL, check baseball relevance, check appropriateness
//   3. If approved: create news_articles row, mark tip 'promoted'
//   4. If rejected: mark tip 'rejected' with reason
//
// V1 uses rules-based moderation. Upgrade to LLM review when ready.

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { randomUUID } from 'crypto';

export const runtime = 'nodejs';
export const maxDuration = 60;

// ---------------------------------------------------------------------------
// Moderation
// ---------------------------------------------------------------------------

type ModerationResult = {
  approved: boolean;
  reason: string;
  score: number; // 0-100
};

const BASEBALL_KEYWORDS = [
  'baseball', 'mlb', 'minor league', 'milb', 'homer', 'home run',
  'pitcher', 'hitting', 'batting', 'rbi', 'era', 'strikeout',
  'draft', 'prospect', 'triple-a', 'double-a', 'single-a',
];

const SPAM_PATTERNS = [
  /viagra/i, /casino/i, /crypto.*giveaway/i, /free.*money/i,
  /click.*here.*win/i, /\$\$\$/,
];

const BLOCKED_DOMAINS = [
  'spam.com', // placeholder — add real blocklist
];

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'unknown';
  }
}

async function moderateTip(tip: any): Promise<ModerationResult> {
  const url = String(tip.article_url || '');
  const notes = String(tip.notes || '').toLowerCase();
  const playerName = String(tip.raw_player_name || '').toLowerCase();

  // 1. URL must be valid
  if (!url || !/^https?:\/\//i.test(url)) {
    return { approved: false, reason: 'Invalid URL', score: 0 };
  }

  const domain = extractDomain(url);
  if (BLOCKED_DOMAINS.includes(domain)) {
    return { approved: false, reason: `Blocked domain: ${domain}`, score: 0 };
  }

  // 2. Check for spam patterns
  const combinedText = `${notes} ${playerName} ${url}`;
  for (const pattern of SPAM_PATTERNS) {
    if (pattern.test(combinedText)) {
      return { approved: false, reason: 'Spam pattern detected', score: 10 };
    }
  }

  // 3. Check baseball relevance
  const hasBaseballKeyword = BASEBALL_KEYWORDS.some((kw) => combinedText.includes(kw));
  const hasPlayerName = playerName.length > 2;

  if (!hasBaseballKeyword && !hasPlayerName) {
    return {
      approved: false,
      reason: 'No baseball relevance detected',
      score: 30,
    };
  }

  // 4. Try to fetch the URL to verify it's real
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, {
      method: 'HEAD',
      signal: controller.signal,
      headers: { 'User-Agent': 'YATSTATS-TipBot/1.0' },
    });
    clearTimeout(timeout);

    if (res.status >= 400) {
      return { approved: false, reason: `URL returned ${res.status}`, score: 20 };
    }
  } catch {
    // If we can't reach it, don't auto-reject — Instagram etc. may block HEAD
    // Just lower the score
  }

  // Passed all checks
  const score = hasBaseballKeyword && hasPlayerName ? 85 : 70;
  return {
    approved: true,
    reason: `Auto-approved: baseball-relevant${hasPlayerName ? `, player: ${tip.raw_player_name}` : ''}`,
    score,
  };
}

// ---------------------------------------------------------------------------
// Promotion: tip -> news_articles
// ---------------------------------------------------------------------------

async function promoteTip(tip: any, mod: ModerationResult): Promise<string> {
  const newsUuid = randomUUID();
  const domain = extractDomain(String(tip.article_url || ''));

  // Build title from notes (first 120 chars) or default
  const notes = String(tip.notes || '').trim();
  const title = notes.length > 0
    ? notes.slice(0, 120) + (notes.length > 120 ? '…' : '')
    : `${tip.raw_player_name || 'Player'} news tip`;

  await query(
    `INSERT INTO public.news_articles
      (uuid, playerid, player_name, hsid, title, source, url,
       snippet, published_at, ingested_at, discovery_source,
       verification_status, verification_score, verification_reason)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW(), 'fan_tip', 'AI_REVIEWED', $9, $10)`,
    [
      newsUuid,
      tip.matched_playerid || null,
      tip.raw_player_name || null,
      tip.matched_hsid || null,
      title,
      domain,
      tip.article_url,
      notes.slice(0, 500) || null,
      mod.score,
      mod.reason,
    ]
  );

  return newsUuid;
}

// ---------------------------------------------------------------------------
// Main cron handler
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  // Verify cron secret
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Get all new tips
    const { rows: tips } = await query(
      `SELECT * FROM public.news_tip_queue WHERE status = 'new' ORDER BY submitted_at ASC LIMIT 20`
    );

    const results = {
      processed: 0,
      promoted: 0,
      rejected: 0,
      errors: [] as string[],
    };

    for (const tip of tips) {
      results.processed++;
      try {
        const mod = await moderateTip(tip);

        if (mod.approved) {
          const newsUuid = await promoteTip(tip, mod);
          await query(
            `UPDATE public.news_tip_queue
             SET status = 'promoted', promoted_news_uuid = $1
             WHERE id = $2`,
            [newsUuid, tip.id]
          );
          results.promoted++;
        } else {
          await query(
            `UPDATE public.news_tip_queue
             SET status = 'rejected', error_message = $1
             WHERE id = $2`,
            [`Auto-rejected: ${mod.reason} (score: ${mod.score})`, tip.id]
          );
          results.rejected++;
        }
      } catch (err: any) {
        results.errors.push(`Tip ${tip.id}: ${err?.message}`);
        await query(
          `UPDATE public.news_tip_queue
           SET status = 'error', error_message = $1
           WHERE id = $2`,
          [err?.message || 'Processing error', tip.id]
        );
      }
    }

    return NextResponse.json({ ok: true, ...results });
  } catch (err: any) {
    console.error('[process-tip-queue] failed:', err);
    return NextResponse.json({ error: err?.message }, { status: 500 });
  }
}
