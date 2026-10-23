import crypto from 'node:crypto';
import { writerQuery } from '@/lib/dbWriter';

const API_BASE = 'https://api.microservices.iscoresports.com/api';
const PAGE_LIMIT = 1000;
type Json = Record<string, any>;
export type ScheduleQuery = (text: string, values?: any[]) => Promise<{ rows: any[]; rowCount?: number | null }>;

export type IndyScheduleSeason = {
  source_system: string;
  league_code: string;
  season_id: string;
  league_id: string;
  season_year: number;
  season_start: string;
  season_end: string;
  schedule_timezone: string;
  game_type: string;
  source_url: string;
};

export type IndyScheduleGame = {
  source_system: string;
  league_code: string;
  season_id: string;
  league_id: string;
  source_game_id: string;
  game_date: string;
  game_time_utc: string;
  home_source_team_id: string;
  away_source_team_id: string;
  home_team_name: string;
  away_team_name: string;
  home_team_abbrev: string | null;
  away_team_abbrev: string | null;
  status: string;
  venue_name: string | null;
  game_type: string;
  home_score: number | null;
  away_score: number | null;
  raw_payload: Json;
  score_payload: Json | null;
};

export type IndyScheduleOptions = {
  dryRun?: boolean;
  query?: ScheduleQuery;
  fetcher?: typeof fetch;
  scoreLimit?: number;
  // A saved official response can be replayed without fetching it again.
  inputPayload?: unknown;
  inputScores?: Record<string, unknown>;
};

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function dateInZone(value: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(new Date(value));
  return ['year', 'month', 'day'].map((key) => parts.find((part) => part.type === key)?.value).join('-');
}

function validateSeason(season: IndyScheduleSeason) {
  if (season.source_system !== 'iscore_central') throw new Error('Unsupported independent schedule source');
  if (!season.league_id || !season.season_id || !season.league_code) throw new Error('Schedule requires explicit source identities');
  for (const date of [season.season_start, season.season_end]) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))
        || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) {
      throw new Error('Schedule requires an approved season date window');
    }
  }
  if (season.season_start > season.season_end) throw new Error('Invalid season date window');
  dateInZone(`${season.season_start}T12:00:00Z`, season.schedule_timezone);
}

/** The source season UUID and approved dates both matter: the provider also
 * contains test games labeled with a real season, and a DO-NOT-USE season. */
export function parseIndySchedulePayload(payload: unknown, season: IndyScheduleSeason) {
  validateSeason(season);
  if (!Array.isArray(payload)) throw new Error('iScore schedule response is not a game array');
  const games = new Map<string, IndyScheduleGame>();
  const rejected: Record<string, number> = {};
  const reject = (reason: string) => { rejected[reason] = (rejected[reason] || 0) + 1; };
  for (const item of payload) {
    if (!item || typeof item !== 'object') { reject('invalid_game'); continue; }
    const row = item as Json;
    if (row.leagueId !== season.league_id || row.season?.id !== season.season_id) { reject('other_league_or_season'); continue; }
    if (/do[ -]?not[ -]?use|test|exhibition/i.test(text(row.season?.name))) { reject('test_season'); continue; }
    const gameId = text(row.gameGuid);
    const homeId = text(row.homeTeam?.id);
    const awayId = text(row.awayTeam?.id);
    const scheduled = text(row.scheduledDate);
    // Require an explicit offset so the server's timezone cannot change a game.
    if (!gameId || !homeId || !awayId || homeId === awayId || !text(row.homeTeam?.name) || !text(row.awayTeam?.name)
        || !/(?:Z|[+-]\d{2}:\d{2})$/i.test(scheduled) || Number.isNaN(Date.parse(scheduled))) {
      reject('invalid_game'); continue;
    }
    const date = dateInZone(scheduled, season.schedule_timezone);
    if (date < season.season_start || date > season.season_end) { reject('outside_season_window'); continue; }
    const status = ({ 1: 'Scheduled', 2: 'In Progress', 3: 'Final' } as Record<number, string>)[Number(row.gameStatusId)];
    if (!status) { reject('unknown_status'); continue; }
    const game: IndyScheduleGame = {
      source_system: season.source_system, league_code: season.league_code, season_id: season.season_id,
      league_id: season.league_id, source_game_id: gameId, game_date: date,
      game_time_utc: new Date(scheduled).toISOString(), home_source_team_id: homeId, away_source_team_id: awayId,
      home_team_name: text(row.homeTeam.name), away_team_name: text(row.awayTeam.name),
      home_team_abbrev: null, away_team_abbrev: null, status,
      venue_name: text(row.gameInfo?.location) || null, game_type: season.game_type,
      home_score: null, away_score: null, raw_payload: row, score_payload: null,
    };
    const previous = games.get(gameId);
    if (previous && JSON.stringify(previous.raw_payload) !== JSON.stringify(row)) {
      throw new Error(`Conflicting schedule records for source game ${gameId}`);
    }
    // Distinct IDs survive even when a doubleheader shares the same start time.
    games.set(gameId, game);
  }
  return { games: [...games.values()], rejected, fetched: payload.length };
}

