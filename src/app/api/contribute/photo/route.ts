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
// The photo is cropped, safety-checked, and published in the same request.
// media_upload starts as 'pending' only as a durable transaction state; every
// family-safe image is promoted immediately and exits pending before return.
import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { query } from '@/lib/db';
import { CONTRIBUTE_MAX_PHOTO_BYTES, PHOTO_TYPES, PLAYER_ID, type Crop, type PhotoPurpose } from '@/lib/contribute';
import {
  CONTRIBUTE_DAILY_LIMIT,
  NotAnImageError,
  contributionsToday,
  identifyContributor,
  isReviewer,
  logContribution,
  notifyContributor,
  photoLinkPath,
  assetUrl,
  promoteUpload,
  stagePhoto,
  uploadCategory,
} from '@/lib/contributeServer';
import { CONTRIBUTE_MODERATION_POLICY_VERSION, moderatePhoto } from '@/lib/contributeModeration';
import { findOrCreateGhlContact, sendGHLEmail } from '@/lib/gohighlevel';

export const runtime = 'nodejs';
// The automatic review (Claude) and putting an approved photo on the site
// happen in this request, so the fan hears the result right away.
export const maxDuration = 60;

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });
const text = (v: FormDataEntryValue | null, max = 500) => String(v ?? '').trim().slice(0, max);

type HeroRecord = {
  id: string; playerid: string; date_taken: string; description: string | null;
  uploaded_at: string; status: string;
};
function heroDetails(row: Pick<HeroRecord, 'description'>): Record<string, unknown> {
  try {
    const value = JSON.parse(row.description || '{}');
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  } catch { return {}; }
}
function heroOwner(details: Record<string, unknown>, uid: string): boolean {
  const by = details.by;
  return Boolean(by && typeof by === 'object' && (by as { uid?: string }).uid === uid);
}
function heroYearAllowed(year: number): boolean {
  return Number.isInteger(year) && year >= 1900 && year <= new Date().getFullYear() + 1;
}
function heroAssets(details: Record<string, unknown>): string[] {
  return Array.isArray(details.published_assets)
    ? details.published_assets.filter((value): value is string => typeof value === 'string')
    : [];
}
function heroFile(details: Record<string, unknown>, id: string): string | null {
  return heroAssets(details).find((key) =>
    key.startsWith('players/season-photos/') && key.endsWith('_' + id + '.jpg')
  ) || null;
}
const ACTIVE_HERO = `COALESCE((CASE WHEN description IS NOT NULL AND left(description,1) = '{'
    THEN description::jsonb ->> 'supersededBy' ELSE NULL END),'') = ''`;

// Only the original contributor and configured reviewers can list or edit
// their yearly heroes. Never trust an arbitrary client-supplied uploader UID.
export async function GET(req: NextRequest) {
  const bearer = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const who = await identifyContributor(req, bearer);
  if (!who) return fail('Sign in to view your uploaded yearly photos.', 401);
  const playerId = req.nextUrl.searchParams.get('playerId') || '';
  if (!PLAYER_ID.test(playerId)) return fail('Choose a player.');
  const { rows } = await query<HeroRecord>(
    `SELECT id::text, playerid, date_taken::text, uploaded_at::text, status, description
     FROM media_upload WHERE playerid=$1 AND purpose='timeline_hero'
       AND status='approved' ORDER BY date_taken ASC, uploaded_at DESC, id DESC LIMIT 250`, [playerId]
  );
  const reviewer = isReviewer(who);
  const allowed = rows.filter((row) => reviewer || heroOwner(heroDetails(row), who.uid));
  const newestByYear = new Map<number, string>();
  for (const row of rows) {
    const year = Number(row.date_taken.slice(0,4));
    if (!newestByYear.has(year) && !heroDetails(row).supersededBy && heroFile(heroDetails(row), row.id))
      newestByYear.set(year, row.id);
  }
  const toPhoto = (row: HeroRecord) => {
    const details = heroDetails(row);
    const year = Number(row.date_taken.slice(0,4));
    const key = heroFile(details, row.id);
    return { id: row.id, year, active: newestByYear.get(year) === row.id,
      imageUrl: key ? assetUrl(key) : null, uploadedAt: row.uploaded_at };
  };
  // All signed-in contributors can see whether a year is occupied and
  // preview the PUBLIC currently displayed image, regardless of who owns it.
  // Neither another fan's identity nor their inactive upload data is shared.
  const slots = rows.filter((row) => newestByYear.get(Number(row.date_taken.slice(0,4))) === row.id)
    .map((row) => ({ ...toPhoto(row), canEdit: reviewer || heroOwner(heroDetails(row), who.uid) }));
  return NextResponse.json({ heroes: allowed.map(toPhoto), slots },
    { headers: { 'Cache-Control':'no-store' } });
}

