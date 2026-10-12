// src/app/api/contribute/review/route.ts
// Connect & Contribute review queue, for the reviewers in
// CONTRIBUTE_REVIEWER_EMAILS only.
//
//   GET                       -> pending photos, latest corrections/tips,
//                                latest missing-player reports
//   POST { id, action }       -> approve | reject a photo. Approving copies
//                                it to the files the site reads (see
//                                promoteUpload) - the only way a fan's photo
//                                ever reaches a card.
import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { assetUrl, identifyContributor, isReviewer, promoteUpload, type UploadRow } from '@/lib/contributeServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });

async function reviewer(req: NextRequest, idToken?: string | null) {
  const who = await identifyContributor(req, idToken || req.headers.get('x-firebase-token'));
  if (!who) return { error: fail('Please sign in.', 401) };
  if (!isReviewer(who)) return { error: fail('This page is for YAT?STATS reviewers.', 403) };
  return { who };
}

export async function GET(req: NextRequest) {
  const r = await reviewer(req);
  if (r.error) return r.error;
  try {
    const [photos, tips, missing] = await Promise.all([
      query<UploadRow & { description: string | null; uploaded_at: string; player_name: string | null; school_name: string | null }>(
        `SELECT m.id::text, m.playerid, m.hsid, m.purpose, m.s3_key, m.date_taken, m.description, m.uploaded_at,
                NULLIF(TRIM(COALESCE(f.first_name, '') || ' ' || COALESCE(f.last_name, '')), '') AS player_name,
                s.hsname AS school_name
           FROM media_upload m
           LEFT JOIN LATERAL (SELECT first_name, last_name FROM flip_card_front_stage
                               WHERE playerid::text = m.playerid LIMIT 1) f ON true
           LEFT JOIN LATERAL (SELECT hsname FROM school_success WHERE hsid::text = m.hsid LIMIT 1) s ON true
          WHERE m.status = 'pending' AND m.s3_key LIKE 'staging/contribute/%'
          ORDER BY m.uploaded_at ASC LIMIT 100`
      ),
      query(
        `SELECT id::text, submitted_at, intake_source, sender_name, raw_player_name, matched_playerid, matched_hsid,
                article_url, notes, status
           FROM news_tip_queue WHERE intake_source IN ('correction', 'fan_drawer')
          ORDER BY submitted_at DESC LIMIT 100`
      ),
      query(
        `SELECT p.id::text, p.created_at, p.hsid, p.player_name, p.grad_year, p.notes, s.hsname AS school_name
           FROM missing_player_submission p
           LEFT JOIN LATERAL (SELECT hsname FROM school_success WHERE hsid::text = p.hsid LIMIT 1) s ON true
          ORDER BY p.created_at DESC LIMIT 100`
      ),
    ]);
    return NextResponse.json({
      photos: photos.rows.map((p) => {
        let details: Record<string, unknown> = {};
        try { details = JSON.parse(p.description || '{}'); } catch {}
        return { ...p, url: assetUrl(p.s3_key), details };
      }),
      tips: tips.rows,
      missing: missing.rows,
    });
  } catch (error) {
    console.error('[contribute/review] GET failed', error);
    return fail('The review queue could not be loaded.', 500);
  }
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return fail('Nothing arrived.');
  }
  const r = await reviewer(req, String(body.idToken || ''));
  if (r.error) return r.error;
  const id = String(body.id || '');
  const action = String(body.action || '');
  if (!/^[0-9a-f-]{36}$/i.test(id) || !['approve', 'reject'].includes(action)) return fail('Unknown request.');
  try {
    const { rows } = await query<UploadRow & { status: string }>(
      `SELECT id::text, playerid, hsid, purpose, s3_key, date_taken, team_at_time, status FROM media_upload WHERE id = $1`,
      [id]
    );
    const upload = rows[0];
    if (!upload) return fail('That photo was not found.', 404);
    if (upload.status !== 'pending') return fail(`Already ${upload.status}.`, 409);
    if (action === 'approve') {
      const written = await promoteUpload(upload);
      await query(`UPDATE media_upload SET status = 'approved' WHERE id = $1`, [id]);
      return NextResponse.json({ ok: true, status: 'approved', written });
    }
    await query(`UPDATE media_upload SET status = 'rejected' WHERE id = $1`, [id]);
    return NextResponse.json({ ok: true, status: 'rejected' });
  } catch (error) {
    console.error('[contribute/review] POST failed', error);
    return fail(error instanceof Error ? error.message : 'That did not work.', 500);
  }
}
