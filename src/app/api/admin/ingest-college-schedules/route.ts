import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { XMLParser } from "fast-xml-parser";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type FeedSource = {
  teamid: string;
  current_team_name: string | null;
  current_org_or_conference_name: string | null;
  level_label: string | null;
  schedule_rss_feed: string;
  schedule_url: string | null;
  conference_schedule_url: string | null;
};

type ParsedGame = {
  college_game_key: string;
  source_game_id: string;
  game_date: string | null;
  status: string | null;
  opponent: string | null;
  home_team_name: string | null;
  away_team_name: string | null;
  boxscore_url: string | null;
  recap_url: string | null;
  livestats_url: string | null;
  raw_payload: Record<string, unknown>;
};

const sql = neon(process.env.DATABASE_URL!);

function requireAdmin(req: NextRequest) {
  const configuredSecret = process.env.ADMIN_INGEST_SECRET;

  // If ADMIN_INGEST_SECRET is set, require it.
  // Call route as /api/admin/ingest-college-schedules?secret=YOUR_SECRET
  if (configuredSecret) {
    const provided = req.nextUrl.searchParams.get("secret");
    if (provided !== configuredSecret) {
      return false;
    }
  }

  return true;
}

function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function cleanText(value: unknown): string | null {
  if (value === null || value === undefined) return null;

  const text = String(value)
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

  return text || null;
}

function normalizeUrl(value: unknown): string | null {
  if (!value) return null;

  if (typeof value === "string") return value.trim() || null;

  if (typeof value === "object" && value !== null) {
    const obj = value as Record<string, unknown>;
    if (typeof obj.href === "string") return obj.href.trim() || null;
    if (typeof obj["@_href"] === "string") return obj["@_href"].trim() || null;
  }

  return null;
}

function hashString(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

function extractDate(text: string | null): string | null {
  if (!text) return null;

  // Matches 2026-02-14
  const iso = text.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);
  if (iso) {
    const [, y, m, d] = iso;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  // Matches 02/14/2026 or 2/14/26
  const slash = text.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/);
  if (slash) {
    const [, m, d, yRaw] = slash;
    const y = yRaw.length === 2 ? `20${yRaw}` : yRaw;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  return null;
}

function parseDateFromItem(item: Record<string, unknown>): string | null {
  const title = cleanText(item.title);
  const description = cleanText(item.description ?? item.summary);
  const pubDate = cleanText(item.pubDate ?? item.published ?? item.updated);

  const explicit = extractDate(`${title ?? ""} ${description ?? ""}`);
  if (explicit) return explicit;

  if (pubDate) {
    const parsed = new Date(pubDate);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString().slice(0, 10);
    }
  }

  return null;
}

function classifyStatus(text: string | null): string | null {
  if (!text) return null;

  const t = text.toLowerCase();

  if (t.includes("final")) return "final";
  if (t.includes("cancelled") || t.includes("canceled")) return "cancelled";
  if (t.includes("postponed")) return "postponed";
  if (t.includes("suspended")) return "suspended";
  if (t.includes("live")) return "live";

  return "scheduled";
}

function parseHomeAway(
  sourceTeamName: string | null,
  text: string | null
): {
  opponent: string | null;
  home_team_name: string | null;
  away_team_name: string | null;
} {
  if (!text || !sourceTeamName) {
    return {
      opponent: null,
      home_team_name: null,
      away_team_name: null,
    };
  }

  const normalized = text.replace(/\s+/g, " ").trim();

  // Common title patterns:
  // "Arizona Western at Central Arizona"
  // "Arizona Western vs. Eastern Arizona"
  // "Baseball: Arizona Western at Central Arizona"
  const atMatch = normalized.match(/(.+?)\s+at\s+(.+?)(?:\s+-|\s+\||$)/i);
  if (atMatch) {
    const away = atMatch[1].replace(/^.*?:\s*/, "").trim();
    const home = atMatch[2].trim();

    return {
      opponent:
        home.toLowerCase().includes(sourceTeamName.toLowerCase()) ? away : home,
      home_team_name: home,
      away_team_name: away,
    };
  }

  const vsMatch = normalized.match(/(.+?)\s+v(?:s\.?|ersus)\s+(.+?)(?:\s+-|\s+\||$)/i);
  if (vsMatch) {
    const left = vsMatch[1].replace(/^.*?:\s*/, "").trim();
    const right = vsMatch[2].trim();

    return {
      opponent:
        left.toLowerCase().includes(sourceTeamName.toLowerCase()) ? right : left,
      home_team_name: sourceTeamName,
      away_team_name:
        left.toLowerCase().includes(sourceTeamName.toLowerCase()) ? right : left,
    };
  }

  return {
    opponent: null,
    home_team_name: null,
    away_team_name: null,
  };
}

