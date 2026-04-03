// src/lib/playerUtils.ts
// Shared helper functions for player data formatting

export function fmt(key: string, value: unknown): string {
  if (value === null || value === undefined || value === "" || value === "--") return "--";
  const DECIMAL = ["AVG","OBP","SLG","OPS","ERA","WHIP","H9","BB9","K9","KBB","K/9","K/BB"];
  const k = key.toUpperCase();
  if (DECIMAL.includes(k)) {
    const num = parseFloat(String(value));
    if (isNaN(num)) return String(value);
    const decimals = k === "ERA" || k === "WHIP" ? 2 : 3;
    const str = num.toFixed(decimals);
    if (["AVG","OBP","SLG","OPS"].includes(k) && num < 1 && num >= 0) return str.substring(1);
    return str;
  }
  if (k === "IP") { const n = parseFloat(String(value)); return isNaN(n) ? String(value) : n.toFixed(1); }
  return String(value);
}

export function parseDraft(raw: string | null): string {
  if (!raw) return "";
  const parts = raw.split("-");
  if (parts.length >= 3) return `${parts[0]} · Rd ${parts[1]} · #${parts[2]}${parts[3] ? " · " + parts[3] : ""}`;
  return raw;
}

export function levelLabel(level: string): string {
  // Maps raw TBC DB values to the canonical level strings used in layout.tsx filter checkboxes.
  // MUST stay in sync with the filterLevels array in src/app/[hsid]/layout.tsx.
  const map: Record<string, string> = {
    // Pro
    "MLB":       "MLB",
    "TRIPLE-A":  "TRIPLE-A",  "AAA":       "TRIPLE-A",
    "DOUBLE-A":  "DOUBLE-A",  "AA":        "DOUBLE-A",
    "HIGH-A":    "HIGH-A",    "A+":        "HIGH-A",
    "LOW-A":     "LOW-A",     "A":         "LOW-A",     "A-":       "LOW-A",
    "ROOKIE":    "ROOKIE",    "Rk":        "ROOKIE",    "RK":       "ROOKIE",
    "INDY":      "INDY",      "Indy":      "INDY",
    "INT'L":     "INT'L",     "INTL":      "INT'L",     "Intl":     "INT'L",
    // College
    "NCAA-D1":   "NCAA-D1",   "D1":        "NCAA-D1",   "NCAA":     "NCAA-D1",
    "NCAA-D2":   "NCAA-D2",   "D2":        "NCAA-D2",
    "NCAA-D3":   "NCAA-D3",   "D3":        "NCAA-D3",
    "NAIA":      "NAIA",
    "JUCO":      "JUCO",      "JrCollege": "JUCO",
    // High school
    "HIGH SCHOOL": "HIGH SCHOOL", "HS": "HIGH SCHOOL",
  };
  // Treat dash, empty, or unknown as empty string (card will show -- for level)
  if (!level || level === '-' || level === '--') return "";
  return map[level] || level.toUpperCase();
}

export function levelClass(lvl: string): string {
  if (lvl === "MLB") return "chip-mlb";
  if (lvl === "AAA") return "chip-aaa";
  if (lvl === "AA") return "chip-aa";
  if (lvl === "A+") return "chip-aplus";
  if (["A","A-","RK"].includes(lvl)) return "chip-a";
  if (lvl === "INDY") return "chip-indy";
  if (lvl === "NCAA") return "chip-ncaa";
  return "chip-other";
}

/**
 * Returns the grad class year and whether it is estimated.
 * - verified: class_of from flip_card_front_stage (set by school or curator)
 * - estimated: first statistical year - 1 (derived from playyears start year)
 * - blank: no data available
 */
