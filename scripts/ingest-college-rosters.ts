import { Client } from "pg";
import * as cheerio from "cheerio";

type TeamSource = {
  teamid: string;
  team?: string;
  source_system: string | null;
  team_site_url: string | null;
  roster_url: string | null;
  schedule_url: string | null;
  calendar_feed_url: string | null;
};

type ParsedPlayer = {
  name: string;
  profileUrl: string | null;
  highSchool: string | null;
  headshotUrl: string | null;
  headshotOriginalUrl: string | null;
  headshotTransformedUrl: string | null;
  raw: Record<string, unknown>;
};

type IngestOptions = {
  dryRun?: boolean;
  teamId?: string;
};

const USER_AGENT =
  "Mozilla/5.0 (compatible; YATStatsBot/1.0; +https://yatstats.com)";

function parseArgs(): IngestOptions {
  const args = process.argv.slice(2);
  const opts: IngestOptions = {};
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

function absolutize(base: string, href?: string | null): string | null {
  if (!href) return null;
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}

async function fetchHtml(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: { "user-agent": USER_AGENT }, redirect: "follow" });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

function deduceProvider(team: TeamSource): "sidearm" | "presto" | "wmt" | "unknown" {
  const source = (team.source_system || "").toLowerCase();
  if (source.includes("sidearm")) return "sidearm";
  if (source.includes("presto")) return "presto";
  if (source.includes("wmt")) return "wmt";

  const url = `${team.team_site_url || ""} ${team.roster_url || ""} ${team.calendar_feed_url || ""}`.toLowerCase();
  if (url.includes("sidearm")) return "sidearm";
  if (url.includes("vaquerosports.com")) return "presto";
  if (url.includes("wmt.digital") || url.includes("thesundevils.com")) return "wmt";
  return "unknown";
}

function parseTableRows($: cheerio.CheerioAPI, rosterUrl: string): ParsedPlayer[] {
  const players: ParsedPlayer[] = [];
  $("table").each((_, table) => {
    const headers = $(table)
      .find("thead th")
      .map((__, th) => ($(th).text() || "").trim().toLowerCase())
      .get();

    $(table)
      .find("tbody tr")
      .each((__, tr) => {
        const cells = $(tr)
          .find("td")
          .map((___, td) => ($(td).text() || "").trim())
          .get();
        if (cells.length === 0) return;

        const rowData: Record<string, string> = {};
        headers.forEach((h, idx) => {
          rowData[h || `col_${idx}`] = cells[idx] ?? "";
        });

        const link = $(tr).find("a[href]").first();
        const name =
          link.text().trim() ||
          rowData["name"] ||
          rowData["player"] ||
          cells.find((v) => /[A-Za-z]/.test(v)) ||
          "";
        if (!name) return;

        const profileUrl = absolutize(rosterUrl, link.attr("href"));
        const highSchool =
          rowData["high school"] || rowData["highschool"] || rowData["hs"] || null;

        players.push({
          name,
          profileUrl,
          highSchool,
          headshotUrl: null,
          headshotOriginalUrl: null,
          headshotTransformedUrl: null,
          raw: rowData,
        });
      });
  });
  return players;
}

function parseSidearmCards($: cheerio.CheerioAPI, rosterUrl: string): ParsedPlayer[] {
  const players: ParsedPlayer[] = [];
  $(".sidearm-roster-player").each((_, el) => {
    const name =
      $(el).find(".sidearm-roster-player-name a, .sidearm-roster-player-name h3").first().text().trim() ||
      $(el).find(".sidearm-roster-player-name").first().text().trim();
    if (!name) return;

    const profileUrl = absolutize(
      rosterUrl,
      $(el).find(".sidearm-roster-player-name a, a.sidearm-roster-player-name").first().attr("href")
    );

    const image =
      $(el).find("img").first().attr("data-src") ||
      $(el).find("img").first().attr("src") ||
      null;
    const absImage = absolutize(rosterUrl, image);

    const highSchool =
      $(el).find(".sidearm-roster-player-highschool").text().trim() || null;

    players.push({
      name,
      profileUrl,
      highSchool,
      headshotUrl: absImage,
      headshotOriginalUrl: null,
      headshotTransformedUrl: null,
      raw: {
        cardText: $(el).text().trim(),
      },
    });
  });

  return players;
}

