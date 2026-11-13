// src/app/api/contribute/sponsor/route.ts
// Connect & Contribute: a sponsorship inquiry from the portal page ("Contact
// the YAT?STATS Partner Program Team"). It becomes an ARMS lead: the contact
// is found or created in GoHighLevel, tagged as a sponsor lead with what
// they're interested in and the school, and what they wrote is added as a
// note. No account needed - a business owner may not be a fan yet.
//
//   POST JSON { name, email, phone?, business?, interest, message?, hsid,
//               schoolName?, pageUrl?, website (honeypot, must be empty) }
import { NextRequest, NextResponse } from 'next/server';
import { SPONSOR_INTERESTS, PLAYER_ID } from '@/lib/contribute';
import { identifyFan } from '@/lib/fanIdentity';
import { getUserProfile } from '@/lib/userProfile';
import { query } from '@/lib/db';
import { addNoteToGHLContact, addTagToGHLContact, findOrCreateGhlContact } from '@/lib/gohighlevel';

export const runtime = 'nodejs';

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });
const text = (v: unknown, max = 500) => String(v ?? '').trim().slice(0, max);

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return fail('Nothing arrived.');
  }
  // A bot fills every field; people never see this one.
  if (text(body.website)) return NextResponse.json({ ok: true });

  let name = text(body.name, 120);
  let email = text(body.email, 200).toLowerCase();
  const phone = text(body.phone, 40);
  const business = text(body.business, 160);
  const interest = text(body.interest, 20) as keyof typeof SPONSOR_INTERESTS;
  const message = text(body.message, 2000);
  let hsid = text(body.hsid, 20);
  let schoolName = text(body.schoolName, 160);
  const pageUrl = text(body.pageUrl, 500);
  const playerId = text(body.playerId, 40);
  let playerName = text(body.playerName, 160);

  // Fan video requests require a verified account. Browser-submitted
  // names, email addresses and player labels never establish identity.
  let registeredFanUid = '';
  if (interest === 'video') {
    const fan = await identifyFan(req, req.headers.get('x-firebase-token')).catch(() => null);
    if (!fan) return fail('Please sign in or join YAT?STATS to register your interest.', 401);
    registeredFanUid = fan.uid;
    const profile = await getUserProfile(fan.uid).catch((error) => {
      console.error('[contribute/sponsor] fan profile lookup failed', error);
      return null;
    });
    if (!profile || !profile.email) return fail('Please complete your YAT?STATS registration before submitting.', 403);
    name = [profile.first_name, profile.last_name].map(v => text(v, 70)).filter(Boolean).join(' ');
    email = text(profile.email, 200).toLowerCase();
    if (!name) return fail('Add your name to your YAT?STATS account profile before submitting.', 409);
    if (!PLAYER_ID.test(playerId)) return fail('Find and select the player you want a video from.');
    const requestedHsid = /^\d{1,10}$/.test(hsid) ? hsid : '';
    type PlayerRow = { player_id: string; player_name: string; hsid: string; school_name: string | null };
    let rows: PlayerRow[] = [];
    try {
      const stage = await query<PlayerRow>(
        [
          'SELECT f.playerid::text AS player_id,',
          "COALESCE(NULLIF(BTRIM(f.display_name), ''), CONCAT_WS(' ', f.first_name, f.last_name)) AS player_name,",
          'f.hsid::text AS hsid, ss.hsname AS school_name',
          'FROM public.flip_card_front_stage f',
          'LEFT JOIN public.school_success ss ON ss.hsid::text = f.hsid::text',
          'WHERE f.playerid::text = $1',
          'ORDER BY (f.hsid::text = $2) DESC LIMIT 1',
        ].join(' '), [playerId, requestedHsid]
      );
      rows = stage.rows;
      if (!rows.length) {
        const raw = await query<PlayerRow>(
          [
            "SELECT p.playerid::text AS player_id, CONCAT_WS(' ',p.firstname,p.lastname) AS player_name,",
            'ph.hsid::text AS hsid, ss.hsname AS school_name',
            'FROM public.tbc_players_raw p',
            'JOIN public.player_hsids ph ON ph.playerid::text = p.playerid::text',
            'LEFT JOIN public.school_success ss ON ss.hsid::text = ph.hsid::text',
            'WHERE p.playerid::text = $1',
            'ORDER BY (ph.hsid::text = $2) DESC LIMIT 1',
          ].join(' '), [playerId, requestedHsid]
        );
        rows = raw.rows;
      }
    } catch (error) {
      console.error('[contribute/sponsor] player lookup failed', error);
      return fail('Player lookup is temporarily unavailable. Please try again.', 503);
    }
    const requested = rows[0];
    if (!requested?.player_id || !requested.player_name?.trim())
      return fail('That player could not be verified. Please choose a result from player search.', 404);
    playerName = text(requested.player_name, 160);
    hsid = text(requested.hsid, 20);
    schoolName = text(requested.school_name, 160);
  }

  if (!name) return fail('Please add your name.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail('Please add a valid email.');
  if (!(interest in SPONSOR_INTERESTS)) return fail('Pick what you are interested in.');
  if (hsid && !/^\d+$/.test(hsid)) return fail('Unknown school.');
  if (interest === 'video_player' && (!playerName || !/^(?:YAT)?\d+$/i.test(playerId))) return fail('Find and select your player profile before applying.');

  const [firstName, ...rest] = name.split(/\s+/);
  try {
    const contactId = await findOrCreateGhlContact(email, firstName, rest.join(' '), hsid || undefined, schoolName || undefined);
    if (!contactId) return fail('Your message could not be sent. Please email info@yatstats.com.', 502);
    const tags = interest === 'video' || interest === 'video_player'
      ? [interest === 'video_player' ? 'player-video-program-applicant' : 'player-video-interest', ...(hsid ? [`video-hsid:${hsid}`] : [])]
      : ['sponsor-lead', `sponsor:${interest}`, ...(hsid ? [`sponsor-hsid:${hsid}`] : [])];
    await Promise.all(tags.map((tag) => addTagToGHLContact(contactId, tag)));
    await addNoteToGHLContact(contactId, [
      `${interest === 'video_player' ? 'Player application' : interest === 'video' ? 'Fan video interest' : 'Sponsorship inquiry'}: ${SPONSOR_INTERESTS[interest]}`,
      playerName ? `Selected player: ${playerName} (${playerId})` : '',
      registeredFanUid ? `YAT?STATS signed-in fan UID: ${registeredFanUid}` : '',
      schoolName || hsid ? `School: ${schoolName}${hsid ? ` (hsid ${hsid})` : ''}` : '',
      business ? `Business: ${business}` : '',
      phone ? `Phone: ${phone}` : '',
      message ? `Message: ${message}` : '',
      pageUrl ? `From: ${pageUrl}` : '',
    ].filter(Boolean).join('\n'));
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[contribute/sponsor] failed', error);
    return fail('Your message could not be sent. Please email info@yatstats.com.', 500);
  }
}
