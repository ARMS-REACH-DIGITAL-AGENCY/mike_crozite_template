import 'server-only';
import { query } from '@/lib/db';

type JsonRecord = Record<string, any>;

const SPORTSBLAZE_BASE_URL = 'https://api.sportsblaze.com/mlb/v1';

export type SportsBlazeMode = 'live' | 'missing-key' | 'api-error';

export type SportsBlazeMappedPlayer = {
  yatstatsPlayerId: string;
  sportsblazePlayerId: string;
  sportsblazeTeamId?: string | null;
  sportsblazeTeamName?: string | null;
  playerName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  birthdate?: string | null;
  position?: string | null;
  headshotUrl?: string | null;
  confidenceScore: number;
  matchMethod: string;
  raw?: JsonRecord;
};

export type SportsBlazeIngestSummary = {
  mode: SportsBlazeMode;
  season: number;
  dryRun: boolean;
  mappedPlayers: number;
  playersChecked: number;
  gamelogsFetched: number;
  gamesUpserted: number;
  errors: string[];
};

function getSportsBlazeKey() {
  return process.env.SPORTSBLAZE_KEY || '';
}

function normalizeName(value: string | null | undefined) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function asDateOnly(value: string | null | undefined) {
  if (!value) return null;
  const raw = String(value).trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
}

async function sportsBlazeFetch<T>(path: string, params: Record<string, string | number | undefined> = {}): Promise<T> {
  const key = getSportsBlazeKey();
  if (!key) {
    throw new Error('SPORTSBLAZE_KEY is missing');
  }

  const url = new URL(`${SPORTSBLAZE_BASE_URL}${path}`);
  url.searchParams.set('key', key);
  Object.entries(params).forEach(([name, value]) => {
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      url.searchParams.set(name, String(value));
    }
  });

  const response = await fetch(url.toString(), {
    cache: 'no-store',
    headers: { accept: 'application/json' },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`SportsBlaze ${response.status} ${response.statusText}: ${body.slice(0, 500)}`);
  }

  return response.json() as Promise<T>;
}

export async function fetchSportsBlazeMlbRosters(season: number) {
  return sportsBlazeFetch<JsonRecord>(`/rosters/${season}.json`);
}

export async function fetchSportsBlazeMlbPlayerGamelogs(season: number, sportsblazePlayerId: string) {
  return sportsBlazeFetch<JsonRecord>(`/gamelogs/players/${season}/${sportsblazePlayerId}.json`, {
    type: 'Regular Season,Playoffs',
  });
}

function flattenRosterPlayers(rosterPayload: JsonRecord) {
  const teams = Array.isArray(rosterPayload?.teams) ? rosterPayload.teams : [];
  const players: SportsBlazeMappedPlayer[] = [];

  for (const team of teams) {
    const roster = Array.isArray(team?.roster) ? team.roster : [];
    for (const player of roster) {
      players.push({
        yatstatsPlayerId: '',
        sportsblazePlayerId: String(player?.id || ''),
        sportsblazeTeamId: team?.id ? String(team.id) : null,
        sportsblazeTeamName: team?.name ? String(team.name) : null,
        playerName: player?.name ? String(player.name) : null,
        firstName: player?.first ? String(player.first) : null,
        lastName: player?.last ? String(player.last) : null,
        birthdate: asDateOnly(player?.birthdate ? String(player.birthdate) : null),
        position: player?.position ? String(player.position) : null,
        headshotUrl: player?.headshot ? String(player.headshot) : null,
        confidenceScore: 0,
        matchMethod: 'unmatched',
        raw: player,
      });
    }
  }

  return players.filter((player) => player.sportsblazePlayerId);
}

async function loadActiveYatPlayers(season: number) {
  const sql = `
    with active_playerids as (
      select distinct playerid::text as playerid
      from public.tbc_batting_2026_season_raw
      where year::text = $1::text
      union
      select distinct playerid::text as playerid
      from public.tbc_pitching_2026_season_raw
      where year::text = $1::text
    )
    select
      tp.playerid::text as playerid,
      tp.firstname,
      tp.lastname,
      trim(coalesce(tp.firstname, '') || ' ' || coalesce(tp.lastname, '')) as player_name,
      tp.posit as position,
      tp.bats,
      tp.throws,
      tp.ht,
      tp.wt
    from active_playerids ap
    join public.tbc_players_raw tp on tp.playerid::text = ap.playerid
  `;
  const { rows } = await query(sql, [String(season)]);
  return rows;
}

