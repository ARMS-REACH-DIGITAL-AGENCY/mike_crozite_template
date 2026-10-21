// Nightly: load the NAIA, CCCAA and NWAC league schedule feeds into
// college_feed_games, and note every team name they use in
// college_feed_teams (names only; Pete approves which teamid each one is).
import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { COLLEGE_FEEDS, collegeSeasonKey, parseCollegeFeed, type FeedGame } from '@/lib/collegeFeedSchedules';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const USER_AGENT = 'Mozilla/5.0 (compatible; YATStatsBot/1.0; +https://yatstats.com)';
const BATCH = 400;

async function upsertGames(source: string, season: string, games: FeedGame[]) {
  for (let i = 0; i < games.length; i += BATCH) {
    const rows = games.slice(i, i + BATCH);
    await query(
      `INSERT INTO public.college_feed_games
         (source, season, uid, starts_at, game_date, time_tba, away_name, home_name, neutral, location, result, notes, cancelled, feed_modified_at, fetched_at)
       SELECT $1, $2, g.uid, g.starts_at, g.game_date, g.time_tba, g.away_name, g.home_name, g.neutral, g.location, g.result, g.notes, g.cancelled, g.feed_modified_at, now()
         FROM jsonb_to_recordset($3::jsonb) AS g(uid text, starts_at timestamptz, game_date date, time_tba boolean, away_name text, home_name text,
              neutral boolean, location text, result text, notes text, cancelled boolean, feed_modified_at timestamptz)
       ON CONFLICT (source, uid) DO UPDATE SET
         season = EXCLUDED.season, starts_at = EXCLUDED.starts_at, game_date = EXCLUDED.game_date, time_tba = EXCLUDED.time_tba,
         away_name = EXCLUDED.away_name, home_name = EXCLUDED.home_name, neutral = EXCLUDED.neutral, location = EXCLUDED.location,
         result = EXCLUDED.result, notes = EXCLUDED.notes, cancelled = EXCLUDED.cancelled,
         feed_modified_at = EXCLUDED.feed_modified_at, fetched_at = now()`,
      [source, season, JSON.stringify(rows.map((g) => ({
        uid: g.uid, starts_at: g.startsAt, game_date: g.gameDate, time_tba: g.timeTba, away_name: g.awayName, home_name: g.homeName,
        neutral: g.neutral, location: g.location, result: g.result, notes: g.notes, cancelled: g.cancelled, feed_modified_at: g.modifiedAt,
      })))],
    );
  }
}

async function noteTeamNames(source: string, games: FeedGame[]) {
  const names = [...new Set(games.flatMap((g) => [g.awayName, g.homeName]))];
  if (!names.length) return;
  // Adds new names and refreshes last_seen_at; never touches teamid.
  await query(
    `INSERT INTO public.college_feed_teams (source, feed_name)
     SELECT $1, n FROM unnest($2::text[]) AS n
     ON CONFLICT (source, feed_name) DO UPDATE SET last_seen_at = now()`,
    [source, names],
  );
}

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== 'Bearer ' + secret)
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  const season = collegeSeasonKey();
  const results = [];
  for (const feed of COLLEGE_FEEDS) {
    const url = feed.url(season);
    try {
      const res = await fetch(url, { headers: { 'user-agent': USER_AGENT, accept: 'text/calendar' }, cache: 'no-store', signal: AbortSignal.timeout(60000) });
      if (!res.ok) { results.push({ source: feed.source, season, status: res.status }); continue; }
      const games = parseCollegeFeed(await res.text(), feed.timeZone);
      await upsertGames(feed.source, season, games);
      await noteTeamNames(feed.source, games);
      results.push({ source: feed.source, season, games: games.length });
    } catch (error) {
      results.push({ source: feed.source, season, error: String(error).slice(0, 160) });
    }
  }
  console.log('[college-feed-schedules]', JSON.stringify(results));
  return NextResponse.json({ ok: true, results });
}
