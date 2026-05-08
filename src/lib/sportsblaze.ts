// src/lib/sportsblaze.ts
// Server-only SportsBlaze adapter for YAT?STATS.
//
// This file now does exactly one thing for the trial: call SportsBlaze from the
// server and display the real provider payload normalized into YAT?STATS-shaped
// live game objects. It does not invent Hamilton alumni, player stat lines, or
// fake schedules. Missing key / failed API calls are shown as errors.

export type SportsBlazeMode = "live" | "missing-key" | "api-error";

export type YatAlumniActivity = {
  provider: "sportsblaze";
  mode: SportsBlazeMode;
  league: string;
  date: string;
  sourceUrl?: string;
  generatedAt: string;
  school: {
    hsid: string;
    name: string;
    location: string;
  };
  summary: {
    providerGames: number;
    finalGames: number;
    upcomingGames: number;
    liveGames: number;
    matchedPlayers: number;
  };
  games: SportsBlazeGameCard[];
  rawShape?: {
    topLevelKeys: string[];
    gameArrayPath: string;
    gameCount: number;
  };
  rawSample?: unknown;
  error?: string;
};

export type SportsBlazeGameCard = {
  id: string;
  status: "FINAL" | "LIVE" | "SCHEDULED" | "UNKNOWN";
  label: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: string;
  awayScore: string;
  venue?: string;
  startsAt?: string;
};

type SportsBlazeFetchOptions = {
  league?: string;
  date?: string;
  hsid?: string;
};

const SAMPLE_DATE = "2025-02-09";
const SAMPLE_LEAGUE = "nfl";

