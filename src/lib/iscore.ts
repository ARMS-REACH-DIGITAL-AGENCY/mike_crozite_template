import {
  ExternalStatTeamConfig,
  envValue,
  normalizeInt,
  normalizeString,
  safeIsoDate,
} from '@/lib/externalStats';

const TEAM_WEBSITE_BASE = 'https://api.iscoresports.com/teamwebsite';
const DEFAULT_TIMEOUT_MS = 20000;
const DEFAULT_RETRIES = 2;

export type NormalizedIscorePlayer = {
  sourcePlayerGuid: string;
  firstName?: string | null;
  lastName?: string | null;
  jersey?: string | null;
  position?: string | null;
  headshotUrl?: string | null;
  raw: Record<string, unknown>;
};

export type NormalizedIscoreGame = {
  sourceGameGuid: string;
  scheduledAt?: string | null;
  startedAt?: string | null;
  endedAt?: string | null;
  homeTeamName?: string | null;
  visitorTeamName?: string | null;
  homeScore?: number | null;
  visitorScore?: number | null;
  result?: string | null;
  status?: string | null;
  raw: Record<string, unknown>;
};

export type NormalizedIscorePlayerGameStat = {
  sourceGameGuid: string;
  sourcePlayerGuid: string;
  teamIdentifier?: string | null;
  seasonYear?: number | null;
  statType?: string | null;
  stats: Record<string, unknown>;
};

export function buildIscoreTeamWebsiteUrl(
  endpoint: string,
  params: Record<string, string | number | null | undefined>
) {
  const cleanEndpoint = endpoint.replace(/^\/+/, '').replace(/\.php$/, '');
  const url = new URL(`${TEAM_WEBSITE_BASE}/${cleanEndpoint}.php`);
  url.searchParams.set('s', 'baseball');
  url.searchParams.set('json', '1');

  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === '') continue;
    url.searchParams.set(key, String(value));
  }

  return url;
}

export function redactUrl(url: URL | string) {
  const u = new URL(String(url));
  if (u.searchParams.has('p')) u.searchParams.set('p', 'REDACTED');
  return u.toString();
}

function getNestedValues(input: unknown): unknown[] {
  if (Array.isArray(input)) return input;
  if (!input || typeof input !== 'object') return [];
  const obj = input as Record<string, unknown>;

  for (const key of ['players', 'player', 'roster', 'games', 'game', 'stats', 'stat', 'rows', 'row', 'data']) {
    const value = obj[key];
    if (Array.isArray(value)) return value;
    if (value && typeof value === 'object') {
      const nested = getNestedValues(value);
      if (nested.length) return nested;
    }
  }

  return Object.values(obj).some((v) => typeof v !== 'object') ? [obj] : [];
}

function pick(obj: Record<string, unknown>, ...keys: string[]) {
  const lowerMap = new Map(Object.keys(obj).map((key) => [key.toLowerCase(), key]));
  for (const key of keys) {
    const actual = lowerMap.get(key.toLowerCase());
    if (actual && obj[actual] !== null && obj[actual] !== undefined && obj[actual] !== '') return obj[actual];
  }
  return null;
}

function splitName(fullName: unknown) {
  const name = normalizeString(fullName);
  if (!name) return { firstName: null, lastName: null };
  if (name.includes(',')) {
    const [last, first] = name.split(',').map((part) => part.trim());
    return { firstName: first || null, lastName: last || null };
  }
  const parts = name.split(/\s+/).filter(Boolean);
  return {
    firstName: parts.length > 1 ? parts.slice(0, -1).join(' ') : parts[0] || null,
    lastName: parts.length > 1 ? parts[parts.length - 1] : null,
  };
}

function isFinalLike(value: unknown) {
  const s = String(value || '').toLowerCase();
  return s.includes('final') || s.includes('complete') || s.includes('completed') || s === 'f';
}

export function isCompletedGame(game: NormalizedIscoreGame) {
  if (isFinalLike(game.status) || isFinalLike(game.result)) return true;
  if (game.endedAt) return true;
  return typeof game.homeScore === 'number' && typeof game.visitorScore === 'number' && Boolean(game.sourceGameGuid);
}

export function resolveTeamWebsiteIdentifier(team: ExternalStatTeamConfig) {
  const meta = team.metadata || {};
  const envName = typeof meta.env_team_identifier === 'string' ? meta.env_team_identifier : null;
  return envValue(envName) || normalizeString(team.source_team_identifier);
}

export function resolveTeamWebsitePassword(team: ExternalStatTeamConfig) {
  return envValue(team.api_password_secret_name) || envValue('ISCORE_API_PASSWORD');
}

