// src/app/api/stories/[id]/like/route.ts
//   POST - like a story, or take the like back if it's already liked.
//          No account needed: signed-in fans like as themselves; anyone
//          else as a visitor (lib/fanIdentity.ts likerKey / VISITOR_COOKIE).
import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { query } from '@/lib/db';
import { VISITOR_COOKIE, identifyFan, likerKey } from '@/lib/fanIdentity';
import { fail, loadLiveStory, logFanActivity, parseStoryId } from '@/lib/storySocial';

export const runtime = 'nodejs';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const id = parseStoryId((await params).id);
  if (!id) return fail('Story not found.', 404);
  const fan = await identifyFan(req);
  let key = likerKey(req, fan?.uid);
  let newVisitor: string | null = null;
  if (!key) {
    newVisitor = randomUUID();
    key = `anon:${newVisitor}`;
  }

  try {
    const story = await loadLiveStory(id);
    if (!story) return fail('Story not found.', 404);

    // Remove the like if there is one, otherwise add it - in one statement.
    const { rows } = await query<{ liked: boolean; like_count: number }>(
      `WITH removed AS (
         DELETE FROM player_moment_likes WHERE moment_id = $1 AND firebase_uid = $2 RETURNING 1
       ), added AS (
         INSERT INTO player_moment_likes (moment_id, firebase_uid)
         SELECT $1, $2 WHERE NOT EXISTS (SELECT 1 FROM removed)
         ON CONFLICT DO NOTHING
         RETURNING 1
       )
       SELECT EXISTS (SELECT 1 FROM added) AS liked,
              ((SELECT count(*) FROM player_moment_likes WHERE moment_id = $1)
                - (SELECT count(*) FROM removed) + (SELECT count(*) FROM added))::int AS like_count`,
      [id, key]
    );
    const liked = Boolean(rows[0]?.liked);
    if (fan) await logFanActivity(fan.uid, liked ? 'story_liked' : 'story_unliked', story);

    const response = NextResponse.json({ liked, likeCount: rows[0]?.like_count ?? 0 });
    if (newVisitor) {
      response.cookies.set({
        name: VISITOR_COOKIE,
        value: newVisitor,
        path: '/',
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 365,
      });
    }
    return response;
  } catch (error) {
    console.error('[stories] like failed', error);
    return fail('That like did not go through. Please try again.', 500);
  }
}
