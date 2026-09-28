// src/app/api/stories/route.ts
// Fan Stories.
//   GET  /api/stories?playerId=  - a player's live stories, newest first
//                                  (public fields only: never emails or phones)
//   POST /api/stories            - post a story (multipart form, signed-in fans)
//
// Tables are created by migration, never here: the site's database login
// can't create tables, and trying to on every request is what broke the
// old /api/player-moments.
import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { query } from '@/lib/db';
import { AUTH_PASS_COOKIE, readAuthPass } from '@/lib/authPass';
import { getUserProfile } from '@/lib/userProfile';
import {
  NotAnImageError,
  STORY_DAILY_LIMIT,
  STORY_MAX_PHOTO_BYTES,
  STORY_MAX_PHOTOS,
  STORY_MAX_TAGS,
  STORY_MAX_TEXT,
  storeStoryPhoto,
  storyAssetUrl,
  verifyFirebaseIdToken,
} from '@/lib/stories';

export const runtime = 'nodejs';
export const maxDuration = 60;

type StoryRow = {
  id: string;
  story: string | null;
  contributor_name: string | null;
  photo_taken_date: string | null;
  photo_taken_year: number | null;
  created_at: string;
  posted_on_playerid: string;
  photos: { web: string; thumb: string; full: string; width: number | null; height: number | null }[] | null;
  players: { playerid: string; hsid: string | null; first_name: string | null; last_name: string | null; is_primary: boolean }[] | null;
  like_count: number;
  comment_count: number;
};