/** Never turn a stale live score into a final result, or attach another game's
 * score. Some final entries have a score endpoint that still says IN_PROGRESS. */
export function attachIndyFinalScore(game: IndyScheduleGame, payload: unknown): boolean {
  if (!payload || typeof payload !== 'object' || game.status !== 'Final') return false;
  const score = payload as Json;
  const home = score.teams?.HOME;
  const away = score.teams?.AWAY;
  const summaryId = text(score.gameSummary?.game_id);
  if (score.status !== 'FINAL' || home?.id !== game.home_source_team_id || away?.id !== game.away_source_team_id
      || (summaryId && summaryId !== game.source_game_id)
      || !Number.isInteger(home?.runs) || home.runs < 0 || !Number.isInteger(away?.runs) || away.runs < 0) return false;
  game.home_score = home.runs;
  game.away_score = away.runs;
  game.home_team_abbrev = text(home.shortName) || null;
  game.away_team_abbrev = text(away.shortName) || null;
  game.score_payload = score;
  return true;
}

function scheduleUrl(season: IndyScheduleSeason, from: number, to: number) {
  const url = new URL(`${API_BASE}/public/games`);
  url.searchParams.set('leagueId', season.league_id);
  url.searchParams.set('startDateFrom', new Date(from).toISOString());
  url.searchParams.set('startDateTo', new Date(to).toISOString());
  url.searchParams.set('take', String(PAGE_LIMIT));
  return url.toString();
}

