// src/app/api/stories/[id]/like/route.ts
//   POST - like a story, or take the like back if it's already liked
import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { identifyFan } from '@/lib/fanIdentity';
import { fail, loadLiveStory, logFanActivity, parseStoryId } from '@/lib/storySocial';

export const runtime = 'nodejs';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const id = parseStoryId((await params).id);
  if (!id) return fail('Story not found.', 404);
  const fan = await identifyFan(req);
  if (!fan) return fail('Sign in to like stories.', 401);

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
      [id, fan.uid]
    );
    const liked = Boolean(rows[0]?.liked);
    await logFanActivity(fan.uid, liked ? 'story_liked' : 'story_unliked', story);
    return NextResponse.json({ liked, likeCount: rows[0]?.like_count ?? 0 });
  } catch (error) {
    console.error('[stories] like failed', error);
    return fail('That like did not go through. Please try again.', 500);
  }
}
