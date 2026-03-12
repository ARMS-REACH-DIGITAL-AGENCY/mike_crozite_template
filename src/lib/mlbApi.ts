// src/lib/mlbApi.ts
// YAT?STATS — Live MLB Stats API helpers (server-side only)
//
// Used by the player profile page to fetch a player's real-time current team,
// roster status, and next scheduled game directly from the MLB Stats API.
// All calls are gracefully degraded — a network failure or missing data never
// throws; it returns null/undefined instead.

const MLB_API = "https://statsapi.mlb.com/api/v1";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MlbCurrentTeamInfo {
  mlbPersonId: number;
  fullName: string;
  teamId: number;
  teamName: string;
  teamAbbreviation: string;
  /** Short level label, e.g. "AAA", "AA", "MLB" */
  level: string;
  sportId: number;
  active: boolean;
  /** Roster status description, e.g. "Active", "60-Day IL", "Restricted List" */
  status: string;
}

export interface MlbNextGame {
  /** ISO date string, e.g. "2025-03-27" */
  date: string;
  /** Opponent team abbreviation, e.g. "BUF" */
  opponent: string;
  /** True when the player's team is the home team */
  home: boolean;
  /** Game type code: "S"=spring, "R"=regular season */
  gameType: string;
}

// ---------------------------------------------------------------------------
// Internal MLB API response shapes (only the fields we use)
// ---------------------------------------------------------------------------

interface MlbPersonResponse {
  people?: Array<{
    id: number;
    fullName: string;
    active?: boolean;
    currentTeam?: {
      id: number;
      name: string;
      abbreviation?: string;
      sport?: { id?: number; name?: string };
    };
    status?: { code?: string; description?: string };
  }>;
}

interface MlbScheduleResponse {
  dates?: Array<{
    date: string;
    games?: Array<{
      gamePk: number;
      gameType?: string;
      teams?: {
        home?: { team?: { id?: number; abbreviation?: string } };
        away?: { team?: { id?: number; abbreviation?: string } };
      };
    }>;
  }>;
}

// ---------------------------------------------------------------------------
// Level label helper (mirrors the one in the sync script)
// ---------------------------------------------------------------------------

function sportNameToLevel(sportName?: string): string {
  if (!sportName) return "";
  const s = sportName.toLowerCase();
  if (s.includes("major")) return "MLB";
  if (s.includes("triple") || s === "aaa") return "AAA";
  if (s.includes("double") || s === "aa") return "AA";
  if (s.includes("high")) return "High-A";
  if (s.includes("single") || s.includes("class a")) return "Single-A";
  if (s.includes("rookie")) return "Rookie";
  return "";
}

// ---------------------------------------------------------------------------
// Fetch current team for a player by their MLB Stats API person ID
// ---------------------------------------------------------------------------

