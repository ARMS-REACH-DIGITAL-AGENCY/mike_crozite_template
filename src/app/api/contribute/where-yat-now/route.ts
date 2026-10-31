import { NextRequest, NextResponse } from 'next/server';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import sharp from 'sharp';
import { randomUUID } from 'crypto';
import { query } from '@/lib/db';
import { identifyContributor, contributionsToday, logContribution } from '@/lib/contributeServer';
import { S3_BUCKET, S3_REGION, storyAssetUrl } from '@/lib/storyAssets';
import { normalizeWhereYatLink, WHERE_YAT_LINK_FIELDS } from '@/lib/whereYatLinks';
import { notifyWhereYatReviewers } from '@/lib/whereYatReviewNotifications';
import { notifyWhereYatContributor } from '@/lib/whereYatContributorNotifications';
import { syncWhereYatSubmissionToArms } from '@/lib/whereYatArmsSync';
import { storeStoryPhoto, STORY_MAX_PHOTO_BYTES } from '@/lib/stories';
import { moderateContributedTip } from '@/lib/contributeTipModeration';
import { moderatePhoto } from '@/lib/contributeModeration';

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

  if (clean(form.get('proofConfirmed'),8)!=='yes') return reply('Please review and confirm your proof before submitting.');
  const playerId = clean(form.get('playerId'), 32);
  const hsid = clean(form.get('hsid'), 16);
  const replacesSubmissionId = Number(clean(form.get('replacesSubmissionId'), 20)) || null;
  let prior: Record<string, any> | null = null;
  if (replacesSubmissionId) {
    const previous = await query(
      `SELECT * FROM public.alumni_where_yat_now WHERE id=$1 AND playerid=$2 AND hsid=$3 AND contributor_uid=$4 AND status IN ('approved','pending') LIMIT 1`,
      [replacesSubmissionId, playerId, hsid, who.uid]
    );
    if (!previous.rows[0]) return reply('This saved questionnaire does not belong to your account.', 403);
    prior = previous.rows[0];
  }
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
    favoriteHs: clean(form.get('favoriteHs'), 5000), favoriteAfter: clean(form.get('favoriteAfter'), 5000),
    family: clean(form.get('family'), 5000), retirementYear: clean(form.get('retirementYear'), 4),
    businessMessage: clean(form.get('businessMessage'), 3000), businessOffer: clean(form.get('businessOffer'), 1000),
    businessEmail: clean(form.get('businessEmail'), 220), businessPhone: clean(form.get('businessPhone'), 80),
    teammateTips: clean(form.get('teammateTips'), 5000),
    contactPhone: clean(form.get('contactPhone'), 40),
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
    let companyLogoKey: string | null = null;
    let companyLogoUrl: string | null = null;
    const photo = form.get('photo');
    const companyLogo = form.get('companyLogo');

    // Validate both optional files before any storage write.
    if (photo instanceof File && photo.size &&
        (photo.size > 8 * 1024 * 1024 || !['image/jpeg','image/png','image/webp','image/heic','image/heif'].includes(photo.type)))
      return reply('Select a JPG, PNG or WebP personal photo under 8 MB.', 413);
    if (companyLogo instanceof File && companyLogo.size &&
        (companyLogo.size > 5 * 1024 * 1024 || !['image/jpeg','image/png','image/webp'].includes(companyLogo.type)))
      return reply('Select a JPG, PNG or WebP company logo under 5 MB.', 413);

    // Both image uploads use the existing Contribute AWS credential names.
    const accessKeyId = process.env.YATSTATS_AWS_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.YATSTATS_AWS_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY;
    if (((photo instanceof File && photo.size) || (companyLogo instanceof File && companyLogo.size)) &&
        (!accessKeyId || !secretAccessKey)) {
      console.error('[where-yat-now] Media storage credentials missing', { playerId, environment: process.env.VERCEL_ENV });
      return reply('Photo/logo storage is temporarily unavailable. Please try again shortly; your entries have not been saved.', 503);
    }
    const s3 = accessKeyId && secretAccessKey
      ? new S3Client({ region: S3_REGION, credentials: { accessKeyId, secretAccessKey } })
      : null;
    if (photo instanceof File && photo.size) {
      const original = Buffer.from(await photo.arrayBuffer());
      const compressed = await sharp(original, { failOn: 'error', limitInputPixels: 16000000 })
        .rotate().resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 82, mozjpeg: true }).toBuffer();
      photoKey = `alumni-where-yat-now/pending/${encodeURIComponent(playerId)}/${randomUUID()}.jpg`;
      await s3!.send(new PutObjectCommand({
        Bucket: S3_BUCKET, Key: photoKey, Body: compressed, ContentType: 'image/jpeg',
        CacheControl: 'private, no-store',
      }));
      photoUrl = storyAssetUrl(photoKey);
    }
    if (companyLogo instanceof File && companyLogo.size) {
      const original = Buffer.from(await companyLogo.arrayBuffer());
      let logoBytes: Buffer;
      try {
        // Preserve transparency and the complete company mark; never crop logos.
        logoBytes = await sharp(original, { failOn: 'error', limitInputPixels: 16000000 })
          .rotate().resize(640, 640, { fit: 'inside', withoutEnlargement: true })
          .png({ compressionLevel: 9 }).toBuffer();
      } catch {
        return reply('The company logo could not be processed. Upload a valid PNG, JPG or WebP image.', 422);
      }
      companyLogoKey = `alumni-where-yat-now/pending/${encodeURIComponent(playerId)}/logos/${randomUUID()}.png`;
      await s3!.send(new PutObjectCommand({
        Bucket: S3_BUCKET, Key: companyLogoKey, Body: logoBytes, ContentType: 'image/png',
        CacheControl: 'private, no-store',
      }));
      companyLogoUrl = storyAssetUrl(companyLogoKey);
    }

    const lifeFiles = form.getAll('lifePhotos').filter((f): f is File => f instanceof File && f.size > 0);
    if (lifeFiles.length > 4 || lifeFiles.some(f => f.size > STORY_MAX_PHOTO_BYTES))
      return reply('Please choose up to four photographs, each under 4 MB.', 413);
    const album = [];
    for (let i=0; i<lifeFiles.length; i++) {
      const stored = await storeStoryPhoto(randomUUID(), i, Buffer.from(await lifeFiles[i].arrayBuffer()));
      album.push({ web: storyAssetUrl(stored.web_s3_key), full: storyAssetUrl(stored.s3_key), thumb: storyAssetUrl(stored.thumb_s3_key) });
    }
    const year = fields.retirementYear ? Number(fields.retirementYear) : null;
    if (year !== null && (!Number.isInteger(year) || year < 1900 || year > new Date().getFullYear()))
      return reply('Please enter a valid retirement year.');
    const publicBusiness = clean(form.get('businessPublic'), 8) === 'yes';
    const attested = clean(form.get('claimAttestation'),8) === 'yes';
    if (!attested) return reply('Please confirm that you are the alumnus or are authorized to submit this update.');
    const sponsorship = clean(form.get('sponsorship'), 8) === 'yes';
    // The first Life After Baseball photo is also the flip-card's recent photo
    // unless a separate personal portrait was uploaded. This matches the proof.
    if (!photoUrl && album.length > 0) photoUrl = album[0].web;
    if (prior) {
      if (!photoUrl) {photoUrl=prior.photo_url||null;photoKey=prior.photo_key||null;}
      if (!companyLogoUrl) {companyLogoUrl=prior.company_logo_url||null;companyLogoKey=prior.company_logo_key||null;}
      if (!album.length && Array.isArray(prior.life_photos_json)) album.push(...prior.life_photos_json);
    }

    // A confirmed proof is published immediately only after every safety check passes.
    // Unavailable, rejected or uncertain moderation never exposes either public view.
    const safetyText = [fields.story, fields.favoriteHs, fields.favoriteAfter, fields.family,
      fields.businessMessage, fields.businessOffer, fields.teammateTips, displayName].join('\\n');
    const textVerdict = await moderateContributedTip({
      url: normalized.website || '', title: displayName, description: safetyText.slice(0, 2000), playerName: displayName,
    });
    let safeToPublish = textVerdict.decision === 'approve';
    for (const imageUrl of [photoUrl, companyLogoUrl, ...album.map(item => item.web)].filter((url): url is string => Boolean(url))) {
      if (!safeToPublish) break;
      const verdict = await moderatePhoto({ imageUrl, purpose: 'other_photo', playerName: displayName });
      if (verdict?.decision !== 'approve') safeToPublish = false;
    }
    // Automated moderation is a safety filter, not independent identity
    // verification. Never auto-publish a newly claimed retired identity.
    const publicationStatus = 'pending';
    // Revisions create a new record. A previously approved record remains
    // published while the revised version goes through moderation.
    const result = await query<{ id: number }>(
      `INSERT INTO public.alumni_where_yat_now
      (playerid,hsid,contributor_uid,contact_email,display_name,location_city,location_state,
       occupation,company_name,business_website,linkedin_url,instagram_url,facebook_url,x_url,
       story,photo_key,photo_url,company_logo_key,company_logo_url,sponsorship_interest,proof_confirmed_at,retirement_year,favorite_hs_memory,favorite_post_hs_memory,family_life,business_message,business_offer,business_contact_email,business_contact_phone,business_public_opt_in,private_teammate_tips,life_photos_json,alumni_claim_attested,questionnaire_version,status,reviewed_at,replaces_submission_id,contact_phone)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,now(),$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31::jsonb,$32,2,$33,NULL,$34,$35)
       RETURNING id`,
      [playerId,hsid,who.uid,email,displayName,fields.city,fields.state,fields.occupation,fields.company,
       normalized.website,normalized.linkedin,normalized.instagram,
       normalized.facebook,normalized.x,fields.story,photoKey,photoUrl,companyLogoKey,companyLogoUrl,sponsorship,year,fields.favoriteHs,fields.favoriteAfter,fields.family,fields.businessMessage,fields.businessOffer,fields.businessEmail,fields.businessPhone,publicBusiness,fields.teammateTips,JSON.stringify(album),attested,publicationStatus,replacesSubmissionId,fields.contactPhone],
    );
    await logContribution(who, 'contribute_where_yat_now', {
      playerid: playerId, hsid, details: { submissionId: result.rows[0]?.id, sponsorshipInterest: sponsorship, hasPersonalPhoto: !!photoKey, hasCompanyLogo: !!companyLogoKey },
    }).catch(() => {});
    const submissionId = result.rows[0]?.id;
    // Submission succeeds independently of notification delivery. Never disclose reviewer contact details.
    if (submissionId) await syncWhereYatSubmissionToArms(submissionId).catch(error=>console.error('[where-yat-now] ARMS sync queued for retry',error));
    if (submissionId) await notifyWhereYatReviewers({ id: submissionId, hsid, playerId, displayName }).catch(err => console.error('[where-yat-now] reviewer alert failed', err));
    if (submissionId) await notifyWhereYatContributor({id:submissionId,hsid,email:who.email||email,name:displayName,outcome:'received'}).catch(err=>console.error('[where-yat-now] contributor receipt failed',err));
    return NextResponse.json({ ok: true, pending: true, published: false, submissionId, partnerHref: 'https://yatstats.com/partners/' });
  } catch (error) {
    console.error('[where-yat-now] submit failed', { playerId, error });
    return reply('Unable to save this update. Please try again.', 500);
  }
}
