#!/usr/bin/env ts-node
// scripts/ingest-college-rosters.ts
//
// Reads discovered roster URLs from college_team_sources and ingests roster/player
// candidates into college_roster_players_raw for downstream match review.

import { createHash } from "crypto";
import { Pool } from "pg";
import * as cheerio from "cheerio";

type TeamSourceRow = {
  teamid: string;
  team: string;
  source_system: string | null;
  roster_url: string;
};

type RosterCandidate = {
  source_player_id: string | null;
  player_name: string;
  first_name: string | null;
  last_name: string | null;
  jersey_number: string | null;
  position: string | null;
  class_year: string | null;
  hometown: string | null;
  home_state: string | null;
  bats: string | null;
  throws: string | null;
  headshot_url: string | null;
  bio_url: string | null;
};

const USER_AGENT =
  "Mozilla/5.0 (compatible; YATStatsBot/1.0; +https://yatstats.com)";
const FETCH_TIMEOUT_MS = 20000;
const REQUEST_DELAY_MS = 500;

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error("DATABASE_URL is required");
}

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const teamArgIndex = args.indexOf("--teamid");
const onlyTeamId = teamArgIndex >= 0 ? args[teamArgIndex + 1] : null;

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clean(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length ? normalized : null;
}

function normalizeNameForKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function splitPlayerName(playerName: string): {
  firstName: string | null;
  lastName: string | null;
} {
  const normalized = clean(playerName);
  if (!normalized) return { firstName: null, lastName: null };

  const parts = normalized.split(" ");
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: null };
  }

  return {
    firstName: parts.slice(0, -1).join(" "),
    lastName: parts.at(-1) ?? null,
  };
}

function absolutizeUrl(baseUrl: string, maybeRelative?: string | null): string | null {
  if (!maybeRelative) return null;
  try {
    return new URL(maybeRelative, baseUrl).toString();
  } catch {
    return null;
  }
}

function parseStateFromHometown(hometown: string | null): string | null {
  if (!hometown) return null;
  const parts = hometown.split(",").map((x) => x.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  const maybeState = parts.at(-1) ?? "";
  const twoLetter = maybeState.match(/\b([A-Z]{2})\b/i)?.[1];
  return twoLetter ? twoLetter.toUpperCase() : null;
}

async function fetchHtml(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      headers: { "user-agent": USER_AGENT },
      signal: controller.signal,
      redirect: "follow",
    });

    if (!res.ok) {
      throw new Error(`Failed to fetch ${url}: HTTP ${res.status}`);
    }

    return await res.text();
  } finally {
    clearTimeout(timeout);
  }
}

function inferSeasonFromUrl(url: string): string | null {
  const matched = url.match(/(20\d{2})/g);
  if (!matched?.length) return null;
  return matched[matched.length - 1] ?? null;
}