export async function seedSportsBlazeMlbPlayerMap(season: number, dryRun = false) {
  const rosterPayload = await fetchSportsBlazeMlbRosters(season);
  const providerPlayers = flattenRosterPlayers(rosterPayload);
  const activeYatPlayers = await loadActiveYatPlayers(season);

  const byFullName = new Map<string, any[]>();
  for (const player of activeYatPlayers) {
    const key = normalizeName(player.player_name);
    if (!key) continue;
    const list = byFullName.get(key) || [];
    list.push(player);
    byFullName.set(key, list);
  }

  const mapped: SportsBlazeMappedPlayer[] = [];

  for (const providerPlayer of providerPlayers) {
    const fullName = normalizeName(
      providerPlayer.playerName || `${providerPlayer.firstName || ''} ${providerPlayer.lastName || ''}`
    );
    const yatMatches = byFullName.get(fullName) || [];
    if (yatMatches.length !== 1) continue;

    const yatPlayer = yatMatches[0];
    mapped.push({
      ...providerPlayer,
      yatstatsPlayerId: String(yatPlayer.playerid),
      confidenceScore: 88,
      matchMethod: 'exact_name_active_2026',
    });
  }

  if (!dryRun) {
    for (const player of mapped) {
      await query(
        `
          insert into public.sportsblaze_mlb_player_map (
            yatstats_playerid,
            sportsblaze_player_id,
            sportsblaze_team_id,
            sportsblaze_team_name,
            player_name,
            first_name,
            last_name,
            birthdate,
            position,
            headshot_url,
            confidence_score,
            match_method,
            metadata,
            last_verified_at,
            updated_at
          ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,now(),now())
          on conflict (yatstats_playerid) do update set
            sportsblaze_player_id = excluded.sportsblaze_player_id,
            sportsblaze_team_id = excluded.sportsblaze_team_id,
            sportsblaze_team_name = excluded.sportsblaze_team_name,
            player_name = excluded.player_name,
            first_name = excluded.first_name,
            last_name = excluded.last_name,
            birthdate = excluded.birthdate,
            position = excluded.position,
            headshot_url = excluded.headshot_url,
            confidence_score = excluded.confidence_score,
            match_method = excluded.match_method,
            metadata = excluded.metadata,
            active = true,
            last_verified_at = now(),
            updated_at = now()
        `,
        [
          player.yatstatsPlayerId,
          player.sportsblazePlayerId,
          player.sportsblazeTeamId,
          player.sportsblazeTeamName,
          player.playerName,
          player.firstName,
          player.lastName,
          player.birthdate,
          player.position,
          player.headshotUrl,
          player.confidenceScore,
          player.matchMethod,
          JSON.stringify(player.raw || {}),
        ]
      );
    }
  }

  return {
    rosterPlayers: providerPlayers.length,
    activeYatPlayers: activeYatPlayers.length,
    mappedPlayers: mapped.length,
    mapped,
  };
}

async function loadMappedPlayers(limit: number) {
  const { rows } = await query(
    `
      select *
      from public.sportsblaze_mlb_player_map
      where active = true
      order by confidence_score desc, updated_at desc
      limit $1
    `,
    [limit]
  );
  return rows;
}

function numberOrNull(value: any) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