async function enrichHeadshotFromProfile(player: ParsedPlayer): Promise<ParsedPlayer> {
  if (!player.profileUrl) return player;
  const html = await fetchHtml(player.profileUrl);
  if (!html) return player;

  const $ = cheerio.load(html);
  const og =
    $("meta[property='og:image']").attr("content") ||
    $("meta[name='twitter:image']").attr("content") ||
    null;

  const firstImg = $("img[src]").first().attr("src") || null;
  const picked = og || firstImg;
  const headshotUrl = picked ? absolutize(player.profileUrl, picked) : player.headshotUrl;

  let headshotOriginalUrl: string | null = null;
  let headshotTransformedUrl: string | null = null;

  const htmlLower = html.toLowerCase();
  const nextgenMatch = html.match(/https?:\/\/[^"'\s]*sidearm\.nextgen\.sites[^"'\s]*/i);
  const transformedMatch = html.match(/https?:\/\/[^"'\s]*images\.sidearmdev\.com[^"'\s]*/i);

  if (nextgenMatch) headshotOriginalUrl = nextgenMatch[0];
  if (transformedMatch) headshotTransformedUrl = transformedMatch[0];

  if (!headshotOriginalUrl && headshotUrl?.toLowerCase().includes("sidearm.nextgen.sites")) {
    headshotOriginalUrl = headshotUrl;
  }
  if (!headshotTransformedUrl && headshotUrl?.toLowerCase().includes("images.sidearmdev.com")) {
    headshotTransformedUrl = headshotUrl;
  }

  return {
    ...player,
    headshotUrl,
    headshotOriginalUrl,
    headshotTransformedUrl,
    raw: {
      ...player.raw,
      profileHasSidearmNextgen: htmlLower.includes("sidearm.nextgen.sites"),
      profileHasImagesSidearmDev: htmlLower.includes("images.sidearmdev.com"),
    },
  };
}

async function getWritableColumns(client: Client): Promise<Set<string>> {
  const { rows } = await client.query<{ column_name: string }>(
    `
      select column_name
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'college_roster_players_raw'
    `
  );
  return new Set(rows.map((r) => r.column_name));
}

async function insertRawPlayer(
  client: Client,
  writable: Set<string>,
  team: TeamSource,
  provider: string,
  rosterUrl: string,
  player: ParsedPlayer
) {
  const candidate: Record<string, unknown> = {
    teamid: team.teamid,
    provider,
    source_system: provider,
    roster_url: rosterUrl,
    player_name: player.name,
    full_name: player.name,
    name: player.name,
    high_school: player.highSchool,
    profile_url: player.profileUrl,
    headshot_url: player.headshotUrl,
    headshot_original_url: player.headshotOriginalUrl,
    headshot_transformed_url: player.headshotTransformedUrl,
    raw_json: player.raw,
    raw_payload: player.raw,
    created_at: new Date(),
    updated_at: new Date(),
    ingested_at: new Date(),
  };

  const cols = Object.keys(candidate).filter((c) => writable.has(c));
  if (cols.length === 0) {
    throw new Error("No writable columns discovered for college_roster_players_raw");
  }

  const values = cols.map((c) => candidate[c]);
  const placeholders = cols.map((_, i) => `$${i + 1}`);

  await client.query(
    `insert into college_roster_players_raw (${cols.join(",")}) values (${placeholders.join(",")})`,
    values
  );
}

export async function runIngestCollegeRosters(options: IngestOptions = {}) {
  const { dryRun = false, teamId } = options;

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  const whereParts = ["ingest_enabled = true", "roster_url is not null"];
  const values: string[] = [];
  if (teamId) {
    values.push(teamId);
    whereParts.push(`teamid = $${values.length}`);
  }

  const { rows } = await client.query<TeamSource>(
    `select teamid, team, source_system, team_site_url, roster_url, schedule_url, calendar_feed_url
     from college_team_sources
     where ${whereParts.join(" and ")}
     order by teamid`,
    values
  );

  const writable = dryRun ? new Set<string>() : await getWritableColumns(client);

  for (const team of rows) {
    const rosterUrl = team.roster_url as string;
    const provider = deduceProvider(team);
    const html = await fetchHtml(rosterUrl);
    if (!html) {
      console.error(`Unable to fetch roster for team ${team.teamid}: ${rosterUrl}`);
      continue;
    }

    const $ = cheerio.load(html);
    let players: ParsedPlayer[] = [];

    if (provider === "sidearm") {
      players = [...parseSidearmCards($, rosterUrl), ...parseTableRows($, rosterUrl)];
    } else if (provider === "presto") {
      players = parseTableRows($, rosterUrl);
    } else if (provider === "wmt") {
      players = parseTableRows($, rosterUrl);
    } else {
      players = parseTableRows($, rosterUrl);
    }

    const dedup = new Map<string, ParsedPlayer>();
    for (const p of players) {
      let key: string;
      if (p.profileUrl) {
        key = `${p.name.toLowerCase()}|${p.profileUrl}`;
      } else {
        // No profile URL — build a stronger fingerprint from available discriminators
        // so two real players with the same name are not collapsed.
        const r = p.raw;
        const jersey = String(r["no."] ?? r["#"] ?? r["jersey"] ?? r["number"] ?? "");
        const pos = String(r["pos"] ?? r["position"] ?? "");
        const yr = String(r["yr"] ?? r["year"] ?? r["class"] ?? r["cl"] ?? "");
        const hs = String(p.highSchool ?? r["high school"] ?? r["highschool"] ?? r["hs"] ?? "");
        const cardText = String(r["cardText"] ?? "");
        key = `${p.name.toLowerCase()}|${jersey}|${pos}|${yr}|${hs}|${cardText}`;
      }
      if (!dedup.has(key)) dedup.set(key, p);
    }

    const finalized: ParsedPlayer[] = [];
    for (const p of dedup.values()) {
      if (provider === "sidearm") {
        finalized.push(await enrichHeadshotFromProfile(p));
      } else {
        finalized.push(p);
      }
    }

    if (dryRun) {
      console.log(
        JSON.stringify(
          {
            mode: "dry-run",
            teamid: team.teamid,
            provider,
            rosterUrl,
            scheduleUrl: team.schedule_url,
            calendarFeedUrl: team.calendar_feed_url,
            parsedPlayers: finalized.length,
            sample: finalized.slice(0, 3),
          },
          null,
          2
        )
      );
      continue;
    }

    for (const player of finalized) {
      await insertRawPlayer(client, writable, team, provider, rosterUrl, player);
    }

    console.log(
      `Inserted ${finalized.length} roster rows for team ${team.teamid} (${provider})`
    );
  }

  await client.end();
}

if (require.main === module) {
  runIngestCollegeRosters(parseArgs()).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
