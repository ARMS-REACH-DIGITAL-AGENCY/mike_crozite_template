// scripts/discover-college-team-sources.ts

import { Client } from "pg";
import * as cheerio from "cheerio";

type TeamRow = {
  teamid: string;
  team: string;
};

type DiscoveryResult = {
  sourceSystem: string | null;
  teamSiteUrl: string | null;
  rosterUrl: string | null;
  scheduleUrl: string | null;
  calendarFeedUrl: string | null;
  discoveryStatus: "discovered" | "manual_review" | "failed";
  discoveryNotes: string | null;
};

type DiscoveryOptions = {
  dryRun?: boolean;
  teamId?: string;
};

const USER_AGENT =
  "Mozilla/5.0 (compatible; YATStatsBot/1.0; +https://yatstats.com)";

const SEARCH_DELAY_MS = 1500;
const FETCH_TIMEOUT_MS = 15000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = "";
    if (u.pathname.endsWith("/")) u.pathname = u.pathname.slice(0, -1);
    return u.toString();
  } catch {
    return url;
  }
}

function absolutizeUrl(base: string, href?: string | null): string | null {
  if (!href) return null;
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}

function isLikelyAthleticsUrl(url: string): boolean {
  const badHosts = [
    "facebook.com",
    "instagram.com",
    "x.com",
    "twitter.com",
    "youtube.com",
    "wikipedia.org",
    "linkedin.com",
    "maxpreps.com",
    "thebaseballcube.com",
  ];

  try {
    const host = new URL(url).hostname.toLowerCase();
    if (badHosts.some((h) => host.includes(h))) return false;
    return true;
  } catch {
    return false;
  }
}

async function fetchText(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      headers: { "user-agent": USER_AGENT },
      signal: controller.signal,
      redirect: "follow",
    });

    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function searchDuckDuckGo(query: string): Promise<string[]> {
  const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const html = await fetchText(searchUrl);
  if (!html) return [];

  const $ = cheerio.load(html);
  const urls = new Set<string>();

  $("a").each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;

    try {
      const u = new URL(href, "https://html.duckduckgo.com");
      const uddg = u.searchParams.get("uddg");
      const finalUrl = uddg ? decodeURIComponent(uddg) : href;
      if (finalUrl.startsWith("http") && isLikelyAthleticsUrl(finalUrl)) {
        urls.add(normalizeUrl(finalUrl));
      }
    } catch {
      // ignore malformed links
    }
  });

  return [...urls].slice(0, 10);
}

function detectSourceSystem(html: string, url: string): string | null {
  const lower = html.toLowerCase();
  const lowerUrl = url.toLowerCase();

  if (
    lower.includes("sidearm sports") ||
    lower.includes("sidearm") ||
    lower.includes("sidearm.nextgen") ||
    lowerUrl.includes("sidearm")
  ) {
    return "sidearm";
  }

  if (
    lower.includes("prestosports") ||
    lower.includes("presto sports") ||
    lower.includes("stretch internet") ||
    lowerUrl.includes("prestosports")
  ) {
    return "presto";
  }

  if (lower.includes("wmt") || lowerUrl.includes("wmt.digital")) {
    return "wmt";
  }

  if (lower.includes("statbroadcast")) {
    return "statbroadcast";
  }

  return null;
}

function scoreCandidate(url: string, team: string, html: string): number {
  const lowerHtml = html.toLowerCase();
  const lowerUrl = url.toLowerCase();
  const teamWords = team.toLowerCase().split(/[\s(),.-]+/).filter(Boolean);

  let score = 0;

  if (lowerHtml.includes("baseball")) score += 15;
  if (lowerHtml.includes("roster")) score += 10;
  if (lowerHtml.includes("schedule")) score += 10;
  if (lowerHtml.includes("athletics")) score += 10;

  for (const word of teamWords) {
    if (word.length < 3) continue;
    if (lowerHtml.includes(word)) score += 3;
    if (lowerUrl.includes(word)) score += 5;
  }

  if (detectSourceSystem(html, url)) score += 15;

  return score;
}

function findBestLinks(baseUrl: string, html: string): {
  rosterUrl: string | null;
  scheduleUrl: string | null;
} {
  const $ = cheerio.load(html);

  const rosterPatterns = [
    "roster",
    "/sports/baseball/roster",
    "/sport/baseball/roster",
  ];

  const schedulePatterns = [
    "schedule",
    "/sports/baseball/schedule",
    "/sport/baseball/schedule",
  ];

  let rosterUrl: string | null = null;
  let scheduleUrl: string | null = null;

  $("a").each((_, el) => {
    const href = $(el).attr("href");
    const text = ($(el).text() || "").toLowerCase().trim();
    const abs = absolutizeUrl(baseUrl, href);
    if (!abs) return;

    const target = abs.toLowerCase();

    if (!rosterUrl) {
      if (
        rosterPatterns.some((p) => target.includes(p)) ||
        text.includes("baseball roster") ||
        text === "roster"
      ) {
        rosterUrl = abs;
      }
    }

    if (!scheduleUrl) {
      if (
        schedulePatterns.some((p) => target.includes(p)) ||
        text.includes("baseball schedule") ||
        text === "schedule"
      ) {
        scheduleUrl = abs;
      }
    }
  });

  return { rosterUrl, scheduleUrl };
}

