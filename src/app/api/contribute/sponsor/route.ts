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
import { SPONSOR_INTERESTS } from '@/lib/contribute';
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

  const name = text(body.name, 120);
  const email = text(body.email, 200).toLowerCase();
  const phone = text(body.phone, 40);
  const business = text(body.business, 160);
  const interest = text(body.interest, 20) as keyof typeof SPONSOR_INTERESTS;
  const message = text(body.message, 2000);
  const hsid = text(body.hsid, 20);
  const schoolName = text(body.schoolName, 160);
  const pageUrl = text(body.pageUrl, 500);
  const playerId = text(body.playerId, 40);
  const playerName = text(body.playerName, 160);

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