function linkFromItem(item: Record<string, unknown>): string | null {
  const link = item.link;

  if (typeof link === "string") return link.trim() || null;

  if (Array.isArray(link)) {
    for (const candidate of link) {
      const parsed = normalizeUrl(candidate);
      if (parsed) return parsed;
    }
  }

  return normalizeUrl(link);
}

function parseGamesFromRss(feed: FeedSource, xml: string): ParsedGame[] {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
  });

  const parsed = parser.parse(xml);

  const rssItems = asArray<Record<string, unknown>>(parsed?.rss?.channel?.item);
  const atomItems = asArray<Record<string, unknown>>(parsed?.feed?.entry);
  const items = rssItems.length > 0 ? rssItems : atomItems;

  return items.map((item, index) => {
    const title = cleanText(item.title);
    const description = cleanText(item.description ?? item.summary);
    const link = linkFromItem(item);

    const guid =
      cleanText(item.guid) ||
      cleanText(item.id) ||
      link ||
      `${feed.teamid}-${index}-${title ?? "untitled"}`;

    const sourceGameId = hashString(`${feed.teamid}|${guid}`);
    const collegeGameKey = `${feed.teamid}::presto_rss::${sourceGameId}`;

    const combinedText = `${title ?? ""} ${description ?? ""}`;
    const gameDate = parseDateFromItem(item);
    const status = classifyStatus(combinedText);

    const teams = parseHomeAway(feed.current_team_name, combinedText);

    return {
      college_game_key: collegeGameKey,
      source_game_id: sourceGameId,
      game_date: gameDate,
      status,
      opponent: teams.opponent,
      home_team_name: teams.home_team_name,
      away_team_name: teams.away_team_name,
      boxscore_url:
        link && /box|boxscore/i.test(link + " " + combinedText) ? link : null,
      recap_url:
        link && /recap|story|news/i.test(link + " " + combinedText) ? link : null,
      livestats_url:
        link && /live|stats/i.test(link + " " + combinedText) ? link : null,
      raw_payload: {
        feed_teamid: feed.teamid,
        feed_team_name: feed.current_team_name,
        title,
        description,
        link,
        guid,
        original_item: item,
      },
    };
  });
}

async function ensureLogTable() {
  await sql`
    create table if not exists public.college_schedule_ingestion_log (
      id bigserial primary key,
      teamid text,
      current_team_name text,
      schedule_rss_feed text,
      status text not null,
      games_found integer default 0,
      games_upserted integer default 0,
      error_message text,
      started_at timestamptz not null default now(),
      finished_at timestamptz
    )
  `;
}

async function loadFeedSources(limit: number | null): Promise<FeedSource[]> {
  const rows = await sql`
    select
      teamid::text as teamid,
      current_team_name,
      current_org_or_conference_name,
      level_label,
      schedule_rss_feed,
      schedule_url,
      conference_schedule_url
    from public.teamid_universe_mapping
    where nullif(trim(schedule_rss_feed), '') is not null
    order by current_org_or_conference_name, current_team_name
  `;

  const sources = rows as FeedSource[];
  return limit ? sources.slice(0, limit) : sources;
}

