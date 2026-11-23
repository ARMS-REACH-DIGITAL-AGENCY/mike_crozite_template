// Production MLB boxscore ingestion. The HTTP route and isolated rehearsal
// use this same parser, registry lookup and database writer.
import { mlbIngestionContext, type MlbIngestionDb, type MlbIngestionOptions } from "./ingestionContext";

const MLB_API_BASE = "https://statsapi.mlb.com/api/v1";
const AZ_TZ = "America/Phoenix";

type ScheduleGame = {
  gamePk: number;
  gameDate?: string;
  officialDate?: string;
  gameType?: string;
  sport?: { id?: number; name?: string; abbreviation?: string };
  status?: { detailedState?: string };
  teams?: {
    home?: { team?: { id?: number; name?: string }; isWinner?: boolean };
    away?: { team?: { id?: number; name?: string }; isWinner?: boolean };
  };
};

type BoxPlayer = {
  person?: { id?: number; fullName?: string };
  stats?: {
    batting?: Record<string, unknown>;
    pitching?: Record<string, unknown>;
  };
};

function azToday(now: Date): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: AZ_TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function hasBattingActivity(stat: Record<string, unknown> | undefined): boolean {
  if (!stat) return false;
  return Number(stat.plateAppearances || 0) > 0
    || Number(stat.atBats || 0) > 0
    || Number(stat.baseOnBalls || 0) > 0
    || Number(stat.hitByPitch || 0) > 0
    || Number(stat.sacFlies || 0) > 0;
}

function hasPitchingActivity(stat: Record<string, unknown> | undefined): boolean {
  if (!stat) return false;
  const ip = String(stat.inningsPitched || "0.0");
  return ip !== "0.0"
    || Number(stat.battersFaced || 0) > 0
    || Number(stat.pitchesThrown || 0) > 0;
}

function battingLine(stat: Record<string, unknown>): string {
  const ab = Number(stat.atBats || 0);
  const h = Number(stat.hits || 0);
  const hr = Number(stat.homeRuns || 0);
  const rbi = Number(stat.rbi || 0);
  const bb = Number(stat.baseOnBalls || 0);
  const parts = [`${h}-${ab}`];
  if (hr) parts.push(`${hr} HR`);
  if (rbi) parts.push(`${rbi} RBI`);
  if (bb) parts.push(`${bb} BB`);
  return parts.join(", ");
}

function pitchingLine(stat: Record<string, unknown>): string {
  const ip = String(stat.inningsPitched || "0.0");
  const er = Number(stat.earnedRuns || 0);
  const k = Number(stat.strikeOuts || 0);
  const bb = Number(stat.baseOnBalls || 0);
  const parts = [`${ip} IP`, `${er} ER`, `${k} K`];
  if (bb) parts.push(`${bb} BB`);
  return parts.join(", ");
}

async function fetchJson(request: typeof fetch, url: string): Promise<any> {
  const res = await request(url, {
    cache: "no-store",
    headers: { Accept: "application/json", "User-Agent": "YATSTATS-live-gamelogs" },
  });
  if (!res.ok) throw new Error(`MLB API ${res.status} for ${url}`);
  return res.json();
}

async function getMappedPlayerIds(pool: MlbIngestionDb, mlbIds: string[]): Promise<Map<string, string>> {
  if (!mlbIds.length) return new Map();
  const { rows } = await pool.query<{ source_player_id: string; playerid: string }>(
    // YAT key step 9: MLB ID -> YAT ID -> the key of his card.
    `select mlb_id as source_player_id, playerid
       from public.yat_mlb_links
      where mlb_id = any($1::text[]) and playerid is not null`,
    [mlbIds],
  );
  return new Map(rows.map((r) => [r.source_player_id, r.playerid]));
}

async function upsertRow(pool: MlbIngestionDb, effectiveAt: string | null, args: {
  playerid: string;
  gamePk: number;
  teamId: number | null;
  statType: "batting" | "pitching";
  gameDate: string;
  gameStatus: string;
  teamName: string | null;
  opponentName: string | null;
  homeAway: "home" | "away";
  lineSummary: string;
  stats: Record<string, unknown>;
  rawPayload: unknown;
}) {
  await pool.query(
    `insert into public.player_game_logs (
       playerid, source, source_game_id, source_team_id, stat_type,
       game_date, game_status, team_name, opponent_name, home_away,
       line_summary, stats, raw_payload, created_at, updated_at
     )
     values (
       $1, 'mlb_api', $2, $3, $4,
       $5::date, $6, $7, $8, $9,
       $10, $11::jsonb, $12::jsonb, coalesce($13::timestamptz, now()), coalesce($13::timestamptz, now())
     )
     on conflict (playerid, source, source_game_id, stat_type) do update set
       source_team_id = excluded.source_team_id,
       game_date = excluded.game_date,
       game_status = excluded.game_status,
       team_name = excluded.team_name,
       opponent_name = excluded.opponent_name,
       home_away = excluded.home_away,
       line_summary = excluded.line_summary,
       stats = excluded.stats,
       raw_payload = excluded.raw_payload,
       updated_at = coalesce($13::timestamptz, now())`,
    [
      args.playerid,
      String(args.gamePk),
      args.teamId == null ? null : String(args.teamId),
      args.statType,
      args.gameDate,
      args.gameStatus,
      args.teamName,
      args.opponentName,
      args.homeAway,
      args.lineSummary,
      JSON.stringify(args.stats),
      JSON.stringify(args.rawPayload),
      effectiveAt,
    ],
  );
}

