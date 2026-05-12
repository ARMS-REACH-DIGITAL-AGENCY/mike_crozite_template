import { NextRequest, NextResponse } from 'next/server';
import {
  ensureExternalStatsTables,
  hasGameStats,
  loadActiveExternalStatTeams,
  saveRawPayload,
  upsertExternalGame,
  upsertExternalPlayer,
  upsertExternalPlayerGameStat,
  type ExternalStatSummary,
  type ExternalStatTeamConfig,
} from '@/lib/externalStats';
import {
  fetchIscoreCentralStats,
  fetchIscoreTeamWebsite,
  isCompletedGame,
  normalizeIscoreGameStats,
  normalizeIscoreGames,
  normalizeIscoreRoster,
  resolveTeamWebsiteIdentifier,
} from '@/lib/iscore';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

function isAuthorized(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET || process.env.ADMIN_INGEST_SECRET;
  if (!expected) return false;

  const bearer = req.headers.get('authorization') || '';
  const token = bearer.startsWith('Bearer ') ? bearer.slice(7) : '';
  const qp = req.nextUrl.searchParams.get('secret') || '';

  return token === expected || qp === expected;
}

function shouldForce(req: NextRequest) {
  const value = req.nextUrl.searchParams.get('force') || '';
  return ['1', 'true', 'yes', 'y'].includes(value.toLowerCase());
}

function shouldDryRun(req: NextRequest) {
  const value = req.nextUrl.searchParams.get('dryRun') || req.nextUrl.searchParams.get('dry_run') || '';
  return ['1', 'true', 'yes', 'y'].includes(value.toLowerCase());
}

function teamFilter(req: NextRequest) {
  return req.nextUrl.searchParams.get('team') || req.nextUrl.searchParams.get('teamName') || '';
}

async function ingestIscoreCentral(team: ExternalStatTeamConfig, dryRun: boolean): Promise<ExternalStatSummary> {
  const summary: ExternalStatSummary = {
    team: team.team_name,
    sourceSystem: team.source_system,
    rosterPlayers: 0,
    gamesFound: 0,
    gamesIngested: 0,
    playerStatRows: 0,
    skippedGames: 0,
    errors: [],
  };

  try {
    const { payload, sourceUrl } = await fetchIscoreCentralStats(team);
    if (!dryRun) {
      await saveRawPayload({
        sourceSystem: team.source_system,
        sourceUrl,
        leagueCode: team.league_code,
        teamIdentifier: team.source_team_identifier || 'ALPB',
        payload,
      });
    }

    // The league-level public iScore Central URL is currently treated as an archived/raw source.
    // If the page exposes embedded JSON/API URLs in production, add a parser here without changing
    // the database contract or renderer.
    summary.errors.push('Archived iScore Central stats page payload only; no stable embedded parser configured yet. Use iscore_team_website credentials for game/player rows until parser is finalized.');
  } catch (error: any) {
    summary.errors.push(error?.message || String(error));
  }

  return summary;
}

