#!/usr/bin/env ts-node
/**
 * YAT?STATS — Webz.io News Ingest Pipeline v2
 * 
 * IMPROVEMENTS:
 * 1. Smaller batch size (3) to avoid Webz.io 500 errors.
 * 2. Junk title filter (No "Facebook", "Twitter", etc.).
 * 3. Proximity matching for names (avoids "drew swift criticism" false positives).
 * 4. Baseball context requirement.
 * 5. Support for local_recap column.
 */

import { Pool } from "pg";
import fetch from "node-fetch";

const DATABASE_URL = process.env.DATABASE_URL;
const WEBZ_TOKEN = process.env.WEBZ_API_TOKEN || "e293311e-b089-4595-bb2c-1ea330fe1c81";
const BATCH_SIZE = 3; 
const LOOKBACK_DAYS = 30;
const DELAY_MS = 1200;

const BASEBALL_KEYWORDS = [
    "baseball", "mlb", "pitcher", "pitching", "batting", "batter",
    "home run", "homer", "strikeout", "innings", "rbi", "minors",
    "triple-a", "double-a", "high-a", "low-a", "roster", "bullpen",
    "save", "era", "whip", "slugging", "on-base", "prospect", "call-up",
    "world baseball classic", "wbc", "ncaa", "college baseball"
];

const JUNK_TITLES = ["facebook", "twitter", "instagram", "linkedin", "login", "sign in"];

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function ensureTable() {
  await pool.query(`
    ALTER TABLE news_articles ADD COLUMN IF NOT EXISTS local_recap TEXT;
    ALTER TABLE news_articles ADD COLUMN IF NOT EXISTS player_firstname TEXT;
    ALTER TABLE news_articles ADD COLUMN IF NOT EXISTS player_lastname TEXT;
  `);
}

function hasBaseballContext(text: string): boolean {
  const lower = text.toLowerCase();
  return BASEBALL_KEYWORDS.some(kw => lower.includes(kw));
}

function isJunkTitle(title: string): boolean {
  const lower = title.toLowerCase().trim();
  return JUNK_TITLES.includes(lower) || lower.length < 5;
}

function nameAppearsCorrectly(firstName: string, lastName: string, text: string): boolean {
  const pattern = new RegExp(`\\b${firstName}\\b\\s+\\b${lastName}\\b`, 'i');
  return pattern.test(text);
}

async function main() {
  const args = process.argv.slice(2);
  const targetHsid = args.includes("--hsid") ? args[args.indexOf("--hsid") + 1] : "5004";

  console.log(`=== Ingesting News for HSID: ${targetHsid} ===`);
  await ensureTable();

  const { rows: players } = await pool.query(`
    SELECT tp.playerid::text, tp.firstname, tp.lastname, ph.hsid::text
    FROM tbc_players_raw tp
    JOIN player_hsids ph ON tp.playerid::text = ph.playerid::text
    WHERE ph.hsid = $1
    AND (
      tp.playerid::text IN (SELECT DISTINCT playerid::text FROM tbc_batting_raw WHERE year = '2025')
      OR tp.playerid::text IN (SELECT DISTINCT playerid::text FROM tbc_pitching_raw WHERE year = '2025')
    )
  `, [targetHsid]);

  console.log(`Found ${players.length} active players.`);

  for (let i = 0; i < players.length; i += BATCH_SIZE) {
    const batch = players.slice(i, i + BATCH_SIZE);
    const names = batch.map(p => `"${p.firstname} ${p.lastname}"`);
    const query = `(${names.join(" OR ")}) baseball`;
    
    console.log(`\nProcessing: ${batch.map(p => p.firstname + " " + p.lastname).join(", ")}`);
    
    const ts = Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000;
    const url = `https://api.webz.io/newsApiLite?token=${WEBZ_TOKEN}&q=${encodeURIComponent(query)}&ts=${ts}`;

    try {
      const res = await fetch(url);
      const data: any = await res.json();
      
      if (!data.posts) {
        console.log(`  ✗ No posts returned or API error.`);
        continue;
      }

      for (const post of data.posts) {
        if (isJunkTitle(post.title)) continue;
        
        const fullText = (post.title + " " + post.text + " " + post.highlightText).toLowerCase();
        if (!hasBaseballContext(fullText)) continue;

        for (const p of batch) {
          if (nameAppearsCorrectly(p.firstname, p.lastname, fullText)) {
            console.log(`  ✓ Matched: ${p.firstname} ${p.lastname} -> ${post.title.substring(0, 50)}...`);
            
            await pool.query(`
              INSERT INTO news_articles 
              (uuid, playerid, player_name, player_firstname, player_lastname, hsid, title, source, source_full, published_at, url, image_url, snippet, sentiment)
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
              ON CONFLICT (uuid) DO UPDATE SET 
                playerid = EXCLUDED.playerid,
                player_name = EXCLUDED.player_name
            `, [
              post.uuid, p.playerid, `${p.firstname} ${p.lastname}`, p.firstname, p.lastname, targetHsid,
              post.title, post.thread.site, post.thread.site_full, post.published, post.url,
              post.thread.main_image, post.highlightText || post.text, post.sentiment
            ]);
          }
        }
      }
    } catch (e) {
      console.error(`  ✗ Error:`, e);
    }
    
    await new Promise(r => setTimeout(r, DELAY_MS));
  }

  console.log("\n=== Ingest Complete ===");
  process.exit(0);
}

main();