export function gradClassInfo(p: Record<string, unknown>): { year: string; estimated: boolean } {
  // 1. Verified: class_of from flip_card_front_stage — set by school or curator, never inferred.
  if (p.class_of) {
    const yr = String(p.class_of).trim();
    if (/^\d{4}$/.test(yr)) return { year: yr, estimated: false };
  }
  // 2. Estimated: first statistical year minus 1.
  //    playyears from TBC is stored as a hyphenated range "YYYY-YYYY" where the start year
  //    is the first year the player had recorded stats. Subtracting 1 gives a defensible
  //    estimate of high school graduation year (player typically graduates the year before
  //    their first pro/college season).
  //    NOTE: draft_info is intentionally NOT used — draft year can occur out of HS, after
  //    junior year, after senior year, or after transfers. It is not a reliable HS class proxy.
  if (p.playyears) {
    const raw = String(p.playyears).trim();
    // Hyphenated range: "2021-2025" → start year "2021" → estimated grad "2020"
    if (raw.includes("-")) {
      const startYr = raw.split("-")[0].trim();
      if (/^\d{4}$/.test(startYr)) {
        return { year: String(parseInt(startYr, 10) - 1), estimated: true };
      }
    } else {
      // Comma-separated individual years (legacy format): take the earliest year
      const years = raw.split(",").map((y: string) => y.trim()).filter((y: string) => /^\d{4}$/.test(y)).sort();
      if (years.length) {
        return { year: String(parseInt(years[0], 10) - 1), estimated: true };
      }
    }
  }
  // 3. Blank — no data available. Blank is honest.
  return { year: "", estimated: false };
}

/** Returns just the grad class year string (for backward compat / data-gradclass). */
export function gradClass(p: Record<string, unknown>): string {
  return gradClassInfo(p).year;
}

export function varsityDots(p: Record<string, unknown>): string[] {
  if (!p.playyears) return [];
  const raw = String(p.playyears).trim();
  // Hyphenated range format — no individual years to extract as varsity dots
  if (raw.includes("-")) return [];
  return raw.split(",").map((y: string) => y.trim().slice(-2)).filter(Boolean).slice(0, 6);
}

export type NavItem = { thin: string; bold: string; tab: string };

/**
 * Format a school name for display.
 * Appends "HIGH SCHOOL" unless the name already contains it,
 * or the name ends with "PREP" or "ACADEMY" (whole-word match at end).
 */
export function formatSchoolName(raw: string): string {
  const u = raw.toUpperCase().trim();
  if (u.includes("HIGH SCHOOL")) return u;
  // "PREP" or "ACADEMY" as standalone suffix — e.g. "BROPHY COLLEGE PREP"
  if (/\bPREP$/.test(u)) return u;
  if (/\bACADEMY$/.test(u)) return u;
  return `${u} HIGH SCHOOL`;
}

// ---------------------------------------------------------------------------
// ACTIVE ALUMNI SORT — canonical 4-tier comparator
// ---------------------------------------------------------------------------

/**
 * Canonical level sort order for active alumni display.
 * Pro levels first (MLB → Rookie), then independent/international,
 * then college tiers, then high school.
 * Any unrecognised value sorts to the end (rank 99).
 */
export const LEVEL_RANK: Record<string, number> = {
  "MLB":          1,
  "TRIPLE-A":     2,
  "DOUBLE-A":     3,
  "HIGH-A":       4,
  "LOW-A":        5,
  "ROOKIE":       6,
  "INDY":         7,
  "INT'L":        8,
  "NCAA-D1":      9,
  "NCAA-D2":      10,
  "NCAA-D3":      11,
  "NAIA":         12,
  "JUCO":         13,
  "HIGH SCHOOL":  14,
};

/**
 * Derive the canonical level string from a merged player row.
 * Prefers level_label (stage, already normalised) over raw TBC level.
 */
function resolvedLevel(p: Record<string, unknown>): string {
  return String(p.level_label || levelLabel(String(p.level || "")) || "");
}

/**
 * Derive the grad year integer for sorting (9999 = unknown → sorts last).
 * Prefers verified class_of from stage, falls back to estimated from playyears.
 */
function resolvedGradYear(p: Record<string, unknown>): number {
  const { year } = gradClassInfo(p);
  const n = parseInt(year, 10);
  return isNaN(n) ? 9999 : n;
}

/**
 * Derive roster years count for sorting (more years → higher priority).
 * Prefers roster_years from stage (array of individual years, most accurate).
 * Falls back to playyears from TBC (hyphenated range or comma-separated).
 */
function resolvedRosterYearsCount(p: Record<string, unknown>): number {
  // Stage field: roster_years is a Postgres text[] stored as ["2024","2023",...]
  if (p.roster_years) {
    const raw = String(p.roster_years).trim();
    // Count individual 4-digit year tokens regardless of delimiter
    const count = (raw.match(/\b\d{4}\b/g) || []).length;
    if (count > 0) return count;
  }
  // TBC fallback: playyears as hyphenated range or comma-separated
  if (p.playyears) {
    const raw = String(p.playyears).trim();
    if (raw.includes("-")) {
      // Hyphenated range "2018-2024" → 2024 - 2018 + 1 = 7 years
      const parts = raw.split("-");
      const start = parseInt(parts[0], 10);
      const end   = parseInt(parts[1], 10);
      if (!isNaN(start) && !isNaN(end)) return end - start + 1;
    } else {
      // Comma-separated individual years
      return raw.split(",").filter((y) => /^\d{4}$/.test(y.trim())).length;
    }
  }
  return 0;
}