export async function getSportsBlazeHamiltonWatch(options: SportsBlazeFetchOptions = {}): Promise<YatAlumniActivity> {
  const league = (options.league || SAMPLE_LEAGUE).toLowerCase();
  const date = options.date || SAMPLE_DATE;
  const key = process.env.SPORTSBLAZE_KEY;

  if (!key) {
    return buildErrorActivity({
      league,
      date,
      mode: "missing-key",
      error: "SPORTSBLAZE_KEY is not available to this Vercel deployment. Add it to the mike-crozite-template project for the Preview environment, then redeploy this branch.",
    });
  }

  const url = `https://api.sportsblaze.com/${league}/v1/boxscores/daily/${date}.json?key=${encodeURIComponent(key)}`;

  try {
    const response = await fetch(url, {
      headers: { accept: "application/json" },
      cache: "no-store",
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      return buildErrorActivity({
        league,
        date,
        mode: "api-error",
        error: `SportsBlaze HTTP ${response.status}${body ? `: ${body.slice(0, 260)}` : ""}`,
      });
    }

    const raw = await response.json();
    return normalizeSportsBlazeToYatActivity(raw, {
      league,
      date,
      sourceUrl: url.replace(/key=[^&]+/, "key=***"),
    });
  } catch (error) {
    return buildErrorActivity({
      league,
      date,
      mode: "api-error",
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function normalizeSportsBlazeToYatActivity(
  raw: unknown,
  meta: { league: string; date: string; sourceUrl: string }
): YatAlumniActivity {
  const obj = isRecord(raw) ? raw : {};
  const { games, path } = findFirstArray(obj, ["games", "boxscores", "data", "events", "schedule"]);
  const normalizedGames = games.filter(isRecord).map((game, index) => toGameCard(game, index));

  return {
    provider: "sportsblaze",
    mode: "live",
    league: meta.league.toUpperCase(),
    date: meta.date,
    sourceUrl: meta.sourceUrl,
    generatedAt: new Date().toISOString(),
    school: {
      hsid: "5004",
      name: "Hamilton High School",
      location: "Chandler, AZ",
    },
    summary: {
      providerGames: normalizedGames.length,
      finalGames: normalizedGames.filter((g) => g.status === "FINAL").length,
      upcomingGames: normalizedGames.filter((g) => g.status === "SCHEDULED").length,
      liveGames: normalizedGames.filter((g) => g.status === "LIVE").length,
      matchedPlayers: 0,
    },
    games: normalizedGames,
    rawShape: {
      topLevelKeys: Object.keys(obj).slice(0, 24),
      gameArrayPath: path,
      gameCount: normalizedGames.length,
    },
    rawSample: normalizedGames.length ? games[0] : obj,
  };
}

function buildErrorActivity(input: {
  league: string;
  date: string;
  mode: "missing-key" | "api-error";
  error: string;
}): YatAlumniActivity {
  return {
    provider: "sportsblaze",
    mode: input.mode,
    league: input.league.toUpperCase(),
    date: input.date,
    generatedAt: new Date().toISOString(),
    school: { hsid: "5004", name: "Hamilton High School", location: "Chandler, AZ" },
    summary: {
      providerGames: 0,
      finalGames: 0,
      upcomingGames: 0,
      liveGames: 0,
      matchedPlayers: 0,
    },
    games: [],
    rawShape: {
      topLevelKeys: [],
      gameArrayPath: "not called",
      gameCount: 0,
    },
    error: input.error,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function findFirstArray(root: Record<string, unknown>, keys: string[]): { games: unknown[]; path: string } {
  for (const key of keys) {
    const value = root[key];
    if (Array.isArray(value)) return { games: value, path: `$.${key}` };
  }

  for (const [key, value] of Object.entries(root)) {
    if (isRecord(value)) {
      const nested = findFirstArray(value, keys);
      if (nested.games.length) return { games: nested.games, path: `$.${key}${nested.path.slice(1)}` };
    }
  }

  return { games: [], path: "not found" };
}

function toGameCard(game: Record<string, unknown>, index: number): SportsBlazeGameCard {
  const status = normalizeStatus(game);
  const home = readTeam(game, "home");
  const away = readTeam(game, "away");
  const startsAt = String(game.start_time || game.startTime || game.scheduled || game.date || game.game_time || "").trim();
  const venue = String(game.venue || game.stadium || game.location || "").trim();
  const id = String(game.id || game.game_id || game.event_id || `${index + 1}`);

  return {
    id,
    status,
    label: gameLabel(home, away, status, startsAt),
    homeTeam: home.name || "Home",
    awayTeam: away.name || "Away",
    homeScore: String(home.score ?? "--"),
    awayScore: String(away.score ?? "--"),
    venue: venue || undefined,
    startsAt: startsAt || undefined,
  };
}

function normalizeStatus(game: Record<string, unknown>): SportsBlazeGameCard["status"] {
  const raw = String(game.status || game.game_status || game.state || game.statusText || game.status_text || "").toLowerCase();
  if (raw.includes("final") || raw === "closed" || raw === "complete" || raw === "completed") return "FINAL";
  if (raw.includes("live") || raw.includes("progress") || raw.includes("inning") || raw.includes("quarter")) return "LIVE";
  if (raw.includes("scheduled") || raw.includes("pre") || raw.includes("not started") || raw.includes("upcoming")) return "SCHEDULED";
  return "UNKNOWN";
}

function readTeam(game: Record<string, unknown>, side: "home" | "away"): { name: string; score?: unknown } {
  const direct = game[side];
  if (isRecord(direct)) {
    return {
      name: String(direct.name || direct.team || direct.full_name || direct.display_name || direct.abbreviation || direct.alias || ""),
      score: direct.score ?? direct.points ?? direct.runs ?? direct.total,
    };
  }

  const teamObj = game[`${side}_team`] || game[`${side}Team`];
  if (isRecord(teamObj)) {
    return {
      name: String(teamObj.name || teamObj.team || teamObj.full_name || teamObj.display_name || teamObj.abbreviation || teamObj.alias || ""),
      score: game[`${side}_score`] ?? game[`${side}Score`] ?? teamObj.score ?? teamObj.points,
    };
  }

  return {
    name: String(game[`${side}_team`] || game[`${side}Team`] || game[`${side}_name`] || game[`${side}Name`] || ""),
    score: game[`${side}_score`] ?? game[`${side}Score`] ?? game[`${side}_points`] ?? game[`${side}Points`],
  };
}

function gameLabel(
  home: { name: string; score?: unknown },
  away: { name: string; score?: unknown },
  status: SportsBlazeGameCard["status"],
  startsAt?: string
): string {
  const homeName = home.name || "Home";
  const awayName = away.name || "Away";
  if (status === "FINAL" || status === "LIVE") {
    return `${awayName} ${String(away.score ?? "--")} @ ${homeName} ${String(home.score ?? "--")} · ${status}`;
  }
  return `${awayName} @ ${homeName}${startsAt ? ` · ${startsAt}` : ""} · ${status}`;
}
