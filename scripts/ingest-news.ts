#!/usr/bin/env ts-node
// scripts/ingest-news.ts
// YAT?STATS — Webz.io News Ingest Pipeline
//
// Fetches news articles from Webz.io News API Lite for active alumni,
// matches them to players/schools, and stores them in the news_articles
// table in Neon Postgres.
//
// This is the "middleman" — Webz.io is never called on user page loads.
// Run this script on a schedule (daily cron) or manually.
//
// Pilot scope: news is on for the schools listed in NEWS_HSIDS / --hsid
// only (Hamilton, 5004, today). There is deliberately no "every school"
// mode - Webz.io bills every story it returns (about half a cent each)
// against $5 of free credits a month, so turning a school on is an
// explicit decision.
//
// Keeping a school's daily run inside that budget:
//   - each run searches only what Webz.io crawled since the school's last
//     completed run (recorded in source_ingest_runs), so a story is never
//     paid for twice;
//   - each search returns at most RESULTS_PER_CALL stories;
//   - fantasy/betting/promo pages are excluded in the query itself;
//   - the run stops once the balance Webz.io reports drops below
//     NEWS_MIN_BALANCE.
//
// Usage:
//   npx tsx scripts/ingest-news.ts                      # NEWS_HSIDS, default 5004
//   npx tsx scripts/ingest-news.ts --hsid 5004,1234     # these schools
//   npx tsx scripts/ingest-news.ts --dry-run            # preview queries, no calls, no writes
//
// Required env vars:
//   DATABASE_URL    — Neon Postgres connection string
//   WEBZ_API_TOKEN  — Webz.io News API Lite token
// Optional:
//   NEWS_HSIDS               — comma-separated school hsids (default "5004")
//   NEWS_MIN_BALANCE         — stop once the Webz.io balance (USD) falls
//                              below this (default 0.50)

import { randomUUID } from "crypto";
import { appendFileSync } from "fs";
import { Pool } from "pg";
import { verifyNewsIdentity, type VerificationResult } from "./lib/newsIdentity";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("ERROR: DATABASE_URL environment variable is not set.");
  process.exit(1);
}

const WEBZ_TOKEN: string = process.env.WEBZ_API_TOKEN ?? "";
if (!WEBZ_TOKEN) {
  console.error("ERROR: WEBZ_API_TOKEN environment variable is not set.");
  process.exit(1);
}

// Leave headroom in the monthly Webz.io credits for manual runs.
const MIN_BALANCE = Number(process.env.NEWS_MIN_BALANCE || 0.5);

const BATCH_SIZE = 8; // max player names per Webz.io query
const DELAY_BETWEEN_CALLS_MS = 1000; // rate-limit courtesy delay

// Parse CLI args
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const hsidIdx = args.indexOf("--hsid");
const hsidArg = hsidIdx !== -1 ? args[hsidIdx + 1] : "";
const targetHsids = (hsidArg || process.env.NEWS_HSIDS || "5004")
  .split(",")
  .map((h) => h.trim())
  .filter(Boolean);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface PlayerRow {
  playerid: string;
  firstname: string;
  lastname: string;
  hsid: string;
  high_school: string | null;
  class_of: string | null;
  position: string | null;
  current_team: string | null;
  current_org: string | null;
  current_level: string | null;
  college_path: string | null;
  career_teams: string | null;
}

interface WebzPost {
  uuid: string;
  url: string;
  title: string;
  text: string;
  highlightText: string;
  highlightTitle: string;
  author: string;
  published: string;
  sentiment: string;
  categories: string[];
  summary?: string;
  entities?: {
    persons?: unknown[];
    organizations?: unknown[];
  };
  topics?: string[];
  thread: {
    uuid?: string;
    site: string;
    site_full: string;
    main_image: string;
    country: string;
    domain_rank: number;
  };
}

interface WebzResponse {
  posts: WebzPost[];
  totalResults: number;
  // This account is billed from a prepaid balance: each response reports
  // what the call cost (it grows with the number of posts returned) and
  // the balance left. It sends no requests_left.
  balance: number;
  cost: number;
}