function parseRosterCards(baseUrl: string, html: string): RosterCandidate[] {
  const $ = cheerio.load(html);
  const candidates: RosterCandidate[] = [];

  const cardSelectors = [
    "[class*='roster'] [class*='player']",
    "[class*='sidearm-roster-player']",
    "[class*='person-card']",
    "li[class*='roster']",
    "tr",
  ];

  const seen = new Set<string>();

  for (const selector of cardSelectors) {
    $(selector).each((_, el) => {
      const node = $(el);
      const rawName =
        clean(node.find("[class*='name']").first().text()) ||
        clean(node.find("a[aria-label*='bio']").first().text()) ||
        clean(node.find("a").first().text());

      if (!rawName || rawName.length < 3) return;
      if (/roster|schedule|coaches/i.test(rawName)) return;

      const bioHref =
        node.find("a[href*='bio'], a[href*='player'], a[href*='athlete']").first().attr("href") ||
        node.find("a").first().attr("href");

      const imgSrc =
        node.find("img").first().attr("data-src") ||
        node.find("img").first().attr("src") ||
        node.find("img").first().attr("data-lazy-src");

      const jerseyText =
        clean(node.find("[class*='jersey'], [class*='number']").first().text()) ||
        clean(node.find("td").eq(0).text());

      const positionText =
        clean(node.find("[class*='position']").first().text()) ||
        clean(node.find("td").eq(1).text());

      const classText =
        clean(node.find("[class*='class']").first().text()) ||
        clean(node.find("td").eq(2).text());

      const hometownText =
        clean(node.find("[class*='hometown']").first().text()) ||
        clean(node.find("td").eq(3).text());

      const batsText = clean(node.find("[class*='bats']").first().text());
      const throwsText = clean(node.find("[class*='throws']").first().text());

      const sourcePlayerId =
        node.attr("data-player-id") ||
        node.attr("data-id") ||
        (() => {
          const href = absolutizeUrl(baseUrl, bioHref);
          if (!href) return null;
          const u = new URL(href);
          return (
            u.searchParams.get("id") ||
            u.searchParams.get("player") ||
            u.pathname.split("/").filter(Boolean).at(-1) ||
            null
          );
        })();

      const normalizedName = normalizeNameForKey(rawName);
      const dedupeKey = `${normalizedName}|${sourcePlayerId ?? ""}|${bioHref ?? ""}`;
      if (seen.has(dedupeKey)) return;
      seen.add(dedupeKey);

      const split = splitPlayerName(rawName);
      const hometown = hometownText;

      candidates.push({
        source_player_id: clean(sourcePlayerId),
        player_name: rawName,
        first_name: split.firstName,
        last_name: split.lastName,
        jersey_number: clean(jerseyText),
        position: clean(positionText),
        class_year: clean(classText),
        hometown,
        home_state: parseStateFromHometown(hometown),
        bats: clean(batsText),
        throws: clean(throwsText),
        headshot_url: absolutizeUrl(baseUrl, imgSrc),
        bio_url: absolutizeUrl(baseUrl, bioHref),
      });
    });

    if (candidates.length > 0) break;
  }

  return candidates;
}

function buildRosterPlayerKey(input: {
  teamid: string;
  sourceSystem: string | null;
  rosterSeason: string;
  sourcePlayerId: string | null;
  playerName: string;
  bioUrl: string | null;
  headshotUrl: string | null;
}): string {
  const stableNaturalKey = [
    input.teamid,
    input.sourceSystem ?? "unknown",
    input.rosterSeason,
    input.sourcePlayerId ?? "",
    input.bioUrl ?? "",
    normalizeNameForKey(input.playerName),
    input.headshotUrl ?? "",
  ].join("|");

  const digest = createHash("sha1").update(stableNaturalKey).digest("hex");
  return `${input.teamid}:${input.rosterSeason}:${digest.slice(0, 24)}`;
}

async function upsertRosterPlayer(row: {
  roster_player_key: string;
  teamid: string;
  team: string;
  source_system: string | null;
  source_player_id: string | null;
  roster_season: string;
  player_name: string;
  first_name: string | null;
  last_name: string | null;
  jersey_number: string | null;
  position: string | null;
  class_year: string | null;
  hometown: string | null;
  home_state: string | null;
  bats: string | null;
  throws: string | null;
  headshot_url: string | null;
  bio_url: string | null;
}) {
  const update = await pool.query(
    `
      UPDATE college_roster_players_raw
      SET
        teamid = $2,
        team = $3,
        source_system = $4,
        source_player_id = $5,
        roster_season = $6,
        player_name = $7,
        first_name = $8,
        last_name = $9,
        jersey_number = $10,
        position = $11,
        class_year = $12,
        hometown = $13,
        home_state = $14,
        bats = $15,
        throws = $16,
        headshot_url = $17,
        bio_url = $18,
        updated_at = now()
      WHERE roster_player_key = $1
    `,
    [
      row.roster_player_key,
      row.teamid,
      row.team,
      row.source_system,
      row.source_player_id,
      row.roster_season,
      row.player_name,
      row.first_name,
      row.last_name,
      row.jersey_number,
      row.position,
      row.class_year,
      row.hometown,
      row.home_state,
      row.bats,
      row.throws,
      row.headshot_url,
      row.bio_url,
    ]
  );

  if (update.rowCount && update.rowCount > 0) {
    return "updated";
  }

  await pool.query(
    `
      INSERT INTO college_roster_players_raw (
        roster_player_key,
        teamid,
        team,
        source_system,
        source_player_id,
        roster_season,
        player_name,
        first_name,
        last_name,
        jersey_number,
        position,
        class_year,
        hometown,
        home_state,
        bats,
        throws,
        headshot_url,
        bio_url
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
        $11,$12,$13,$14,$15,$16,$17,$18
      )
    `,
    [
      row.roster_player_key,
      row.teamid,
      row.team,
      row.source_system,
      row.source_player_id,
      row.roster_season,
      row.player_name,
      row.first_name,
      row.last_name,
      row.jersey_number,
      row.position,
      row.class_year,
      row.hometown,
      row.home_state,
      row.bats,
      row.throws,
      row.headshot_url,
      row.bio_url,
    ]
  );

  return "inserted";
}