export async function fetchMlbPlayerCurrentTeam(
  mlbPersonId: number
): Promise<MlbCurrentTeamInfo | null> {
  try {
    const url = `${MLB_API}/people/${mlbPersonId}?hydrate=currentTeam`;
    const res = await fetch(url, {
      // Revalidate once per hour — live enough for a daily update cycle
      next: { revalidate: 3600 },
    } as RequestInit & { next?: { revalidate?: number } });
    if (!res.ok) return null;

    const data = (await res.json()) as MlbPersonResponse;
    const person = data.people?.[0];
    if (!person) return null;

    const ct = person.currentTeam;
    if (!ct?.id) return null;

    return {
      mlbPersonId: person.id,
      fullName: person.fullName,
      teamId: ct.id,
      teamName: ct.name,
      teamAbbreviation: ct.abbreviation ?? "",
      level: sportNameToLevel(ct.sport?.name),
      sportId: ct.sport?.id ?? 1,
      active: person.active ?? false,
      status: person.status?.description ?? "Active",
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Search for a player by name when no stable MLB person ID is stored yet.
//
// WHY THIS EXISTS: Our canonical player file (tbc_players_raw) stores
// preferred/nickname first names (e.g. "Dom" for Dominic Hamel) while the
// MLB Stats API uses legal first names ("Dominic").  An exact-string match
// fails silently — the batch sync logs "UNMATCHED" and moves on — so the
// player's current team never gets written to player_current_team.
//
// HOW IT WORKS: Uses the documented sports_players endpoint
// (GET /sports/{sportId}/players?season=) to load all active players at each
// professional level, then searches locally with prefix-based nickname matching
// (e.g. "Dom" matches "Dominic" because "dominic".startsWith("dom")).
// If exactly one unambiguous candidate is found, their stable MLB person ID is
// returned so the caller can fetch current team details and persist the mapping.
//
// NOTE: people/search is NOT a documented endpoint. sports_players is.
// ---------------------------------------------------------------------------

// Sport IDs in order of likelihood for YAT?STATS alumni (pro ball first).
const SPORT_IDS_FOR_SEARCH = [1, 11, 12, 13, 14, 15, 16];
// 1=MLB, 11=Triple-A, 12=Double-A, 13=High-A, 14=Single-A, 15=Rookie+, 16=Rookie

interface SportPlayerEntry {
  id: number;
  firstName?: string;
  /** useName is the player's preferred/nickname (e.g. "Dom" for Dominic Hamel).
   *  This is the field our canonical DB stores, making it the primary match key. */
  useName?: string;
  lastName?: string;
  fullName?: string;
}

async function fetchSportPlayerIds(
  sportId: number,
  season: string
): Promise<SportPlayerEntry[]> {
  try {
    const url =
      `${MLB_API}/sports/${sportId}/players` +
      `?season=${season}` +
      // useName = preferred/nickname name (matches what our DB stores)
      // firstName = legal first name (fallback for prefix matching)
      `&fields=people,id,firstName,lastName,useName,fullName`;
    const res = await fetch(url, {
      next: { revalidate: 3600 },
    } as RequestInit & { next?: { revalidate?: number } });
    if (!res.ok) return [];
    const data = (await res.json()) as { people?: SportPlayerEntry[] };
    return data.people ?? [];
  } catch {
    return [];
  }
}

export async function searchMlbPlayerByName(
  firstName: string,
  lastName: string
): Promise<MlbCurrentTeamInfo | null> {
  const firstLower = firstName.toLowerCase().trim();
  const lastLower = lastName.toLowerCase().trim();
  const season = String(new Date().getFullYear());

  // Fetch all sport levels in parallel — each response is independently cached
  // for one hour, so after the first cache-miss the overhead is negligible.
  const allPeople = (
    await Promise.all(
      SPORT_IDS_FOR_SEARCH.map((sportId) =>
        fetchSportPlayerIds(sportId, season)
      )
    )
  ).flat();

  // Deduplicate by person ID (a player can appear in multiple sport levels).
  const seen = new Set<number>();
  const unique = allPeople.filter((p) => {
    if (seen.has(p.id)) return false;
    seen.add(p.id);
    return true;
  });

  const candidates = unique.filter((p) => {
    const apiLast = (p.lastName ?? "").toLowerCase();
    if (apiLast !== lastLower) return false;

    // Primary: useName is the preferred/nickname (e.g. "Dom" for Dominic Hamel).
    // Our DB stores the same preferred name, so this is an exact match.
    const apiUseName = (p.useName ?? "").toLowerCase();
    if (apiUseName === firstLower) return true;

    // Secondary: legal firstName exact match (e.g. player goes by legal name).
    const apiFirst = (p.firstName ?? "").toLowerCase();
    if (apiFirst === firstLower) return true;

    // Tertiary: prefix matching as last resort — handles cases where neither
    // useName nor firstName exactly matches our stored name.
    return (
      apiFirst.startsWith(firstLower) ||
      firstLower.startsWith(apiFirst) ||
      apiUseName.startsWith(firstLower) ||
      firstLower.startsWith(apiUseName)
    );
  });

  // Only use the result when it is unambiguous — one match, no guessing.
  if (candidates.length !== 1) return null;
  return fetchMlbPlayerCurrentTeam(candidates[0].id);
}

// ---------------------------------------------------------------------------
// Fetch the next scheduled game for a team
// ---------------------------------------------------------------------------

export async function fetchNextTeamGame(
  teamId: number,
  sportId: number
): Promise<MlbNextGame | null> {
  try {
    const today = new Date().toISOString().split("T")[0];
    // Look 60 days ahead to cover the gap between spring and regular season
    const future = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];

    const url =
      `${MLB_API}/schedule` +
      `?sportId=${sportId}` +
      `&teamId=${teamId}` +
      `&startDate=${today}` +
      `&endDate=${future}` +
      `&gameTypes=S,R` + // S=Spring Training, R=Regular Season (plural per MLB Stats API docs)
      `&fields=dates,date,games,gamePk,gameType,teams,home,away,team,id,abbreviation`;

    const res = await fetch(url, {
      next: { revalidate: 3600 },
    } as RequestInit & { next?: { revalidate?: number } });
    if (!res.ok) return null;

    const data = (await res.json()) as MlbScheduleResponse;
    const firstDate = data.dates?.[0];
    const firstGame = firstDate?.games?.[0];
    if (!firstDate || !firstGame) return null;

    const homeTeamId = firstGame.teams?.home?.team?.id;
    const isHome = homeTeamId === teamId;
    const opponent = isHome
      ? (firstGame.teams?.away?.team?.abbreviation ?? "")
      : (firstGame.teams?.home?.team?.abbreviation ?? "");

    return {
      date: firstDate.date,
      opponent,
      home: isHome,
      gameType: firstGame.gameType ?? "R",
    };
  } catch {
    return null;
  }
}
