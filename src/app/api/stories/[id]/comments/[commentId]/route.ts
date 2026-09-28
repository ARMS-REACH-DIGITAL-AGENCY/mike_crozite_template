// src/app/api/stories/[id]/comments/[commentId]/route.ts
//   DELETE - the commenter, or the story's poster, removes a comment
//            (hidden: status 'deleted')
import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { identifyFan } from '@/lib/fanIdentity';
import { fail, loadLiveStory, logFanActivity, parseStoryId } from '@/lib/storySocial';

export const runtime = 'nodejs';

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string; commentId: string }> }) {
  const { id: rawId, commentId: rawCommentId } = await params;
  const id = parseStoryId(rawId);
  const commentId = parseStoryId(rawCommentId);
  if (!id || !commentId) return fail('Comment not found.', 404);
  const fan = await identifyFan(req);
  if (!fan) return fail('Please sign in.', 401);

  try {
    const story = await loadLiveStory(id);
    if (!story) return fail('Story not found.', 404);
    const { rowCount } = await query(
      `UPDATE player_moment_comments SET status = 'deleted', updated_at = now()
        WHERE id = $1 AND moment_id = $2 AND status = 'visible' AND (firebase_uid = $3 OR $4)`,
      [commentId, id, fan.uid, story.ownerUid === fan.uid]
    );
    if (!rowCount) return fail('That comment can’t be removed.', 403);
    await logFanActivity(fan.uid, 'comment_deleted', story, { commentId });
    return NextResponse.json({ id: commentId, deleted: true });
  } catch (error) {
    console.error('[stories] comment DELETE failed', error);
    return fail('The comment could not be removed. Please try again.', 500);
  }
}