/**
 * Sort a merged active-alumni player array in-place using the 4-tier rule:
 *   1. Level (MLB first → HIGH SCHOOL last, unknowns at end)
 *   2. Grad year (oldest class first — lowest year number)
 *   3. Roster years count (most years first — descending)
 *   4. Last name A → Z
 *
 * Mutates the array and returns it for convenience.
 */
export function sortActivePlayers(players: Record<string, unknown>[]): Record<string, unknown>[] {
  players.sort((a, b) => {
    // Tier 1 — level
    const rankA = LEVEL_RANK[resolvedLevel(a)] ?? 99;
    const rankB = LEVEL_RANK[resolvedLevel(b)] ?? 99;
    if (rankA !== rankB) return rankA - rankB;

    // Tier 2 — grad year (oldest first: 1999 → 2025, unknowns last)
    const yearA = resolvedGradYear(a);
    const yearB = resolvedGradYear(b);
    if (yearA !== yearB) return yearA - yearB;

    // Tier 3 — roster years count (most first)
    const ryA = resolvedRosterYearsCount(a);
    const ryB = resolvedRosterYearsCount(b);
    if (ryA !== ryB) return ryB - ryA;

    // Tier 4 — last name A→Z
    const lnA = String(a.lastname || a.last_name || "").toUpperCase();
    const lnB = String(b.lastname || b.last_name || "").toUpperCase();
    return lnA.localeCompare(lnB);
  });
  return players;
}

// ---------------------------------------------------------------------------
// ALL-TIME ALUMNI SORT — canonical 4-tier comparator
// ---------------------------------------------------------------------------

/**
 * Sort an all-time alumni player array in-place using the 4-tier rule:
 *   1. Grad year (oldest first: 1999 → 2025, unknowns at end)
 *   2. Level (MLB first → HIGH SCHOOL last, unknowns at end)
 *   3. Roster years count (most years first — descending)
 *   4. Last name A → Z
 *
 * Mutates the array and returns it for convenience.
 */
export function sortAllTimePlayers(players: Record<string, unknown>[]): Record<string, unknown>[] {
  players.sort((a, b) => {
    // Tier 1 — grad year (oldest first: 1999 → 2025, unknowns last)
    const yearA = resolvedGradYear(a);
    const yearB = resolvedGradYear(b);
    if (yearA !== yearB) return yearA - yearB;

    // Tier 2 — level (highest first)
    const rankA = LEVEL_RANK[resolvedLevel(a)] ?? 99;
    const rankB = LEVEL_RANK[resolvedLevel(b)] ?? 99;
    if (rankA !== rankB) return rankA - rankB;

    // Tier 3 — roster years count (most first)
    const ryA = resolvedRosterYearsCount(a);
    const ryB = resolvedRosterYearsCount(b);
    if (ryA !== ryB) return ryB - ryA;

    // Tier 4 — last name A→Z
    const lnA = String(a.lastname || a.last_name || "").toUpperCase();
    const lnB = String(b.lastname || b.last_name || "").toUpperCase();
    return lnA.localeCompare(lnB);
  });
  return players;
}

// ---------------------------------------------------------------------------
// ORG / CONFERENCE NORMALIZATION
// ---------------------------------------------------------------------------

/**
 * Canonical org/conference names used as filter checkbox values.
 * All data-org attributes on player cards are normalized to these values
 * so the filter always works regardless of the data source's casing or
 * abbreviation style.
 *
 * Rule: strip whitespace, uppercase, then match against the lookup table.
 * Unknown values pass through uppercased (so they still appear on cards).
 */