async function upsertGameLog(params: {
  yatstatsPlayerId: string;
  sportsblazePlayerId: string;
  game: JsonRecord;
  sourceUpdatedAt?: string | null;
}) {
  const { yatstatsPlayerId, sportsblazePlayerId, game, sourceUpdatedAt } = params;
  const stats = game?.stats && typeof game.stats === 'object' ? game.stats : {};

  await query(
    `
      insert into public.sportsblaze_mlb_player_gamelogs (
        yatstats_playerid,
        sportsblaze_player_id,
        sportsblaze_game_id,
        season_year,
        season_type,
        game_date,
        game_status,
        played_team_id,
        position,
        started,
        away_team_id,
        away_team_name,
        home_team_id,
        home_team_name,
        batting_summary,
        stats,
        raw_game,
        source_updated_at,
        updated_at
      ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,now())
      on conflict (sportsblaze_player_id, sportsblaze_game_id) do update set
        yatstats_playerid = excluded.yatstats_playerid,
        season_year = excluded.season_year,
        season_type = excluded.season_type,
        game_date = excluded.game_date,
        game_status = excluded.game_status,
        played_team_id = excluded.played_team_id,
        position = excluded.position,
        started = excluded.started,
        away_team_id = excluded.away_team_id,
        away_team_name = excluded.away_team_name,
        home_team_id = excluded.home_team_id,
        home_team_name = excluded.home_team_name,
        batting_summary = excluded.batting_summary,
        stats = excluded.stats,
        raw_game = excluded.raw_game,
        source_updated_at = excluded.source_updated_at,
        updated_at = now()
    `,
    [
      yatstatsPlayerId,
      sportsblazePlayerId,
      String(game?.id || ''),
      numberOrNull(game?.season?.year) || new Date().getFullYear(),
      game?.season?.type ? String(game.season.type) : null,
      game?.date ? String(game.date) : null,
      game?.status ? String(game.status) : null,
      game?.played ? String(game.played) : null,
      game?.position ? String(game.position) : null,
      typeof game?.started === 'boolean' ? game.started : null,
      game?.teams?.away?.id ? String(game.teams.away.id) : null,
      game?.teams?.away?.name ? String(game.teams.away.name) : null,
      game?.teams?.home?.id ? String(game.teams.home.id) : null,
      game?.teams?.home?.name ? String(game.teams.home.name) : null,
      stats?.batting_summary ? String(stats.batting_summary) : null,
      JSON.stringify(stats),
      JSON.stringify(game || {}),
      sourceUpdatedAt ? String(sourceUpdatedAt) : null,
    ]
  );
}

export async function ingestSportsBlazeMlbGamelogs(options: {
  season: number;
  dryRun?: boolean;
  limit?: number;
  seedMap?: boolean;
}): Promise<SportsBlazeIngestSummary> {
  const season = options.season;
  const dryRun = Boolean(options.dryRun);
  const limit = Math.max(1, Math.min(options.limit || 50, 500));
  const errors: string[] = [];

  if (!getSportsBlazeKey()) {
    return {
      mode: 'missing-key',
      season,
      dryRun,
      mappedPlayers: 0,
      playersChecked: 0,
      gamelogsFetched: 0,
      gamesUpserted: 0,
      errors: ['SPORTSBLAZE_KEY is missing'],
    };
  }

  let mappedPlayers = 0;
  if (options.seedMap !== false) {
    try {
      const mapResult = await seedSportsBlazeMlbPlayerMap(season, dryRun);
      mappedPlayers = mapResult.mappedPlayers;
    } catch (error: any) {
      errors.push(`mapping: ${error?.message || String(error)}`);
    }
  }

  const players = dryRun ? [] : await loadMappedPlayers(limit);
  let gamelogsFetched = 0;
  let gamesUpserted = 0;

  for (const player of players) {
    try {
      const payload = await fetchSportsBlazeMlbPlayerGamelogs(season, player.sportsblaze_player_id);
      const games = Array.isArray(payload?.games) ? payload.games : [];
      gamelogsFetched += 1;

      for (const game of games) {
        if (!game?.id) continue;
        await upsertGameLog({
          yatstatsPlayerId: String(player.yatstats_playerid),
          sportsblazePlayerId: String(player.sportsblaze_player_id),
          game,
          sourceUpdatedAt: payload?.updated ? String(payload.updated) : null,
        });
        gamesUpserted += 1;
      }
    } catch (error: any) {
      errors.push(`${player.yatstats_playerid}/${player.sportsblaze_player_id}: ${error?.message || String(error)}`);
    }
  }

  return {
    mode: errors.length ? 'api-error' : 'live',
    season,
    dryRun,
    mappedPlayers,
    playersChecked: players.length,
    gamelogsFetched,
    gamesUpserted,
    errors,
  };
}

export async function getRecentSportsBlazeMlbGamelogs(yatstatsPlayerId: string, limit = 3) {
  const { rows } = await query(
    `
      select *
      from public.sportsblaze_mlb_player_gamelogs
      where yatstats_playerid = $1
      order by game_date desc nulls last
      limit $2
    `,
    [yatstatsPlayerId, Math.max(1, Math.min(limit, 25))]
  );
  return rows;
}