async function discoverTeam(team: TeamRow): Promise<DiscoveryResult> {
  const queries = [
    `${team.team} baseball athletics`,
    `${team.team} baseball roster`,
    `${team.team} athletics baseball schedule`,
  ];

  const candidates: string[] = [];

  for (const query of queries) {
    const found = await searchDuckDuckGo(query);
    for (const url of found) {
      if (!candidates.includes(url)) candidates.push(url);
    }
    await sleep(SEARCH_DELAY_MS);
  }

  const scored: Array<{
    url: string;
    html: string;
    score: number;
    sourceSystem: string | null;
  }> = [];

  for (const url of candidates.slice(0, 8)) {
    const html = await fetchText(url);
    if (!html) continue;

    const score = scoreCandidate(url, team.team, html);
    const sourceSystem = detectSourceSystem(html, url);

    scored.push({ url, html, score, sourceSystem });
    await sleep(500);
  }

  scored.sort((a, b) => b.score - a.score);

  const best = scored[0];
  if (!best) {
    return {
      sourceSystem: null,
      teamSiteUrl: null,
      rosterUrl: null,
      scheduleUrl: null,
      calendarFeedUrl: null,
      discoveryStatus: "failed",
      discoveryNotes: "No viable candidate URLs found",
    };
  }

  const links = findBestLinks(best.url, best.html);

  const enoughToTrust =
    !!best.url && (!!links.rosterUrl || !!links.scheduleUrl || !!best.sourceSystem);

  return {
    sourceSystem: best.sourceSystem,
    teamSiteUrl: best.url,
    rosterUrl: links.rosterUrl,
    scheduleUrl: links.scheduleUrl,
    calendarFeedUrl: null,
    discoveryStatus: enoughToTrust ? "discovered" : "manual_review",
    discoveryNotes: `Best candidate score=${best.score}`,
  };
}

function parseArgs(): DiscoveryOptions {
  const args = process.argv.slice(2);
  const opts: DiscoveryOptions = {};
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--dry-run") opts.dryRun = true;
    if (arg === "--teamid" && args[i + 1]) {
      opts.teamId = args[i + 1];
      i += 1;
    }
  }
  return opts;
}

export async function runDiscovery(options: DiscoveryOptions = {}) {
  const { dryRun = false, teamId } = options;

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();

  const values: string[] = [];
  let where: string;

  if (teamId) {
    // Targeted run: query directly by teamid, bypassing bulk-pending predicates
    // so a manually seeded or already-discovered team is not silently excluded.
    values.push(teamId);
    where = `
      where ingest_enabled = true
        and teamid = $1
    `;
  } else {
    // Bulk run: only process teams still pending discovery or missing a site URL.
    where = `
      where ingest_enabled = true
        and (
          discovery_status = 'pending'
          or team_site_url is null
        )
    `;
  }

  const { rows } = await client.query<TeamRow>(
    `
      select teamid, team
      from college_team_sources
      ${where}
      order by teamid
    `,
    values
  );

  console.log(`Found ${rows.length} teams to discover${dryRun ? " (dry-run)" : ""}`);

  for (const team of rows) {
    console.log(`\nDiscovering ${team.team} (${team.teamid})...`);

    try {
      const result = await discoverTeam(team);

      if (dryRun) {
        console.log({ teamid: team.teamid, team: team.team, ...result, write: "skipped (dry-run)" });
      } else if (result.discoveryStatus === "failed") {
        await client.query(
          `
            update college_team_sources
            set
              discovery_status = $2,
              discovery_notes = $3,
              last_discovered_at = now(),
              updated_at = now()
            where teamid = $1
          `,
          [team.teamid, result.discoveryStatus, result.discoveryNotes]
        );
      } else {
        await client.query(
          `
            update college_team_sources
            set
              source_system = coalesce($2, source_system),
              team_site_url = coalesce(team_site_url, $3),
              roster_url = coalesce(roster_url, $4),
              schedule_url = coalesce(schedule_url, $5),
              calendar_feed_url = coalesce(calendar_feed_url, $6),
              discovery_status = $7,
              discovery_notes = $8,
              last_discovered_at = now(),
              updated_at = now()
            where teamid = $1
          `,
          [
            team.teamid,
            result.sourceSystem,
            result.teamSiteUrl,
            result.rosterUrl,
            result.scheduleUrl,
            result.calendarFeedUrl,
            result.discoveryStatus,
            result.discoveryNotes,
          ]
        );
      }

      console.log({
        teamid: team.teamid,
        team: team.team,
        ...result,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unknown discovery error";

      if (dryRun) {
        console.error(`Dry-run failure for ${team.team}: ${message}`);
      } else {
        await client.query(
          `
            update college_team_sources
            set
              discovery_status = 'failed',
              discovery_notes = $2,
              last_discovered_at = now(),
              updated_at = now()
            where teamid = $1
          `,
          [team.teamid, message]
        );
      }

      console.error(`Failed for ${team.team}: ${message}`);
    }

    await sleep(1000);
  }

  await client.end();
}

if (require.main === module) {
  runDiscovery(parseArgs()).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
