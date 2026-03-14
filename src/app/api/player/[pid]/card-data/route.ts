// src/app/api/player/[pid]/card-data/route.ts
// FIXED: pid is now parsed to integer BEFORE any DB call
// This stops the "invalid input syntax for type integer" crashes that killed the entire client bundle.

import { NextRequest, NextResponse } from 'next/server';
import {
  getResolvedCurrentTeam,
  getPlayerBattingGameLog,
  getPlayerPitchingGameLog,
  getTeamSchedule,
  getNewsByPlayer,
} from '@/lib/db';

export const runtime = 'nodejs';

function corsHeaders(req: NextRequest) {
  const origin = req.headers.get('origin') || '*';
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
  };
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req) });
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ pid: string }> }
) {
  const cors = corsHeaders(req);
  const { pid } = await context.params;

  // ←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←
  // THE FIX: convert to integer immediately
  const playerId = parseInt(pid, 10);
  if (isNaN(playerId) || playerId < 1) {
    return NextResponse.json({ error: 'Invalid pid' }, { status: 400, headers: cors });
  }
  // ←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←

  try {
    const [currentTeam, newsRows] = await Promise.all([
      getResolvedCurrentTeam(playerId),        // ← now integer
      getNewsByPlayer(playerId, 4),            // ← now integer
    ]);

    let lastGames: any[] = [];
    let nextGame: any = null;

    if (currentTeam?.teamid) {
      const tid = String(currentTeam.teamid);

      const [battingLog, pitchingLog, schedule] = await Promise.all([
        getPlayerBattingGameLog(playerId, tid),   // ← now integer
        getPlayerPitchingGameLog(playerId, tid),  // ← now integer
        getTeamSchedule(tid, 50),
      ]);

      const useLog = pitchingLog.length > battingLog.length ? pitchingLog : battingLog;

      const played = useLog
        .filter((g: any) => {
          const s = String(g.status || g.game_status || '').toUpperCase();
          return s === 'FINAL' || s === 'F' || (!s && g.game_date);
        })
        .sort((a: any, b: any) => (a.game_date < b.game_date ? 1 : -1));
      lastGames = played.slice(0, 3);

      const today = new Date().toISOString().slice(0, 10);
      nextGame =
        schedule.find((g: any) => {
          const s = String(g.status || g.game_status || '').toUpperCase();
          const d = String(g.game_date || '').slice(0, 10);
          return d >= today && (s === 'SCHEDULED' || s === '' || !g.status);
        }) || null;
    }

    const news = newsRows.map((r: any) => ({
      uuid: r.uuid,
      title: r.title,
      imageUrl: r.image_url || null,
      url: r.url,
      source: r.source,
      publishedAt: r.published_at,
    }));

    return NextResponse.json(
      { lastGames, nextGame, teamName: currentTeam?.team_name || null, news },
      {
        status: 200,
        headers: { ...cors, 'Cache-Control': 'public, max-age=120, s-maxage=120' },
      }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('card-data API error:', message);
    return NextResponse.json({ error: 'Server error', message }, { status: 500, headers: cors });
  }
}