async function fetchWithTimeout(url: URL, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      signal: controller.signal,
      cache: 'no-store',
      headers: {
        accept: 'application/json, text/json, text/plain, */*',
        'user-agent': 'YATSTATS ALPB ingestion/1.0',
      },
    });
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchIscoreTeamWebsite(
  endpoint: string,
  team: ExternalStatTeamConfig,
  extraParams: Record<string, string | number | null | undefined> = {}
) {
  const t = resolveTeamWebsiteIdentifier(team);
  const p = resolveTeamWebsitePassword(team);

  if (!t || !p) {
    throw new Error(`Missing iScore Team Website config for ${team.team_name}; expected team identifier and API password env vars.`);
  }

  const url = buildIscoreTeamWebsiteUrl(endpoint, { t, p, ...extraParams });
  let lastError: unknown;

  for (let attempt = 0; attempt <= DEFAULT_RETRIES; attempt += 1) {
    try {
      const res = await fetchWithTimeout(url);
      const text = await res.text();
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText} from ${redactUrl(url)}: ${text.slice(0, 160)}`);
      }
      try {
        return { payload: JSON.parse(text), sourceUrl: redactUrl(url), actualUrl: url.toString() };
      } catch {
        return { payload: { rawText: text }, sourceUrl: redactUrl(url), actualUrl: url.toString() };
      }
    } catch (error) {
      lastError = error;
      if (attempt === DEFAULT_RETRIES) break;
      await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export async function fetchIscoreCentralStats(team: ExternalStatTeamConfig) {
  const source = team.stats_url || 'https://pro.iscorecentral.com/ALPB/stats';
  const url = new URL(source);
  const res = await fetchWithTimeout(url, DEFAULT_TIMEOUT_MS);
  const body = await res.text();

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText} from ${source}: ${body.slice(0, 160)}`);
  }

  // This public page can be a rendered app. Preserve the raw HTML/text payload so the
  // deployed runtime can still archive responses while a specific embedded API/parser is finalized.
  return {
    payload: {
      rawText: body,
      contentType: res.headers.get('content-type'),
      fetchedFrom: source,
    },
    sourceUrl: source,
    actualUrl: source,
  };
}

export function normalizeIscoreRoster(payload: unknown): NormalizedIscorePlayer[] {
  return getNestedValues(payload)
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
    .map((row, idx) => {
      const guid = normalizeString(pick(row, 'playerguid', 'player_guid', 'guid', 'id', 'playerid', 'player_id')) || `unknown-player-${idx}`;
      const names = splitName(pick(row, 'name', 'playername', 'player_name', 'fullname', 'full_name'));
      return {
        sourcePlayerGuid: guid,
        firstName: normalizeString(pick(row, 'firstname', 'first_name', 'first')) || names.firstName,
        lastName: normalizeString(pick(row, 'lastname', 'last_name', 'last')) || names.lastName,
        jersey: normalizeString(pick(row, 'jersey', 'number', 'uniform', 'uniform_number')),
        position: normalizeString(pick(row, 'position', 'positions', 'posit', 'pos')),
        headshotUrl: normalizeString(pick(row, 'headshot', 'headshot_url', 'photo', 'photo_url', 'image', 'image_url')),
        raw: row,
      };
    })
    .filter((player) => player.sourcePlayerGuid && !player.sourcePlayerGuid.startsWith('unknown-player-'));
}

export function normalizeIscoreGames(payload: unknown): NormalizedIscoreGame[] {
  return getNestedValues(payload)
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
    .map((row, idx) => ({
      sourceGameGuid: normalizeString(pick(row, 'gameguid', 'game_guid', 'guid', 'id', 'gameid', 'game_id')) || `unknown-game-${idx}`,
      scheduledAt: safeIsoDate(pick(row, 'scheduled', 'scheduled_at', 'scheduleddate', 'scheduled_date', 'date', 'datetime', 'starttime')),
      startedAt: safeIsoDate(pick(row, 'started', 'started_at', 'start', 'actual_start')),
      endedAt: safeIsoDate(pick(row, 'ended', 'ended_at', 'end', 'actual_end')),
      homeTeamName: normalizeString(pick(row, 'hometeam', 'home_team', 'home', 'home_name')),
      visitorTeamName: normalizeString(pick(row, 'visitorteam', 'visitor_team', 'awayteam', 'away_team', 'visitor', 'away')),
      homeScore: normalizeInt(pick(row, 'homescore', 'home_score', 'home_runs')),
      visitorScore: normalizeInt(pick(row, 'visitorscore', 'visitor_score', 'awayscore', 'away_score', 'visitor_runs', 'away_runs')),
      result: normalizeString(pick(row, 'result', 'outcome')),
      status: normalizeString(pick(row, 'status', 'gamestatus', 'game_status', 'state')),
      raw: row,
    }))
    .filter((game) => game.sourceGameGuid && !game.sourceGameGuid.startsWith('unknown-game-'));
}

export function normalizeIscoreGameStats(payload: unknown, gameGuid: string, teamIdentifier?: string | null): NormalizedIscorePlayerGameStat[] {
  return getNestedValues(payload)
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
    .map((row, idx) => {
      const sourcePlayerGuid = normalizeString(pick(row, 'playerguid', 'player_guid', 'guid', 'playerid', 'player_id', 'id')) || `unknown-player-${idx}`;
      return {
        sourceGameGuid: normalizeString(pick(row, 'gameguid', 'game_guid', 'gameid', 'game_id')) || gameGuid,
        sourcePlayerGuid,
        teamIdentifier,
        seasonYear: normalizeInt(pick(row, 'year', 'season', 'season_year')) || new Date().getFullYear(),
        statType: normalizeString(pick(row, 'type', 'stat_type', 'category')) || 'baseball',
        stats: row,
      };
    })
    .filter((stat) => stat.sourcePlayerGuid && !stat.sourcePlayerGuid.startsWith('unknown-player-'));
}