const ORG_NORM: Record<string, string> = {
  // ── MLB Organizations ────────────────────────────────────────────────────
  "ARIZONA DIAMONDBACKS": "ARIZONA DIAMONDBACKS",
  "ARI": "ARIZONA DIAMONDBACKS", "AZ DIAMONDBACKS": "ARIZONA DIAMONDBACKS",
  "ATLANTA BRAVES": "ATLANTA BRAVES", "ATL": "ATLANTA BRAVES",
  "BALTIMORE ORIOLES": "BALTIMORE ORIOLES", "BAL": "BALTIMORE ORIOLES",
  "BOSTON RED SOX": "BOSTON RED SOX", "BOS": "BOSTON RED SOX",
  "CHICAGO CUBS": "CHICAGO CUBS", "CHC": "CHICAGO CUBS",
  "CHICAGO WHITE SOX": "CHICAGO WHITE SOX", "CHA": "CHICAGO WHITE SOX", "CHW": "CHICAGO WHITE SOX",
  "CINCINNATI REDS": "CINCINNATI REDS", "CIN": "CINCINNATI REDS",
  "CLEVELAND GUARDIANS": "CLEVELAND GUARDIANS", "CLE": "CLEVELAND GUARDIANS",
  "COLORADO ROCKIES": "COLORADO ROCKIES", "COL": "COLORADO ROCKIES",
  "DETROIT TIGERS": "DETROIT TIGERS", "DET": "DETROIT TIGERS",
  "HOUSTON ASTROS": "HOUSTON ASTROS", "HOU": "HOUSTON ASTROS",
  "KANSAS CITY ROYALS": "KANSAS CITY ROYALS", "KC": "KANSAS CITY ROYALS", "KCR": "KANSAS CITY ROYALS",
  "LOS ANGELES ANGELS": "LOS ANGELES ANGELS", "LAA": "LOS ANGELES ANGELS", "LA ANGELS": "LOS ANGELES ANGELS",
  "LOS ANGELES DODGERS": "LOS ANGELES DODGERS", "LAD": "LOS ANGELES DODGERS", "LA DODGERS": "LOS ANGELES DODGERS",
  "MIAMI MARLINS": "MIAMI MARLINS", "MIA": "MIAMI MARLINS",
  "MILWAUKEE BREWERS": "MILWAUKEE BREWERS", "MIL": "MILWAUKEE BREWERS",
  "MINNESOTA TWINS": "MINNESOTA TWINS", "MIN": "MINNESOTA TWINS",
  "NEW YORK METS": "NEW YORK METS", "NYM": "NEW YORK METS", "NY METS": "NEW YORK METS",
  "NEW YORK YANKEES": "NEW YORK YANKEES", "NYY": "NEW YORK YANKEES", "NY YANKEES": "NEW YORK YANKEES",
  // Athletics — stored as just "Athletics" in TBC
  "ATHLETICS": "ATHLETICS", "OAKLAND ATHLETICS": "ATHLETICS", "OAK": "ATHLETICS",
  "LAS VEGAS ATHLETICS": "ATHLETICS", "SACRAMENTO ATHLETICS": "ATHLETICS",
  "PHILADELPHIA PHILLIES": "PHILADELPHIA PHILLIES", "PHI": "PHILADELPHIA PHILLIES",
  "PITTSBURGH PIRATES": "PITTSBURGH PIRATES", "PIT": "PITTSBURGH PIRATES",
  "SAN DIEGO PADRES": "SAN DIEGO PADRES", "SD": "SAN DIEGO PADRES", "SDP": "SAN DIEGO PADRES",
  "SAN FRANCISCO GIANTS": "SAN FRANCISCO GIANTS", "SF": "SAN FRANCISCO GIANTS", "SFG": "SAN FRANCISCO GIANTS",
  "SEATTLE MARINERS": "SEATTLE MARINERS", "SEA": "SEATTLE MARINERS",
  "ST. LOUIS CARDINALS": "ST. LOUIS CARDINALS", "STL": "ST. LOUIS CARDINALS", "ST LOUIS CARDINALS": "ST. LOUIS CARDINALS",
  "TAMPA BAY RAYS": "TAMPA BAY RAYS", "TB": "TAMPA BAY RAYS", "TBR": "TAMPA BAY RAYS",
  "TEXAS RANGERS": "TEXAS RANGERS", "TEX": "TEXAS RANGERS",
  "TORONTO BLUE JAYS": "TORONTO BLUE JAYS", "TOR": "TORONTO BLUE JAYS",
  "WASHINGTON NATIONALS": "WASHINGTON NATIONALS", "WSH": "WASHINGTON NATIONALS", "WAS": "WASHINGTON NATIONALS",

  // ── Independent / Pro ────────────────────────────────────────────────────
  "ATLANTIC LEAGUE": "ATLANTIC LEAGUE",
  "INDY": "INDY",

  // ── College Conferences ──────────────────────────────────────────────────
  // ACC
  "ACC": "ACC", "ATLANTIC COAST CONFERENCE": "ACC", "ATLANTIC COAST": "ACC",

  // Big Ten  (TBC uses "Big 10 Conference")
  "BIG TEN": "BIG TEN", "BIG TEN CONFERENCE": "BIG TEN",
  "BIG 10": "BIG TEN", "BIG 10 CONFERENCE": "BIG TEN",
  "BIG10": "BIG TEN", "B1G": "BIG TEN",

  // Big 12  (TBC uses "Big 12 Conference")
  "BIG 12": "BIG 12", "BIG 12 CONFERENCE": "BIG 12",
  "BIG12": "BIG 12",

  // Big East
  "BIG EAST": "BIG EAST", "BIG EAST CONFERENCE": "BIG EAST",

  // Big West
  "BIG WEST": "BIG WEST", "BIG WEST CONFERENCE": "BIG WEST",

  // Big South
  "BIG SOUTH": "BIG SOUTH", "BIG SOUTH CONFERENCE": "BIG SOUTH",

  // Pac-12  (TBC uses "Pac 12 Conference")
  "PAC-12": "PAC-12", "PAC 12": "PAC-12", "PAC 12 CONFERENCE": "PAC-12",
  "PAC12": "PAC-12", "PAC-12 CONFERENCE": "PAC-12",

  // SEC
  "SEC": "SEC", "SOUTHEASTERN CONFERENCE": "SEC",

  // American Athletic Conference
  "AMERICAN": "AMERICAN", "AMERICAN ATHLETIC CONFERENCE": "AMERICAN",
  "AAC": "AMERICAN",

  // Mountain West
  "MOUNTAIN WEST": "MOUNTAIN WEST", "MOUNTAIN WEST CONFERENCE": "MOUNTAIN WEST",
  "MWC": "MOUNTAIN WEST",

  // MAC (Mid-American Conference)
  "MAC": "MAC", "MID-AMERICAN CONFERENCE": "MAC", "MID AMERICAN CONFERENCE": "MAC",

  // WCC (West Coast Conference)
  "WCC": "WCC", "WEST COAST CONFERENCE": "WCC",

  // WAC (Western Athletic Conference)
  "WAC": "WAC", "WESTERN ATHLETIC CONFERENCE": "WAC",

  // Atlantic Sun
  "ATLANTIC SUN": "ATLANTIC SUN", "ASUN": "ATLANTIC SUN", "A-SUN": "ATLANTIC SUN",

  // C-USA (Conference USA)
  "C-USA": "C-USA", "CONFERENCE USA": "C-USA", "CUSA": "C-USA",

  // Horizon League
  "HORIZON": "HORIZON", "HORIZON LEAGUE": "HORIZON",

  // Ivy League
  "IVY LEAGUE": "IVY LEAGUE", "IVY": "IVY LEAGUE",

  // MAAC
  "MAAC": "MAAC", "METRO ATLANTIC ATHLETIC CONFERENCE": "MAAC",

  // MEAC
  "MEAC": "MEAC", "MID-EASTERN ATHLETIC CONFERENCE": "MEAC",

  // Missouri Valley
  "MISSOURI VALLEY": "MISSOURI VALLEY", "MISSOURI VALLEY CONFERENCE": "MISSOURI VALLEY", "MVC": "MISSOURI VALLEY",

  // NEC (Northeast Conference)
  "NEC": "NEC", "NORTHEAST CONFERENCE": "NEC",

  // OVC (Ohio Valley Conference)
  "OVC": "OVC", "OHIO VALLEY CONFERENCE": "OVC",

  // Patriot League
  "PATRIOT": "PATRIOT", "PATRIOT LEAGUE": "PATRIOT",

  // Southern Conference
  "SOUTHERN": "SOUTHERN", "SOUTHERN CONFERENCE": "SOUTHERN", "SOCON": "SOUTHERN",

  // Southland Conference
  "SOUTHLAND": "SOUTHLAND", "SOUTHLAND CONFERENCE": "SOUTHLAND",

  // Summit League
  "SUMMIT": "SUMMIT", "SUMMIT LEAGUE": "SUMMIT",

  // Sun Belt
  "SUN BELT": "SUN BELT", "SUN BELT CONFERENCE": "SUN BELT",

  // SWAC
  "SWAC": "SWAC", "SOUTHWESTERN ATHLETIC CONFERENCE": "SWAC",

  // Colonial Athletic Association
  "COLONIAL": "COLONIAL", "COLONIAL ATHLETIC ASSOCIATION": "COLONIAL", "CAA": "COLONIAL",

  // Independent
  "INDEPENDENT": "INDEPENDENT",

  // NAIA
  "NAIA": "NAIA",

  // JUCO
  "JUCO": "JUCO", "JUNIOR COLLEGE": "JUCO",

  // ACCAC (Arizona Community College Athletic Conference)
  "ACCAC": "ACCAC",

  // Rocky Mountain Athletic Conference
  "RMAC": "RMAC", "ROCKY MOUNTAIN ATHLETIC CONFERENCE": "RMAC",

  // Great American Conference
  "GAC": "GAC", "GREAT AMERICAN CONFERENCE": "GAC",

  // Mid-American Intercollegiate Athletics Association
  "MIAA": "MIAA",

  // Conference Carolinas
  "CONFERENCE CAROLINAS": "CONFERENCE CAROLINAS",

  // Continental Athletic Conference
  "CONTINENTAL ATHLETIC CONFERENCE": "CONTINENTAL ATHLETIC CONFERENCE",

  // Northern Athletics Collegiate Conference
  "NACC": "NACC", "NORTHERN ATHLETICS COLLEGIATE CONFERENCE": "NACC",

  // Northwest Conference
  "NORTHWEST CONFERENCE": "NORTHWEST CONFERENCE",

  // Midwest Conference
  "MIDWEST CONFERENCE": "MIDWEST CONFERENCE",

  // Big 8 - CCCAA (California Community College)
  "BIG 8 - CCCAA": "BIG 8 - CCCAA", "BIG 8": "BIG 8 - CCCAA",
};