export async function runMlbLiveGameLogs(pool: MlbIngestionDb, options: MlbIngestionOptions = {}) {
  const { request, effectiveAt, now } = mlbIngestionContext(options);
  const date = azToday(now());
  const startedAt = Date.now();

  const schedule = await fetchJson(request,
    `${MLB_API_BASE}/schedule?sportId=1&date=${date}`,
  );

  const games: ScheduleGame[] = (schedule?.dates ?? [])
    .flatMap((d: any) => d?.games ?? [])
    .filter((g: ScheduleGame) => g?.gamePk);

  let rowsUpserted = 0;
  let mappedPlayersSeen = 0;
  const warnings: string[] = [];

  for (const game of games) {
    try {
      const box = await fetchJson(request, `${MLB_API_BASE}/game/${game.gamePk}/boxscore`);

      const sides: Array<{
        key: "home" | "away";
        teamId: number | null;
        teamName: string | null;
        opponentName: string | null;
        isWinner: boolean | undefined;
        players: Record<string, BoxPlayer>;
      }> = [
        {
          key: "home",
          teamId: game.teams?.home?.team?.id ?? null,
          teamName: game.teams?.home?.team?.name ?? null,
          opponentName: game.teams?.away?.team?.name ?? null,
          isWinner: game.teams?.home?.isWinner,
          players: box?.teams?.home?.players ?? {},
        },
        {
          key: "away",
          teamId: game.teams?.away?.team?.id ?? null,
          teamName: game.teams?.away?.team?.name ?? null,
          opponentName: game.teams?.home?.team?.name ?? null,
          isWinner: game.teams?.away?.isWinner,
          players: box?.teams?.away?.players ?? {},
        },
      ];

      const mlbIds = sides.flatMap((side) =>
        Object.values(side.players)
          .map((p) => p?.person?.id)
          .filter((id): id is number => Number.isFinite(id)),
      );

      const idMap = await getMappedPlayerIds(pool, [...new Set(mlbIds.map(String))]);
      mappedPlayersSeen += idMap.size;

      // officialDate is the local game day. gameDate is the UTC start time,
      // so a 5pm Arizona game (00:00Z) would land on the next day.
      const gameDate = String(game.officialDate || date).slice(0, 10);
      const gameStatus = game.status?.detailedState || "Unknown";
      // Boxscore player objects omit the game's level/type. Preserve the
      // player evidence and carry the schedule's metadata alongside it so
      // landing and scoring never fall back to the player's current level.
      // This worker requests sportId=1; MLB is therefore source context even
      // when the schedule omits its sport object. Do not guess a different
      // sport's abbreviation if the provider explicitly supplies another ID.
      const sportId = game.sport?.id ?? 1;
      const sport = {
        ...game.sport,
        id: sportId,
        ...(game.sport?.abbreviation ? {} : sportId === 1 ? { abbreviation: "MLB" } : {}),
      };
      const isFinal = /^(final|game over|completed)/i.test(gameStatus);

      for (const side of sides) {
        for (const player of Object.values(side.players)) {
          const mlbId = player?.person?.id;
          if (!mlbId) continue;
          const playerid = idMap.get(String(mlbId));
          if (!playerid) continue;
          const rawPayload = {
            ...player,
            ...(game.gameType ? { gameType: game.gameType } : {}),
            sport,
            ...(isFinal && typeof side.isWinner === "boolean" ? { isWin: side.isWinner } : {}),
          };

          const batting = player.stats?.batting;
          if (hasBattingActivity(batting)) {
            await upsertRow(pool, effectiveAt, {
              playerid,
              gamePk: game.gamePk,
              teamId: side.teamId,
              statType: "batting",
              gameDate,
              gameStatus,
              teamName: side.teamName,
              opponentName: side.opponentName,
              homeAway: side.key,
              lineSummary: battingLine(batting!),
              stats: batting!,
              rawPayload,
            });
            rowsUpserted++;
          }

          const pitching = player.stats?.pitching;
          if (hasPitchingActivity(pitching)) {
            await upsertRow(pool, effectiveAt, {
              playerid,
              gamePk: game.gamePk,
              teamId: side.teamId,
              statType: "pitching",
              gameDate,
              gameStatus,
              teamName: side.teamName,
              opponentName: side.opponentName,
              homeAway: side.key,
              lineSummary: pitchingLine(pitching!),
              stats: pitching!,
              rawPayload,
            });
            rowsUpserted++;
          }
        }
      }
    } catch (error) {
      warnings.push(
        `gamePk=${game.gamePk}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  return {
    ok: true,
    date,
    gamesChecked: games.length,
    mappedPlayersSeen,
    rowsUpserted,
    warnings,
    durationMs: Date.now() - startedAt,
  };

}
