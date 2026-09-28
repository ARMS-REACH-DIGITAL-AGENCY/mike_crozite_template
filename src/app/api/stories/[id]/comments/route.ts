// src/app/api/stories/[id]/comments/route.ts
//   GET  - a story's comments, oldest first (public: names only)
//   POST - add a comment (signed-in fans)
import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { identifyFan, viewerUid } from '@/lib/fanIdentity';
import { COMMENT_MAX, fail, loadLiveStory, logFanActivity, parseStoryId } from '@/lib/storySocial';

export const runtime = 'nodejs';

type Params = { params: Promise<{ id: string }> };

type CommentRow = { id: string; body: string; created_at: string; firebase_uid: string; first_name: string | null; last_name: string | null };

function toComment(r: CommentRow, viewer: string | null, storyOwner: string | null) {
  return {
    id: r.id,
    text: r.body,
    createdAt: r.created_at,
    author: [r.first_name, r.last_name].map((v) => String(v || '').trim()).filter(Boolean).join(' ') || 'A YAT?STATS fan',
    isMine: Boolean(viewer && r.firebase_uid === viewer),
    // The story's poster can remove comments on their own story.
    canDelete: Boolean(viewer && (r.firebase_uid === viewer || storyOwner === viewer)),
  };
}

const SELECT_COMMENTS = `
  SELECT c.id::text AS id, c.body, c.created_at, c.firebase_uid, up.first_name, up.last_name
    FROM player_moment_comments c
    LEFT JOIN LATERAL (SELECT first_name, last_name FROM user_profiles WHERE firebase_uid = c.firebase_uid LIMIT 1) up ON true`;

export async function GET(req: NextRequest, { params }: Params) {
  const id = parseStoryId((await params).id);
  if (!id) return fail('Story not found.', 404);
  try {
    const story = await loadLiveStory(id);
    if (!story) return fail('Story not found.', 404);
    const { rows } = await query<CommentRow>(`${SELECT_COMMENTS} WHERE c.moment_id = $1 AND c.status = 'visible' ORDER BY c.created_at, c.id LIMIT 500`, [id]);
    const viewer = viewerUid(req);
    return NextResponse.json({ comments: rows.map((r) => toComment(r, viewer, story.ownerUid)) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('[stories] comments GET failed', error);
    return fail('Comments could not load.', 500);
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  const id = parseStoryId((await params).id);
  if (!id) return fail('Story not found.', 404);
  const fan = await identifyFan(req);
  if (!fan) return fail('Sign in to comment.', 401);

  const body = (await req.json().catch(() => ({}))) as { text?: unknown };
  const text = String(body.text ?? '').trim();
  if (!text) return fail('Write a comment first.');
  if (text.length > COMMENT_MAX) return fail(`Please keep comments under ${COMMENT_MAX.toLocaleString()} characters.`);

  try {
    const story = await loadLiveStory(id);
    if (!story) return fail('Story not found.', 404);
    const { rows } = await query<CommentRow>(
      `WITH c AS (
         INSERT INTO player_moment_comments (moment_id, firebase_uid, body) VALUES ($1, $2, $3)
         RETURNING id, body, created_at, firebase_uid
       )
       SELECT c.id::text AS id, c.body, c.created_at, c.firebase_uid, up.first_name, up.last_name
         FROM c LEFT JOIN LATERAL (SELECT first_name, last_name FROM user_profiles WHERE firebase_uid = c.firebase_uid LIMIT 1) up ON true`,
      [id, fan.uid, text]
    );
    await logFanActivity(fan.uid, 'story_commented', story, { commentId: rows[0]?.id });
    return NextResponse.json({ comment: toComment(rows[0], fan.uid, story.ownerUid) }, { status: 201 });
  } catch (error) {
    console.error('[stories] comment POST failed', error);
    return fail('Your comment could not be posted. Please try again.', 500);
  }
}