/**
 * Normalize an org/conference name to a canonical filter key.
 * Strips extra whitespace, uppercases, then looks up in ORG_NORM.
 * Falls back to the uppercased raw value if no mapping is found.
 */
export function normalizeOrg(raw: string | null | undefined): string {
  if (!raw) return "";
  const key = raw.trim().toUpperCase();
  return ORG_NORM[key] ?? key;
}

/**
 * Canonical list of org/conference filter checkbox values.
 * These are the display labels AND the values used in the filter comparison.
 * Must stay in sync with ORG_NORM canonical values above.
 */
export const ORG_FILTER_LIST: string[] = [
  // MLB Organizations
  "ARIZONA DIAMONDBACKS","ATLANTA BRAVES","BALTIMORE ORIOLES","BOSTON RED SOX",
  "CHICAGO CUBS","CHICAGO WHITE SOX","CINCINNATI REDS","CLEVELAND GUARDIANS",
  "COLORADO ROCKIES","DETROIT TIGERS","HOUSTON ASTROS","KANSAS CITY ROYALS",
  "LOS ANGELES ANGELS","LOS ANGELES DODGERS","MIAMI MARLINS","MILWAUKEE BREWERS",
  "MINNESOTA TWINS","NEW YORK METS","NEW YORK YANKEES","ATHLETICS",
  "PHILADELPHIA PHILLIES","PITTSBURGH PIRATES","SAN DIEGO PADRES","SAN FRANCISCO GIANTS",
  "SEATTLE MARINERS","ST. LOUIS CARDINALS","TAMPA BAY RAYS","TEXAS RANGERS",
  "TORONTO BLUE JAYS","WASHINGTON NATIONALS",
  // Independent / Pro
  "ATLANTIC LEAGUE","INDY",
  // Power conferences
  "ACC","BIG TEN","BIG 12","BIG EAST","BIG WEST","PAC-12","SEC",
  // Mid-major conferences
  "AMERICAN","ATLANTIC SUN","C-USA","HORIZON","IVY LEAGUE","MAC","MAAC",
  "MEAC","MISSOURI VALLEY","MOUNTAIN WEST","NEC","OVC","PATRIOT",
  "SOUTHERN","SOUTHLAND","SUMMIT","SUN BELT","SWAC","WAC","WCC",
  "COLONIAL",
  // Regional / smaller conferences
  "ACCAC","BIG 8 - CCCAA","BIG SOUTH","CONFERENCE CAROLINAS",
  "CONTINENTAL ATHLETIC CONFERENCE","GAC","MIDWEST CONFERENCE",
  "NACC","NORTHWEST CONFERENCE","RMAC",
  // Independent / Other
  "INDEPENDENT","NAIA","JUCO",
];
