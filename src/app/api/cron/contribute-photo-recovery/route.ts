// Recover uploads blocked before the media_upload RLS repair.
// Vercel cron (CRON_SECRET) only. A bounded, idempotent, AI-gated batch;
// no published image is overwritten and uncertain files remain in review.
import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { PHOTO_TYPES, PLAYER_ID, type PhotoPurpose } from '@/lib/contribute';
import { assetUrl, existingPublishedTarget, promoteUpload, sha256ForStagedPhoto, type UploadRow } from '@/lib/contributeServer';
import { moderatePhoto } from '@/lib/contributeModeration';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';
const BATCH = 6;

type Pending = UploadRow & { uploaded_at: string; sha256: string | null };
type Details = {
  note?: string | null;
  season?: { year?: number; team?: string; label?: string } | null;
  playerName?: string | null;
  currentSeason?: boolean;
  moderation?: { decision?: string; checked_at?: string };
  published_assets?: string[];
  [key: string]: unknown;
};

function parse(raw: string | null | undefined): Details {
  try { return JSON.parse(raw || '{}') as Details; } catch { return {}; }
}
function allowed(req: NextRequest) {
  return Boolean(process.env.CRON_SECRET && req.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`);
}

export async function GET(req: NextRequest) {
  if (!allowed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    // Old uploads had no recorded AI outcome; a separate review verdict must
    // not be retried continually. A lock avoids competing recovery requests.
    const { rows: pending } = await query<Pending>(
      `SELECT id::text, playerid, hsid, purpose, s3_key, date_taken, team_at_time,
              description, uploaded_at, sha256
         FROM media_upload WHERE status = 'pending'
          AND s3_key LIKE 'staging/contribute/%'
          AND (COALESCE((description::jsonb->'moderation'->>'checked_at'), '') = ''
            OR (description::jsonb->'moderation'->>'decision' = 'approve'
                AND COALESCE(jsonb_array_length(CASE WHEN jsonb_typeof(description::jsonb->'published_assets') = 'array'
                  THEN description::jsonb->'published_assets' ELSE '[]'::jsonb END), 0) = 0))
         ORDER BY uploaded_at ASC LIMIT $1`,
      [BATCH]
    );
    const results: { id: string; outcome: string; detail?: string }[] = [];
    for (const item of pending) {
      const details = parse(item.description);
      try {
        const purpose = item.purpose as PhotoPurpose;
        if (!PHOTO_TYPES.some((p) => p.id === purpose)) throw new Error('Unknown photo purpose');
        if (purpose === 'team_logo' && !/^\d+$/.test(item.team_at_time || '')) throw new Error('Missing team ID');
        if (purpose !== 'school_logo' && purpose !== 'team_logo' && purpose !== 'other_photo' && !PLAYER_ID.test(item.playerid)) throw new Error('Unknown player');
        const sha = item.sha256 || await sha256ForStagedPhoto(item.s3_key);
        if (!item.sha256) await query('UPDATE media_upload SET sha256 = $2 WHERE id = $1', [item.id, sha]);

        // Pre-existing uploads may be byte-identical: compute missing hashes
        // for older siblings before deciding; duplicate files never appear twice.
        const { rows: siblings } = await query<Pending>(
          `SELECT id::text, playerid, hsid, purpose, s3_key, date_taken, team_at_time,
                  description, uploaded_at, sha256 FROM media_upload
             WHERE id <> $1 AND playerid = $2 AND purpose = $3 AND date_taken = $4::date
               AND status IN ('pending', 'approved')
               AND (status = 'approved' OR uploaded_at < $5)
             ORDER BY CASE WHEN status = 'approved' THEN 0 ELSE 1 END, uploaded_at ASC LIMIT 20`,
          [item.id, item.playerid, item.purpose, item.date_taken, item.uploaded_at]
        );
        let duplicateId: string | null = null;
        for (const sibling of siblings) {
          const otherHash = sibling.sha256 || await sha256ForStagedPhoto(sibling.s3_key);
          if (!sibling.sha256) await query('UPDATE media_upload SET sha256 = $2 WHERE id = $1', [sibling.id, otherHash]);
          if (otherHash === sha) { duplicateId = sibling.id; break; }
        }
        if (duplicateId) {
          const moderation = { decision: 'review', checked_at: new Date().toISOString(), description: `Duplicate of submission ${duplicateId}; not republished.` };
          await query('UPDATE media_upload SET description = $2 WHERE id = $1',
            [item.id, JSON.stringify({ ...details, moderation })]);
          results.push({ id: item.id, outcome: 'duplicate-held' });
          continue;
        }
        if (purpose === 'other_photo') {
          const moderation = { decision: 'review', checked_at: new Date().toISOString(), description: 'Gallery-only photo: awaiting a public gallery placement.' };
          await query('UPDATE media_upload SET description = $2 WHERE id = $1',
            [item.id, JSON.stringify({ ...details, moderation })]);
          results.push({ id: item.id, outcome: 'gallery-placement-held' });
          continue;
        }
        const occupied = await existingPublishedTarget(item);
        // An existing card image is not a reason to suppress a valid upload.
        // Preserve it and add the new photo to the year-specific timeline.
        const appendTimeline = Boolean(occupied && purpose !== 'school_logo' && purpose !== 'team_logo');
        const verdict = details.moderation?.decision === 'approve' ? { decision: 'approve' as const, description: 'Previously AI approved; retrying publication.', reason_for_fan: '' } : await moderatePhoto({
          imageUrl: assetUrl(item.s3_key) || '',
          purpose,
          playerName: details.playerName,
          season: details.season,
          note: details.note
        });
        if (!verdict) {
          const moderation = { decision: 'review', checked_at: new Date().toISOString(), description: 'Automatic moderation unavailable; no publication attempted.' };
          await query('UPDATE media_upload SET description = $2 WHERE id = $1',
            [item.id, JSON.stringify({ ...details, moderation })]);
          results.push({ id: item.id, outcome: 'ai-unavailable-held' });
          continue;
        }
        const moderation = { decision: verdict.decision, checked_at: new Date().toISOString(),
          description: verdict.description, reason: verdict.reason_for_fan };
        if (verdict.decision === 'reject') {
          await query("UPDATE media_upload SET status = 'rejected', description = $2 WHERE id = $1",
            [item.id, JSON.stringify({ ...details, moderation })]);
          results.push({ id: item.id, outcome: 'rejected' });
        } else if (verdict.decision === 'review') {
          await query('UPDATE media_upload SET description = $2 WHERE id = $1',
            [item.id, JSON.stringify({ ...details, moderation })]);
          results.push({ id: item.id, outcome: 'review' });
        } else {
          // Persist review before an S3 write so retrying a partially
          // completed upload never quietly overwrites another asset.
          await query('UPDATE media_upload SET description = $2 WHERE id = $1',
            [item.id, JSON.stringify({ ...details, moderation })]);
          const written = await promoteUpload({ ...item, purpose: appendTimeline ? 'timeline_hero' : item.purpose, current_season: details.currentSeason });
          await query("UPDATE media_upload SET status = 'approved', description = $2 WHERE id = $1",
            [item.id, JSON.stringify({ ...details, moderation, published_assets: written })]);
          results.push({ id: item.id, outcome: 'published' });
        }
      } catch (error) {
        console.error('[contribute/recovery] item failed', item.id, error);
        results.push({ id: item.id, outcome: 'failed', detail: error instanceof Error ? error.message : 'Unknown failure' });
      }
    }
    return NextResponse.json({ ok: true, processed: results.length, results });
  } catch (error) {
    console.error('[contribute/recovery] failed', error);
    return NextResponse.json({ error: 'Recovery failed' }, { status: 500 });
  }
}
