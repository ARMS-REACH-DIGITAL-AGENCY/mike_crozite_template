// Shared predicate for the school Alumni News sidebar. These filters apply
// to *stories*, not the Active/All-Time player-card gallery DOM.
export type NewsFilterableStory = {
  playerId: string | null;
  playerName: string | null;
  status: string | null;
  level: string | null;
  gradClass: string | null;
  rosterYears: string[] | null;
  orgName?: string | null;
};

export type NewsFilterSelection = {
  name: string;
  statuses: string[];
  levels: string[];
  orgs: string[];
  gradClasses: string[];
  rosterYears: string[];
  favoritesOnly: boolean;
};

export const EMPTY_NEWS_FILTERS: NewsFilterSelection = {
  name: '',
  statuses: [],
  levels: [],
  orgs: [],
  gradClasses: [],
  rosterYears: [],
  favoritesOnly: false,
};

const normalize = (value: unknown): string => String(value ?? '').trim().toUpperCase();

export function matchesNewsGraduatingClass(value: string | null | undefined, selected: string[]): boolean {
  if (!selected.length) return true;
  const year = Number.parseInt(String(value || ''), 10);
  return selected.some((choice) => {
    const criterion = normalize(choice);
    if (criterion === normalize(value)) return true;
    if (criterion === 'PRE-1980') return Number.isFinite(year) && year < 1980;
    const range = criterion.match(/^(\d{4})-(\d{4})$/);
    return Boolean(range && Number.isFinite(year) && year >= Number(range[1]) && year <= Number(range[2]));
  });
}

export function matchesNewsStory(
  story: NewsFilterableStory,
  selected: NewsFilterSelection,
  favoriteIds: ReadonlySet<string>
): boolean {
  const statuses = selected.statuses.map(normalize);
  const levels = selected.levels.map(normalize);
  const orgs = selected.orgs.map(normalize);
  const years = selected.rosterYears.map(normalize);
  const rosterYears = Array.isArray(story.rosterYears) ? story.rosterYears.map(normalize) : [];
  const playerId = String(story.playerId || '');
  return (
    (!selected.name.trim() || String(story.playerName || '').toLowerCase().includes(selected.name.trim().toLowerCase()))
    && (!statuses.length || statuses.includes(normalize(story.status || 'ACTIVE')))
    && (!levels.length || levels.includes(normalize(story.level)))
    && (!orgs.length || orgs.includes(normalize(story.orgName)))
    && matchesNewsGraduatingClass(story.gradClass, selected.gradClasses)
    && (!years.length || rosterYears.some(year => years.includes(year)))
    && (!selected.favoritesOnly || favoriteIds.has(playerId))
  );
}