async function ingestIscoreTeamWebsite(
  team: ExternalStatTeamConfig,
  force: boolean,
  dryRun: boolean,
  onlyGameGuid?: string | null
): Promise<ExternalStatSummary> {
  const summary: ExternalStatSummary = {
    team: team.team_name,
    sourceSystem: team.source_system,
    rosterPlayers: 0,
    gamesFound: 0,
    gamesIngested: 0,
    playerStatRows: 0,
    skippedGames: 0,
    errors: [],
  };

  const teamIdentifier = resolveTeamWebsiteIdentifier(team);

  try {
    const rosterResponse = await fetchIscoreTeamWebsite('roster', team);
    const roster = normalizeIscoreRoster(rosterResponse.payload);
    summary.rosterPlayers = roster.length;

    if (!dryRun) {
      await saveRawPayload({
        sourceSystem: team.source_system,
        sourceUrl: rosterResponse.sourceUrl,
        leagueCode: team.league_code,
        teamIdentifier,
        payload: rosterResponse.payload,
      });

      for (const player of roster) {
        await upsertExternalPlayer({
          sourceSystem: team.source_system,
          sourcePlayerGuid: player.sourcePlayerGuid,
          firstName: player.firstName,
          lastName: player.lastName,
          jersey: player.jersey,
          position: player.position,
          headshotUrl: player.headshotUrl,
          rawPayload: player.raw,
        });
      }
    }
  } catch (error: any) {
    summary.errors.push(`roster: ${error?.message || String(error)}`);
  }

  let games = [] as ReturnType<typeof normalizeIscoreGames>;

  try {
    const gamesResponse = await fetchIscoreTeamWebsite('games', team);
    games = normalizeIscoreGames(gamesResponse.payload);
    summary.gamesFound = games.length;

    if (!dryRun) {
      await saveRawPayload({
        sourceSystem: team.source_system,
        sourceUrl: gamesResponse.sourceUrl,
        leagueCode: team.league_code,
        teamIdentifier,
        payload: gamesResponse.payload,
      });
    }
  } catch (error: any) {
    summary.errors.push(`games: ${error?.message || String(error)}`);
    return summary;
  }

  for (const game of games) {
    if (onlyGameGuid && game.sourceGameGuid !== onlyGameGuid) continue;
    if (!isCompletedGame(game)) {
      summary.skippedGames += 1;
      continue;
    }

    if (!force && !dryRun && (await hasGameStats(team.source_system, game.sourceGameGuid))) {
      summary.skippedGames += 1;
      continue;
    }

    try {
      if (!dryRun) {
        await upsertExternalGame({
          sourceSystem: team.source_system,
          sourceGameGuid: game.sourceGameGuid,
          sourceTeamIdentifier: teamIdentifier,
          scheduledAt: game.scheduledAt,
          startedAt: game.startedAt,
          endedAt: game.endedAt,
          homeTeamName: game.homeTeamName,
          visitorTeamName: game.visitorTeamName,
          homeScore: game.homeScore,
          visitorScore: game.visitorScore,
          result: game.result,
          status: game.status,
        });
      }

      const statsResponse = await fetchIscoreTeamWebsite('gamestats', team, { g: game.sourceGameGuid });
      const rawPayloadId = dryRun ? null : await saveRawPayload({
        sourceSystem: team.source_system,
        sourceUrl: statsResponse.sourceUrl,
        leagueCode: team.league_code,
        teamIdentifier,
        gameGuid: game.sourceGameGuid,
        payload: statsResponse.payload,
      });

      const statRows = normalizeIscoreGameStats(statsResponse.payload, game.sourceGameGuid, teamIdentifier);
      summary.playerStatRows += statRows.length;

      if (!dryRun) {
        await upsertExternalGame({
          sourceSystem: team.source_system,
          sourceGameGuid: game.sourceGameGuid,
          sourceTeamIdentifier: teamIdentifier,
          scheduledAt: game.scheduledAt,
          startedAt: game.startedAt,
          endedAt: game.endedAt,
          homeTeamName: game.homeTeamName,
          visitorTeamName: game.visitorTeamName,
          homeScore: game.homeScore,
          visitorScore: game.visitorScore,
          result: game.result,
          status: game.status || 'FINAL',
          rawPayloadId,
        });

        for (const stat of statRows) {
          await upsertExternalPlayerGameStat({
            sourceSystem: team.source_system,
            sourceGameGuid: stat.sourceGameGuid,
            sourcePlayerGuid: stat.sourcePlayerGuid,
            teamIdentifier: stat.teamIdentifier,
            seasonYear: stat.seasonYear,
            statType: stat.statType,
            stats: stat.stats,
            rawPayloadId,
          });
        }
      }

      summary.gamesIngested += 1;
    } catch (error: any) {
      summary.errors.push(`game ${game.sourceGameGuid}: ${error?.message || String(error)}`);
    }
  }

  return summary;
}

async function ingestTeam(team: ExternalStatTeamConfig, req: NextRequest): Promise<ExternalStatSummary> {
  const force = shouldForce(req);
  const dryRun = shouldDryRun(req);
  const onlyGameGuid = req.nextUrl.searchParams.get('gameGuid');

  if (team.source_system === 'iscore_central') {
    return ingestIscoreCentral(team, dryRun);
  }

  if (team.source_system === 'iscore_team_website' || team.source_system === 'iscore') {
    return ingestIscoreTeamWebsite(team, force, dryRun, onlyGameGuid);
  }

  return {
    team: team.team_name,
    sourceSystem: team.source_system,
    rosterPlayers: 0,
    gamesFound: 0,
    gamesIngested: 0,
    playerStatRows: 0,
    skippedGames: 0,
    errors: [`Unsupported external stat source_system: ${team.source_system}`],
  };
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  if ((process.env.ALPB_INGEST_ENABLED || '').toLowerCase() === 'false') {
    return NextResponse.json({ ok: false, error: 'ALPB_INGEST_ENABLED=false' }, { status: 409 });
  }

  await ensureExternalStatsTables();
  const filter = teamFilter(req).toLowerCase();
  const teams = (await loadActiveExternalStatTeams('ALPB')).filter((team) => {
    if (!filter) return true;
    return team.team_name.toLowerCase().includes(filter) || team.source_system.toLowerCase().includes(filter);
  });

  const results: ExternalStatSummary[] = [];
  for (const team of teams) {
    results.push(await ingestTeam(team, req));
  }

  return NextResponse.json({
    ok: results.every((r) => r.errors.length === 0),
    dryRun: shouldDryRun(req),
    force: shouldForce(req),
    ranAt: new Date().toISOString(),
    teamsChecked: results.length,
    totals: {
      rosterPlayers: results.reduce((sum, r) => sum + r.rosterPlayers, 0),
      gamesFound: results.reduce((sum, r) => sum + r.gamesFound, 0),
      gamesIngested: results.reduce((sum, r) => sum + r.gamesIngested, 0),
      playerStatRows: results.reduce((sum, r) => sum + r.playerStatRows, 0),
      skippedGames: results.reduce((sum, r) => sum + r.skippedGames, 0),
      errors: results.reduce((sum, r) => sum + r.errors.length, 0),
    },
    results,
  });
}
