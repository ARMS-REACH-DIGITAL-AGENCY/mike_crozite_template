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
// Usage:
//   npx ts-node scripts/ingest-news.ts                    # all active players
//   npx ts-node scripts/ingest-news.ts --hsid 5004        # one school only
//   npx ts-node scripts/ingest-news.ts --dry-run          # preview queries, don't write
//
// Required env vars:
//   DATABASE_URL    — Neon Postgres connection string
//   WEBZ_API_TOKEN  — Webz.io News API Lite token

import { Pool } from "pg";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("ERROR: DATABASE_URL environment variable is not set.");
  process.exit(1);
}

const WEBZ_TOKEN = process.env.WEBZ_API_TOKEN;
if (!WEBZ_TOKEN) {
  console.error("ERROR: WEBZ_API_TOKEN environment variable is not set.");
  process.exit(1);
}

const BATCH_SIZE = 3; // smaller batches reduce noisy/over-broad Webz.io matches
const LOOKBACK_DAYS = 30; // how far back to search
const DELAY_BETWEEN_CALLS_MS = 1000; // rate-limit courtesy delay
const MAX_WEBZ_RETRIES = 2;

// Parse CLI args
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const hsidIdx = args.indexOf("--hsid");
const targetHsid = hsidIdx !== -1 ? args[hsidIdx + 1] : null;

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

type InsertResult = "inserted" | "duplicate" | "error";

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

/** Get active players with their school hsid */
async function getActivePlayers(hsid?: string | null): Promise<PlayerRow[]> {
  const whereClause = hsid ? `AND ph.hsid = $1` : "";
  const params = hsid ? [hsid] : [];

  const sql = `
    SELECT DISTINCT
      tp.playerid::text AS playerid,
      tp.firstname,
      tp.lastname,
      ph.hsid::text AS hsid
    FROM tbc_players_raw tp
    JOIN player_hsids ph ON tp.playerid::text = ph.playerid::text
    WHERE (
      tp.playerid::text IN (
        SELECT DISTINCT playerid::text FROM tbc_batting_raw WHERE year = '2025'
      )
      OR tp.playerid::text IN (
        SELECT DISTINCT playerid::text FROM tbc_pitching_raw WHERE year = '2025'
      )
    )
    ${whereClause}
    AND TRIM(tp.firstname) != '' AND TRIM(tp.lastname) != ''
    ORDER BY hsid, lastname, firstname
  `;

  const { rows } = await pool.query(sql, params);
  return rows;
}

// ---------------------------------------------------------------------------
// Text cleanup helpers
// ---------------------------------------------------------------------------
function cleanText(value?: string | null): string | null {
  if (!value) return null;

  const cleaned = value
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned || null;
}

function cleanRequiredText(value?: string | null, fallback = "Untitled"): string {
  return cleanText(value) || fallback;
}

// ---------------------------------------------------------------------------
// Webz.io API
// ---------------------------------------------------------------------------
async function fetchWebzNews(
  queryString: string
): Promise<WebzResponse | null> {
  const ts = Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000;
  const url = `https://api.webz.io/newsApiLite?token=${encodeURIComponent(
    WEBZ_TOKEN
  )}&q=${encodeURIComponent(queryString)}&ts=${ts}`;

  for (let attempt = 1; attempt <= MAX_WEBZ_RETRIES + 1; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        console.error(
          `  Webz.io API error: ${res.status} ${res.statusText} (attempt ${attempt}/${MAX_WEBZ_RETRIES + 1})`
        );
        if (body) console.error(`  Webz.io response body: ${body.slice(0, 500)}`);
      } else {
        return (await res.json()) as WebzResponse;
      }
    } catch (err) {
      console.error(
        `  Webz.io fetch error (attempt ${attempt}/${MAX_WEBZ_RETRIES + 1}):`,
        err
      );
    }

    if (attempt <= MAX_WEBZ_RETRIES) {
      await new Promise((r) => setTimeout(r, DELAY_BETWEEN_CALLS_MS * attempt));
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Player matching — figure out which player(s) an article is about
// ---------------------------------------------------------------------------
function matchPlayerToArticle(
  post: WebzPost,
  players: PlayerRow[]
): PlayerRow[] {
  const searchText = cleanRequiredText(
    (post.title || "") +
      " " +
      (post.highlightTitle || "") +
      " " +
      (post.highlightText || "") +
      " " +
      (post.text || ""),
    ""
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
): Promise<InsertResult> {
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
        cleanRequiredText(post.title),
        cleanRequiredText(post.thread?.site, "unknown"),
        cleanText(post.thread?.site_full),
        post.published,
        post.url,
        post.thread?.main_image || null,
        cleanText(post.highlightText || post.text),
        post.sentiment || "neutral",
        post.categories || [],
        post.thread?.country || null,
        post.thread?.domain_rank || null,
      ]
    );

    return (result.rowCount ?? 0) > 0 ? "inserted" : "duplicate";
  } catch (err) {
    console.error(`  DB insert error for uuid=${post.uuid}:`, err);
    return "error";
  }
}