async function fetchJson(url: string, fetcher: typeof fetch) {
  const response = await fetcher(url, {
    headers: { Accept: 'application/json', Origin: 'https://pro.iscorecentral.com', Referer: 'https://pro.iscorecentral.com/' },
    cache: 'no-store', signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error(`iScore schedule HTTP ${response.status}`);
  return response.json();
}

async function fetchSeason(season: IndyScheduleSeason, fetcher: typeof fetch) {
  const from = Date.parse(`${season.season_start.slice(0, 4)}-01-01T00:00:00Z`);
  const to = Date.parse(`${season.season_end.slice(0, 4)}-12-31T23:59:59.999Z`);
  const pages: { url: string; payload: unknown[] }[] = [];
  // The official client uses take with date windows, not offset pagination.
  // Split a full window rather than silently truncating a busy league.
  async function collect(start: number, end: number, depth = 0): Promise<void> {
    const url = scheduleUrl(season, start, end);
    const payload = await fetchJson(url, fetcher);
    if (!Array.isArray(payload)) throw new Error('iScore schedule response is not a game array');
    if (payload.length >= PAGE_LIMIT) {
      if (depth >= 12 || end - start < 86400000) throw new Error('iScore schedule window exceeds safe page limit');
      const middle = Math.floor((start + end) / 2);
      await collect(start, middle, depth + 1);
      await collect(middle + 1, end, depth + 1);
    } else pages.push({ url, payload });
  }
  await collect(from, to);
  return { sourceUrl: scheduleUrl(season, from, to), payload: pages.length === 1 ? pages[0].payload : { pages }, games: pages.flatMap((page) => page.payload) };
}

const UPSERT_GAMES = `
INSERT INTO public.indy_iscore_games_raw AS stored (
  source_system,league_code,season_id,league_id,source_game_id,game_date,game_time_utc,
  home_source_team_id,away_source_team_id,home_team_name,away_team_name,home_team_abbrev,away_team_abbrev,
  status,venue_name,game_type,home_score,away_score,raw_payload,score_payload,raw_payload_id,updated_at
)
SELECT r.*, $2::bigint, now() FROM jsonb_to_recordset($1::jsonb) AS r(
  source_system text,league_code text,season_id text,league_id text,source_game_id text,game_date date,game_time_utc timestamptz,
  home_source_team_id text,away_source_team_id text,home_team_name text,away_team_name text,home_team_abbrev text,away_team_abbrev text,
  status text,venue_name text,game_type text,home_score integer,away_score integer,raw_payload jsonb,score_payload jsonb
)
ON CONFLICT (source_system,league_code,season_id,source_game_id) DO UPDATE SET
  game_date=excluded.game_date, game_time_utc=excluded.game_time_utc, league_id=excluded.league_id,
  home_source_team_id=excluded.home_source_team_id, away_source_team_id=excluded.away_source_team_id,
  home_team_name=excluded.home_team_name, away_team_name=excluded.away_team_name,
  home_team_abbrev=CASE WHEN stored.home_source_team_id=excluded.home_source_team_id THEN coalesce(excluded.home_team_abbrev,stored.home_team_abbrev) ELSE excluded.home_team_abbrev END,
  away_team_abbrev=CASE WHEN stored.away_source_team_id=excluded.away_source_team_id THEN coalesce(excluded.away_team_abbrev,stored.away_team_abbrev) ELSE excluded.away_team_abbrev END,
  status=excluded.status, venue_name=excluded.venue_name, game_type=excluded.game_type,
  home_score=CASE WHEN stored.home_source_team_id=excluded.home_source_team_id AND stored.away_source_team_id=excluded.away_source_team_id THEN coalesce(excluded.home_score,stored.home_score) ELSE excluded.home_score END,
  away_score=CASE WHEN stored.home_source_team_id=excluded.home_source_team_id AND stored.away_source_team_id=excluded.away_source_team_id THEN coalesce(excluded.away_score,stored.away_score) ELSE excluded.away_score END,
  score_payload=CASE WHEN stored.home_source_team_id=excluded.home_source_team_id AND stored.away_source_team_id=excluded.away_source_team_id THEN coalesce(excluded.score_payload,stored.score_payload) ELSE excluded.score_payload END,
  raw_payload=excluded.raw_payload, raw_payload_id=excluded.raw_payload_id, updated_at=now()
WHERE (stored.raw_payload,stored.game_date,stored.game_time_utc,stored.home_source_team_id,stored.away_source_team_id,stored.status,stored.game_type)
  IS DISTINCT FROM (excluded.raw_payload,excluded.game_date,excluded.game_time_utc,excluded.home_source_team_id,excluded.away_source_team_id,excluded.status,excluded.game_type)
  OR (excluded.score_payload IS NOT NULL AND (stored.score_payload,stored.home_score,stored.away_score)
      IS DISTINCT FROM (excluded.score_payload,excluded.home_score,excluded.away_score))
`;

async function resolveTeamMappings(games: IndyScheduleGame[], query: ScheduleQuery) {
  const teams = new Map<string, Json>();
  for (const game of games) for (const side of ['home', 'away'] as const) {
    const id = game[`${side}_source_team_id`];
    teams.set(id, { source_system: game.source_system, league_code: game.league_code, season_id: game.season_id,
      source_team_id: id, source_team_name: game[`${side}_team_name`] });
  }
  if (!teams.size) return { mappings: [], unresolved: [] };
  const { rows } = await query(`
    WITH source_teams AS (
      SELECT * FROM jsonb_to_recordset($1::jsonb) AS t(source_system text,league_code text,season_id text,source_team_id text,source_team_name text)
    )
    SELECT t.*, stored.teamid AS existing_teamid, array_remove(array_agg(DISTINCT u.teamid),NULL) AS canonical_ids
    FROM source_teams t
    LEFT JOIN public.indy_iscore_leagues l ON l.league_code=t.league_code
    LEFT JOIN public.teamid_universe_mapping u
      ON lower(regexp_replace(u.current_team_name,'\\s+','','g'))=lower(regexp_replace(t.source_team_name,'\\s+','','g'))
      AND lower(trim(u.current_org_or_conference_name))=lower(trim(l.league_name))
    LEFT JOIN public.indy_iscore_team_source_map stored
      ON stored.source_system=t.source_system AND stored.league_code=t.league_code
      AND stored.season_id=t.season_id AND stored.source_team_id=t.source_team_id
    GROUP BY t.source_system,t.league_code,t.season_id,t.source_team_id,t.source_team_name,stored.teamid
  `, [JSON.stringify([...teams.values()])]);
  const isResolved = (row: Json) => row.canonical_ids.length === 1
    && (!row.existing_teamid || row.existing_teamid === row.canonical_ids[0]);
  return {
    mappings: rows.filter(isResolved).map((row) => ({
      source_system: row.source_system, league_code: row.league_code, season_id: row.season_id,
      source_team_id: row.source_team_id, source_team_name: row.source_team_name, teamid: row.canonical_ids[0],
    })),
    unresolved: rows.filter((row) => !isResolved(row)).map((row) => row.source_team_name),
  };
}

/** Add missing canonical IDs to identities we already know. This does not
 * establish a current roster membership: the stage's existing name and league
 * must already agree, and its labels, status, ownership and freshness stay put. */
export async function fillIndyCanonicalTeamLinks(
  mappings: { source_system: string; league_code: string; season_id: string; source_team_id: string; source_team_name: string; teamid: string }[],
  options: Pick<IndyScheduleOptions, 'dryRun' | 'query'> = {},
) {
  const dryRun = options.dryRun !== false;
  const query = options.query || writerQuery;
  const empty = { playerLinksEligible: 0, stageTeamIdsEligible: 0, playerLinksFilled: 0, stageTeamIdsFilled: 0 };
  if (!mappings.length) return empty;
  const sourceTeams = new Map<string, string>();
  for (const mapping of mappings) {
    const key = JSON.stringify([mapping.source_system, mapping.league_code, mapping.season_id, mapping.source_team_id]);
    if (sourceTeams.has(key) && sourceTeams.get(key) !== mapping.teamid) {
      throw new Error(`Ambiguous canonical team for source team ${mapping.source_team_id}`);
    }
    sourceTeams.set(key, mapping.teamid);
  }
  const candidates = `
    WITH supplied AS (
      SELECT DISTINCT * FROM jsonb_to_recordset($1::jsonb)
        AS t(source_system text,league_code text,season_id text,source_team_id text,source_team_name text,teamid text)
    ), verified AS (
      SELECT s.* FROM supplied s
      WHERE NOT EXISTS (
        SELECT 1 FROM public.indy_iscore_team_source_map stored
        WHERE stored.source_system=s.source_system AND stored.league_code=s.league_code
          AND stored.season_id=s.season_id AND stored.source_team_id=s.source_team_id AND stored.teamid<>s.teamid
      ) AND ($2::boolean OR EXISTS (
        SELECT 1 FROM public.indy_iscore_team_source_map stored
        WHERE stored.source_system=s.source_system AND stored.league_code=s.league_code
          AND stored.season_id=s.season_id AND stored.source_team_id=s.source_team_id AND stored.teamid=s.teamid
      ))
    ), source_player_candidates AS (
      SELECT p.source_system,p.league_code,p.season_id,p.source_player_id,p.source_team_id,p.yatstats_playerid,
        p.match_status,p.teamid AS existing_teamid,v.teamid,v.source_team_name
      FROM public.indy_iscore_player_source_map p
      JOIN verified v ON v.source_system=p.source_system AND v.league_code=p.league_code
        AND v.season_id=p.season_id AND v.source_team_id=p.source_team_id
      WHERE p.teamid IS NULL OR p.teamid=v.teamid
    ), stage_candidates AS (
      SELECT f.playerid,min(p.teamid) AS teamid,
        f.current_team_name AS expected_team_name,f.current_org_or_conference_name AS expected_league_name
      FROM source_player_candidates p
      JOIN public.flip_card_front_stage f ON f.playerid=p.yatstats_playerid
      JOIN public.indy_iscore_leagues l ON l.league_code=p.league_code
      WHERE p.match_status='matched' AND p.yatstats_playerid IS NOT NULL
        AND f.current_teamid IS NULL
        AND lower(regexp_replace(f.current_team_name,'\\s+','','g'))=lower(regexp_replace(p.source_team_name,'\\s+','','g'))
        AND lower(trim(f.current_org_or_conference_name))=lower(trim(l.league_name))
      GROUP BY f.playerid,f.current_team_name,f.current_org_or_conference_name
      HAVING count(DISTINCT p.teamid)=1
        AND count(DISTINCT (p.source_system,p.league_code,p.season_id,p.source_player_id))=1
    )`;
  // A single write statement keeps both link updates atomic. The stage's
  // labels are rechecked at UPDATE time to protect a concurrent roster edit.
  const writes = dryRun ? '' : `,
    player_link_updates AS (
      UPDATE public.indy_iscore_player_source_map target SET teamid=p.teamid
      FROM source_player_candidates p
      WHERE target.source_system=p.source_system AND target.league_code=p.league_code
        AND target.season_id=p.season_id AND target.source_player_id=p.source_player_id
        AND target.source_team_id=p.source_team_id
        AND target.teamid IS NULL
      RETURNING target.source_player_id
    ), stage_team_updates AS (
      UPDATE public.flip_card_front_stage target SET current_teamid=c.teamid
      FROM stage_candidates c
      WHERE target.playerid=c.playerid AND target.current_teamid IS NULL
        AND target.current_team_name IS NOT DISTINCT FROM c.expected_team_name
        AND target.current_org_or_conference_name IS NOT DISTINCT FROM c.expected_league_name
      RETURNING target.playerid
    )`;
  const result = await query(`${candidates}${writes}
    SELECT (SELECT count(*) FROM source_player_candidates WHERE existing_teamid IS NULL)::integer AS player_links_eligible,
      (SELECT count(*) FROM stage_candidates)::integer AS stage_team_ids_eligible,
      ${dryRun ? '0' : '(SELECT count(*) FROM player_link_updates)'}::integer AS player_links_filled,
      ${dryRun ? '0' : '(SELECT count(*) FROM stage_team_updates)'}::integer AS stage_team_ids_filled`,
  [JSON.stringify(mappings), dryRun]);
  const row = result.rows[0] || {};
  return { playerLinksEligible: Number(row.player_links_eligible || 0), stageTeamIdsEligible: Number(row.stage_team_ids_eligible || 0),
    playerLinksFilled: Number(row.player_links_filled || 0), stageTeamIdsFilled: Number(row.stage_team_ids_filled || 0) };
}

export async function syncIndyScheduleSeason(season: IndyScheduleSeason, options: IndyScheduleOptions = {}) {
  validateSeason(season);
  const query = options.query || writerQuery;
  const fetcher = options.fetcher || fetch;
  const dryRun = options.dryRun !== false;
  const fetched = options.inputPayload !== undefined
    ? { sourceUrl: scheduleUrl(season, Date.parse(`${season.season_start.slice(0, 4)}-01-01T00:00:00Z`), Date.parse(`${season.season_end.slice(0, 4)}-12-31T23:59:59.999Z`)), payload: options.inputPayload, games: options.inputPayload }
    : await fetchSeason(season, fetcher);
  const parsed = parseIndySchedulePayload(fetched.games, season);
  const { mappings, unresolved } = await resolveTeamMappings(parsed.games, query);
  const scoreWarnings: string[] = [];
  let scoresAttached = 0;
  for (const game of parsed.games) {
    if (options.inputScores?.[game.source_game_id] !== undefined) {
      if (attachIndyFinalScore(game, options.inputScores[game.source_game_id])) scoresAttached++;
      else scoreWarnings.push(`Unverified final score: ${game.source_game_id}`);
    }
  }
  const scoreLimit = Math.max(0, Math.min(200, Math.trunc(options.scoreLimit ?? 10)));
  if (scoreLimit && !options.inputScores) {
    const existing = await query(`SELECT source_game_id FROM public.indy_iscore_games_raw
      WHERE source_system=$1 AND league_code=$2 AND season_id=$3 AND home_score IS NOT NULL AND away_score IS NOT NULL AND score_payload->>'status'='FINAL'`,
    [season.source_system, season.league_code, season.season_id]);
    const scored = new Set(existing.rows.map((row) => row.source_game_id));
    const pending = parsed.games.filter((game) => game.status === 'Final' && !scored.has(game.source_game_id))
      .sort((a, b) => b.game_time_utc.localeCompare(a.game_time_utc)).slice(0, scoreLimit);
    // Three score requests at a time, bounded independently of season size.
    for (let offset = 0; offset < pending.length; offset += 3) {
      await Promise.all(pending.slice(offset, offset + 3).map(async (game) => {
        try {
          const score = await fetchJson(`${API_BASE}/games/${encodeURIComponent(game.source_game_id)}/latest-score/internal`, fetcher);
          if (attachIndyFinalScore(game, score)) scoresAttached++;
          else scoreWarnings.push(`Unverified final score: ${game.source_game_id}`);
        } catch (error) { scoreWarnings.push(`${game.source_game_id}: ${error instanceof Error ? error.message : String(error)}`); }
      }));
    }
  }
  let gamesWritten = 0;
  let mappingsWritten = 0;
  if (!dryRun) {
    const serialized = JSON.stringify(fetched.payload);
    const hash = crypto.createHash('sha256').update(serialized).digest('hex');
    const archive = await query(`INSERT INTO public.indy_iscore_raw_payloads(source_system,league_code,payload_type,source_url,payload,payload_hash)
      VALUES($1,$2,'league_schedule',$3,$4::jsonb,$5)
      ON CONFLICT(source_system,payload_type,source_url,payload_hash) DO UPDATE SET fetched_at=now() RETURNING id`,
    [season.source_system, season.league_code, fetched.sourceUrl, serialized, hash]);
    if (parsed.games.length) {
      gamesWritten = (await query(UPSERT_GAMES, [JSON.stringify(parsed.games), archive.rows[0].id])).rowCount || 0;
    }
    if (mappings.length) {
      mappingsWritten = (await query(`INSERT INTO public.indy_iscore_team_source_map AS stored(source_system,league_code,season_id,source_team_id,source_team_name,teamid,updated_at)
        SELECT r.*,now() FROM jsonb_to_recordset($1::jsonb) AS r(source_system text,league_code text,season_id text,source_team_id text,source_team_name text,teamid text)
        ON CONFLICT(source_system,league_code,season_id,source_team_id) DO UPDATE SET source_team_name=excluded.source_team_name,updated_at=now()
        WHERE stored.teamid=excluded.teamid AND stored.source_team_name IS DISTINCT FROM excluded.source_team_name`,
      [JSON.stringify(mappings)])).rowCount || 0;
    }
  }
  const identityLinks = await fillIndyCanonicalTeamLinks(mappings, { query, dryRun });
  return { leagueCode: season.league_code, seasonYear: season.season_year, seasonId: season.season_id, dryRun,
    gamesFetched: parsed.fetched, gamesAccepted: parsed.games.length, rejected: parsed.rejected,
    gamesWritten, teamsResolved: mappings.length, mappingsWritten, unresolvedTeams: unresolved, scoresAttached, scoreWarnings,
    ...identityLinks };
}

export async function syncConfiguredIndySchedules(options: IndyScheduleOptions & { leagueFilter?: string | null } = {}) {
  const query = options.query || writerQuery;
  const { rows } = await query(`SELECT source_system,league_code,season_id,league_id,season_year,
    season_start::text,season_end::text,schedule_timezone,game_type,source_url
    FROM public.indy_iscore_schedule_seasons WHERE active IS TRUE AND ($1::text IS NULL OR league_code=$1)
    ORDER BY league_code,season_year`, [options.leagueFilter || null]);
  const results = [];
  const errors: string[] = [];
  for (const season of rows) {
    try { results.push(await syncIndyScheduleSeason(season as IndyScheduleSeason, options)); }
    catch (error) { errors.push(`${season.league_code}/${season.season_year}: ${error instanceof Error ? error.message : String(error)}`); }
  }
  return { results, errors };
}