// Year correction needs NO reupload and preserves the original image and
// its audit record. A conflicting active target is refused (never overwritten).
export async function PATCH(req: NextRequest) {
  const bearer = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const who = await identifyContributor(req, bearer);
  if (!who) return fail('Please sign in to edit your photo.', 401);
  let body: { uploadId?: string; year?: number };
  try { body = await req.json(); } catch { return fail('Invalid edit request.'); }
  const id = String(body.uploadId || '');
  const year = Number(body.year);
  if (!/^[0-9a-f-]{36}$/i.test(id) || !heroYearAllowed(year)) return fail('Select a valid photo and year.');
  const { rows } = await query<HeroRecord>(
    `SELECT id::text, playerid, date_taken::text, uploaded_at::text, status, description
     FROM media_upload WHERE id=$1::uuid AND purpose='timeline_hero' AND status='approved' LIMIT 1`, [id]
  );
  const record = rows[0];
  if (!record) return fail('The approved photo was not found.', 404);
  const details = heroDetails(record);
  if (!heroOwner(details, who.uid) && !isReviewer(who)) return fail('Only the original uploader or a reviewer can correct this photo.', 403);
  if (!heroFile(details, id)) return fail('The original published photo is unavailable. Contact a reviewer.', 409);
  const oldYear = Number(record.date_taken.slice(0,4));
  if (oldYear === year && !details.supersededBy) return fail('Select a different year to correct the photo.');
  const corrected = { ...details, supersededBy: undefined,
    season: { ...(details.season && typeof details.season === 'object' ? details.season : {}), year },
    correctedAt: new Date().toISOString(), correctedBy: who.uid };
  // Single guarded UPDATE avoids overwriting another year's accepted image
  // or a concurrent edit of this row.
  const { rows: updated } = await query<{ id: string }>(
    `UPDATE media_upload m SET date_taken=$2::date,description=$3
      WHERE m.id=$1::uuid AND m.date_taken=$4::date AND m.purpose='timeline_hero'
        AND m.status='approved'
        AND NOT EXISTS (
          SELECT 1 FROM media_upload other
           WHERE other.playerid=m.playerid AND other.id<>m.id
             AND other.purpose='timeline_hero' AND other.status='approved'
             AND other.date_taken=$2::date AND ${ACTIVE_HERO}
        ) RETURNING m.id::text`,
    [id, `${year}-01-01`, JSON.stringify(corrected), record.date_taken.slice(0,10)]
  );
  if (!updated.length) return fail('That year already has a hero, or the photo changed. Refresh and choose another year.', 409);
  await logContribution(who,'contribute_photo_year_correction',{
    playerid:record.playerid,hsid:null,pageUrl:req.nextUrl.href,
    details:{upload_id:id,from_year:oldYear,to_year:year},
  });
  return NextResponse.json({ ok:true,id,year,status:'approved',message:'The yearly photo was moved to its corrected year.' },
    {headers:{'Cache-Control':'no-store'}});
}

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
  const replaceUploadId = purpose === 'timeline_hero' ? text(form.get('replaceUploadId'), 40) : '';

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
    if (purpose === 'team_logo') {
      const { rows: teamRows } = await query<{ teamid: string; current_team_name: string | null }>(
        `SELECT teamid::text, current_team_name
           FROM teamid_universe_mapping
          WHERE teamid::text = $1
            AND COALESCE(current_team_name, '') <> ''
            AND UPPER(COALESCE(level_label, '')) <> 'HIGH SCHOOL'
          LIMIT 1`,
        [teamId]
      );
      if (!teamRows[0]) return fail('That college or pro team was not found.', 404);
      hsid = '';
    } else if (!/^\d+$/.test(hsid)) {
      return fail('Pick the high school.');
    }

    // A yearly hero is a SINGLE active player/year slot. New submissions
    // cannot silently overwrite it; the fan chooses an explicit existing
    // upload to replace and must own that upload (reviewers can also edit).
    if (purpose === 'timeline_hero') {
      if (!PLAYER_ID.test(playerId)) return fail('Select a player before uploading an annual hero.');
      let existingId: string | null = null;
      if (replaceUploadId) {
        if (!/^[0-9a-f-]{36}$/i.test(replaceUploadId)) return fail('Invalid replacement photo.');
        const { rows: owners } = await query<HeroRecord>(
          `SELECT id::text,playerid,date_taken::text,uploaded_at::text,status,description
             FROM media_upload WHERE id=$1::uuid AND purpose='timeline_hero'
               AND status='approved' LIMIT 1`, [replaceUploadId]
        );
        const record = owners[0];
        if (!record || record.playerid !== playerId) return fail('The original yearly photo could not be found.',404);
        if (!heroOwner(heroDetails(record),who.uid) && !isReviewer(who))
          return fail('Only the original uploader or an authorized reviewer can replace a yearly photo.',403);
        existingId = record.id;
      }
      const { rows: occupied } = await query<{ id:string }>(
        `SELECT id::text FROM media_upload
          WHERE playerid=$1 AND purpose='timeline_hero' AND status='approved'
            AND date_taken=$2::date AND ${ACTIVE_HERO}
          ORDER BY uploaded_at DESC,id DESC LIMIT 1`, [playerId,`${year}-01-01`]
      );
      if (occupied[0] && occupied[0].id !== existingId)
        return fail(`A yearly hero already exists for ${year}. Choose Edit / Replace beside that photo in the Contribute form.`,409);
    }

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
      replacesUploadId: replaceUploadId || undefined,
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
      policy_version: CONTRIBUTE_MODERATION_POLICY_VERSION,
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
        // Moderation can take time. Recheck the slot just before publishing,
        // rather than relying solely on the first read before processing.
        if (purpose === 'timeline_hero') {
          const { rows: latest } = await query<{ id:string }>(
            `SELECT id::text FROM media_upload WHERE playerid=$1
               AND purpose='timeline_hero' AND status='approved' AND date_taken=$2::date
               AND ${ACTIVE_HERO} ORDER BY uploaded_at DESC,id DESC LIMIT 1`,
            [playerId,`${year}-01-01`]
          );
          if (latest[0] && latest[0].id !== replaceUploadId) {
            message = 'The yearly hero changed while your photo was being checked. Your new photo was held for review; the current hero was not replaced.';
            throw new Error('annual hero year occupied during moderation');
          }
          if (replaceUploadId) {
            const { rows: current } = await query<{id:string; year:string}>(
              `SELECT id::text, date_taken::text AS year FROM media_upload
               WHERE id=$1::uuid AND playerid=$2 AND purpose='timeline_hero'
                 AND status='approved' AND ${ACTIVE_HERO} LIMIT 1`,
              [replaceUploadId,playerId]
            );
            if (!current[0] || current[0].year.slice(0,10) !== `${year}-01-01`) {
              message = 'The image being replaced has moved or changed. Your new upload was held for review; no existing image was changed.';
              throw new Error('replacement slot changed during moderation');
            }
          }
        }
        // Exact reuploads do not need a second S3 copy, but they are still
        // resolved as approved rather than being stranded in pending.
        const { rows: duplicates } = await query<{ id: string }>(
          `SELECT id::text FROM media_upload
            WHERE id <> $1 AND playerid = $2 AND purpose = $3 AND date_taken = $4::date
              AND sha256 = $5 AND status = 'approved'
            ORDER BY uploaded_at ASC LIMIT 1`,
          [id, playerId, purpose, `${year}-01-01`, staged.sha256]
        );
        if (duplicates.length && !replaceUploadId) {
          status = 'approved';
          message = "That photo is already on the site.";
        } else {
          // The selected destination is authoritative. Safe uploads replace
          // single-image slots immediately; timeline photos remain additive.
          // "Other Photo" with a tagged player becomes a normal timeline photo
          // so it has a public destination instead of an invisible holding bin.
          const publishPurpose = purpose === 'other_photo' && PLAYER_ID.test(playerId) ? 'timeline_hero' : purpose;
          publishedAssets = await promoteUpload({ ...upload, purpose: publishPurpose });
          status = 'approved';
          message = "Approved! It's on the site now.";
        }
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
    if (status === 'approved' && replaceUploadId && publishedAssets.length > 0) {
      // Preserve the previous immutable file and metadata for audit/recovery,
      // but take it out of the active annual-hero selection once the new
      // replacement is durably approved. Failed moderation leaves it intact.
      const { rows: prior } = await query<{description:string | null}>(
        `SELECT description FROM media_upload WHERE id=$1::uuid AND playerid=$2
           AND purpose='timeline_hero' AND status='approved'`,[replaceUploadId,playerId]
      );
      if (prior[0]) await query(
        `UPDATE media_upload SET description=$2 WHERE id=$1::uuid`,
        [replaceUploadId,JSON.stringify({...heroDetails(prior[0]),supersededBy:id})]
      );
    }
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
