// src/lib/teamYearShare.ts
// One high school team (a varsity season) on the All-Time Next-Level List:
// who from that roster went on to the next level, and how the team is named
// when it's shared ("2017 State Champs (23-10)"). Used by the share preview
// (metadata + image); the page's count box counts the same cards client-side.

import { varsityDots } from './playerUtils';

export const TEAM_YEAR_SHARE_TAGLINE = 'Where they YAT now?';

export type TeamSeasonResultLike = {
  seasonYear: number;
  achievement: string;
  wins: number;
  losses: number;
  seasonNote: string | null;
};

// A team year a share link may name: four digits, from the first season on
// the list (1999) through next spring's.
export function parseTeamYear(value: unknown): string | null {
  const year = String(value ?? '').trim();
  if (!/^\d{4}$/.test(year)) return null;
  const n = Number(year);
  return n >= 1999 && n <= new Date().getUTCFullYear() + 1 ? year : null;
}

// The years a player was on the varsity roster, as four-digit years. Cards
// carry either four-digit years or two-digit dots ("17"); both are read.
function rosterYears(p: Record<string, unknown>): string[] {
  const raw = Array.isArray(p.roster_years) ? (p.roster_years as unknown[]).map(String) : varsityDots(p);
  return raw.map((y) => y.trim()).filter(Boolean).map((y) => (y.length === 2 ? `20${y}` : y));
}

// The team's next-level alumni: on that year's roster, played past high
// school (HIGH SCHOOL entries and coaches don't count) - the same rule as
// the count box on the page.
export function teamYearAlumni<T extends Record<string, unknown>>(rows: T[], year: string): T[] {
  const seen = new Set<string>();
  return rows.filter((p) => {
    const id = String(p.playerid ?? '');
    if (!id || seen.has(id)) return false;
    const level = String(p.level_label ?? '').trim().toUpperCase();
    const status = String(p.status_label ?? '').trim().toUpperCase();
    if (level === 'HIGH SCHOOL' || /COACH/.test(status)) return false;
    if (!rosterYears(p).includes(year)) return false;
    seen.add(id);
    return true;
  });
}

// "State Champs" from "State Champions"; the season's headline as the badge
// shows it.
export function teamYearAchievement(result?: TeamSeasonResultLike | null): string {
  const text = String(result?.achievement || '').trim();
  if (/\bstate\s+champ(?:ion)?s?\b/i.test([result?.achievement, result?.seasonNote].filter(Boolean).join(' '))) return 'State Champs';
  return text;
}

export function teamYearRecord(result?: TeamSeasonResultLike | null): string {
  return result && Number.isFinite(result.wins) && Number.isFinite(result.losses) ? `${result.wins}-${result.losses}` : '';
}

// "Hamilton 2017 State Champs (23-10)" - what the link is called.
export function teamYearTitle(schoolName: string, year: string, result?: TeamSeasonResultLike | null): string {
  const achievement = teamYearAchievement(result);
  const record = teamYearRecord(result);
  return [schoolName, year, achievement, record ? `(${record})` : ''].filter(Boolean).join(' ');
}
