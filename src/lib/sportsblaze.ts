// src/lib/sportsblaze.ts
// Server-only SportsBlaze adapter for YAT?STATS.
//
// Purpose:
// Convert provider boxscore data into YAT-owned alumni activity objects that can be
// rendered inside the existing Hamilton Where They YAT? experience: Alumni Watch,
// FlipCard backs, Profile Current YAT Status, FunZone prompts, and YaTi notes.
//
// Important: never expose SPORTSBLAZE_KEY to browser/client components.

export type YatAlumniActivity = {
  provider: "sportsblaze";
  mode: "live" | "mock" | "error-fallback";
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
    activeToday: number;
    finalGames: number;
    upcomingGames: number;
    liveGames: number;
    matchedPlayers: number;
  };
  alumni: YatAlumniCard[];
  rawShape?: {
    topLevelKeys: string[];
    gameArrayPath: string;
    gameCount: number;
  };
  error?: string;
};

export type YatAlumniCard = {
  yatPlayerId: string;
  name: string;
  currentTeam: string;
  opponent: string;
  status: "FINAL" | "LIVE" | "SCHEDULED" | "UNKNOWN";
  gameLabel: string;
  lastYat: string;
  nextYat: string;
  yatiNote: string;
  statline: Record<string, string | number>;
  cta: {
    primary: string;
    secondary: string;
  };
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
    return buildMockActivity({ league, date, mode: "mock" });
  }

  const url = `https://api.sportsblaze.com/${league}/v1/boxscores/daily/${date}.json?key=${encodeURIComponent(key)}`;

  try {
    const response = await fetch(url, {
      headers: { accept: "application/json" },
      cache: "no-store",
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      return buildMockActivity({
        league,
        date,
        mode: "error-fallback",
        error: `SportsBlaze HTTP ${response.status}${body ? `: ${body.slice(0, 160)}` : ""}`,
      });
    }

    const raw = await response.json();
    return normalizeSportsBlazeToYatActivity(raw, {
      league,
      date,
      mode: "live",
      sourceUrl: url.replace(/key=[^&]+/, "key=***"),
    });
  } catch (error) {
    return buildMockActivity({
      league,
      date,
      mode: "error-fallback",
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function normalizeSportsBlazeToYatActivity(
  raw: unknown,
  meta: { league: string; date: string; mode: "live"; sourceUrl: string }
): YatAlumniActivity {
  const obj = isRecord(raw) ? raw : {};
  const { games, path } = findFirstArray(obj, ["games", "boxscores", "data", "events", "schedule"]);
  const normalizedGames = games.filter(isRecord);

  const finalGames = normalizedGames.filter((g) => normalizeStatus(g) === "FINAL").length;
  const liveGames = normalizedGames.filter((g) => normalizeStatus(g) === "LIVE").length;
  const upcomingGames = normalizedGames.filter((g) => normalizeStatus(g) === "SCHEDULED").length;

  // Trial bridge: the NFL sample is not a Hamilton baseball feed, so the adapter
  // demonstrates how provider game/player facts become YAT modules. Once baseball
  // coverage and provider player IDs are confirmed, these rows should be created by
  // sportsblaze_player_map -> yat_playerid matching.
  const alumni = buildDemoAlumniCards(normalizedGames, meta.league);

  return {
    provider: "sportsblaze",
    mode: meta.mode,
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
      activeToday: Math.max(alumni.length, normalizedGames.length),
      finalGames,
      upcomingGames,
      liveGames,
      matchedPlayers: alumni.length,
    },
    alumni,
    rawShape: {
      topLevelKeys: Object.keys(obj).slice(0, 24),
      gameArrayPath: path,
      gameCount: normalizedGames.length,
    },
  };
}

function buildDemoAlumniCards(games: Record<string, unknown>[], league: string): YatAlumniCard[] {
  const firstGame = games[0] || {};
  const secondGame = games[1] || firstGame;
  const firstStatus = normalizeStatus(firstGame);
  const secondStatus = normalizeStatus(secondGame);

  const firstHome = readTeam(firstGame, "home");
  const firstAway = readTeam(firstGame, "away");
  const secondHome = readTeam(secondGame, "home");
  const secondAway = readTeam(secondGame, "away");

  return [
    {
      yatPlayerId: "cody-bellinger-demo",
      name: "Cody Bellinger",
      currentTeam: firstHome.name || "New York Yankees",
      opponent: firstAway.name || "Opponent TBD",
      status: firstStatus,
      gameLabel: gameLabel(firstHome, firstAway, firstStatus),
      lastYat: firstStatus === "FINAL" ? `Final: ${firstHome.score ?? "--"}-${firstAway.score ?? "--"}` : "Game activity pending",
      nextYat: firstStatus === "SCHEDULED" ? "Scheduled today" : "Next game pulled from provider schedule",
      yatiNote: `YaTi: SportsBlaze returned ${league.toUpperCase()} game context. Map this provider player/team row to the YAT playerid, then this becomes Cody's live FlipCard note.`,
      statline: { source: "SportsBlaze", status: firstStatus, teamScore: firstHome.score ?? "--" },
      cta: { primary: "Open Profile", secondary: "Add to Dream Team" },
    },
    {
      yatPlayerId: "roch-cholowsky-demo",
      name: "Roch Cholowsky",
      currentTeam: secondAway.name || "UCLA Bruins",
      opponent: secondHome.name || "Opponent TBD",
      status: secondStatus,
      gameLabel: gameLabel(secondHome, secondAway, secondStatus),
      lastYat: secondStatus === "FINAL" ? `Final: ${secondAway.score ?? "--"}-${secondHome.score ?? "--"}` : "Awaiting first pitch / tip-off",
      nextYat: secondStatus === "SCHEDULED" ? "Game today" : "Upcoming schedule slot",
      yatiNote: "YaTi: This is the exact place where Webz.io story context and SportsBlaze stat context merge into a school-centered alumni moment.",
      statline: { source: "SportsBlaze", status: secondStatus, opponent: secondHome.name || "TBD" },
      cta: { primary: "Follow Roch", secondary: "Send Attaboy" },
    },
  ];
}

function buildMockActivity(input: {
  league: string;
  date: string;
  mode: "mock" | "error-fallback";
  error?: string;
}): YatAlumniActivity {
  return {
    provider: "sportsblaze",
    mode: input.mode,
    league: input.league.toUpperCase(),
    date: input.date,
    generatedAt: new Date().toISOString(),
    school: { hsid: "5004", name: "Hamilton High School", location: "Chandler, AZ" },
    summary: {
      activeToday: 3,
      finalGames: 1,
      upcomingGames: 2,
      liveGames: 0,
      matchedPlayers: 3,
    },
    alumni: [
      {
        yatPlayerId: "cody-bellinger-demo",
        name: "Cody Bellinger",
        currentTeam: "New York Yankees",
        opponent: "Boston Red Sox",
        status: "SCHEDULED",
        gameLabel: "Yankees vs Red Sox · Today 4:05 PM",
        lastYat: "1-for-4 · 2B · RBI",
        nextYat: "Today · 4:05 PM",
        yatiNote: "YaTi: Cody has a game today. This is a perfect Fan/Superfan alert and sponsor impression moment.",
        statline: { AB: 4, H: 1, "2B": 1, RBI: 1 },
        cta: { primary: "Open Profile", secondary: "Add to Dream Team" },
      },
      {
        yatPlayerId: "roch-cholowsky-demo",
        name: "Roch Cholowsky",
        currentTeam: "UCLA Bruins",
        opponent: "Stanford Cardinal",
        status: "SCHEDULED",
        gameLabel: "UCLA vs Stanford · Tonight 6:00 PM",
        lastYat: "2-for-4 · HR · 3 RBI",
        nextYat: "Tonight · 6:00 PM",
        yatiNote: "YaTi: Roch is heating up. This belongs on the FlipCard back, profile status strip, and FunZone prompt.",
        statline: { AB: 4, H: 2, HR: 1, RBI: 3 },
        cta: { primary: "Follow Roch", secondary: "Send Attaboy" },
      },
      {
        yatPlayerId: "nolan-gorman-demo",
        name: "Nolan Gorman",
        currentTeam: "St. Louis Cardinals",
        opponent: "Chicago Cubs",
        status: "FINAL",
        gameLabel: "Cardinals 5 · Cubs 3 · Final",
        lastYat: "1-for-4 · RBI · R",
        nextYat: "Tomorrow · TBD",
        yatiNote: "YaTi: Nolan produced a run in a final game. This is a clean post-game alumni activity event.",
        statline: { AB: 4, H: 1, RBI: 1, R: 1 },
        cta: { primary: "View Game Log", secondary: "Share Attaboy" },
      },
    ],
    rawShape: {
      topLevelKeys: ["mock"],
      gameArrayPath: "mock fixture - set SPORTSBLAZE_KEY for live provider call",
      gameCount: 1,
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

function normalizeStatus(game: Record<string, unknown>): YatAlumniCard["status"] {
  const raw = String(game.status || game.game_status || game.state || game.statusText || "").toLowerCase();
  if (raw.includes("final") || raw === "closed" || raw === "complete") return "FINAL";
  if (raw.includes("live") || raw.includes("progress") || raw.includes("inning") || raw.includes("quarter")) return "LIVE";
  if (raw.includes("scheduled") || raw.includes("pre") || raw.includes("not started")) return "SCHEDULED";
  return "UNKNOWN";
}

function readTeam(game: Record<string, unknown>, side: "home" | "away"): { name: string; score?: unknown } {
  const direct = game[side];
  if (isRecord(direct)) {
    return {
      name: String(direct.name || direct.team || direct.full_name || direct.display_name || direct.abbreviation || ""),
      score: direct.score ?? direct.points ?? direct.runs,
    };
  }

  return {
    name: String(game[`${side}_team`] || game[`${side}Team`] || game[`${side}_name`] || ""),
    score: game[`${side}_score`] ?? game[`${side}Score`],
  };
}

function gameLabel(
  home: { name: string; score?: unknown },
  away: { name: string; score?: unknown },
  status: YatAlumniCard["status"]
): string {
  const homeName = home.name || "Home";
  const awayName = away.name || "Away";
  if (status === "FINAL" || status === "LIVE") {
    return `${awayName} ${away.score ?? "--"} @ ${homeName} ${home.score ?? "--"} · ${status}`;
  }
  return `${awayName} @ ${homeName} · ${status}`;
}
