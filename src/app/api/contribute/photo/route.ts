// src/app/api/contribute/photo/route.ts
// Connect & Contribute: one photo per request (the drawer sends each photo
// on its own, so a phone photo never runs into the upload size limit).
//
//   POST multipart: photo, purpose, playerId | playerName + hsid, year,
//                   classYear (year_headshot), note, pageUrl, idToken?
//
// The photo is cropped and stored in staging and saved to media_upload as
// 'pending'. It reaches the site only when a reviewer approves it.
import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { query } from '@/lib/db';
import { CLASS_YEARS, CONTRIBUTE_MAX_PHOTO_BYTES, PHOTO_TYPES, type PhotoPurpose } from '@/lib/contribute';
import {
  CONTRIBUTE_DAILY_LIMIT,
  NotAnImageError,
  contributionsToday,
  identifyContributor,
  logContribution,
  stagePhoto,
} from '@/lib/contributeServer';

export const runtime = 'nodejs';

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
  const year = Number(text(form.get('year'))) || (type.forSchool ? thisYear : NaN);
  if (!Number.isInteger(year) || year < 1900 || year > thisYear + 1) return fail('Pick the year the photo was taken.');
  const classYear = text(form.get('classYear'), 40);
  if (purpose === 'year_headshot' && !CLASS_YEARS.includes(classYear)) return fail('Pick which school year this headshot is from.');

  const playerId = text(form.get('playerId'), 20);
  let playerName = text(form.get('playerName'), 120);
  let hsid = text(form.get('hsid'), 20);
  const note = text(form.get('note'), 2000);
  const pageUrl = text(form.get('pageUrl'), 500) || null;

  try {
    if (!type.forSchool) {
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
    const staged = await stagePhoto(id, purpose, Buffer.from(await file.arrayBuffer()));
    const details = {
      note: note || null,
      classYear: purpose === 'year_headshot' ? classYear : null,
      playerName: playerName || null,
      by: { uid: who.uid, name: who.name, email: who.email || null },
      pageUrl,
    };
    await query(
      `INSERT INTO media_upload (id, playerid, hsid, category, s3_key, date_taken, status, mime_type, file_size_bytes, purpose, description)
       VALUES ($1, $2, $3, $4, $5, $6::date, 'pending', $7, $8, $9, $10)`,
      [id, playerId, hsid, type.forSchool ? 'school' : 'player', staged.key, `${year}-01-01`, staged.mime, staged.bytes, purpose, JSON.stringify(details)]
    );
    await logContribution(who, 'contribute_photo', { playerid: playerId || null, hsid, pageUrl, details: { upload_id: id, purpose } });
    return NextResponse.json({ ok: true, id }, { status: 201 });
  } catch (error) {
    if (error instanceof NotAnImageError) return fail(error.message);
    console.error('[contribute/photo] failed', error);
    return fail('Your photo could not be sent. Please try again.', 500);
  }
}