async function upsertGame(feed: FeedSource, game: ParsedGame) {
  await sql`
    insert into public.college_schedule_games_raw (
      college_game_key,
      teamid,
      team,
      source_system,
      source_game_id,
      game_date,
      status,
      home_team_name,
      away_team_name,
      level,
      schedule_url,
      boxscore_url,
      recap_url,
      livestats_url,
      raw_payload,
      updated_at
    )
    values (
      ${game.college_game_key},
      ${feed.teamid},
      ${feed.current_team_name},
      'presto_rss',
      ${game.source_game_id},
      ${game.game_date},
      ${game.status},
      ${game.home_team_name},
      ${game.away_team_name},
      ${feed.level_label},
      ${feed.schedule_url || feed.conference_schedule_url || feed.schedule_rss_feed},
      ${game.boxscore_url},
      ${game.recap_url},
      ${game.livestats_url},
      ${JSON.stringify(game.raw_payload)}::jsonb,
      now()
    )
    on conflict (college_game_key) do update set
      teamid = excluded.teamid,
      team = excluded.team,
      source_system = excluded.source_system,
      source_game_id = excluded.source_game_id,
      game_date = excluded.game_date,
      status = excluded.status,
      home_team_name = excluded.home_team_name,
      away_team_name = excluded.away_team_name,
      level = excluded.level,
      schedule_url = excluded.schedule_url,
      boxscore_url = excluded.boxscore_url,
      recap_url = excluded.recap_url,
      livestats_url = excluded.livestats_url,
      raw_payload = excluded.raw_payload,
      updated_at = now()
  `;
}

export async function GET(req: NextRequest) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      { ok: false, error: "Missing DATABASE_URL" },
      { status: 500 }
    );
  }

  if (!requireAdmin(req)) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  await ensureLogTable();

  const limitParam = req.nextUrl.searchParams.get("limit");
  const limit = limitParam ? Number(limitParam) : null;

  const sources = await loadFeedSources(
    Number.isFinite(limit) && limit && limit > 0 ? limit : null
  );

  const results: Array<{
    teamid: string;
    team: string | null;
    status: string;
    games_found: number;
    games_upserted: number;
    error?: string;
  }> = [];

  for (const feed of sources) {
    const startedAt = new Date();

    try {
      const response = await fetch(feed.schedule_rss_feed, {
        method: "GET",
        headers: {
          "User-Agent": "YATSTATS Schedule Ingest/1.0",
          Accept: "application/rss+xml, application/xml, text/xml, */*",
        },
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(`Fetch failed: ${response.status} ${response.statusText}`);
      }

      const xml = await response.text();
      const games = parseGamesFromRss(feed, xml);

      let upserted = 0;

      for (const game of games) {
        await upsertGame(feed, game);
        upserted += 1;
      }

      await sql`
        insert into public.college_schedule_ingestion_log (
          teamid,
          current_team_name,
          schedule_rss_feed,
          status,
          games_found,
          games_upserted,
          error_message,
          started_at,
          finished_at
        )
        values (
          ${feed.teamid},
          ${feed.current_team_name},
          ${feed.schedule_rss_feed},
          'success',
          ${games.length},
          ${upserted},
          null,
          ${startedAt.toISOString()},
          now()
        )
      `;

      results.push({
        teamid: feed.teamid,
        team: feed.current_team_name,
        status: "success",
        games_found: games.length,
        games_upserted: upserted,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      await sql`
        insert into public.college_schedule_ingestion_log (
          teamid,
          current_team_name,
          schedule_rss_feed,
          status,
          games_found,
          games_upserted,
          error_message,
          started_at,
          finished_at
        )
        values (
          ${feed.teamid},
          ${feed.current_team_name},
          ${feed.schedule_rss_feed},
          'error',
          0,
          0,
          ${message},
          ${startedAt.toISOString()},
          now()
        )
      `;

      results.push({
        teamid: feed.teamid,
        team: feed.current_team_name,
        status: "error",
        games_found: 0,
        games_upserted: 0,
        error: message,
      });
    }
  }

  const summary = {
    ok: true,
    feeds_checked: results.length,
    successful_feeds: results.filter((r) => r.status === "success").length,
    failed_feeds: results.filter((r) => r.status === "error").length,
    games_found: results.reduce((sum, r) => sum + r.games_found, 0),
    games_upserted: results.reduce((sum, r) => sum + r.games_upserted, 0),
  };

  return NextResponse.json({
    ...summary,
    results,
  });
}

export async function POST(req: NextRequest) {
  return GET(req);
}
