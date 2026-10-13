// src/lib/teamYearShare.ts
// One high school team (a varsity season) on the All-Time Next-Level List:
// who from that roster went on to the next level, and how the team is named
// when it's shared ("2017 State Champs (23-10)"). Used by the share preview
// (metadata + image); the page's count box counts the same cards client-side.

import { levelLabel, varsityDots } from './playerUtils';

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

// Whether a flip card is on that year's team the way the page's All-Time
// filter reads it: the card's roster years (data-rosteryears) as written,
// roster_years or else the varsity dots. Server and filter must agree so a
// ?team=2017 page rendered on the server needs no change once it loads.
export function onTeamYearCard(p: Record<string, unknown>, year: string): boolean {
  const years = Array.isArray(p.roster_years) ? (p.roster_years as unknown[]) : varsityDots(p);
  return years.map(String).includes(year);
}

// The count box's number for a team year: its cards that played past high
// school (no HIGH SCHOOL entries, no coaches) - PageMessageStrip's count.
export function teamYearCardCount(rows: Record<string, unknown>[], year: string): number {
  const ids = new Set<string>();
  rows.forEach((p) => {
    const id = String(p.playerid ?? '');
    const level = String(p.level_label ?? '').trim().toUpperCase();
    const status = String(p.status_label ?? '').trim().toUpperCase();
    if (id && onTeamYearCard(p, year) && level !== 'HIGH SCHOOL' && !/COACH/.test(status)) ids.add(id);
  });
  return ids.size;
}

// The All-Time list as the filter lays it out once a team year is picked
// (GalleryFilterController's sortFilteredAllTime): that team's cards first -
// highest level, then graduating class, then most varsity years, then last
// name - and every other card after them, hidden. Same order on the server,
// so the page doesn't reshuffle when the filter runs on the phone.
const TEAM_LEVEL_ORDER: Record<string, number> = {
  MLB: 1, 'TRIPLE-A': 2, 'DOUBLE-A': 3, 'HIGH-A': 4, 'LOW-A': 5,
  ROOKIE: 6, INDY: 7, "INT'L": 8, 'NCAA-D1': 9, 'NCAA-D2': 10,
  'NCAA-D3': 11, NAIA: 12, JUCO: 13, 'HIGH SCHOOL': 14,
};

function cardLevelRank(p: Record<string, unknown>): number {
  const level = String(p.level_label || levelLabel(String(p.level || '')) || p.level || '')
    .trim().toUpperCase().replace(/\s+/g, '-')
    .replace(/^NCAA-?D([123])$/, 'NCAA-D$1')
    .replace(/^AAA$/, 'TRIPLE-A').replace(/^AA$/, 'DOUBLE-A')
    .replace(/^A\+$/, 'HIGH-A').replace(/^A$/, 'LOW-A')
    .replace(/^HIGH-SCHOOL$/, 'HIGH SCHOOL');
  return TEAM_LEVEL_ORDER[level] ?? 99;
}

function cardName(p: Record<string, unknown>): string {
  return `${String(p.firstname || p.first_name || '')} ${String(p.lastname || p.last_name || '')}`.toLowerCase().trim();
}

export function teamYearCardOrder<T extends Record<string, unknown>>(rows: T[], year: string): { player: T; onTeam: boolean }[] {
  const grad = (p: T) => {
    const value = Number(String(p.class_of || '').trim());
    return Number.isFinite(value) && value > 0 ? value : 9999;
  };
  const years = (p: T) => {
    const list = Array.isArray(p.roster_years) ? (p.roster_years as unknown[]) : varsityDots(p);
    return list.map(String).join(',').split(',').filter(Boolean).length;
  };
  const last = (p: T) => cardName(p).split(/\s+/).pop() || '';
  // The team's coach goes last: the highest-level player leads a team.
  const coach = (p: T) => /(?:^|[ -])COACH(?:$|[ -])/.test(String(p.status_label || '').trim().toUpperCase());
  const sorted = [...rows].sort((a, b) => Number(coach(a)) - Number(coach(b))
    || cardLevelRank(a) - cardLevelRank(b) || grad(a) - grad(b) || years(b) - years(a)
    || last(a).localeCompare(last(b)) || cardName(a).localeCompare(cardName(b)));
  const onTeam = sorted.filter((p) => onTeamYearCard(p, year));
  const rest = sorted.filter((p) => !onTeamYearCard(p, year));
  return [...onTeam.map((player) => ({ player, onTeam: true })), ...rest.map((player) => ({ player, onTeam: false }))];
}
