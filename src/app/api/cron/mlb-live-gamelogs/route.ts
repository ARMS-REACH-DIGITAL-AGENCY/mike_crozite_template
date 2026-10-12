import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";

export const runtime = "nodejs";
export const maxDuration = 120;
export const dynamic = "force-dynamic";

const MLB_API_BASE = "https://statsapi.mlb.com/api/v1";
const AZ_TZ = "America/Phoenix";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

type ScheduleGame = {
  gamePk: number;
  gameDate?: string;
  officialDate?: string;
  status?: { detailedState?: string };
  teams?: {
    home?: { team?: { id?: number; name?: string } };
    away?: { team?: { id?: number; name?: string } };
  };
};

type BoxPlayer = {
  person?: { id?: number; fullName?: string };
  stats?: {
    batting?: Record<string, unknown>;
    pitching?: Record<string, unknown>;
  };
};

function isAuthorized(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  const bearer = req.headers.get("authorization") || "";
  return Boolean(expected && bearer === `Bearer ${expected}`);
}

function azToday(): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: AZ_TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(new Date())
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

async function fetchJson(url: string): Promise<any> {
  const res = await fetch(url, {
    cache: "no-store",
    headers: { Accept: "application/json", "User-Agent": "YATSTATS-live-gamelogs" },
  });
  if (!res.ok) throw new Error(`MLB API ${res.status} for ${url}`);
  return res.json();
}

async function getMappedPlayerIds(mlbIds: string[]): Promise<Map<string, string>> {
  if (!mlbIds.length) return new Map();
  const { rows } = await pool.query<{ source_player_id: string; playerid: string }>(
    `select source_player_id::text, playerid::text
       from public.player_source_map
      where source = 'mlb_api'
        and source_player_id::text = any($1::text[])
        and match_method is distinct from 'rejected_bad_identity_match'`,
    [mlbIds],
  );
  return new Map(rows.map((r) => [r.source_player_id, r.playerid]));
}

async function upsertRow(args: {
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
       line_summary, stats, raw_payload, updated_at
     )
     values (
       $1, 'mlb_api', $2, $3, $4,
       $5::date, $6, $7, $8, $9,
       $10, $11::jsonb, $12::jsonb, now()
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
       updated_at = now()`,
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
    ],
  );
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const date = azToday();
  const startedAt = Date.now();

  try {
    const schedule = await fetchJson(
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
        const box = await fetchJson(`${MLB_API_BASE}/game/${game.gamePk}/boxscore`);

        const sides: Array<{
          key: "home" | "away";
          teamId: number | null;
          teamName: string | null;
          opponentName: string | null;
          players: Record<string, BoxPlayer>;
        }> = [
          {
            key: "home",
            teamId: game.teams?.home?.team?.id ?? null,
            teamName: game.teams?.home?.team?.name ?? null,
            opponentName: game.teams?.away?.team?.name ?? null,
            players: box?.teams?.home?.players ?? {},
          },
          {
            key: "away",
            teamId: game.teams?.away?.team?.id ?? null,
            teamName: game.teams?.away?.team?.name ?? null,
            opponentName: game.teams?.home?.team?.name ?? null,
            players: box?.teams?.away?.players ?? {},
          },
        ];

        const mlbIds = sides.flatMap((side) =>
          Object.values(side.players)
            .map((p) => p?.person?.id)
            .filter((id): id is number => Number.isFinite(id)),
        );

        const idMap = await getMappedPlayerIds([...new Set(mlbIds.map(String))]);
        mappedPlayersSeen += idMap.size;

        // officialDate is the local game day. gameDate is the UTC start time,
        // so a 5pm Arizona game (00:00Z) would land on the next day.
        const gameDate = String(game.officialDate || date).slice(0, 10);
        const gameStatus = game.status?.detailedState || "Unknown";

        for (const side of sides) {
          for (const player of Object.values(side.players)) {
            const mlbId = player?.person?.id;
            if (!mlbId) continue;
            const playerid = idMap.get(String(mlbId));
            if (!playerid) continue;

            const batting = player.stats?.batting;
            if (hasBattingActivity(batting)) {
              await upsertRow({
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
                rawPayload: player,
              });
              rowsUpserted++;
            }

            const pitching = player.stats?.pitching;
            if (hasPitchingActivity(pitching)) {
              await upsertRow({
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
                rawPayload: player,
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

    const summary = {
      ok: true,
      date,
      gamesChecked: games.length,
      mappedPlayersSeen,
      rowsUpserted,
      warnings,
      durationMs: Date.now() - startedAt,
    };

    console.log("[mlb-live-gamelogs]", JSON.stringify(summary));
    return NextResponse.json(summary, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[mlb-live-gamelogs] failed", { message });
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
