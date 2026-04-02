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