// The News API sends its envelope in snake_case (total_results).
interface WebzRawResponse {
  posts?: WebzPost[];
  total_results?: number;
  totalResults?: number;
  balance?: number;
  cost?: number;
}

// ---------------------------------------------------------------------------
// Database helpers
// ---------------------------------------------------------------------------
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function ensureTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS news_articles (
      id            SERIAL PRIMARY KEY,
      uuid          TEXT UNIQUE NOT NULL,
      playerid      TEXT,
      player_name   TEXT,
      hsid          TEXT NOT NULL,
      title         TEXT NOT NULL,
      source        TEXT NOT NULL,
      source_full   TEXT,
      published_at  TIMESTAMPTZ NOT NULL,
      url           TEXT NOT NULL,
      image_url     TEXT,
      snippet       TEXT,
      sentiment     TEXT DEFAULT 'neutral',
      categories    TEXT[] DEFAULT '{}',
      country       TEXT,
      domain_rank   INT,
      ingested_at   TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_news_articles_hsid ON news_articles(hsid, published_at DESC)`
  );
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_news_articles_playerid ON news_articles(playerid, published_at DESC)`
  );
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_news_articles_published ON news_articles(published_at DESC)`
  );
}

/**
 * Active alumni of the given schools, from the flip cards: anyone still
 * playing (active, injured, redshirt, ...) - not retired, not a free
 * agent, not a current high schooler. (This used to be "had 2025 stats",
 * which never picked up anyone new in 2026.)
 */
async function getActivePlayers(hsids: string[]): Promise<PlayerRow[]> {
  const { rows } = await pool.query<PlayerRow>(
    `SELECT DISTINCT
       f.playerid::text AS playerid,
       TRIM(COALESCE(f.first_name, tp.firstname)) AS firstname,
       TRIM(COALESCE(f.last_name, tp.lastname)) AS lastname,
       f.hsid::text AS hsid,
       COALESCE(ctx.high_school, tp.high_school) AS high_school,
       f.class_of::text AS class_of,
       COALESCE(NULLIF(TRIM(f.position), ''), tp.posit) AS position,
       f.current_team_name AS current_team,
       f.current_org_or_conference_name AS current_org,
       f.level_label AS current_level,
       ctx.college_path_text AS college_path,
       ctx.career_team_names AS career_teams
     FROM flip_card_front_stage f
     LEFT JOIN tbc_players_raw tp ON tp.playerid::text = f.playerid::text
     LEFT JOIN v_news_player_context ctx ON ctx.playerid::text = f.playerid::text
     WHERE f.hsid::text = ANY($1::text[])
       AND NULLIF(TRIM(f.status_label), '') IS NOT NULL
       AND UPPER(TRIM(f.status_label)) NOT IN ('RETIRED', 'FREE AGENT', 'UNCOMMITTED', 'COMMIT', 'NOT ACTIVE')
       AND UPPER(TRIM(COALESCE(f.level_label, ''))) NOT IN ('HIGH SCHOOL', 'HS')
       AND TRIM(COALESCE(f.first_name, tp.firstname, '')) <> ''
       AND TRIM(COALESCE(f.last_name, tp.lastname, '')) <> ''
     ORDER BY hsid, lastname, firstname`,
    [hsids]
  );
  return rows;
}

// ---------------------------------------------------------------------------
// Webz.io API
// ---------------------------------------------------------------------------
// The News API (api.webz.io/api/news) - the endpoint a current Webz.io
// account's token is issued for. The older "News API Lite" address
// (/newsApiLite) answers 401 to these tokens. WEBZ_API_URL overrides it.
const WEBZ_API_URL = process.env.WEBZ_API_URL || "https://api.webz.io/api/news";
// Webz.io bills per story returned, so keep this small; the per-player cap
// (MAX_STORIES_PER_PLAYER) keeps fewer than this anyway.
const RESULTS_PER_CALL = 10;

// Pages that name our alumni but aren't news about them: fantasy rankings,
// betting previews, sportsbook promos. Excluded in the query so we don't
// pay for them. ("odds" and "picks" are left out on purpose - they appear
// in real stories: "against the odds", "draft picks".)
const EXCLUDED_TERMS = ["fantasy", "betting", "sportsbook", "\"promo code\"", "\"best bets\"", "\"prop bets\"", "PrizePicks", "DFS"];

// Where a school's search window starts: what Webz.io crawled since that
// school's last completed run began (less an hour of overlap for posts
// crawled mid-run), so each story is bought once. A school's first run
// looks back 3 days; nothing reaches past Webz.io's 31-day limit.
const WINDOW_OVERLAP_MS = 60 * 60 * 1000;
const FIRST_RUN_LOOKBACK_MS = 3 * 24 * 60 * 60 * 1000;
const MAX_LOOKBACK_MS = 31 * 24 * 60 * 60 * 1000;
const RUN_SOURCE = "webz";
const runFeedName = (hsid: string) => `news_ingest_${hsid}`;

async function windowStart(hsid: string): Promise<number> {
  const { rows } = await pool.query<{ started_at: Date }>(
    `SELECT started_at FROM public.source_ingest_runs
      WHERE source = $1 AND feed_name = $2 AND status = 'completed'
      ORDER BY started_at DESC
      LIMIT 1`,
    [RUN_SOURCE, runFeedName(hsid)]
  );
  const now = Date.now();
  const since = rows[0] ? rows[0].started_at.getTime() - WINDOW_OVERLAP_MS : now - FIRST_RUN_LOOKBACK_MS;
  return Math.max(since, now - MAX_LOOKBACK_MS);
}

async function startSchoolRun(hsid: string): Promise<string> {
  const runId = randomUUID();
  await pool.query(
    `INSERT INTO public.source_ingest_runs (run_id, source, feed_name, status, started_at)
     VALUES ($1, $2, $3, 'running', NOW())`,
    [runId, RUN_SOURCE, runFeedName(hsid)]
  );
  return runId;
}

async function finishSchoolRun(
  runId: string,
  status: "completed" | "failed",
  counts: { received: number; stored: number; matched: number; unmatched: number },
  notes: Record<string, unknown>
): Promise<void> {
  await pool.query(
    `UPDATE public.source_ingest_runs
        SET status = $2, completed_at = NOW(),
            rows_received = $3, rows_stored = $4, rows_matched = $5, rows_unmatched = $6,
            notes = $7
      WHERE run_id = $1`,
    [runId, status, counts.received, counts.stored, counts.matched, counts.unmatched, JSON.stringify(notes)]
  );
}

class WebzAuthError extends Error {}

async function fetchWebzNews(
  queryString: string,
  since: number
): Promise<WebzResponse | null> {
  // Crawled since `since`, oldest first (Webz.io's default for the crawled
  // sort; ts is the window's start). The window is only as long as the
  // gap since the last run, so this is this week's news, not a month-old
  // backlog. https://docs.webz.io/docs/webz/news-blogs-forums-time-range
  const params = new URLSearchParams({
    token: WEBZ_TOKEN,
    q: queryString,
    ts: String(since),
    sort: "crawled",
    format: "json",
    size: String(RESULTS_PER_CALL),
  });

  try {
    const res = await fetch(`${WEBZ_API_URL}?${params.toString()}`);
    if (res.status === 401 || res.status === 403) {
      const body = (await res.text()).slice(0, 300);
      throw new WebzAuthError(`Webz.io rejected the token (${res.status}): ${body}`);
    }
    if (!res.ok) {
      console.error(`  Webz.io API error: ${res.status} ${res.statusText}`);
      return null;
    }
    const data = (await res.json()) as WebzRawResponse;
    return {
      posts: Array.isArray(data.posts) ? data.posts : [],
      totalResults: Number(data.total_results ?? data.totalResults),
      balance: Number(data.balance),
      cost: Number(data.cost),
    };
  } catch (err) {
    if (err instanceof WebzAuthError) throw err;
    console.error(`  Webz.io fetch error:`, err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Player matching — figure out which player(s) an article is about
// ---------------------------------------------------------------------------
function matchPlayerToArticle(
  post: WebzPost,
  players: PlayerRow[]
): PlayerRow[] {
  const searchText = (
    (post.title || "") +
    " " +
    (post.highlightTitle || "") +
    " " +
    (post.highlightText || "") +
    " " +
    (post.text || "")
  ).toLowerCase();

  return players.filter((p) => {
    const fullName = `${p.firstname} ${p.lastname}`.toLowerCase();
    return searchText.includes(fullName);
  });
}

// ---------------------------------------------------------------------------
// Quality rules - a name hit alone isn't a story about our alum
// ---------------------------------------------------------------------------

// Most stories kept per player per run; the ones naming him in the
// headline win. A one-line mention in a league-wide roundup ("4 MLB teams
// built best for deep playoff runs") otherwise buries everyone else -
// Cody Bellinger drew 48 in one run.
const MAX_STORIES_PER_PLAYER = 5;

const BASEBALL_TERMS =
  /\b(baseball|mlb|milb|minor league|pitch(er|ed|ing)?|inning|homer(ed|s)?|home run|rbi|strikeouts?|shortstop|outfielder|infielder|catcher|dugout|bullpen|triple-a|double-a|single-a|draft)\b/i;
const OTHER_SPORT_TERMS =
  /\b(football|touchdown|quarterback|nfl|basketball|nba|hockey|nhl|soccer|hydroplane|volleyball|lacrosse)\b/i;

// Is this story plausibly baseball, and about our alum rather than a
// namesake in another sport? Headline decides when it's clear-cut.
function looksLikeBaseballStory(post: WebzPost): boolean {
  const title = `${post.title || ""}`;
  const body = `${post.text || ""}`.slice(0, 1500);
  if (OTHER_SPORT_TERMS.test(title) && !BASEBALL_TERMS.test(title)) return false;
  return BASEBALL_TERMS.test(title) || BASEBALL_TERMS.test(body);
}

function nameInHeadline(post: WebzPost, player: PlayerRow): boolean {
  const title = `${post.title || ""} ${post.highlightTitle || ""}`.toLowerCase();
  return title.includes(`${player.firstname} ${player.lastname}`.toLowerCase()) ||
    title.includes(` ${player.lastname.toLowerCase()}`);
}

function normalizeTitle(title: string | null | undefined): string {
  return (title || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

// ---------------------------------------------------------------------------
// Insert articles into DB
// ---------------------------------------------------------------------------
/** Headlines already saved for this player (normalized), to skip syndicated copies. */
async function existingTitles(playerid: string): Promise<Set<string>> {
  const { rows } = await pool.query<{ title: string }>(
    `SELECT title FROM news_articles WHERE playerid = $1`,
    [playerid]
  );
  return new Set(rows.map((r) => normalizeTitle(r.title)));
}

async function insertArticle(
  post: WebzPost,
  player: PlayerRow,
  verification: VerificationResult
): Promise<boolean> {
  try {
    const playerFallbackImage =
      `https://yatstats-assets.s3.us-west-2.amazonaws.com/players/now/${encodeURIComponent(player.playerid)}.jpg`;

    const result = await pool.query(
      `INSERT INTO news_articles
        (uuid, playerid, player_name, hsid, title, source, source_full,
         published_at, url, image_url, snippet, sentiment, categories,
         country, domain_rank, summary, discovery_source, raw_payload,
         webz_persons, webz_organizations, webz_topics, syndication_id,
         verification_status, verification_score, verification_reason,
         verification_evidence, newsworthiness, image_verification_status,
         display_image_url, verified_at)
       VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,
         $16,'webz',$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,
         'FALLBACK_PLAYER',$27,
         CASE WHEN $22 = 'VERIFIED' THEN NOW() ELSE NULL END
       )
       ON CONFLICT (uuid) DO UPDATE SET
         raw_payload = EXCLUDED.raw_payload,
         webz_persons = EXCLUDED.webz_persons,
         webz_organizations = EXCLUDED.webz_organizations,
         webz_topics = EXCLUDED.webz_topics,
         syndication_id = COALESCE(EXCLUDED.syndication_id, news_articles.syndication_id),
         verification_status = EXCLUDED.verification_status,
         verification_score = EXCLUDED.verification_score,
         verification_reason = EXCLUDED.verification_reason,
         verification_evidence = EXCLUDED.verification_evidence,
         newsworthiness = EXCLUDED.newsworthiness,
         display_image_url = COALESCE(news_articles.display_image_url, EXCLUDED.display_image_url),
         verified_at = CASE
           WHEN EXCLUDED.verification_status = 'VERIFIED'
             THEN COALESCE(news_articles.verified_at, NOW())
           ELSE NULL
         END`,
      [
        post.uuid,
        player.playerid,
        `${player.firstname} ${player.lastname}`,
        player.hsid,
        post.title || "Untitled",
        post.thread?.site || "unknown",
        post.thread?.site_full || null,
        post.published,
        post.url,
        post.thread?.main_image || null,
        post.highlightText || post.text || null,
        post.sentiment || "neutral",
        post.categories || [],
        post.thread?.country || null,
        post.thread?.domain_rank || null,
        post.summary || null,
        JSON.stringify(post),
        JSON.stringify(post.entities?.persons || []),
        JSON.stringify(post.entities?.organizations || []),
        post.topics || [],
        post.thread?.uuid || null,
        verification.status,
        verification.score,
        verification.reason,
        JSON.stringify(verification.evidence),
        verification.newsworthiness,
        playerFallbackImage,
      ]
    );
    return (result.rowCount ?? 0) > 0;
  } catch (err) {
    console.error(`  DB insert/update error for uuid=${post.uuid}:`, err);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Main pipeline
// ---------------------------------------------------------------------------
async function main() {
  console.log("=== YAT?STATS News Ingest ===");
  console.log(`Mode: ${dryRun ? "DRY RUN" : "LIVE"}`);
  console.log(`Schools: ${targetHsids.join(", ")}`);
  console.log(`Window: since each school's last completed run`);
  console.log(`Stories per search: ${RESULTS_PER_CALL}; stop below balance $${MIN_BALANCE.toFixed(2)}`);
  console.log("");

  // 1. Ensure table exists
  if (!dryRun) {
    await ensureTable();
    console.log("✓ news_articles table ready");
  }

  // 2. Get active players
  const players = await getActivePlayers(targetHsids);
  console.log(`✓ Found ${players.length} active players`);

  if (players.length === 0) {
    console.log("No active players found. Nothing to ingest.");
    return;
  }

  // 3. Group players by school (hsid)
  const schoolGroups = new Map<string, PlayerRow[]>();
  for (const p of players) {
    const group = schoolGroups.get(p.hsid) || [];
    group.push(p);
    schoolGroups.set(p.hsid, group);
  }
  console.log(`✓ ${schoolGroups.size} school(s) to process`);
  console.log("");

  // 4. For each school, batch players and query Webz.io
  let totalApiCalls = 0;
  let totalArticlesInserted = 0;
  let totalArticlesMatched = 0;
  let totalUnattributed = 0;
  let balance: number | null = null;
  let runCost = 0;
  let stoppedForBudget = false;
  let failedCalls = 0;
  let totalOffTopic = 0;
  let totalDuplicateTitles = 0;
  let totalOverCap = 0;
  let totalVerified = 0;
  let totalReview = 0;
  let totalRejected = 0;
  let totalReceived = 0;

  schools: for (const [hsid, schoolPlayers] of schoolGroups) {
    console.log(
      `── School hsid=${hsid} (${schoolPlayers.length} players) ──`
    );

    // This school's run: its search window, and a source_ingest_runs row
    // that marks where the next run's window starts - only if every batch
    // was searched, so a stopped or failed run is simply covered again.
    const since = dryRun ? Date.now() - FIRST_RUN_LOOKBACK_MS : await windowStart(hsid);
    const runId = dryRun ? null : await startSchoolRun(hsid);
    const before = { received: totalReceived, stored: totalArticlesInserted, matched: totalArticlesMatched, unmatched: totalUnattributed, cost: runCost };
    let schoolComplete = true;
    const finishRun = async () => {
      if (!runId) return;
      await finishSchoolRun(
        runId,
        schoolComplete ? "completed" : "failed",
        {
          received: totalReceived - before.received,
          stored: totalArticlesInserted - before.stored,
          matched: totalArticlesMatched - before.matched,
          unmatched: totalUnattributed - before.unmatched,
        },
        { since: new Date(since).toISOString(), cost: Number((runCost - before.cost).toFixed(3)), balance }
      );
    };
    console.log(`  Searching stories crawled since ${new Date(since).toISOString()}`);

    // Split into batches of BATCH_SIZE
    for (let i = 0; i < schoolPlayers.length; i += BATCH_SIZE) {
      const batch = schoolPlayers.slice(i, i + BATCH_SIZE);
      const names = batch.map((p) => `"${p.firstname} ${p.lastname}"`);
      const queryString = `(${names.join(" OR ")}) baseball NOT (${EXCLUDED_TERMS.join(" OR ")})`;

      console.log(
        `  Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${batch
          .map((p) => `${p.firstname} ${p.lastname}`)
          .join(", ")}`
      );
      console.log(`  Query: ${queryString}`);

      if (dryRun) {
        console.log(`  [DRY RUN] Would call Webz.io API`);
        continue;
      }

      // Call Webz.io. A rejected token won't work for the next batch
      // either, so stop and fail the run (GitHub emails the failure).
      let data: WebzResponse | null;
      try {
        data = await fetchWebzNews(queryString, since);
      } catch (err) {
        console.error(`  ✗ ${(err as Error).message}`);
        process.exitCode = 1;
        schoolComplete = false;
        await finishRun();
        break schools;
      }
      totalApiCalls++;

      if (!data) {
        failedCalls++;
        schoolComplete = false;
        console.log(`  ✗ API call failed, skipping batch`);
        continue;
      }

      console.log(
        `  ✓ ${data.posts.length} articles returned (${data.totalResults} total, cost ${data.cost}, balance ${data.balance})`
      );
      if (Number.isFinite(data.balance)) balance = data.balance;
      if (Number.isFinite(data.cost)) runCost += data.cost;
      totalReceived += data.posts.length;

      // Match and insert each article
      // Gather candidates per player, then keep the best few for each.
      const candidates = new Map<string, { player: PlayerRow; post: WebzPost; headline: boolean; verification: VerificationResult }[]>();
      for (const post of data.posts) {
        const matchedPlayers = matchPlayerToArticle(post, schoolPlayers);

        if (matchedPlayers.length === 0) {
          // The search hit, but no alum's full name is in the story - a
          // playerless card on the News page would just say "--", so skip it.
          totalUnattributed++;
          continue;
        }
        if (!looksLikeBaseballStory(post)) {
          totalOffTopic++;
          continue;
        }

        for (const player of matchedPlayers) {
          const verification = verifyNewsIdentity(
            {
              title: post.title,
              text: post.text || post.highlightText,
              summary: post.summary,
              source: post.thread?.site_full || post.thread?.site,
            },
            {
              playerid: player.playerid,
              firstname: player.firstname,
              lastname: player.lastname,
              hsid: player.hsid,
              highSchool: player.high_school,
              classOf: player.class_of,
              position: player.position,
              currentTeam: player.current_team,
              currentOrg: player.current_org,
              currentLevel: player.current_level,
              collegePath: [player.college_path, player.career_teams].filter(Boolean).join("; "),
            }
          );

          const list = candidates.get(player.playerid) ?? [];
          list.push({
            player,
            post,
            headline: nameInHeadline(post, player),
            verification,
          });
          candidates.set(player.playerid, list);
        }
      }

      for (const [playerid, list] of candidates) {
        const existing = await existingTitles(playerid);
        const seen = new Set<string>(existing);
        const ranked = list.sort(
          (a, b) =>
            Number(b.headline) - Number(a.headline) ||
            (a.post.thread?.domain_rank ?? 1e9) - (b.post.thread?.domain_rank ?? 1e9)
        );
        let kept = 0;
        for (const { player, post, verification } of ranked) {
          const key = normalizeTitle(post.title);
          if (!key || seen.has(key)) {
            totalDuplicateTitles++;
            continue;
          }
          if (kept >= MAX_STORIES_PER_PLAYER) {
            totalOverCap++;
            continue;
          }
          seen.add(key);
          const inserted = await insertArticle(post, player, verification);
          if (verification.status === "VERIFIED") totalVerified++;
          else if (verification.status === "REVIEW") totalReview++;
          else totalRejected++;
          if (inserted) {
            totalArticlesInserted++;
            kept++;
          }
          totalArticlesMatched++;
        }
      }

      if (balance !== null && balance < MIN_BALANCE) {
        console.log(
          `  ! Webz.io balance is $${balance} (< $${MIN_BALANCE.toFixed(2)}); stopping to leave headroom.`
        );
        stoppedForBudget = true;
        if (i + BATCH_SIZE < schoolPlayers.length) schoolComplete = false;
        await finishRun();
        break schools;
      }

      // Rate-limit courtesy delay
      if (i + BATCH_SIZE < schoolPlayers.length) {
        await new Promise((r) => setTimeout(r, DELAY_BETWEEN_CALLS_MS));
      }
    }
    await finishRun();
    console.log("");
  }

  // 5. Summary
  console.log("=== Ingest Complete ===");
  console.log(`API calls made:      ${totalApiCalls}`);
  console.log(`Articles matched:    ${totalArticlesMatched}`);
  console.log(`New rows inserted:   ${totalArticlesInserted}`);
  console.log(`No alum named (skipped): ${totalUnattributed}`);
  console.log(`Not a baseball story (skipped): ${totalOffTopic}`);
  console.log(`Same headline already saved (skipped): ${totalDuplicateTitles}`);
  console.log(`Over ${MAX_STORIES_PER_PLAYER} per player this run (skipped): ${totalOverCap}`);
  console.log(`Identity VERIFIED:    ${totalVerified}`);
  console.log(`Identity REVIEW:      ${totalReview}`);
  console.log(`Identity REJECTED:    ${totalRejected}`);
  console.log(`Webz.io cost this run: ${runCost.toFixed(3)}`);
  console.log(`Webz.io balance left: ${balance ?? "unknown"}`);
  if (failedCalls > 0) console.log(`Failed calls: ${failedCalls}`);
  // Every call failed: fail the run so it's noticed, not a quiet "success".
  if (!dryRun && totalApiCalls > 0 && failedCalls === totalApiCalls) process.exitCode = 1;
  if (stoppedForBudget) console.log("Stopped early to keep some of the monthly Webz.io credits.");
  console.log(
    `(Duplicates skipped via ON CONFLICT DO NOTHING)`
  );

  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      [
        `## News ingest (${dryRun ? "dry run" : "live"})`,
        "",
        `| | |`,
        `|---|---|`,
        `| Schools | ${targetHsids.join(", ")} |`,
        `| Active alumni searched | ${players.length} |`,
        `| Webz.io calls made | ${totalApiCalls} |`,
        `| Webz.io cost this run | ${runCost.toFixed(3)} |`,
        `| Webz.io balance left | ${balance ?? "unknown"} |`,
        `| Stories matched to an alum | ${totalArticlesMatched} |`,
        `| New stories saved | ${totalArticlesInserted} |`,
        `| Search hits naming no alum (skipped) | ${totalUnattributed} |`,
        `| Not a baseball story (skipped) | ${totalOffTopic} |`,
        `| Same headline already saved (skipped) | ${totalDuplicateTitles} |`,
        `| Over ${MAX_STORIES_PER_PLAYER} per player (skipped) | ${totalOverCap} |`,
        `| Identity VERIFIED | ${totalVerified} |`,
        `| Identity REVIEW | ${totalReview} |`,
        `| Identity REJECTED | ${totalRejected} |`,
        stoppedForBudget ? `| Stopped early | balance under $${MIN_BALANCE.toFixed(2)} |` : "",
        "",
      ].join("\n")
    );
  }
}

main()
  .catch((err) => {
    console.error("FATAL:", err);
    process.exit(1);
  })
  .finally(() => pool.end());
