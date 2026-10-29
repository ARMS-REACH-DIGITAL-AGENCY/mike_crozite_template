// src/app/api/stories/[id]/route.ts
//   PATCH  - the fan who posted a story edits its text, date and tagged players
//   DELETE - the fan who posted it takes it down (hidden, not erased:
//            status 'deleted'; its photos stay in S3)
import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { identifyFan } from '@/lib/fanIdentity';
import { STORY_MAX_TAGS, STORY_MAX_TEXT } from '@/lib/stories';
import { fail, loadLiveStory, logFanActivity, parseStoryId } from '@/lib/storySocial';

export const runtime = 'nodejs';

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const id = parseStoryId((await params).id);
  if (!id) return fail('Story not found.', 404);
  const fan = await identifyFan(req);
  if (!fan) return fail('Please sign in to edit your story.', 401);

  const parsed = await req.json().catch(() => null);
  const body = (parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}) as {
    story?: unknown; year?: unknown; month?: unknown; tagged?: unknown;
  };
  const story = String(body.story ?? '').trim();
  const year = Number(body.year);
  const month = Number(body.month);
  const thisYear = new Date().getFullYear();
  if (!story) return fail('Tell the story behind this photo.');
  if (story.length > STORY_MAX_TEXT) return fail('Please keep the story under ' + STORY_MAX_TEXT.toLocaleString() + ' characters.');
  if (!Number.isInteger(year) || year < 1950 || year > thisYear + 1) return fail('Please choose the year.');
  if (!Number.isInteger(month) || month < 1 || month > 12) return fail('Please choose the month.');

  // Older clients still edit only text/date. Never clear their existing tags
  // unless the edit request explicitly includes a "tagged" array.
  const updateTags = Object.prototype.hasOwnProperty.call(body, 'tagged');
  if (updateTags && (!Array.isArray(body.tagged) || body.tagged.some((value) => typeof value !== 'string' || !value.trim()))) {
    return fail('Choose players from the player search to tag them.');
  }

  try {
    const existing = await loadLiveStory(id);
    if (!existing) return fail('Story not found.', 404);
    if (existing.ownerUid !== fan.uid) return fail('Only the fan who posted this story can edit it.', 403);

    let taggedIds: string[] | null = null;
    let beforeTags: string[] = [];
    if (updateTags) {
      taggedIds = Array.from(new Set((body.tagged as string[]).map((playerId) => playerId.trim())))
        .filter((playerId) => playerId !== existing.playerId);
      if (taggedIds.length > STORY_MAX_TAGS) return fail('Up to ' + STORY_MAX_TAGS + ' players can be tagged in a story.');

      const { rows: previous } = await query<{ playerid: string }>(
        'SELECT playerid FROM player_moment_players WHERE moment_id = $1 AND is_primary = false AND playerid <> $2',
        [id, existing.playerId]
      );
      beforeTags = previous.map((row) => row.playerid);
      const existingIds = new Set(beforeTags);
      // Existing tags may be historical players missing from today's stage.
      // Keep them; only newly added players must resolve to a real player.
      const additions = taggedIds.filter((playerId) => !existingIds.has(playerId));
      if (additions.length) {
        const { rows: found } = await query<{ playerid: string }>(
          'SELECT playerid FROM flip_card_front_stage WHERE playerid = ANY($1::text[])',
          [additions]
        );
        if (found.length !== additions.length) return fail('One or more tagged players could not be found. Search and select them again.');
      }
    }

    const takenDate = String(year) + '-' + String(month).padStart(2, '0') + '-01';
    if (taggedIds === null) {
      const { rows: changed } = await query<{ id: string }>(
        "UPDATE player_moment_submissions SET caption = $2, photo_taken_date = $3::date, photo_taken_year = $4, sort_date = $3::date WHERE id = $1 AND contributor_firebase_uid = $5 AND status = 'live' RETURNING id::text AS id",
        [id, story, takenDate, year, fan.uid]
      );
      if (!changed.length) return fail('Story not found.', 404);
    } else {
      // One atomic statement: keep the primary player, delete only removed
      // secondary tags, and insert only newly selected secondary tags.
      const sql = [
        'WITH updated AS (',
        '  UPDATE player_moment_submissions',
        '     SET caption = $2, photo_taken_date = $3::date, photo_taken_year = $4, sort_date = $3::date',
        "   WHERE id = $1 AND contributor_firebase_uid = $5 AND status = 'live'",
        '   RETURNING id',
        '), removed AS (',
        '  DELETE FROM player_moment_players mp USING updated',
        '   WHERE mp.moment_id = updated.id AND mp.is_primary = false',
        '     AND mp.playerid <> $6 AND NOT (mp.playerid = ANY($7::text[]))',
        '   RETURNING mp.playerid',
        '), added AS (',
        '  INSERT INTO player_moment_players (moment_id, playerid, is_primary, tagged_by_firebase_uid)',
        '  SELECT updated.id, tag.playerid, false, $5',
        '    FROM updated CROSS JOIN unnest($7::text[]) AS tag(playerid)',
        '   WHERE tag.playerid <> $6',
        '  ON CONFLICT (moment_id, playerid) DO NOTHING',
        '  RETURNING playerid',
        ')',
        'SELECT (SELECT count(*)::int FROM updated) AS updated',
      ].join('\n');
      const { rows: changed } = await query<{ updated: number }>(
        sql, [id, story, takenDate, year, fan.uid, existing.playerId, taggedIds]
      );
      if (!changed[0]?.updated) return fail('Story not found.', 404);
    }

    const { rows: playerRows } = await query<{
      playerid: string; hsid: string | null; name: string | null; is_primary: boolean;
    }>(
      [
        "SELECT mp.playerid, f.hsid, TRIM(CONCAT_WS(' ', f.first_name, f.last_name)) AS name, mp.is_primary",
        'FROM player_moment_players mp',
        'LEFT JOIN flip_card_front_stage f ON f.playerid = mp.playerid',
        'WHERE mp.moment_id = $1',
        'ORDER BY mp.is_primary DESC, f.last_name NULLS LAST, mp.playerid',
      ].join('\n'),
      [id]
    );
    const players = playerRows.map((row) => ({
      playerId: row.playerid, hsid: row.hsid, name: row.name || 'Player', isPrimary: row.is_primary,
    }));
    await logFanActivity(fan.uid, 'story_edited', existing, taggedIds === null ? null : {
      taggedBefore: beforeTags,
      taggedAfter: taggedIds,
      taggedAdded: taggedIds.filter((playerId) => !beforeTags.includes(playerId)),
      taggedRemoved: beforeTags.filter((playerId) => !taggedIds.includes(playerId)),
    });
    return NextResponse.json({ id, story, date: takenDate, year, players });
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
