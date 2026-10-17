// src/app/api/contribute/photo/route.ts
// Connect & Contribute: one photo per request (the drawer sends each photo
// on its own, so a phone photo never runs into the upload size limit).
//
//   POST multipart: photo, purpose, year, playerId (the main player) |
//                   playerName + hsid, tagged (JSON: everyone in it),
//                   season (JSON: team, level, label), teamId (a team
//                   logo), hsid (a school logo), crop (JSON: x, y, w, h as
//                   fractions), landscape (a 7x5 timeline image), note,
//                   pageUrl, idToken?
//
// The photo is cropped and stored in staging and saved to media_upload as
// 'pending'. It reaches the site only when a reviewer approves it.
import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { query } from '@/lib/db';
import { CONTRIBUTE_MAX_PHOTO_BYTES, PHOTO_TYPES, PLAYER_ID, type Crop, type PhotoPurpose } from '@/lib/contribute';
import {
  CONTRIBUTE_DAILY_LIMIT,
  NotAnImageError,
  contributionsToday,
  identifyContributor,
  logContribution,
  notifyContributor,
  photoLinkPath,
  assetUrl,
  existingPublishedTarget,
  promoteUpload,
  stagePhoto,
  uploadCategory,
} from '@/lib/contributeServer';
import { moderatePhoto } from '@/lib/contributeModeration';
import { findOrCreateGhlContact, sendGHLEmail } from '@/lib/gohighlevel';

export const runtime = 'nodejs';
// The automatic review (Claude) and putting an approved photo on the site
// happen in this request, so the fan hears the result right away.
export const maxDuration = 60;

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });
const text = (v: FormDataEntryValue | null, max = 500) => String(v ?? '').trim().slice(0, max);

