// src/app/api/stories/[id]/route.ts
//   PATCH  - the fan who posted a story edits its text or date
//   DELETE - the fan who posted it takes it down (hidden, not erased:
//            status 'deleted'; its photos stay in S3)
import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { identifyFan } from '@/lib/fanIdentity';
import { STORY_MAX_TEXT } from '@/lib/stories';
import { fail, loadLiveStory, logFanActivity, parseStoryId } from '@/lib/storySocial';

export const runtime = 'nodejs';

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const id = parseStoryId((await params).id);
  if (!id) return fail('Story not found.', 404);
  const fan = await identifyFan(req);
  if (!fan) return fail('Please sign in to edit your story.', 401);

  const body = (await req.json().catch(() => ({}))) as { story?: unknown; year?: unknown; month?: unknown };
  const story = String(body.story ?? '').trim();
  const year = Number(body.year);
  const month = Number(body.month);
  const thisYear = new Date().getFullYear();
  if (!story) return fail('Tell the story behind this photo.');
  if (story.length > STORY_MAX_TEXT) return fail(`Please keep the story under ${STORY_MAX_TEXT.toLocaleString()} characters.`);
  if (!Number.isInteger(year) || year < 1950 || year > thisYear + 1) return fail('Please choose the year.');
  if (!Number.isInteger(month) || month < 1 || month > 12) return fail('Please choose the month.');

  try {
    const existing = await loadLiveStory(id);
    if (!existing) return fail('Story not found.', 404);
    if (existing.ownerUid !== fan.uid) return fail('Only the fan who posted this story can edit it.', 403);

    const takenDate = `${year}-${String(month).padStart(2, '0')}-01`;
    await query(
      `UPDATE player_moment_submissions
          SET caption = $2, photo_taken_date = $3::date, photo_taken_year = $4, sort_date = $3::date
        WHERE id = $1 AND contributor_firebase_uid = $5 AND status = 'live'`,
      [id, story, takenDate, year, fan.uid]
    );
    await logFanActivity(fan.uid, 'story_edited', existing);
    return NextResponse.json({ id, story, date: takenDate, year });
  } catch (error) {
    console.error('[stories] PATCH failed', error);
    return fail('Your changes could not be saved. Please try again.', 500);
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const id = parseStoryId((await params).id);
  if (!id) return fail('Story not found.', 404);
  const fan = await identifyFan(req);
  if (!fan) return fail('Please sign in to delete your story.', 401);

  try {
    const existing = await loadLiveStory(id);
    if (!existing) return fail('Story not found.', 404);
    if (existing.ownerUid !== fan.uid) return fail('Only the fan who posted this story can delete it.', 403);

    await query(
      `UPDATE player_moment_submissions SET status = 'deleted'
        WHERE id = $1 AND contributor_firebase_uid = $2 AND status = 'live'`,
      [id, fan.uid]
    );
    await logFanActivity(fan.uid, 'story_deleted', existing);
    return NextResponse.json({ id, deleted: true });
  } catch (error) {
    console.error('[stories] DELETE failed', error);
    return fail('The story could not be deleted. Please try again.', 500);
  }
}
