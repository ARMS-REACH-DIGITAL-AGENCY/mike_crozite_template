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