export async function POST(req: NextRequest) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail('The photo did not arrive. Please try again.');
  }

  const who = await identifyContributor(req, text(form.get('idToken'), 4000));
  if (!who) return fail('Please sign in to send photos.', 401);

  const purpose = text(form.get('purpose')) as PhotoPurpose;
  const type = PHOTO_TYPES.find((t) => t.id === purpose);
  if (!type) return fail('Pick what kind of photo this is.');

  const file = form.get('photo');
  if (!(file instanceof File) || file.size === 0) return fail('Choose a photo.');
  if (file.size > CONTRIBUTE_MAX_PHOTO_BYTES) return fail('That photo is too large. Please choose a smaller one.', 413);

  const thisYear = new Date().getFullYear();
  const year = Number(text(form.get('year'))) || (type.asks === 'season' ? NaN : thisYear);
  if (!Number.isInteger(year) || year < 1900 || year > thisYear + 1) return fail('Pick the season.');
  const teamId = text(form.get('teamId'), 20);
  if (type.asks === 'team' && !/^\d+$/.test(teamId)) return fail('Pick the team.');
  const json = <T,>(v: FormDataEntryValue | null): T | null => {
    try { return JSON.parse(text(v, 2000)) as T; } catch { return null; }
  };
  const season = json<{ team?: string; level?: string; label?: string }>(form.get('season'));
  const crop = json<Crop>(form.get('crop'));
  const tagged = (json<string[]>(form.get('tagged')) || []).map((v) => String(v)).filter((v) => PLAYER_ID.test(v)).slice(0, 20);
  const landscape = text(form.get('landscape'), 5) === '1';
  // A headshot from his newest season (his headshot everywhere) or an
  // earlier one (kept with that season).
  const currentSeason = purpose === 'headshot' && text(form.get('currentSeason'), 5) === '1';

  const playerId = text(form.get('playerId'), 20);
  let playerName = text(form.get('playerName'), 120);
  let hsid = text(form.get('hsid'), 20);
  const note = text(form.get('note'), 2000);
  const pageUrl = text(form.get('pageUrl'), 500) || null;

  try {
    if (type.needsPlayer || playerId) {
      if (playerId) {
        // A player on the site: his name and school come from our records.
        const { rows } = await query<{ hsid: string | null; name: string }>(
          `SELECT hsid::text AS hsid, TRIM(COALESCE(first_name, '') || ' ' || COALESCE(last_name, '')) AS name
             FROM flip_card_front_stage WHERE playerid::text = $1 LIMIT 1`,
          [playerId]
        );
        if (!rows[0]) return fail('That player was not found.', 404);
        playerName = rows[0].name || playerName;
        hsid = rows[0].hsid || hsid;
      } else if (!playerName || !hsid) {
        return fail('Pick the player, or type his name and pick his high school.');
      }
    }
    if (!/^\d+$/.test(hsid)) return fail('Pick the high school.');

    if ((await contributionsToday(who.uid)) >= CONTRIBUTE_DAILY_LIMIT) {
      return fail("You've sent a lot today. Thank you! Please send the rest tomorrow.", 429);
    }

    const id = randomUUID();
    const staged = await stagePhoto(id, purpose, Buffer.from(await file.arrayBuffer()), crop, landscape);
    const details = {
      note: note || null,
      season: season ? { year, team: text(season.team ?? '', 120), level: text(season.level ?? '', 40), label: text(season.label ?? '', 40) } : null,
      cropped: Boolean(crop),
      tagged,
      landscape: purpose === 'timeline_hero' ? landscape : undefined,
      currentSeason: purpose === 'headshot' ? currentSeason : undefined,
      playerName: playerName || null,
      by: { uid: who.uid, name: who.name, email: who.email || null },
      pageUrl,
    };
    await query(
      `INSERT INTO media_upload (id, playerid, hsid, category, s3_key, date_taken, status, mime_type, file_size_bytes, purpose, description, team_at_time, sha256)
       VALUES ($1, $2, $3, $4, $5, $6::date, 'pending', $7, $8, $9, $10, $11, $12)`,
      [id, playerId, hsid, uploadCategory(purpose), staged.key, `${year}-01-01`, staged.mime, staged.bytes, purpose, JSON.stringify(details), teamId || null, staged.sha256]
    );
    await logContribution(who, 'contribute_photo', { playerid: playerId || null, hsid, pageUrl, details: { upload_id: id, purpose } });

    // Notification is sent after the staged file is durable, regardless of
    // whether the photo subsequently passes automatic moderation.
    try {
      const contact=await findOrCreateGhlContact('images@yatstats.com','YATSTATS Image Review');
      if(contact){
        const clean=(v:string)=>v.replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]||m));
        await sendGHLEmail(contact,'New YAT?STATS photo upload: '+purpose,
          '<p>A fan photo was uploaded for moderation.</p>'+
          '<p><b>Type:</b> '+clean(purpose)+'<br/><b>Player:</b> '+clean(playerName)+
          '<br/><b>School:</b> '+clean(hsid)+'<br/><b>Year:</b> '+String(year)+
          '<br/><b>Upload ID:</b> '+clean(id)+'<br/><b>From:</b> '+clean(who.email||who.name)+'</p>');
      }
    }catch(error){console.error('[contribute/photo] image inbox notification failed',error);}


    // Automatic review. Approved: on the site now. Rejected: the fan is told
    // why. Unsure (or the check is unavailable): it waits for a person.
    const verdict = await moderatePhoto({
      imageUrl: assetUrl(staged.key) || '',
      purpose,
      playerName,
      season: details.season,
      note: note || null,
    });
    // Do not publish an AI-approved photo until the moderation outcome can
    // actually be persisted. The runtime database role may have INSERT but
    // no UPDATE policy on media_upload. Previously this silently left
    // approved/rejected uploads permanently 'pending' and could still
    // publish the image to S3.
    const moderation = verdict ? {
      decision: verdict.decision,
      description: verdict.description,
      reason: verdict.reason_for_fan,
      checked_at: new Date().toISOString(),
    } : null;
    const { rows: recordable } = await query<{ id: string }>(
      `UPDATE media_upload SET description = $2 WHERE id = $1 RETURNING id::text AS id`,
      [id, JSON.stringify({ ...details, moderation })]
    );
    if (recordable.length !== 1) {
      console.error('[contribute/photo] moderation cannot be recorded; holding unpublished upload', {
        uploadId: id, purpose,
      });
      return NextResponse.json({
        ok: true, id, status: 'pending',
        message: 'Your photo was received. It is awaiting review before it appears on the site.',
        link: null,
      }, { status: 201 });
    }
    let status: 'approved' | 'rejected' | 'pending' = 'pending';
    let message = "Thanks! We'll take a look and email you when it's on the site.";
    let publishedAssets: string[] = [];
    if (verdict?.decision === 'reject') {
      status = 'rejected';
      message = verdict.reason_for_fan || "This photo can't be used.";
    } else if (verdict?.decision === 'approve') {
      try {
        // A photo for a player who isn't on the site yet can't be placed.
        if (type.needsPlayer && !PLAYER_ID.test(playerId)) throw new Error('no player on the site');
        const upload = { id, playerid: playerId, hsid, purpose, s3_key: staged.key, date_taken: `${year}-01-01`, team_at_time: teamId || null, current_season: currentSeason };
        // Distinct photos for a year coexist. Exact reuploads are kept in
        // staging but never added to the rotation twice.
        const { rows: duplicates } = await query<{ id: string }>(
          `SELECT id::text FROM media_upload
            WHERE id <> $1 AND playerid = $2 AND purpose = $3 AND date_taken = $4::date
              AND sha256 = $5 AND status IN ('pending','approved')
            ORDER BY uploaded_at ASC LIMIT 1`,
          [id, playerId, purpose, `${year}-01-01`, staged.sha256]
        );
        if (duplicates.length) throw new Error('duplicate image; keep existing upload');
        const occupied = await existingPublishedTarget(upload);
        if (occupied) throw new Error('existing published image; hold for review');
        publishedAssets = await promoteUpload(upload);
        status = 'approved';
        message = "Approved! It's on the site now.";
      } catch (error) {
        console.error('[contribute/photo] promote failed', error);
      }
    }
    const { rows: updated } = await query<{ id: string }>(
      `UPDATE media_upload SET status = $2, description = $3 WHERE id = $1 RETURNING id::text AS id`,
      [id, status, JSON.stringify({ ...details, moderation, published_assets: publishedAssets })]
    );
    if (updated.length !== 1) {
      const { rows: [dbContext] } = await query<{ db_role: string; rls_active: boolean }>(
        `SELECT current_user::text AS db_role, row_security_active('public.media_upload'::regclass) AS rls_active`
      ).catch(() => ({ rows: [] as { db_role: string; rls_active: boolean }[] }));
      console.error('[contribute/photo] moderation status update affected no row', { uploadId: id, intendedStatus: status, dbContext: dbContext || null });
    }
    // CRM/email is best effort; do it only after the moderation state is
    // persisted so a slow or misconfigured CRM cannot leave an approved
    // upload stuck as pending.
    if (status === 'approved') {
      await notifyContributor(details.by, 'posted', { purpose, playerId, playerName, hsid, year, pageUrl });
    }
    // Approved: where to see it (a path on this school's site).
    let link: string | null = null;
    if (status === 'approved') {
      if (purpose === 'team_logo' && tagged[0]) {
        // A team logo: the profile of the player tagged with it.
        const { rows } = await query<{ hsid: string | null; name: string }>(
          `SELECT hsid::text AS hsid, TRIM(COALESCE(first_name, '') || ' ' || COALESCE(last_name, '')) AS name
             FROM flip_card_front_stage WHERE playerid::text = $1 LIMIT 1`,
          [tagged[0]]
        ).catch(() => ({ rows: [] as { hsid: string | null; name: string }[] }));
        if (rows[0]) link = photoLinkPath('headshot', { playerId: tagged[0], playerName: rows[0].name, hsid: rows[0].hsid });
      } else {
        link = photoLinkPath(purpose, { playerId, playerName, hsid, pageUrl });
      }
    }
    return NextResponse.json({ ok: true, id, status, message, link }, { status: 201 });
  } catch (error) {
    if (error instanceof NotAnImageError) return fail(error.message);
    console.error('[contribute/photo] failed', error);
    return fail('Your photo could not be sent. Please try again.', 500);
  }
}
