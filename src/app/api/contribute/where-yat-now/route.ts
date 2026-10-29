import { NextRequest, NextResponse } from 'next/server';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import sharp from 'sharp';
import { randomUUID } from 'crypto';
import { query } from '@/lib/db';
import { identifyContributor, contributionsToday, logContribution } from '@/lib/contributeServer';
import { S3_BUCKET, S3_REGION, storyAssetUrl } from '@/lib/storyAssets';
import { normalizeWhereYatLink, WHERE_YAT_LINK_FIELDS } from '@/lib/whereYatLinks';

export const runtime = 'nodejs';
export const maxDuration = 40;
const reply = (message: string, status = 400) => NextResponse.json({ error: message }, { status });
const clean = (value: FormDataEntryValue | null, limit: number) => String(value ?? '').trim().slice(0, limit);
const retired = (s: string) => /\bRETIRED\b/i.test(s) && !/\bACTIVE\b/i.test(s);

export async function POST(req: NextRequest) {
  let form: FormData;
  try { form = await req.formData(); } catch { return reply('The form could not be read.'); }
  const who = await identifyContributor(req, clean(form.get('idToken'), 4000));
  if (!who) return reply('Please sign in to submit your update.', 401);
  if (await contributionsToday(who.uid) >= 60) return reply('Daily contribution limit reached.', 429);

  const playerId = clean(form.get('playerId'), 32);
  const hsid = clean(form.get('hsid'), 16);
  const displayName = clean(form.get('displayName'), 140);
  const email = clean(form.get('email'), 220).toLowerCase();
  if (!/^(?:YAT)?[A-Za-z0-9_-]{1,28}$/.test(playerId) || !/^\d{1,10}$/.test(hsid)) return reply('Invalid player.');
  if (!displayName || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return reply('Enter your name and valid email.');
  const fields = {
    city: clean(form.get('city'), 120), state: clean(form.get('state'), 80),
    occupation: clean(form.get('occupation'), 160), company: clean(form.get('company'), 160),
    website: clean(form.get('website'), 300), linkedin: clean(form.get('linkedin'), 300),
    instagram: clean(form.get('instagram'), 300), facebook: clean(form.get('facebook'), 300),
    x: clean(form.get('x'), 300), story: clean(form.get('story'), 2400),
  };
  const normalized: Record<string, string> = {};
  for (const field of WHERE_YAT_LINK_FIELDS) {
    const result = normalizeWhereYatLink(field, fields[field]);
    if (result.error) return NextResponse.json({ error: result.error, field }, { status: 400 });
    normalized[field] = result.url;
  }

  try {
    const { rows } = await query<{ status_label: string }>(
      'SELECT status_label FROM public.flip_card_front_stage WHERE playerid::text=$1 AND hsid::text=$2 LIMIT 1',
      [playerId, hsid],
    );
    if (!rows.length) return reply('That alumni profile could not be found.', 404);
    if (!retired(String(rows[0].status_label || ''))) return reply('This survey is available for retired alumni.', 409);

    let photoKey: string | null = null;
    let photoUrl: string | null = null;
    const photo = form.get('photo');
    if (photo instanceof File && photo.size) {
      if (photo.size > 8 * 1024 * 1024 || !['image/jpeg','image/png','image/webp','image/heic','image/heif'].includes(photo.type))
        return reply('Select a JPG, PNG or WebP image under 8 MB.', 413);
      const original = Buffer.from(await photo.arrayBuffer());
      const compressed = await sharp(original, { failOn: 'error', limitInputPixels: 16000000 })
        .rotate().resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 82, mozjpeg: true }).toBuffer();
      photoKey = `alumni-where-yat-now/pending/${encodeURIComponent(playerId)}/${randomUUID()}.jpg`;
      const s3 = new S3Client({ region: S3_REGION });
      await s3.send(new PutObjectCommand({
        Bucket: S3_BUCKET, Key: photoKey, Body: compressed, ContentType: 'image/jpeg',
        CacheControl: 'private, no-store',
      }));
      photoUrl = storyAssetUrl(photoKey);
    }

    const sponsorship = clean(form.get('sponsorship'), 8) === 'yes';
    const result = await query<{ id: number }>(
      `INSERT INTO public.alumni_where_yat_now
      (playerid,hsid,contributor_uid,contact_email,display_name,location_city,location_state,
       occupation,company_name,business_website,linkedin_url,instagram_url,facebook_url,x_url,
       story,photo_key,photo_url,sponsorship_interest)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
       RETURNING id`,
      [playerId,hsid,who.uid,email,displayName,fields.city,fields.state,fields.occupation,fields.company,
       normalized.website,normalized.linkedin,normalized.instagram,
       normalized.facebook,normalized.x,fields.story,photoKey,photoUrl,sponsorship],
    );
    await logContribution(who, 'contribute_where_yat_now', {
      playerid: playerId, hsid, details: { submissionId: result.rows[0]?.id, sponsorshipInterest: sponsorship },
    }).catch(() => {});
    return NextResponse.json({ ok: true, pending: true, partnerHref: 'https://yatstats.com/partners/' });
  } catch (error) {
    console.error('[where-yat-now] submit failed', { playerId, error });
    return reply('Unable to save this update. Please try again.', 500);
  }
}
