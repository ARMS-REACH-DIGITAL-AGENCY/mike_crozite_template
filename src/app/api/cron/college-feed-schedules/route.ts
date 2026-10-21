// Nightly: load the NAIA, CCCAA and NWAC league schedule feeds and College
// Baseball Insider's NCAA-D1 team posts into college_feed_games, and note
// every team name they use in college_feed_teams (names only; Pete approves
// which teamid each one is).
import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { CBI, COLLEGE_FEEDS, collegeSeasonKey, collegeSeasonYear, mergeCbiGames, parseCbiPost, parseCollegeFeed, type FeedGame } from '@/lib/collegeFeedSchedules';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const USER_AGENT = 'Mozilla/5.0 (compatible; YATStatsBot/1.0; +https://yatstats.com)';
const BATCH = 400;

async function upsertGames(source: string, season: string, games: FeedGame[]) {
  // One row per uid: one INSERT can't update the same row twice.
  const unique = [...new Map(games.map((g) => [g.uid, g])).values()];
  for (let i = 0; i < unique.length; i += BATCH) {
    const rows = unique.slice(i, i + BATCH);
    await query(
      `INSERT INTO public.college_feed_games
         (source, season, uid, starts_at, game_date, time_tba, local_time, away_name, home_name, neutral, location, result, notes, cancelled, feed_modified_at, fetched_at, listed)
       SELECT $1, $2, g.uid, g.starts_at, g.game_date, g.time_tba, g.local_time, g.away_name, g.home_name, g.neutral, g.location, g.result, g.notes, g.cancelled, g.feed_modified_at, now(), true
         FROM jsonb_to_recordset($3::jsonb) AS g(uid text, starts_at timestamptz, game_date date, time_tba boolean, local_time text, away_name text, home_name text,
              neutral boolean, location text, result text, notes text, cancelled boolean, feed_modified_at timestamptz)
       ON CONFLICT (source, uid) DO UPDATE SET
         season = EXCLUDED.season, starts_at = EXCLUDED.starts_at, game_date = EXCLUDED.game_date, time_tba = EXCLUDED.time_tba,
         local_time = EXCLUDED.local_time, away_name = EXCLUDED.away_name, home_name = EXCLUDED.home_name, neutral = EXCLUDED.neutral,
         location = EXCLUDED.location, result = EXCLUDED.result, notes = EXCLUDED.notes, cancelled = EXCLUDED.cancelled,
         feed_modified_at = EXCLUDED.feed_modified_at, fetched_at = now(), listed = true`,
      [source, season, JSON.stringify(rows.map((g) => ({
        uid: g.uid, starts_at: g.startsAt, game_date: g.gameDate, time_tba: g.timeTba, local_time: g.localTime, away_name: g.awayName,
        home_name: g.homeName, neutral: g.neutral, location: g.location, result: g.result, notes: g.notes, cancelled: g.cancelled,
        feed_modified_at: g.modifiedAt,
      })))],
    );
  }
  return unique.length;
}

// After a complete load: the source's games this run didn't see are no longer listed.
async function markUnlisted(source: string, season: string, since: Date) {
  const res = await query(
    `UPDATE public.college_feed_games SET listed = false
      WHERE source = $1 AND season = $2 AND listed AND fetched_at < $3`,
    [source, season, since],
  );
  return res.rowCount ?? 0;
}

async function dbNow(): Promise<Date> {
  const res = await query<{ now: Date }>('SELECT now() AS now');
  return res.rows[0].now;
}

type CbiPost = { slug: string; modified_gmt?: string; content?: { rendered?: string } };

// Every team post for the season, across the WordPress API's pages.
async function fetchCbiPosts(seasonYear: number): Promise<CbiPost[]> {
  const posts: CbiPost[] = [];
  for (let page = 1; page <= 10; page++) {
    const res = await fetch(CBI.postsUrl(seasonYear, page), { headers: { 'user-agent': USER_AGENT, accept: 'application/json' }, cache: 'no-store', signal: AbortSignal.timeout(60000) });
    if (!res.ok) throw new Error(`HTTP ${res.status} on page ${page}`);
    const batch = (await res.json()) as CbiPost[];
    posts.push(...batch);
    if (page >= Number(res.headers.get('x-wp-totalpages') || 1) || batch.length < 100) break;
  }
  return posts.filter((p) => CBI.isTeamPost(p.slug, seasonYear));
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
      const since = await dbNow();
      const loaded = await upsertGames(feed.source, season, games);
      await noteTeamNames(feed.source, games);
      const unlisted = loaded ? await markUnlisted(feed.source, season, since) : 0;
      results.push({ source: feed.source, season, games: loaded, unlisted });
    } catch (error) {
      results.push({ source: feed.source, season, error: String(error).slice(0, 160) });
    }
  }
  try {
    const seasonYear = collegeSeasonYear(season);
    const posts = await fetchCbiPosts(seasonYear);
    let skipped = 0;
    const games = mergeCbiGames(posts.flatMap((p) => {
      const parsed = parseCbiPost(p.content?.rendered || '', seasonYear, p.modified_gmt ? `${p.modified_gmt}Z` : null);
      skipped += parsed.skipped;
      return parsed.games;
    }));
    const since = await dbNow();
    const loaded = await upsertGames(CBI.source, season, games);
    await noteTeamNames(CBI.source, games);
    const unlisted = loaded ? await markUnlisted(CBI.source, season, since) : 0;
    results.push({ source: CBI.source, season, posts: posts.length, games: loaded, skippedLines: skipped, unlisted });
  } catch (error) {
    results.push({ source: CBI.source, season, error: String(error).slice(0, 160) });
  }
  console.log('[college-feed-schedules]', JSON.stringify(results));
  return NextResponse.json({ ok: true, results });
}
