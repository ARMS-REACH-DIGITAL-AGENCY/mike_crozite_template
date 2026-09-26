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
// mode - each school searched costs Webz.io calls from a 1,000/month
// free plan, so turning a school on is an explicit decision.
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
//   NEWS_MIN_REQUESTS_LEFT   — stop when Webz.io reports fewer calls left
//                              this month (default 100)

import { appendFileSync } from "fs";
import { Pool } from "pg";

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

// Leave headroom in the monthly Webz.io allowance for manual runs.
const MIN_REQUESTS_LEFT = Number(process.env.NEWS_MIN_REQUESTS_LEFT || 100);

const BATCH_SIZE = 8; // max player names per Webz.io query
const LOOKBACK_DAYS = 30; // how far back to search
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
  thread: {
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
  requestsLeft: number;
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
       f.hsid::text AS hsid
     FROM flip_card_front_stage f
     LEFT JOIN tbc_players_raw tp ON tp.playerid::text = f.playerid::text
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
const RESULTS_PER_CALL = 50;

class WebzAuthError extends Error {}

async function fetchWebzNews(
  queryString: string
): Promise<WebzResponse | null> {
  const ts = Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000;
  const params = new URLSearchParams({
    token: WEBZ_TOKEN,
    q: queryString,
    ts: String(ts),
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
    const data = (await res.json()) as WebzResponse;
    return { ...data, posts: Array.isArray(data.posts) ? data.posts : [] };
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
// Insert articles into DB
// ---------------------------------------------------------------------------
async function insertArticle(
  post: WebzPost,
  player: PlayerRow
): Promise<boolean> {
  try {
    const result = await pool.query(
      `INSERT INTO news_articles
        (uuid, playerid, player_name, hsid, title, source, source_full,
         published_at, url, image_url, snippet, sentiment, categories,
         country, domain_rank)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       ON CONFLICT (uuid) DO NOTHING`,
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
      ]
    );
    return (result.rowCount ?? 0) > 0;
  } catch (err) {
    console.error(`  DB insert error for uuid=${post.uuid}:`, err);
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
  console.log(`Lookback: ${LOOKBACK_DAYS} days`);
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
  let requestsLeft: number | null = null;
  let stoppedForBudget = false;
  let failedCalls = 0;

  schools: for (const [hsid, schoolPlayers] of schoolGroups) {
    console.log(
      `── School hsid=${hsid} (${schoolPlayers.length} players) ──`
    );

    // Split into batches of BATCH_SIZE
    for (let i = 0; i < schoolPlayers.length; i += BATCH_SIZE) {
      const batch = schoolPlayers.slice(i, i + BATCH_SIZE);
      const names = batch.map((p) => `"${p.firstname} ${p.lastname}"`);
      const queryString = `(${names.join(" OR ")}) baseball`;

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
        data = await fetchWebzNews(queryString);
      } catch (err) {
        console.error(`  ✗ ${(err as Error).message}`);
        process.exitCode = 1;
        break schools;
      }
      totalApiCalls++;

      if (!data) {
        failedCalls++;
        console.log(`  ✗ API call failed, skipping batch`);
        continue;
      }

      console.log(
        `  ✓ ${data.posts.length} articles returned (${data.totalResults} total, ${data.requestsLeft} calls remaining)`
      );
      if (typeof data.requestsLeft === "number") requestsLeft = data.requestsLeft;

      // Match and insert each article
      for (const post of data.posts) {
        const matchedPlayers = matchPlayerToArticle(post, schoolPlayers);

        if (matchedPlayers.length === 0) {
          // The search hit, but no alum's full name is in the story - a
          // playerless card on the News page would just say "--", so skip it.
          totalUnattributed++;
          continue;
        }

        // Insert one row per matched player (same article can appear on
        // multiple player profiles if it mentions multiple alumni)
        for (const player of matchedPlayers) {
          const inserted = await insertArticle(post, player);
          if (inserted) totalArticlesInserted++;
          totalArticlesMatched++;
        }
      }

      if (requestsLeft !== null && requestsLeft < MIN_REQUESTS_LEFT) {
        console.log(
          `  ! Webz.io reports ${requestsLeft} calls left this month (< ${MIN_REQUESTS_LEFT}); stopping to leave headroom.`
        );
        stoppedForBudget = true;
        break schools;
      }

      // Rate-limit courtesy delay
      if (i + BATCH_SIZE < schoolPlayers.length) {
        await new Promise((r) => setTimeout(r, DELAY_BETWEEN_CALLS_MS));
      }
    }
    console.log("");
  }

  // 5. Summary
  console.log("=== Ingest Complete ===");
  console.log(`API calls made:      ${totalApiCalls}`);
  console.log(`Articles matched:    ${totalArticlesMatched}`);
  console.log(`New rows inserted:   ${totalArticlesInserted}`);
  console.log(`No alum named (skipped): ${totalUnattributed}`);
  console.log(`Webz.io calls left this month: ${requestsLeft ?? "unknown"}`);
  if (failedCalls > 0) console.log(`Failed calls: ${failedCalls}`);
  // Every call failed: fail the run so it's noticed, not a quiet "success".
  if (!dryRun && totalApiCalls > 0 && failedCalls === totalApiCalls) process.exitCode = 1;
  if (stoppedForBudget) console.log("Stopped early to stay under the monthly Webz.io allowance.");
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
        `| Webz.io calls left this month | ${requestsLeft ?? "unknown"} |`,
        `| Stories matched to an alum | ${totalArticlesMatched} |`,
        `| New stories saved | ${totalArticlesInserted} |`,
        `| Search hits naming no alum (skipped) | ${totalUnattributed} |`,
        stoppedForBudget ? `| Stopped early | under ${MIN_REQUESTS_LEFT} calls left |` : "",
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
