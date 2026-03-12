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
  const map: Record<string, string> = {
    "MLB":"MLB","TRIPLE-A":"AAA","AAA":"AAA","DOUBLE-A":"AA","AA":"AA",
    "HIGH-A":"A+","A+":"A+","LOW-A":"A","A":"A","A-":"A-","Indy":"INDY",
    "NCAA":"NCAA","JrCollege":"JUCO","NAIA":"NAIA","Rk":"RK",
  };
  return map[level] || (level ? level.toUpperCase() : "");
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

export function gradClass(p: Record<string, unknown>): string {
  if (p.draft_info) { const yr = String(p.draft_info).split("-")[0]; if (yr && /^\d{4}$/.test(yr)) return yr; }
  if (p.playyears) { const years = String(p.playyears).split(",").map((y: string) => y.trim()).filter(Boolean); if (years.length) return years[0]; }
  return "";
}

export function varsityDots(p: Record<string, unknown>): string[] {
  if (!p.playyears) return [];
  return String(p.playyears).split(",").map((y: string) => y.trim().slice(-2)).filter(Boolean).slice(0, 6);
}

export type NavItem = { thin: string; bold: string; tab: string };

/** Shared top-navigation items — used by school home page, player profile, and layout drawer. */
export const NAV_ITEMS: NavItem[] = [
  { thin: "WHERE THEY", bold: "YAT?",           tab: "active"  },
  { thin: "ACTIVE ALUMNI", bold: "NEWS",         tab: "news"    },
  { thin: "NEXT-LEVEL", bold: "ALL-TIME LIST",   tab: "alltime" },
  { thin: "THE", bold: "CURRENT TEAM",           tab: "team"    },
  { thin: "MENTORSHIP", bold: "MARKETPLACE",     tab: "mentor"  },
  { thin: "PCD ACTION", bold: "PARTNER PROGRAM", tab: "partner" },
  { thin: "", bold: "FAQ'S",                     tab: "faq"     },
];

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
