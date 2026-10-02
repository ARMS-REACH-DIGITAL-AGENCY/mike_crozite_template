// Yadi clubhouse assistant: playoff roster lookup.
// Finds all YAT?STATS alumni currently on the 8 MLB playoff teams.

import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const preview = searchParams.get('preview') === '1';

    // Find teams with games on/after Sep 27, 2026 (playoff start).
    // These are the teams still playing.
    const { rows: teams } = await query<{ team_name: string }>(`
      SELECT DISTINCT team_name
      FROM public.player_game_logs
      WHERE game_date >= '2026-09-27'::date
        AND team_name IS NOT NULL
      ORDER BY team_name
    `);

    // For each playoff team, find YAT?STATS alumni on their roster.
    const result: Array<{ team: string; players: Array<{ name: string; hsid: string; hs_name?: string }> }> = [];

    for (const t of teams) {
      const { rows: players } = await query<{ display_name: string; hsid: string }>(`
        SELECT DISTINCT f.display_name, f.hsid::text AS hsid
        FROM public.flip_card_front_stage f
        JOIN public.player_game_logs gl ON gl.playerid::text = f.playerid::text
        WHERE gl.team_name = $1
          AND gl.game_date >= '2026-09-27'::date
        ORDER BY f.display_name
      `, [t.team_name]);

      if (players.length > 0) {
        result.push({
          team: t.team_name,
          players: players.map(p => ({ name: p.display_name, hsid: p.hsid })),
        });
      }
    }

    return NextResponse.json({
      playoff_teams: result.length,
      teams: result,
    }, {
      headers: { 'Cache-Control': 'public, max-age=300' },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: 'failed', detail: msg }, { status: 500 });
  }
}