export async function GET(req: NextRequest) {
  const playerId = String(req.nextUrl.searchParams.get('playerId') || '').trim();
  if (!playerId) return NextResponse.json({ error: 'playerId is required' }, { status: 400 });

  try {
    const { rows } = await query<StoryRow>(
      `SELECT m.id::text AS id,
              m.caption AS story,
              m.contributor_name,
              m.photo_taken_date::text AS photo_taken_date,
              m.photo_taken_year,
              m.created_at,
              m.playerid AS posted_on_playerid,
              (SELECT json_agg(json_build_object('web', p.web_s3_key, 'thumb', p.thumb_s3_key, 'full', p.s3_key,
                                                 'width', p.width, 'height', p.height) ORDER BY p.sort_order, p.id)
                 FROM player_moment_photos p WHERE p.moment_id = m.id) AS photos,
              (SELECT json_agg(json_build_object('playerid', mp.playerid, 'hsid', f.hsid::text,
                                                 'first_name', f.first_name, 'last_name', f.last_name,
                                                 'is_primary', mp.is_primary) ORDER BY mp.is_primary DESC, f.last_name)
                 FROM player_moment_players mp
                 LEFT JOIN flip_card_front_stage f ON f.playerid::text = mp.playerid
                WHERE mp.moment_id = m.id) AS players,
              (SELECT count(*)::int FROM player_moment_likes l WHERE l.moment_id = m.id) AS like_count,
              (SELECT count(*)::int FROM player_moment_comments c WHERE c.moment_id = m.id AND c.status = 'visible') AS comment_count
         FROM player_moment_submissions m
         JOIN player_moment_players me ON me.moment_id = m.id AND me.playerid = $1
        WHERE m.status = 'live'
          AND COALESCE(m.is_private, false) = false
        ORDER BY m.created_at DESC, m.id DESC
        LIMIT 100`,
      [playerId]
    );

    const stories = rows.map((r) => ({
      id: r.id,
      story: r.story || '',
      author: r.contributor_name || 'A YAT?STATS fan',
      date: r.photo_taken_date,
      year: r.photo_taken_year,
      postedAt: r.created_at,
      postedOnPlayerId: r.posted_on_playerid,
      photos: (r.photos || []).map((p) => ({
        web: storyAssetUrl(p.web),
        thumb: storyAssetUrl(p.thumb),
        full: storyAssetUrl(p.full),
        width: p.width,
        height: p.height,
      })),
      players: (r.players || []).map((p) => ({
        playerId: p.playerid,
        hsid: p.hsid,
        name: [p.first_name, p.last_name].filter(Boolean).join(' ').trim(),
        isPrimary: p.is_primary,
      })),
      likeCount: r.like_count,
      commentCount: r.comment_count,
    }));

    return NextResponse.json({ stories }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('[stories] GET failed', error);
    return NextResponse.json({ error: 'Could not load stories.' }, { status: 500 });
  }
}

function fail(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(req: NextRequest) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail('The upload was too large or incomplete. Try fewer or smaller photos.', 413);
  }

  // 1. Who is posting: a Firebase ID token from this page, or else the
  //    signed pass set at sign-in (covers a fan signed in on another
  //    yatstats.com site, where this page has no Firebase user).
  const idToken = String(form.get('idToken') || '');
  let identity = idToken ? await verifyFirebaseIdToken(idToken) : null;
  if (!identity) {
    const passUid = readAuthPass(req.cookies.get(AUTH_PASS_COOKIE)?.value);
    if (passUid) identity = { uid: passUid, email: '' };
  }
  if (!identity) return fail('Please sign in again to post a story.', 401);

  const profile = await getUserProfile(identity.uid).catch(() => null);
  const authorName =
    [profile?.first_name, profile?.last_name].map((v) => String(v || '').trim()).filter(Boolean).join(' ') ||
    'A YAT?STATS fan';

  // 2. What they're posting.
  const playerId = String(form.get('playerId') || '').trim();
  const year = Number(form.get('year'));
  const month = Number(form.get('month'));
  const story = String(form.get('story') || '').trim();
  const pageUrl = String(form.get('pageUrl') || '').slice(0, 500) || null;
  let tagged: string[] = [];
  try {
    const parsed = JSON.parse(String(form.get('tagged') || '[]'));
    if (Array.isArray(parsed)) tagged = parsed.map((v) => String(v).trim()).filter(Boolean);
  } catch {}
  const photos = form.getAll('photos').filter((f): f is File => f instanceof File && f.size > 0);

  const thisYear = new Date().getFullYear();
  if (!playerId) return fail('Missing player.');
  if (!Number.isInteger(year) || year < 1950 || year > thisYear + 1) return fail('Please choose the year.');
  if (!Number.isInteger(month) || month < 1 || month > 12) return fail('Please choose the month.');
  if (!story) return fail('Tell the story behind this photo.');
  if (story.length > STORY_MAX_TEXT) return fail(`Please keep the story under ${STORY_MAX_TEXT.toLocaleString()} characters.`);
  if (photos.length === 0) return fail('Add at least one photo.');
  if (photos.length > STORY_MAX_PHOTOS) return fail(`Up to ${STORY_MAX_PHOTOS} photos per story.`);
  if (photos.some((f) => f.size > STORY_MAX_PHOTO_BYTES)) return fail('One of the photos is too large. Please choose a smaller one.', 413);

  try {
    // 3. The player, and every tagged player, must exist.
    const playerIds = Array.from(new Set([playerId, ...tagged])).slice(0, STORY_MAX_TAGS + 1);
    const { rows: known } = await query<{ playerid: string; hsid: string | null; name: string }>(
      `SELECT DISTINCT ON (playerid::text) playerid::text AS playerid, hsid::text AS hsid,
              TRIM(COALESCE(first_name, '') || ' ' || COALESCE(last_name, '')) AS name
         FROM flip_card_front_stage WHERE playerid::text = ANY($1::text[])`,
      [playerIds]
    );
    const byId = new Map(known.map((r) => [r.playerid, r]));
    const primary = byId.get(playerId);
    if (!primary) return fail('That player was not found.', 404);
    const taggedIds = playerIds.filter((id) => id !== playerId && byId.has(id));

    // 4. A daily limit per fan.
    const { rows: recent } = await query<{ n: number }>(
      `SELECT count(*)::int AS n FROM player_moment_submissions
        WHERE contributor_firebase_uid = $1 AND created_at > now() - interval '1 day'`,
      [identity.uid]
    );
    if ((recent[0]?.n || 0) >= STORY_DAILY_LIMIT) return fail('You have posted a lot of stories today. Please try again tomorrow.', 429);

    // 5. Photos to S3 (upright, no metadata, three sizes).
    const folder = randomUUID();
    const stored = [];
    for (let i = 0; i < photos.length; i++) {
      stored.push(await storeStoryPhoto(folder, i, Buffer.from(await photos[i].arrayBuffer())));
    }

    // 6. The story, its photos, its players and the fan's activity - one
    //    statement, so it all saves or none of it does.
    const takenDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const { rows } = await query<{ id: string }>(
      `WITH story AS (
         INSERT INTO player_moment_submissions (
           playerid, hsid, stage, caption, contributor_name, status,
           contributor_email, contributor_firebase_uid, contributor_role, contributor_plan,
           contributor_home_hsid, contributor_home_school_name, player_name, page_url,
           photo_taken_date, photo_taken_year, sort_date, visibility, is_private,
           ghl_contact_id, arms_sync_status
         ) VALUES (
           $1, $2, 'Story', $3, $4, 'live',
           $5, $6, $7, $8,
           $9, $10, $11, $12,
           $13::date, $14, $13::date, 'public', false,
           $15, 'not_sent'
         ) RETURNING id
       ), photos AS (
         INSERT INTO player_moment_photos (moment_id, sort_order, s3_key, web_s3_key, thumb_s3_key, width, height, mime_type, file_size_bytes)
         SELECT story.id, p.ord, p.s3_key, p.web_s3_key, p.thumb_s3_key, p.width, p.height, p.mime_type, p.file_size_bytes
           FROM story, jsonb_to_recordset($16::jsonb) AS p(ord int, s3_key text, web_s3_key text, thumb_s3_key text,
                                                           width int, height int, mime_type text, file_size_bytes bigint)
       ), players AS (
         INSERT INTO player_moment_players (moment_id, playerid, is_primary, tagged_by_firebase_uid)
         SELECT story.id, t.playerid, t.playerid = $1, CASE WHEN t.playerid = $1 THEN NULL ELSE $6 END
           FROM story, unnest($17::text[]) AS t(playerid)
       ), activity AS (
         INSERT INTO fan_activity (firebase_uid, arms_contact_id, action, playerid, hsid, moment_id, page_url, details)
         SELECT $6, $15, a.action, a.playerid, $2, story.id, $12, a.details
           FROM story, (
             SELECT 'story_posted'::text AS action, $1::text AS playerid,
                    jsonb_build_object('photos', $18::int, 'tagged', to_jsonb($19::text[])) AS details
             UNION ALL
             SELECT 'player_tagged', t, NULL FROM unnest($19::text[]) AS t
           ) a
       )
       SELECT id::text AS id FROM story`,
      [
        playerId,
        primary.hsid,
        story,
        authorName,
        identity.email || profile?.email || null,
        identity.uid,
        profile?.role || 'fan',
        profile?.plan || 'fan',
        profile?.home_hsid || null,
        profile?.home_school_name || null,
        primary.name || null,
        pageUrl,
        takenDate,
        year,
        profile?.arms_contact_id || null,
        JSON.stringify(stored.map((p, i) => ({ ord: i, ...p }))),
        [playerId, ...taggedIds],
        stored.length,
        taggedIds,
      ]
    );

    return NextResponse.json({ id: rows[0]?.id }, { status: 201 });
  } catch (error) {
    if (error instanceof NotAnImageError) return fail(error.message);
    console.error('[stories] POST failed', error);
    return fail('Your story could not be posted. Please try again.', 500);
  }
}