// ---------------------------------------------------------------------------
// Main pipeline
// ---------------------------------------------------------------------------
async function main() {
  console.log("=== YAT?STATS News Ingest ===");
  console.log(`Mode: ${dryRun ? "DRY RUN" : "LIVE"}`);
  if (targetHsid) console.log(`Target school: hsid=${targetHsid}`);
  console.log(`Lookback: ${LOOKBACK_DAYS} days`);
  console.log("");

  // 1. Ensure table exists
  if (!dryRun) {
    await ensureTable();
    console.log("✓ news_articles table ready");
  }

  // 2. Get active players
  const players = await getActivePlayers(targetHsid);
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
  let successfulApiCalls = 0;
  let failedApiCalls = 0;
  let totalArticlesInserted = 0;
  let totalDuplicateArticles = 0;
  let totalArticlesMatched = 0;
  let skippedUnmatchedArticles = 0;
  let insertErrors = 0;

  for (const [hsid, schoolPlayers] of schoolGroups) {
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

      // Call Webz.io
      const data = await fetchWebzNews(queryString);
      totalApiCalls++;

      if (!data) {
        failedApiCalls++;
        console.log(`  ✗ API call failed, skipping batch`);
        continue;
      }

      successfulApiCalls++;
      console.log(
        `  ✓ ${data.posts.length} articles returned (${data.totalResults} total, ${data.requestsLeft} calls remaining)`
      );

      // Match and insert each article
      for (const post of data.posts) {
        const matchedPlayers = matchPlayerToArticle(post, schoolPlayers);

        if (matchedPlayers.length === 0) {
          skippedUnmatchedArticles++;
          console.log(
            `  Skipping unmatched article: ${cleanRequiredText(post.title)} | ${post.thread?.site || "unknown"} | ${post.url || "no-url"}`
          );
          continue;
        }

        // Insert one row per matched player (same article can appear on
        // multiple player profiles if it mentions multiple alumni)
        for (const player of matchedPlayers) {
          const result = await insertArticle(post, player);
          if (result === "inserted") totalArticlesInserted++;
          if (result === "duplicate") totalDuplicateArticles++;
          if (result === "error") insertErrors++;
          totalArticlesMatched++;
        }
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
  console.log(`API calls made:              ${totalApiCalls}`);
  console.log(`Successful API calls:        ${successfulApiCalls}`);
  console.log(`Failed API calls:            ${failedApiCalls}`);
  console.log(`Articles matched:            ${totalArticlesMatched}`);
  console.log(`New rows inserted:           ${totalArticlesInserted}`);
  console.log(`Duplicate articles skipped:  ${totalDuplicateArticles}`);
  console.log(`Skipped unmatched articles:  ${skippedUnmatchedArticles}`);
  console.log(`Insert errors:               ${insertErrors}`);

  if (!dryRun && totalApiCalls > 0 && successfulApiCalls === 0) {
    throw new Error("All Webz.io API calls failed. No live articles were ingested.");
  }
}

main()
  .catch((err) => {
    console.error("FATAL:", err);
    process.exit(1);
  })
  .finally(() => pool.end());