async function main() {
  console.log("=== College roster ingest ===");
  console.log(`Mode: ${dryRun ? "DRY RUN" : "LIVE"}`);

  const params: string[] = [];
  const where: string[] = ["ingest_enabled = true", "roster_url is not null"];

  if (onlyTeamId) {
    params.push(onlyTeamId);
    where.push(`teamid = $${params.length}`);
  }

  const { rows } = await pool.query<TeamSourceRow>(
    `
      SELECT teamid, team, source_system, roster_url
      FROM college_team_sources
      WHERE ${where.join(" AND ")}
      ORDER BY teamid
    `,
    params
  );

  console.log(`Found ${rows.length} team source rows`);

  let totalCandidates = 0;
  let totalInserted = 0;
  let totalUpdated = 0;

  for (const team of rows) {
    console.log(`\n[${team.teamid}] ${team.team}`);
    const rosterSeason = inferSeasonFromUrl(team.roster_url) ?? String(new Date().getFullYear());

    try {
      const html = await fetchHtml(team.roster_url);
      const candidates = parseRosterCards(team.roster_url, html);

      console.log(`  Parsed ${candidates.length} roster candidates`);
      totalCandidates += candidates.length;

      for (const candidate of candidates) {
        const rosterPlayerKey = buildRosterPlayerKey({
          teamid: team.teamid,
          sourceSystem: team.source_system,
          rosterSeason,
          sourcePlayerId: candidate.source_player_id,
          playerName: candidate.player_name,
          bioUrl: candidate.bio_url,
          headshotUrl: candidate.headshot_url,
        });

        if (dryRun) continue;

        const result = await upsertRosterPlayer({
          roster_player_key: rosterPlayerKey,
          teamid: team.teamid,
          team: team.team,
          source_system: team.source_system,
          source_player_id: candidate.source_player_id,
          roster_season: rosterSeason,
          player_name: candidate.player_name,
          first_name: candidate.first_name,
          last_name: candidate.last_name,
          jersey_number: candidate.jersey_number,
          position: candidate.position,
          class_year: candidate.class_year,
          hometown: candidate.hometown,
          home_state: candidate.home_state,
          bats: candidate.bats,
          throws: candidate.throws,
          headshot_url: candidate.headshot_url,
          bio_url: candidate.bio_url,
        });

        if (result === "inserted") totalInserted += 1;
        if (result === "updated") totalUpdated += 1;
      }
    } catch (error) {
      console.error(`  Failed ${team.teamid}:`, error);
    }

    await sleep(REQUEST_DELAY_MS);
  }

  console.log("\n=== Done ===");
  console.log(`Candidates parsed: ${totalCandidates}`);
  if (!dryRun) {
    console.log(`Inserted: ${totalInserted}`);
    console.log(`Updated: ${totalUpdated}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
