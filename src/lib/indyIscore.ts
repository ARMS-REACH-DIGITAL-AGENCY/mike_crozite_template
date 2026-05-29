import crypto from 'crypto';
import { gunzipSync } from 'zlib';
import { query } from '@/lib/db';

const ISCORE_API_BASE = 'https://api.microservices.iscoresports.com/api';
const SOURCE_SYSTEM = 'iscore_central';
const DEFAULT_TIMEOUT_MS = 25000;
const DEFAULT_SIZE = 500;

type AnyRecord = Record<string, unknown>;

type IndyLeagueConfig = {
  league_code: string;
  league_name: string;
  season_year: number;
  season_id: string;
  league_id: string;
  stats_base_url?: string | null;
  active?: boolean | null;
};

type LeaderboardKind = 'batting' | 'pitching';

type FetchResult = {
  url: string;
  payload: unknown;
};

export type IndyIngestSummary = {
  leagueCode: string;
  leagueName: string;
  battingRows: number;
  pitchingRows: number;
  playersSeen: number;
  playersAutoMatched: number;
  playerDetailsFetched: number;
  gamesFound: number;
  boxScoresFetched: number;
  playerGameRows: number;
  errors: string[];
};

export type IndyStatsForPlayer = {
  batting: AnyRecord[];
  pitching: AnyRecord[];
  recentGames: AnyRecord[];
};

const DEFAULT_LEAGUES: IndyLeagueConfig[] = [
  {
    league_code: 'ALPB',
    league_name: 'Atlantic League',
    season_year: 2026,
    season_id: '9843025b-3dd7-4b1b-8776-a6b53a3bdb7a',
    league_id: 'df9fb9cc-0fdb-4b79-8a3c-ad5d7b415a56',
  },
  {
    league_code: 'AAPB',
    league_name: 'American Association',
    season_year: 2026,
    season_id: 'aeab1d47-af95-4818-b69a-1943bd18800f',
    league_id: '661d9b4b-0e17-412a-bb93-981ca40f021a',
  },
  {
    league_code: 'FL',
    league_name: 'Frontier League',
    season_year: 2026,
    season_id: 'f97588ea-7bc2-47ae-9bca-ca9ddc470c3f',
    league_id: '1e909dc0-2136-47c3-b4a5-df7eccaa504e',
  },
  {
    league_code: 'CPL',
    league_name: 'Coastal Plain League',
    season_year: 2026,
    season_id: 'd7bafd19-85fb-4607-a7a7-d9e8909034cc',
    league_id: '61a894f0-7e75-4e5f-a717-f755efac0cfb',
  },
  {
    league_code: 'DBL',
    league_name: 'MLB Draft League',
    season_year: 2026,
    season_id: 'abd0f707-3c93-45ba-ab40-360515234b64',
    league_id: 'aee2072d-909c-405a-9ef0-ed65e236f896',
  },
  {
    league_code: 'SFCBL',
    league_name: 'SFCBL',
    season_year: 2026,
    season_id: '1a8ebd76-1702-4d2e-af70-88ad3a3a9040',
    league_id: '541ef447-c3d8-497d-811e-54bf6d5d9478',
  },
];

function normalizeString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s || null;
}

function normalizeNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(String(value).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function stableHash(payload: unknown): string {
  return crypto.createHash('sha256').update(JSON.stringify(payload ?? null)).digest('hex');
}

function get(obj: unknown, ...keys: string[]): unknown {
  if (!obj || typeof obj !== 'object') return null;
  const record = obj as AnyRecord;
  const lower = new Map(Object.keys(record).map((key) => [key.toLowerCase(), key]));
  for (const key of keys) {
    const actual = lower.get(key.toLowerCase());
    if (!actual) continue;
    const value = record[actual];
    if (value !== null && value !== undefined && value !== '') return value;
  }
  return null;
}

function getNested(obj: unknown, keys: string[]): unknown {
  let current = obj;
  for (const key of keys) {
    if (!current || typeof current !== 'object') return null;
    current = (current as AnyRecord)[key];
  }
  return current;
}

function normalizePlayerName(firstName?: string | null, lastName?: string | null, fullName?: string | null) {
  const first = normalizeString(firstName);
  const last = normalizeString(lastName);
  if (first || last) return { firstName: first, lastName: last };

  const raw = normalizeString(fullName);
  if (!raw) return { firstName: null, lastName: null };
  if (raw.includes(',')) {
    const [rawLast, rawFirst] = raw.split(',').map((part) => part.trim()).filter(Boolean);
    return { firstName: rawFirst || null, lastName: rawLast || null };
  }
  const parts = raw.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return { firstName: parts[0], lastName: null };
  return { firstName: parts.slice(0, -1).join(' '), lastName: parts[parts.length - 1] };
}

function compactName(value: unknown) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

function findArrays(input: unknown): unknown[][] {
  const found: unknown[][] = [];
  const visit = (value: unknown, depth: number) => {
    if (depth > 6 || value === null || value === undefined) return;
    if (Array.isArray(value)) {
      if (value.length) found.push(value);
      value.slice(0, 5).forEach((item) => visit(item, depth + 1));
      return;
    }
    if (typeof value === 'object') {
      Object.values(value as AnyRecord).forEach((child) => visit(child, depth + 1));
    }
  };
  visit(input, 0);
  return found;
}

function pickRows(payload: unknown): AnyRecord[] {
  const arrays = findArrays(payload);
  const candidate = arrays
    .map((items) => items.filter((item): item is AnyRecord => Boolean(item && typeof item === 'object' && !Array.isArray(item))))
    .sort((a, b) => b.length - a.length)
    .find((items) => items.some((row) => extractSourcePlayerId(row) || extractPlayerName(row)));
  return candidate || [];
}

function extractSourcePlayerId(row: AnyRecord): string | null {
  return normalizeString(
    get(row, 'playerId', 'player_id', 'playerGuid', 'player_guid', 'sourcePlayerId', 'source_player_id') ||
      getNested(row, ['player', 'id']) ||
      getNested(row, ['player', 'playerId']) ||
      getNested(row, ['person', 'id'])
  );
}

function extractPlayerName(row: AnyRecord): string | null {
  return normalizeString(
    get(row, 'playerName', 'player_name', 'name', 'fullName', 'full_name', 'displayName') ||
      getNested(row, ['player', 'name']) ||
      getNested(row, ['player', 'fullName'])
  );
}

function extractTeamName(row: AnyRecord): string | null {
  return normalizeString(
    get(row, 'teamName', 'team_name', 'team', 'teamAbbreviation', 'team_abbreviation') ||
      getNested(row, ['team', 'name']) ||
      getNested(row, ['team', 'teamName']) ||
      getNested(row, ['team', 'abbreviation'])
  );
}

function extractTeamAbbreviation(row: AnyRecord): string | null {
  return normalizeString(
    get(row, 'teamAbbreviation', 'team_abbreviation', 'teamAbbrev', 'team_abbrev', 'abbr') ||
      getNested(row, ['team', 'abbreviation']) ||
      getNested(row, ['team', 'abbr'])
  );
}

function extractSourceTeamId(row: AnyRecord): string | null {
  return normalizeString(
    get(row, 'teamId', 'team_id', 'sourceTeamId', 'source_team_id') ||
      getNested(row, ['team', 'id']) ||
      getNested(row, ['team', 'teamId'])
  );
}

function extractStat(row: AnyRecord, ...keys: string[]): unknown {
  for (const key of keys) {
    const direct = get(row, key);
    if (direct !== null && direct !== undefined && direct !== '') return direct;
    const statsValue = getNested(row, ['stats', key]) || getNested(row, ['stat', key]);
    if (statsValue !== null && statsValue !== undefined && statsValue !== '') return statsValue;
  }
  return null;
}

function rowToSeasonInput(row: AnyRecord, kind: LeaderboardKind, league: IndyLeagueConfig, rawPayloadId?: number | null) {
  const sourcePlayerId = extractSourcePlayerId(row);
  const fullName = extractPlayerName(row);
  const names = normalizePlayerName(
    normalizeString(get(row, 'firstName', 'first_name') || getNested(row, ['player', 'firstName'])),
    normalizeString(get(row, 'lastName', 'last_name') || getNested(row, ['player', 'lastName'])),
    fullName
  );
  const sourceTeamName = extractTeamName(row);
  const sourceTeamAbbrev = extractTeamAbbreviation(row);
  const sourceTeamId = extractSourceTeamId(row);

  return {
    sourcePlayerId,
    firstName: names.firstName,
    lastName: names.lastName,
    playerName: fullName || [names.firstName, names.lastName].filter(Boolean).join(' ') || null,
    sourceTeamId,
    sourceTeamName,
    sourceTeamAbbrev,
    raw: row,
    rawPayloadId: rawPayloadId || null,
    common: {
      league_code: league.league_code,
      league_name: league.league_name,
      season_year: league.season_year,
      season_id: league.season_id,
      league_id: league.league_id,
      source_system: SOURCE_SYSTEM,
    },
    stats: kind === 'batting'
      ? {
          pa: normalizeNumber(extractStat(row, 'PA', 'pa', 'plateAppearances')),
          ab: normalizeNumber(extractStat(row, 'AB', 'ab', 'atBats')),
          r: normalizeNumber(extractStat(row, 'R', 'r', 'runs')),
          h: normalizeNumber(extractStat(row, 'H', 'h', 'hits')),
          dbl: normalizeNumber(extractStat(row, '2B', 'dbl', 'doubles')),
          tpl: normalizeNumber(extractStat(row, '3B', 'tpl', 'triples')),
          hr: normalizeNumber(extractStat(row, 'HR', 'hr', 'homeRuns')),
          rbi: normalizeNumber(extractStat(row, 'RBI', 'rbi')),
          bb: normalizeNumber(extractStat(row, 'BB', 'bb', 'walks')),
          so: normalizeNumber(extractStat(row, 'SO', 'so', 'strikeouts')),
          sb: normalizeNumber(extractStat(row, 'SB', 'sb', 'stolenBases')),
          cs: normalizeNumber(extractStat(row, 'CS', 'cs', 'caughtStealing')),
          avg: normalizeNumber(extractStat(row, 'AVG', 'avg', 'battingAverage')),
          obp: normalizeNumber(extractStat(row, 'OBP', 'obp')),
          slg: normalizeNumber(extractStat(row, 'SLG', 'slg')),
          ops: normalizeNumber(extractStat(row, 'OPS', 'ops')),
        }
      : {
          outs_pitched: normalizeNumber(extractStat(row, 'OUTS_PITCHED', 'outsPitched', 'outs_pitched')),
          ip: normalizeString(extractStat(row, 'IP', 'ip', 'inningsPitched')),
          w: normalizeNumber(extractStat(row, 'W', 'w', 'wins')),
          l: normalizeNumber(extractStat(row, 'L', 'l', 'losses')),
          era: normalizeNumber(extractStat(row, 'ERA', 'era')),
          g: normalizeNumber(extractStat(row, 'G', 'g', 'games')),
          gs: normalizeNumber(extractStat(row, 'GS', 'gs', 'gamesStarted')),
          sv: normalizeNumber(extractStat(row, 'SV', 'sv', 'saves')),
          h: normalizeNumber(extractStat(row, 'H', 'h', 'hits')),
          r: normalizeNumber(extractStat(row, 'R', 'r', 'runs')),
          er: normalizeNumber(extractStat(row, 'ER', 'er', 'earnedRuns')),
          hr: normalizeNumber(extractStat(row, 'HR', 'hr', 'homeRuns')),
          bb: normalizeNumber(extractStat(row, 'BB', 'bb', 'walks')),
          so: normalizeNumber(extractStat(row, 'SO', 'so', 'strikeouts')),
          whip: normalizeNumber(extractStat(row, 'WHIP', 'whip')),
        },
  };
}

async function fetchJson(url: URL): Promise<FetchResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      cache: 'no-store',
      signal: controller.signal,
      headers: {
        accept: 'application/json, text/plain, */*',
        origin: 'https://pro.iscorecentral.com',
        referer: 'https://pro.iscorecentral.com/',
        'user-agent': 'YATSTATS iScore indy ingestion/1.0',
      },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status} ${res.statusText} from ${url.toString()}: ${text.slice(0, 160)}`);
    }
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('gzip')) {
      const buffer = Buffer.from(await res.arrayBuffer());
      const text = gunzipSync(buffer).toString('utf8');
      return { url: url.toString(), payload: JSON.parse(text) };
    }
    return { url: url.toString(), payload: await res.json() };
  } finally {
    clearTimeout(timeout);
  }
}

function leaderboardUrl(league: IndyLeagueConfig, kind: LeaderboardKind, size = DEFAULT_SIZE) {
  const base = league.stats_base_url || ISCORE_API_BASE;
  const url = new URL(`${base.replace(/\/$/, '')}/api/leaderboard/player/${kind}`);
  url.searchParams.set('seasonId', league.season_id);
  url.searchParams.set('leagueId', league.league_id);
  url.searchParams.set('sortBy', kind === 'batting' ? 'PA' : 'OUTS_PITCHED');
  url.searchParams.set('sortDir', 'desc');
  url.searchParams.set('size', String(size));
  return url;
}

function playerStatsUrl(playerId: string) {
  const url = new URL(`${ISCORE_API_BASE}/player-stats`);
  url.searchParams.set('playerId', playerId);
  return url;
}

function leagueGamesUrl(league: IndyLeagueConfig) {
  const url = new URL(`${ISCORE_API_BASE}/games`);
  url.searchParams.set('leagueId', league.league_id);
  return url;
}

function gameSummaryUrl(gameId: string) {
  return new URL(`${ISCORE_API_BASE}/games/${gameId}/summary`);
}

function boxScoreUrl(gameId: string) {
  return new URL(`${ISCORE_API_BASE}/public/games/${gameId}/boxScore/gzip`);
}

export async function ensureIndyIscoreTables() {
  await query(`
    create table if not exists public.indy_iscore_leagues (
      league_code text primary key,
      league_name text not null,
      season_year int not null default 2026,
      season_id text not null,
      league_id text not null,
      stats_base_url text not null default '${ISCORE_API_BASE}',
      active boolean not null default true,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `);

  await query(`
    create table if not exists public.indy_iscore_raw_payloads (
      id bigserial primary key,
      source_system text not null default '${SOURCE_SYSTEM}',
      league_code text,
      payload_type text not null,
      source_url text not null,
      source_player_id text,
      source_game_id text,
      payload jsonb not null,
      payload_hash text not null,
      fetched_at timestamptz not null default now(),
      unique (source_system, payload_type, source_url, payload_hash)
    )
  `);

  await query(`
    create table if not exists public.indy_iscore_player_source_map (
      source_system text not null default '${SOURCE_SYSTEM}',
      league_code text not null,
      season_id text not null,
      source_player_id text not null,
      source_player_name text,
      first_name text,
      last_name text,
      source_team_id text,
      source_team_name text,
      source_team_abbrev text,
      teamid text,
      yatstats_playerid text,
      match_status text not null default 'unmatched',
      match_confidence numeric,
      match_notes text,
      raw_player jsonb not null default '{}'::jsonb,
      first_seen_at timestamptz not null default now(),
      last_seen_at timestamptz not null default now(),
      primary key (source_system, league_code, season_id, source_player_id)
    )
  `);

  await query(`
    create table if not exists public.indy_iscore_batting_2026_season_raw (
      source_system text not null default '${SOURCE_SYSTEM}',
      league_code text not null,
      league_name text not null,
      season_year int not null,
      season_id text not null,
      league_id text not null,
      source_player_id text not null,
      yatstats_playerid text,
      source_player_name text,
      first_name text,
      last_name text,
      source_team_id text,
      source_team_name text,
      source_team_abbrev text,
      teamid text,
      pa numeric, ab numeric, r numeric, h numeric, dbl numeric, tpl numeric, hr numeric, rbi numeric,
      bb numeric, so numeric, sb numeric, cs numeric, avg numeric, obp numeric, slg numeric, ops numeric,
      raw_stats jsonb not null,
      raw_payload_id bigint references public.indy_iscore_raw_payloads(id),
      ingested_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      primary key (source_system, league_code, season_id, source_player_id)
    )
  `);

  await query(`
    create table if not exists public.indy_iscore_pitching_2026_season_raw (
      source_system text not null default '${SOURCE_SYSTEM}',
      league_code text not null,
      league_name text not null,
      season_year int not null,
      season_id text not null,
      league_id text not null,
      source_player_id text not null,
      yatstats_playerid text,
      source_player_name text,
      first_name text,
      last_name text,
      source_team_id text,
      source_team_name text,
      source_team_abbrev text,
      teamid text,
      outs_pitched numeric, ip text, w numeric, l numeric, era numeric, g numeric, gs numeric, sv numeric,
      h numeric, r numeric, er numeric, hr numeric, bb numeric, so numeric, whip numeric,
      raw_stats jsonb not null,
      raw_payload_id bigint references public.indy_iscore_raw_payloads(id),
      ingested_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      primary key (source_system, league_code, season_id, source_player_id)
    )
  `);

  await query(`
    create table if not exists public.indy_iscore_player_stats_raw (
      source_system text not null default '${SOURCE_SYSTEM}',
      league_code text not null,
      season_id text not null,
      source_player_id text not null,
      yatstats_playerid text,
      raw_payload jsonb not null,
      raw_payload_id bigint references public.indy_iscore_raw_payloads(id),
      ingested_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      primary key (source_system, league_code, season_id, source_player_id)
    )
  `);

  await query(`
    create table if not exists public.indy_iscore_games_raw (
      source_system text not null default '${SOURCE_SYSTEM}',
      league_code text not null,
      season_id text not null,
      league_id text not null,
      source_game_id text not null,
      game_date date,
      home_team_abbrev text,
      away_team_abbrev text,
      home_team_name text,
      away_team_name text,
      status text,
      raw_payload jsonb not null,
      raw_payload_id bigint references public.indy_iscore_raw_payloads(id),
      ingested_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      primary key (source_system, league_code, season_id, source_game_id)
    )
  `);

  await query(`
    create table if not exists public.indy_iscore_box_scores_raw (
      source_system text not null default '${SOURCE_SYSTEM}',
      league_code text not null,
      season_id text not null,
      source_game_id text not null,
      raw_payload jsonb not null,
      raw_payload_id bigint references public.indy_iscore_raw_payloads(id),
      ingested_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      primary key (source_system, league_code, season_id, source_game_id)
    )
  `);

  await query(`
    create table if not exists public.indy_iscore_player_game_stats_raw (
      source_system text not null default '${SOURCE_SYSTEM}',
      league_code text not null,
      season_id text not null,
      source_game_id text not null,
      source_player_id text not null,
      yatstats_playerid text,
      stat_type text not null default 'baseball',
      game_date date,
      team_abbrev text,
      opponent_abbrev text,
      raw_stats jsonb not null,
      raw_payload_id bigint references public.indy_iscore_raw_payloads(id),
      ingested_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      primary key (source_system, league_code, season_id, source_game_id, source_player_id, stat_type)
    )
  `);

  await query(`
    create table if not exists public.indy_iscore_ingest_runs (
      id bigserial primary key,
      ran_at timestamptz not null default now(),
      league_code text,
      dry_run boolean not null default false,
      force boolean not null default false,
      summary jsonb not null default '{}'::jsonb
    )
  `);

  for (const league of DEFAULT_LEAGUES) {
    await query(
      `insert into public.indy_iscore_leagues (
         league_code, league_name, season_year, season_id, league_id, stats_base_url, active, updated_at
       ) values ($1, $2, $3, $4, $5, $6, true, now())
       on conflict (league_code) do update set
         league_name = excluded.league_name,
         season_year = excluded.season_year,
         season_id = excluded.season_id,
         league_id = excluded.league_id,
         stats_base_url = excluded.stats_base_url,
         updated_at = now()`,
      [league.league_code, league.league_name, league.season_year, league.season_id, league.league_id, ISCORE_API_BASE]
    );
  }
}

async function saveIndyRawPayload(input: {
  leagueCode?: string | null;
  payloadType: string;
  sourceUrl: string;
  payload: unknown;
  sourcePlayerId?: string | null;
  sourceGameId?: string | null;
}) {
  const hash = stableHash(input.payload);
  const { rows } = await query<{ id: string }>(
    `insert into public.indy_iscore_raw_payloads (
       source_system, league_code, payload_type, source_url, source_player_id, source_game_id, payload, payload_hash, fetched_at
     ) values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, now())
     on conflict (source_system, payload_type, source_url, payload_hash) do update set fetched_at = now()
     returning id`,
    [SOURCE_SYSTEM, input.leagueCode || null, input.payloadType, input.sourceUrl, input.sourcePlayerId || null, input.sourceGameId || null, JSON.stringify(input.payload ?? null), hash]
  );
  return Number(rows[0]?.id);
}

export async function loadActiveIndyIscoreLeagues(filter?: string | null) {
  await ensureIndyIscoreTables();
  const { rows } = await query<IndyLeagueConfig>(
    `select *
     from public.indy_iscore_leagues
     where active is true
       and ($1::text is null or league_code = $1 or lower(league_name) like '%' || lower($1) || '%')
     order by case league_code when 'ALPB' then 0 when 'AAPB' then 1 when 'FL' then 2 else 3 end, league_code`,
    [filter || null]
  );
  return rows;
}

async function upsertPlayerMap(input: ReturnType<typeof rowToSeasonInput>) {
  if (!input.sourcePlayerId) return;
  await query(
    `insert into public.indy_iscore_player_source_map (
       source_system, league_code, season_id, source_player_id, source_player_name, first_name, last_name,
       source_team_id, source_team_name, source_team_abbrev, raw_player, last_seen_at
     ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, now())
     on conflict (source_system, league_code, season_id, source_player_id) do update set
       source_player_name = coalesce(excluded.source_player_name, public.indy_iscore_player_source_map.source_player_name),
       first_name = coalesce(excluded.first_name, public.indy_iscore_player_source_map.first_name),
       last_name = coalesce(excluded.last_name, public.indy_iscore_player_source_map.last_name),
       source_team_id = coalesce(excluded.source_team_id, public.indy_iscore_player_source_map.source_team_id),
       source_team_name = coalesce(excluded.source_team_name, public.indy_iscore_player_source_map.source_team_name),
       source_team_abbrev = coalesce(excluded.source_team_abbrev, public.indy_iscore_player_source_map.source_team_abbrev),
       raw_player = excluded.raw_player,
       last_seen_at = now()`,
    [
      SOURCE_SYSTEM,
      input.common.league_code,
      input.common.season_id,
      input.sourcePlayerId,
      input.playerName,
      input.firstName,
      input.lastName,
      input.sourceTeamId,
      input.sourceTeamName,
      input.sourceTeamAbbrev,
      JSON.stringify(input.raw),
    ]
  );
}

async function upsertSeasonRow(kind: LeaderboardKind, input: ReturnType<typeof rowToSeasonInput>) {
  if (!input.sourcePlayerId) return;
  const table = kind === 'batting' ? 'indy_iscore_batting_2026_season_raw' : 'indy_iscore_pitching_2026_season_raw';
  if (kind === 'batting') {
    await query(
      `insert into public.${table} (
         source_system, league_code, league_name, season_year, season_id, league_id, source_player_id,
         source_player_name, first_name, last_name, source_team_id, source_team_name, source_team_abbrev,
         pa, ab, r, h, dbl, tpl, hr, rbi, bb, so, sb, cs, avg, obp, slg, ops,
         raw_stats, raw_payload_id, updated_at
       ) values (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,
         $14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,
         $30::jsonb,$31,now()
       )
       on conflict (source_system, league_code, season_id, source_player_id) do update set
         source_player_name = excluded.source_player_name,
         first_name = excluded.first_name,
         last_name = excluded.last_name,
         source_team_id = excluded.source_team_id,
         source_team_name = excluded.source_team_name,
         source_team_abbrev = excluded.source_team_abbrev,
         pa = excluded.pa, ab = excluded.ab, r = excluded.r, h = excluded.h, dbl = excluded.dbl, tpl = excluded.tpl,
         hr = excluded.hr, rbi = excluded.rbi, bb = excluded.bb, so = excluded.so, sb = excluded.sb, cs = excluded.cs,
         avg = excluded.avg, obp = excluded.obp, slg = excluded.slg, ops = excluded.ops,
         raw_stats = excluded.raw_stats,
         raw_payload_id = excluded.raw_payload_id,
         updated_at = now()`,
      [
        SOURCE_SYSTEM,
        input.common.league_code,
        input.common.league_name,
        input.common.season_year,
        input.common.season_id,
        input.common.league_id,
        input.sourcePlayerId,
        input.playerName,
        input.firstName,
        input.lastName,
        input.sourceTeamId,
        input.sourceTeamName,
        input.sourceTeamAbbrev,
        input.stats.pa,
        input.stats.ab,
        input.stats.r,
        input.stats.h,
        input.stats.dbl,
        input.stats.tpl,
        input.stats.hr,
        input.stats.rbi,
        input.stats.bb,
        input.stats.so,
        input.stats.sb,
        input.stats.cs,
        input.stats.avg,
        input.stats.obp,
        input.stats.slg,
        input.stats.ops,
        JSON.stringify(input.raw),
        input.rawPayloadId,
      ]
    );
  } else {
    await query(
      `insert into public.${table} (
         source_system, league_code, league_name, season_year, season_id, league_id, source_player_id,
         source_player_name, first_name, last_name, source_team_id, source_team_name, source_team_abbrev,
         outs_pitched, ip, w, l, era, g, gs, sv, h, r, er, hr, bb, so, whip,
         raw_stats, raw_payload_id, updated_at
       ) values (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,
         $14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,
         $29::jsonb,$30,now()
       )
       on conflict (source_system, league_code, season_id, source_player_id) do update set
         source_player_name = excluded.source_player_name,
         first_name = excluded.first_name,
         last_name = excluded.last_name,
         source_team_id = excluded.source_team_id,
         source_team_name = excluded.source_team_name,
         source_team_abbrev = excluded.source_team_abbrev,
         outs_pitched = excluded.outs_pitched, ip = excluded.ip, w = excluded.w, l = excluded.l,
         era = excluded.era, g = excluded.g, gs = excluded.gs, sv = excluded.sv, h = excluded.h, r = excluded.r,
         er = excluded.er, hr = excluded.hr, bb = excluded.bb, so = excluded.so, whip = excluded.whip,
         raw_stats = excluded.raw_stats,
         raw_payload_id = excluded.raw_payload_id,
         updated_at = now()`,
      [
        SOURCE_SYSTEM,
        input.common.league_code,
        input.common.league_name,
        input.common.season_year,
        input.common.season_id,
        input.common.league_id,
        input.sourcePlayerId,
        input.playerName,
        input.firstName,
        input.lastName,
        input.sourceTeamId,
        input.sourceTeamName,
        input.sourceTeamAbbrev,
        input.stats.outs_pitched,
        input.stats.ip,
        input.stats.w,
        input.stats.l,
        input.stats.era,
        input.stats.g,
        input.stats.gs,
        input.stats.sv,
        input.stats.h,
        input.stats.r,
        input.stats.er,
        input.stats.hr,
        input.stats.bb,
        input.stats.so,
        input.stats.whip,
        JSON.stringify(input.raw),
        input.rawPayloadId,
      ]
    );
  }
}

async function autoMatchPlayersForLeague(league: IndyLeagueConfig) {
  const { rowCount } = await query(
    `with candidates as (
       select
         m.source_system,
         m.league_code,
         m.season_id,
         m.source_player_id,
         p.playerid::text as yatstats_playerid,
         row_number() over (partition by m.source_system, m.league_code, m.season_id, m.source_player_id order by p.playerid::text) as rn,
         count(*) over (partition by m.source_system, m.league_code, m.season_id, m.source_player_id) as match_count
       from public.indy_iscore_player_source_map m
       join public.tbc_players_raw p
         on lower(p.firstname) = lower(m.first_name)
        and lower(p.lastname) = lower(m.last_name)
       join public.player_hsids ph
         on ph.playerid::text = p.playerid::text
       where m.source_system = $1
         and m.league_code = $2
         and m.season_id = $3
         and m.yatstats_playerid is null
         and m.first_name is not null
         and m.last_name is not null
     )
     update public.indy_iscore_player_source_map m
        set yatstats_playerid = c.yatstats_playerid,
            match_status = 'matched',
            match_confidence = 0.92,
            match_notes = 'auto exact first/last among YAT player_hsids universe',
            last_seen_at = now()
       from candidates c
      where c.match_count = 1
        and c.rn = 1
        and m.source_system = c.source_system
        and m.league_code = c.league_code
        and m.season_id = c.season_id
        and m.source_player_id = c.source_player_id`,
    [SOURCE_SYSTEM, league.league_code, league.season_id]
  );

  await query(
    `update public.indy_iscore_batting_2026_season_raw b
        set yatstats_playerid = m.yatstats_playerid,
            teamid = coalesce(m.teamid, tum.teamid, b.teamid),
            updated_at = now()
       from public.indy_iscore_player_source_map m
       left join public.teamid_universe_mapping tum
         on lower(tum.current_team_name) = lower(m.source_team_name)
        and tum.level_label = 'INDY'
      where b.source_system = m.source_system
        and b.league_code = m.league_code
        and b.season_id = m.season_id
        and b.source_player_id = m.source_player_id
        and m.yatstats_playerid is not null`
  );

  await query(
    `update public.indy_iscore_pitching_2026_season_raw p
        set yatstats_playerid = m.yatstats_playerid,
            teamid = coalesce(m.teamid, tum.teamid, p.teamid),
            updated_at = now()
       from public.indy_iscore_player_source_map m
       left join public.teamid_universe_mapping tum
         on lower(tum.current_team_name) = lower(m.source_team_name)
        and tum.level_label = 'INDY'
      where p.source_system = m.source_system
        and p.league_code = m.league_code
        and p.season_id = m.season_id
        and p.source_player_id = m.source_player_id
        and m.yatstats_playerid is not null`
  );

  return rowCount || 0;
}

async function ingestLeaderboard(league: IndyLeagueConfig, kind: LeaderboardKind, dryRun: boolean, size: number) {
  const fetched = await fetchJson(leaderboardUrl(league, kind, size));
  const rows = pickRows(fetched.payload);
  if (dryRun) return { rowsSeen: rows.length, playersSeen: rows.filter((row) => extractSourcePlayerId(row)).length };

  const rawPayloadId = await saveIndyRawPayload({
    leagueCode: league.league_code,
    payloadType: `leaderboard_${kind}`,
    sourceUrl: fetched.url,
    payload: fetched.payload,
  });

  let playersSeen = 0;
  for (const row of rows) {
    const input = rowToSeasonInput(row, kind, league, rawPayloadId);
    if (!input.sourcePlayerId) continue;
    playersSeen += 1;
    await upsertPlayerMap(input);
    await upsertSeasonRow(kind, input);
  }
  return { rowsSeen: rows.length, playersSeen };
}

function playerDetailHasGameIds(payload: unknown): string[] {
  const ids = new Set<string>();
  const visit = (value: unknown, depth: number) => {
    if (depth > 7 || value === null || value === undefined) return;
    if (Array.isArray(value)) {
      value.forEach((item) => visit(item, depth + 1));
      return;
    }
    if (typeof value !== 'object') return;
    const record = value as AnyRecord;
    const id = normalizeString(get(record, 'game_id', 'gameId', 'sourceGameId'));
    if (id && /^[0-9a-f-]{20,}$/i.test(id)) ids.add(id);
    Object.values(record).forEach((child) => visit(child, depth + 1));
  };
  visit(payload, 0);
  return Array.from(ids);
}

async function ingestPlayerDetailsForMatched(league: IndyLeagueConfig, dryRun: boolean, limit: number) {
  const { rows } = await query<{ source_player_id: string; yatstats_playerid: string }>(
    `select distinct source_player_id, yatstats_playerid
     from public.indy_iscore_player_source_map
     where source_system = $1
       and league_code = $2
       and season_id = $3
       and yatstats_playerid is not null
     order by source_player_id
     limit $4`,
    [SOURCE_SYSTEM, league.league_code, league.season_id, limit]
  );

  let fetchedCount = 0;
  for (const row of rows) {
    const fetched = await fetchJson(playerStatsUrl(row.source_player_id));
    fetchedCount += 1;
    if (dryRun) continue;
    const rawPayloadId = await saveIndyRawPayload({
      leagueCode: league.league_code,
      payloadType: 'player_stats',
      sourceUrl: fetched.url,
      sourcePlayerId: row.source_player_id,
      payload: fetched.payload,
    });
    await query(
      `insert into public.indy_iscore_player_stats_raw (
         source_system, league_code, season_id, source_player_id, yatstats_playerid, raw_payload, raw_payload_id, updated_at
       ) values ($1,$2,$3,$4,$5,$6::jsonb,$7,now())
       on conflict (source_system, league_code, season_id, source_player_id) do update set
         yatstats_playerid = excluded.yatstats_playerid,
         raw_payload = excluded.raw_payload,
         raw_payload_id = excluded.raw_payload_id,
         updated_at = now()`,
      [SOURCE_SYSTEM, league.league_code, league.season_id, row.source_player_id, row.yatstats_playerid, JSON.stringify(fetched.payload), rawPayloadId]
    );
  }
  return fetchedCount;
}

function parseGameRows(payload: unknown): AnyRecord[] {
  return pickRows(payload).filter((row) => normalizeString(get(row, 'game_id', 'gameId', 'id')));
}

function extractGameId(row: AnyRecord): string | null {
  return normalizeString(get(row, 'game_id', 'gameId', 'source_game_id') || get(row, 'id'));
}

async function ingestGamesAndBoxScores(league: IndyLeagueConfig, dryRun: boolean, force: boolean, maxGames: number) {
  const fetched = await fetchJson(leagueGamesUrl(league));
  const gameRows = parseGameRows(fetched.payload);
  let gamesFound = gameRows.length;
  let boxScoresFetched = 0;
  let playerGameRows = 0;

  if (!dryRun) {
    await saveIndyRawPayload({
      leagueCode: league.league_code,
      payloadType: 'league_games',
      sourceUrl: fetched.url,
      payload: fetched.payload,
    });
  }

  const recentGames = gameRows
    .map((row) => ({ row, gameId: extractGameId(row), date: normalizeString(get(row, 'schedule_date', 'date', 'game_date', 'start_time')) }))
    .filter((item): item is { row: AnyRecord; gameId: string; date: string | null } => Boolean(item.gameId))
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
    .slice(0, maxGames);

  for (const game of recentGames) {
    const already = await query<{ exists: boolean }>(
      `select exists(
         select 1 from public.indy_iscore_box_scores_raw
         where source_system = $1 and league_code = $2 and season_id = $3 and source_game_id = $4
       ) as exists`,
      [SOURCE_SYSTEM, league.league_code, league.season_id, game.gameId]
    );
    if (!force && already.rows[0]?.exists) continue;

    if (!dryRun) {
      const gamePayloadId = await saveIndyRawPayload({
        leagueCode: league.league_code,
        payloadType: 'game_summary',
        sourceUrl: gameSummaryUrl(game.gameId).toString(),
        sourceGameId: game.gameId,
        payload: game.row,
      });
      await query(
        `insert into public.indy_iscore_games_raw (
           source_system, league_code, season_id, league_id, source_game_id, game_date,
           home_team_abbrev, away_team_abbrev, status, raw_payload, raw_payload_id, updated_at
         ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,now())
         on conflict (source_system, league_code, season_id, source_game_id) do update set
           game_date = coalesce(excluded.game_date, public.indy_iscore_games_raw.game_date),
           home_team_abbrev = coalesce(excluded.home_team_abbrev, public.indy_iscore_games_raw.home_team_abbrev),
           away_team_abbrev = coalesce(excluded.away_team_abbrev, public.indy_iscore_games_raw.away_team_abbrev),
           status = coalesce(excluded.status, public.indy_iscore_games_raw.status),
           raw_payload = excluded.raw_payload,
           raw_payload_id = excluded.raw_payload_id,
           updated_at = now()`,
        [
          SOURCE_SYSTEM,
          league.league_code,
          league.season_id,
          league.league_id,
          game.gameId,
          game.date,
          normalizeString(get(game.row, 'home_team_abbreviation', 'homeTeamAbbreviation')),
          normalizeString(get(game.row, 'away_team_abbreviation', 'awayTeamAbbreviation')),
          normalizeString(get(game.row, 'status', 'game_status')),
          JSON.stringify(game.row),
          gamePayloadId,
        ]
      );
    }

    const box = await fetchJson(boxScoreUrl(game.gameId));
    boxScoresFetched += 1;
    if (dryRun) continue;
    const rawPayloadId = await saveIndyRawPayload({
      leagueCode: league.league_code,
      payloadType: 'box_score',
      sourceUrl: box.url,
      sourceGameId: game.gameId,
      payload: box.payload,
    });
    await query(
      `insert into public.indy_iscore_box_scores_raw (
         source_system, league_code, season_id, source_game_id, raw_payload, raw_payload_id, updated_at
       ) values ($1,$2,$3,$4,$5::jsonb,$6,now())
       on conflict (source_system, league_code, season_id, source_game_id) do update set
         raw_payload = excluded.raw_payload,
         raw_payload_id = excluded.raw_payload_id,
         updated_at = now()`,
      [SOURCE_SYSTEM, league.league_code, league.season_id, game.gameId, JSON.stringify(box.payload), rawPayloadId]
    );

    const rows = pickRows(box.payload)
      .filter((row) => extractSourcePlayerId(row))
      .slice(0, 1000);
    for (const row of rows) {
      const sourcePlayerId = extractSourcePlayerId(row);
      if (!sourcePlayerId) continue;
      playerGameRows += 1;
      await query(
        `insert into public.indy_iscore_player_game_stats_raw (
           source_system, league_code, season_id, source_game_id, source_player_id, stat_type,
           game_date, team_abbrev, opponent_abbrev, raw_stats, raw_payload_id, updated_at
         ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,now())
         on conflict (source_system, league_code, season_id, source_game_id, source_player_id, stat_type) do update set
           game_date = coalesce(excluded.game_date, public.indy_iscore_player_game_stats_raw.game_date),
           team_abbrev = coalesce(excluded.team_abbrev, public.indy_iscore_player_game_stats_raw.team_abbrev),
           opponent_abbrev = coalesce(excluded.opponent_abbrev, public.indy_iscore_player_game_stats_raw.opponent_abbrev),
           raw_stats = excluded.raw_stats,
           raw_payload_id = excluded.raw_payload_id,
           updated_at = now()`,
        [
          SOURCE_SYSTEM,
          league.league_code,
          league.season_id,
          game.gameId,
          sourcePlayerId,
          normalizeString(get(row, 'type', 'stat_type', 'category')) || 'baseball',
          game.date,
          extractTeamAbbreviation(row),
          null,
          JSON.stringify(row),
          rawPayloadId,
        ]
      );
    }
  }

  return { gamesFound, boxScoresFetched, playerGameRows };
}

export async function ingestIndyIscoreLeague(league: IndyLeagueConfig, options: { dryRun?: boolean; force?: boolean; includeDetails?: boolean; includeGames?: boolean; size?: number; playerDetailLimit?: number; maxGames?: number } = {}) {
  await ensureIndyIscoreTables();
  const summary: IndyIngestSummary = {
    leagueCode: league.league_code,
    leagueName: league.league_name,
    battingRows: 0,
    pitchingRows: 0,
    playersSeen: 0,
    playersAutoMatched: 0,
    playerDetailsFetched: 0,
    gamesFound: 0,
    boxScoresFetched: 0,
    playerGameRows: 0,
    errors: [],
  };

  const dryRun = Boolean(options.dryRun);
  const size = options.size || DEFAULT_SIZE;

  try {
    const batting = await ingestLeaderboard(league, 'batting', dryRun, size);
    summary.battingRows = batting.rowsSeen;
    summary.playersSeen += batting.playersSeen;
  } catch (error: any) {
    summary.errors.push(`batting: ${error?.message || String(error)}`);
  }

  try {
    const pitching = await ingestLeaderboard(league, 'pitching', dryRun, size);
    summary.pitchingRows = pitching.rowsSeen;
    summary.playersSeen += pitching.playersSeen;
  } catch (error: any) {
    summary.errors.push(`pitching: ${error?.message || String(error)}`);
  }

  if (!dryRun) {
    try {
      summary.playersAutoMatched = await autoMatchPlayersForLeague(league);
    } catch (error: any) {
      summary.errors.push(`autoMatch: ${error?.message || String(error)}`);
    }
  }

  if (options.includeDetails !== false) {
    try {
      summary.playerDetailsFetched = await ingestPlayerDetailsForMatched(league, dryRun, options.playerDetailLimit || 300);
    } catch (error: any) {
      summary.errors.push(`playerDetails: ${error?.message || String(error)}`);
    }
  }

  if (options.includeGames) {
    try {
      const games = await ingestGamesAndBoxScores(league, dryRun, Boolean(options.force), options.maxGames || 10);
      summary.gamesFound = games.gamesFound;
      summary.boxScoresFetched = games.boxScoresFetched;
      summary.playerGameRows = games.playerGameRows;
    } catch (error: any) {
      summary.errors.push(`games: ${error?.message || String(error)}`);
    }
  }

  if (!dryRun) {
    await query(
      `insert into public.indy_iscore_ingest_runs (league_code, dry_run, force, summary)
       values ($1, $2, $3, $4::jsonb)`,
      [league.league_code, dryRun, Boolean(options.force), JSON.stringify(summary)]
    );
  }

  return summary;
}

function rate(value: unknown) {
  if (value === null || value === undefined || value === '') return '';
  const n = Number(value);
  if (!Number.isFinite(n)) return value;
  return n < 1 && n > -1 ? n.toFixed(3).replace(/^0/, '') : n;
}

export async function getIndyIscoreStatsForPlayer(playerId: string, limit = 10): Promise<IndyStatsForPlayer> {
  await ensureIndyIscoreTables();
  const [batting, pitching, recentGames] = await Promise.all([
    query<AnyRecord>(
      `select
         b.*, m.current_team_name, m.current_org_or_conference_name, m.current_org_or_conference_abbrev, m.level_label
       from public.indy_iscore_batting_2026_season_raw b
       left join public.teamid_universe_mapping m on m.teamid::text = b.teamid::text
       where b.yatstats_playerid::text = $1
       order by b.season_year, coalesce(m.current_team_name, b.source_team_name)`,
      [playerId]
    ),
    query<AnyRecord>(
      `select
         p.*, m.current_team_name, m.current_org_or_conference_name, m.current_org_or_conference_abbrev, m.level_label
       from public.indy_iscore_pitching_2026_season_raw p
       left join public.teamid_universe_mapping m on m.teamid::text = p.teamid::text
       where p.yatstats_playerid::text = $1
       order by p.season_year, coalesce(m.current_team_name, p.source_team_name)`,
      [playerId]
    ),
    query<AnyRecord>(
      `select
         g.*, gm.game_date, gm.home_team_abbrev, gm.away_team_abbrev
       from public.indy_iscore_player_game_stats_raw g
       left join public.indy_iscore_games_raw gm
         on gm.source_system = g.source_system
        and gm.league_code = g.league_code
        and gm.season_id = g.season_id
        and gm.source_game_id = g.source_game_id
       where g.yatstats_playerid::text = $1
       order by coalesce(g.game_date, gm.game_date) desc nulls last
       limit $2`,
      [playerId, limit]
    ),
  ]);

  return {
    batting: batting.rows.map((row) => ({
      source: 'indy_iscore',
      year: row.season_year,
      teamid: row.teamid || '',
      team_id: row.teamid || '',
      team: row.current_team_name || row.source_team_name || row.source_team_abbrev || '',
      league: row.current_org_or_conference_abbrev || row.current_org_or_conference_name || row.league_name,
      level: row.level_label || 'INDY',
      org_conf: row.current_org_or_conference_abbrev || row.current_org_or_conference_name || row.league_name,
      pa: row.pa ?? '',
      ab: row.ab ?? '',
      r: row.r ?? '',
      h: row.h ?? '',
      dbl: row.dbl ?? '',
      tpl: row.tpl ?? '',
      hr: row.hr ?? '',
      rbi: row.rbi ?? '',
      bb: row.bb ?? '',
      so: row.so ?? '',
      sb: row.sb ?? '',
      cs: row.cs ?? '',
      avg: rate(row.avg),
      bavg: rate(row.avg),
      obp: rate(row.obp),
      slg: rate(row.slg),
      ops: rate(row.ops),
      raw: row.raw_stats,
    })),
    pitching: pitching.rows.map((row) => ({
      source: 'indy_iscore',
      year: row.season_year,
      teamid: row.teamid || '',
      team_id: row.teamid || '',
      team: row.current_team_name || row.source_team_name || row.source_team_abbrev || '',
      league: row.current_org_or_conference_abbrev || row.current_org_or_conference_name || row.league_name,
      level: row.level_label || 'INDY',
      org_conf: row.current_org_or_conference_abbrev || row.current_org_or_conference_name || row.league_name,
      ip: row.ip ?? '',
      w: row.w ?? '',
      l: row.l ?? '',
      era: row.era ?? '',
      g: row.g ?? '',
      gs: row.gs ?? '',
      sv: row.sv ?? '',
      h: row.h ?? '',
      r: row.r ?? '',
      er: row.er ?? '',
      hr: row.hr ?? '',
      bb: row.bb ?? '',
      so: row.so ?? '',
      whip: row.whip ?? '',
      raw: row.raw_stats,
    })),
    recentGames: recentGames.rows.map((row) => ({
      source: 'indy_iscore',
      year: 2026,
      league: row.league_code,
      level: 'INDY',
      game: row.source_game_id,
      date: row.game_date,
      team: row.team_abbrev || '',
      opponent: row.opponent_abbrev || '',
      stat_type: row.stat_type,
      raw: row.raw_stats,
      ...(typeof row.raw_stats === 'object' && row.raw_stats !== null ? row.raw_stats : {}),
    })),
  };
}
