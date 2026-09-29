// src/app/api/stories/[id]/comments/route.ts
//   GET  - a story's comments, oldest first (public: names only), each
//          with its photos
//   POST - add a comment (signed-in fans): JSON {text}, or a form with
//          text and up to 4 photos (text optional when there are photos)
import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { query } from '@/lib/db';
import { identifyFan, viewerUid } from '@/lib/fanIdentity';
import { NotAnImageError, STORY_MAX_PHOTO_BYTES, STORY_MAX_PHOTOS, storeStoryPhoto, storyAssetUrl } from '@/lib/stories';
import { COMMENT_MAX, fail, loadLiveStory, logFanActivity, parseStoryId } from '@/lib/storySocial';

export const runtime = 'nodejs';

type Params = { params: Promise<{ id: string }> };

type PhotoKeys = { web: string | null; thumb: string | null; full: string | null; width: number | null; height: number | null };
type CommentRow = {
  id: string;
  body: string;
  created_at: string;
  firebase_uid: string;
  first_name: string | null;
  last_name: string | null;
  photos: PhotoKeys[] | null;
};

function toComment(r: CommentRow, viewer: string | null, storyOwner: string | null) {
  return {
    id: r.id,
    text: r.body,
    createdAt: r.created_at,
    author: [r.first_name, r.last_name].map((v) => String(v || '').trim()).filter(Boolean).join(' ') || 'A YAT?STATS fan',
    photos: (r.photos || []).map((p) => ({
      web: storyAssetUrl(p.web),
      thumb: storyAssetUrl(p.thumb),
      full: storyAssetUrl(p.full),
      width: p.width,
      height: p.height,
    })),
    isMine: Boolean(viewer && r.firebase_uid === viewer),
    // The story's poster can remove comments on their own story.
    canDelete: Boolean(viewer && (r.firebase_uid === viewer || storyOwner === viewer)),
  };
}

const COMMENT_PHOTOS = `
  (SELECT json_agg(json_build_object('web', p.web_s3_key, 'thumb', p.thumb_s3_key, 'full', p.s3_key,
                                     'width', p.width, 'height', p.height) ORDER BY p.sort_order, p.id)
     FROM player_moment_comment_photos p WHERE p.comment_id = c.id::bigint) AS photos`;

const SELECT_COMMENTS = `
  SELECT c.id::text AS id, c.body, c.created_at, c.firebase_uid, up.first_name, up.last_name, ${COMMENT_PHOTOS}
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

  // A plain comment comes as JSON; one with photos as a form.
  let text = '';
  let photos: File[] = [];
  if ((req.headers.get('content-type') || '').includes('multipart/form-data')) {
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return fail('The upload was too large or incomplete. Try fewer or smaller photos.', 413);
    }
    text = String(form.get('text') ?? '').trim();
    photos = form.getAll('photos').filter((f): f is File => f instanceof File && f.size > 0);
  } else {
    const body = (await req.json().catch(() => ({}))) as { text?: unknown };
    text = String(body.text ?? '').trim();
  }
  if (!text && photos.length === 0) return fail('Write a comment or add a photo first.');
  if (text.length > COMMENT_MAX) return fail(`Please keep comments under ${COMMENT_MAX.toLocaleString()} characters.`);
  if (photos.length > STORY_MAX_PHOTOS) return fail(`Up to ${STORY_MAX_PHOTOS} photos per comment.`);
  if (photos.some((f) => f.size > STORY_MAX_PHOTO_BYTES)) return fail('One of the photos is too large. Please choose a smaller one.', 413);

  try {
    const story = await loadLiveStory(id);
    if (!story) return fail('Story not found.', 404);

    // Photos to S3 the same way story photos go (upright, no metadata,
    // three sizes), then the comment and its photos in one statement.
    const folder = randomUUID();
    const stored = [];
    for (let i = 0; i < photos.length; i++) {
      stored.push(await storeStoryPhoto(folder, i, Buffer.from(await photos[i].arrayBuffer())));
    }

    const { rows } = await query<CommentRow>(
      `WITH c AS (
         INSERT INTO player_moment_comments (moment_id, firebase_uid, body) VALUES ($1, $2, $3)
         RETURNING id, body, created_at, firebase_uid
       ), p AS (
         INSERT INTO player_moment_comment_photos (comment_id, sort_order, s3_key, web_s3_key, thumb_s3_key, width, height, mime_type, file_size_bytes)
         SELECT c.id, p.ord, p.s3_key, p.web_s3_key, p.thumb_s3_key, p.width, p.height, p.mime_type, p.file_size_bytes
           FROM c, jsonb_to_recordset($4::jsonb) AS p(ord int, s3_key text, web_s3_key text, thumb_s3_key text,
                                                      width int, height int, mime_type text, file_size_bytes bigint)
       )
       SELECT c.id::text AS id, c.body, c.created_at, c.firebase_uid, up.first_name, up.last_name,
              (SELECT json_agg(json_build_object('web', p.web_s3_key, 'thumb', p.thumb_s3_key, 'full', p.s3_key,
                                                 'width', p.width, 'height', p.height) ORDER BY p.ord)
                 FROM jsonb_to_recordset($4::jsonb) AS p(ord int, s3_key text, web_s3_key text, thumb_s3_key text,
                                                         width int, height int)) AS photos
         FROM c LEFT JOIN LATERAL (SELECT first_name, last_name FROM user_profiles WHERE firebase_uid = c.firebase_uid LIMIT 1) up ON true`,
      [id, fan.uid, text, JSON.stringify(stored.map((p, i) => ({ ord: i, ...p })))]
    );
    await logFanActivity(fan.uid, 'story_commented', story, { commentId: rows[0]?.id, photos: stored.length });
    return NextResponse.json({ comment: toComment(rows[0], fan.uid, story.ownerUid) }, { status: 201 });
  } catch (error) {
    if (error instanceof NotAnImageError) return fail(error.message);
    console.error('[stories] comment POST failed', error);
    return fail('Your comment could not be posted. Please try again.', 500);
  }
}
