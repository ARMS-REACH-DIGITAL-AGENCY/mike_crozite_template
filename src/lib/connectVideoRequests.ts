// src/lib/connectVideoRequests.ts
// Connect: personal player videos (Cameo-style), MVP.
//
// The flow:
//   1. A reviewer turns a player on (price, who gets the player's share) on
//      the player's CONNECT tab -> connect_video_players.
//   2. A fan fills in the request and pays with Stripe Checkout. The card is
//      only AUTHORIZED (capture_method manual): nobody is charged unless the
//      video is delivered. Card holds last 7 days, so turnaround is <= 7 days.
//   3. The player gets an email with a private link, records the video on a
//      phone and uploads it there (status 'submitted').
//   4. A reviewer watches it in /connect-video/admin and approves: the card is
//      charged and the fan is emailed a private link to their video. Declining
//      (or the player not recording) releases the hold.
//   5. Payouts (player's NIL share or the donation to the high school program)
//      are paid by hand for now and tracked on the request (payout_status).
//
// No high school players: they're minors, and state high school association
// rules on NIL vary. A player must be 18+ and past high school.
import 'server-only';
import Stripe from 'stripe';
import { createHmac, randomUUID } from 'crypto';
import { query } from './db';
import { findOrCreateGhlContact, sendGHLEmail } from './gohighlevel';
import { storyAssetUrl } from './storyAssets';
import { signVideoPost } from './playerConnectVideo';

// YAT?STATS keeps this share of each video; the rest goes to the player (or,
// if the player chose, to the high school program on the player's behalf).
export const PLATFORM_FEE_PCT = 25;
export const MAX_INSTRUCTIONS = 600;

export const OCCASIONS = [
  { id: 'birthday', label: 'Birthday', emoji: '🎂' },
  { id: 'pep-talk', label: 'Pep talk', emoji: '📣' },
  { id: 'hitting-tip', label: 'Hitting tip', emoji: '⚾' },
  { id: 'pitching-advice', label: 'Pitching advice', emoji: '🎯' },
  { id: 'advice', label: 'Advice', emoji: '💬' },
  { id: 'shout-out', label: 'Shout-out', emoji: '🙌' },
  { id: 'question', label: 'Question', emoji: '❓' },
  { id: 'other', label: 'Other', emoji: '✨' },
] as const;
export type OccasionId = (typeof OCCASIONS)[number]['id'];

export type VideoPlayer = {
  playerid: string;
  hsid: string | null;
  player_name: string | null;
  school_name: string | null;
  enabled: boolean;
  price_cents: number;
  turnaround_days: number;
  beneficiary: 'player' | 'school';
  player_email: string | null;
  player_phone: string | null;
  adult_confirmed: boolean;
  agreement_signed: boolean;
  notes: string | null;
};

export type VideoRequest = {
  id: string;
  playerid: string;
  hsid: string | null;
  player_name: string | null;
  school_name: string | null;
  status: 'pending_payment' | 'requested' | 'submitted' | 'delivered' | 'declined' | 'expired' | 'canceled';
  occasion: string;
  for_self: boolean;
  recipient_name: string | null;
  from_name: string | null;
  instructions: string;
  fan_email: string;
  allow_public: boolean;
  price_cents: number;
  platform_fee_cents: number;
  beneficiary: 'player' | 'school';
  stripe_session_id: string | null;
  stripe_payment_intent: string | null;
  authorized_at: string | null;
  due_at: string | null;
  video_key: string | null;
  submitted_at: string | null;
  delivered_at: string | null;
  decline_reason: string | null;
  payout_status: 'unpaid' | 'paid' | 'n/a';
  payout_note: string | null;
  created_at: string;
};

export const money = (cents: number) => '$' + (cents / 100).toFixed(cents % 100 ? 2 : 0);
export const occasionLabel = (id: string) => OCCASIONS.find((o) => o.id === id)?.label || 'Other';

export function stripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY is not set');
  return new Stripe(key);
}

// ---------------------------------------------------------------------------
// Players
// ---------------------------------------------------------------------------

export async function getVideoPlayer(playerid: string): Promise<VideoPlayer | null> {
  const { rows } = await query<VideoPlayer>(`SELECT * FROM public.connect_video_players WHERE playerid = $1`, [playerid]);
  return rows[0] || null;
}

/** What the public Connect tab may show (no email/phone/notes). */
export function publicPlayer(p: VideoPlayer | null) {
  if (!p || !p.enabled || !p.adult_confirmed || !p.agreement_signed) return null;
  return {
    priceCents: p.price_cents,
    turnaroundDays: p.turnaround_days,
    beneficiary: p.beneficiary,
    schoolName: p.school_name,
  };
}

/** The player's name, school and whether they're past high school. */
export async function playerFacts(playerid: string) {
  const { rows } = await query<{ hsid: string | null; name: string; class_of: string | null; level: string | null; school_name: string | null }>(
    `SELECT f.hsid::text AS hsid,
            TRIM(COALESCE(f.first_name,'') || ' ' || COALESCE(f.last_name,'')) AS name,
            f.class_of::text AS class_of,
            UPPER(TRIM(COALESCE(NULLIF(f.display_level_label,''), NULLIF(f.current_level_label,''), NULLIF(f.level_label,''), ''))) AS level,
            NULLIF(TRIM(t.hsname),'') AS school_name
       FROM public.flip_card_front_stage f
       LEFT JOIN public.tbc_schools_raw t ON t.hsid::text = f.hsid::text
      WHERE f.playerid::text = $1
      LIMIT 1`,
    [playerid]
  );
  const r = rows[0];
  if (!r) return null;
  const classOf = parseInt(String(r.class_of || ''), 10);
  const now = new Date();
  // Class of N is in high school until that June.
  const stillInHighSchool = r.level === 'HIGH SCHOOL'
    || (Number.isFinite(classOf) && (classOf > now.getFullYear() || (classOf === now.getFullYear() && now.getMonth() < 6)));
  return { hsid: r.hsid, name: r.name, schoolName: r.school_name, level: r.level, classOf: Number.isFinite(classOf) ? classOf : null, stillInHighSchool };
}

export async function saveVideoPlayer(
  playerid: string,
  input: Partial<VideoPlayer>,
  by: string
): Promise<VideoPlayer> {
  const facts = await playerFacts(playerid);
  if (!facts) throw new UserError('That player was not found.');
  if (input.enabled && facts.stillInHighSchool) throw new UserError('High school players can not take video requests.');
  if (input.enabled && !(input.adult_confirmed && input.agreement_signed)) {
    throw new UserError('Confirm the player is 18+ and signed the player agreement before turning requests on.');
  }
  const price = Math.round(Number(input.price_cents));
  if (!Number.isFinite(price) || price < 500 || price > 100000) throw new UserError('Price must be between $5 and $1,000.');
  const days = Math.round(Number(input.turnaround_days) || 7);
  const { rows } = await query<VideoPlayer>(
    `INSERT INTO public.connect_video_players
       (playerid, hsid, player_name, school_name, enabled, price_cents, turnaround_days, beneficiary,
        player_email, player_phone, adult_confirmed, agreement_signed, notes, updated_by, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14, now())
     ON CONFLICT (playerid) DO UPDATE SET
       hsid = EXCLUDED.hsid, player_name = EXCLUDED.player_name, school_name = EXCLUDED.school_name,
       enabled = EXCLUDED.enabled, price_cents = EXCLUDED.price_cents, turnaround_days = EXCLUDED.turnaround_days,
       beneficiary = EXCLUDED.beneficiary, player_email = EXCLUDED.player_email, player_phone = EXCLUDED.player_phone,
       adult_confirmed = EXCLUDED.adult_confirmed, agreement_signed = EXCLUDED.agreement_signed,
       notes = EXCLUDED.notes, updated_by = EXCLUDED.updated_by, updated_at = now()
     RETURNING *`,
    [
      playerid, facts.hsid, facts.name, facts.schoolName,
      Boolean(input.enabled), price, Math.min(7, Math.max(1, days)),
      input.beneficiary === 'school' ? 'school' : 'player',
      clean(input.player_email, 200)?.toLowerCase() || null, clean(input.player_phone, 40),
      Boolean(input.adult_confirmed), Boolean(input.agreement_signed), clean(input.notes, 1000), by,
    ]
  );
  return rows[0];
}

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

export class UserError extends Error {}

export function clean(v: unknown, max: number): string | null {
  const s = String(v ?? '').replace(/[\u0000-\u0008\u000b-\u001f]+/g, ' ').trim().slice(0, max);
  return s || null;
}

/** A private token for links (the player's upload page, the fan's video page). */
function linkSecret() {
  return process.env.CONNECT_VIDEO_LINK_SECRET || process.env.STRIPE_WEBHOOK_SECRET || process.env.STRIPE_SECRET_KEY || '';
}
export function linkToken(kind: 'player' | 'fan', id: string) {
  const secret = linkSecret();
  if (!secret) throw new Error('No link secret');
  return createHmac('sha256', secret).update(`${kind}:${id}`).digest('base64url').slice(0, 32);
}
export function checkToken(kind: 'player' | 'fan', id: string, token: string | null | undefined) {
  if (!token) return false;
  try { return linkToken(kind, id) === token; } catch { return false; }
}

const SITE = () => (process.env.NEXT_PUBLIC_APP_URL || 'https://yatstats.com').replace(/\/$/, '');
export const fanLink = (id: string) => `${SITE()}/connect-video/order/${id}?t=${linkToken('fan', id)}`;
export const playerLink = (id: string) => `${SITE()}/connect-video/record/${id}?t=${linkToken('player', id)}`;

export async function getRequest(id: string): Promise<VideoRequest | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { rows } = await query<VideoRequest>(`SELECT * FROM public.connect_video_requests WHERE id = $1`, [id]);
  return rows[0] || null;
}

export async function createRequest(input: {
  playerid: string;
  occasion: string;
  forSelf: boolean;
  recipientName: string | null;
  fromName: string | null;
  instructions: string;
  fanEmail: string;
  fanUid: string | null;
  allowPublic: boolean;
  pageUrl: string | null;
  returnOrigin: string;
}) {
  const player = await getVideoPlayer(input.playerid);
  if (!publicPlayer(player)) throw new UserError('This player is not taking video requests right now.');
  const p = player!;
  if (!OCCASIONS.some((o) => o.id === input.occasion)) throw new UserError('Please choose what the video is for.');
  if (!input.instructions || input.instructions.length < 10) throw new UserError('Tell the player what you would like them to say.');
  if (input.instructions.length > MAX_INSTRUCTIONS) throw new UserError(`Please keep instructions under ${MAX_INSTRUCTIONS} characters.`);
  if (!input.forSelf && !input.recipientName) throw new UserError("Who's the video for?");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.fanEmail)) throw new UserError('Please add a valid email so we can send you the video.');

  const id = randomUUID();
  const fee = Math.round((p.price_cents * PLATFORM_FEE_PCT) / 100);
  await query(
    `INSERT INTO public.connect_video_requests
       (id, playerid, hsid, player_name, school_name, occasion, for_self, recipient_name, from_name, instructions,
        fan_email, fan_firebase_uid, allow_public, price_cents, platform_fee_cents, beneficiary, terms_accepted_at, page_url)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16, now(), $17)`,
    [
      id, p.playerid, p.hsid, p.player_name, p.school_name, input.occasion, input.forSelf, input.recipientName,
      input.fromName, input.instructions, input.fanEmail, input.fanUid, input.allowPublic, p.price_cents, fee,
      p.beneficiary, input.pageUrl,
    ]
  );

  const name = p.player_name || 'a YAT?STATS player';
  const session = await stripe().checkout.sessions.create({
    mode: 'payment',
    customer_email: input.fanEmail,
    payment_method_types: ['card'],
    line_items: [{
      quantity: 1,
      price_data: {
        currency: 'usd',
        unit_amount: p.price_cents,
        product_data: {
          name: `Personal video from ${name}`,
          description: `${occasionLabel(input.occasion)} video. Your card is only charged when the video is delivered.`,
        },
      },
    }],
    payment_intent_data: {
      capture_method: 'manual',
      description: `YAT?STATS personal video ${id}`,
      metadata: { kind: 'connect_video', requestId: id, playerid: p.playerid },
    },
    metadata: { kind: 'connect_video', requestId: id, playerid: p.playerid },
    success_url: `${input.returnOrigin}/connect-video/order/${id}?t=${linkToken('fan', id)}&paid=1`,
    cancel_url: input.pageUrl || `${input.returnOrigin}/`,
  });
  await query(`UPDATE public.connect_video_requests SET stripe_session_id = $2, updated_at = now() WHERE id = $1`, [id, session.id]);
  return { id, checkoutUrl: session.url };
}

/**
 * After Checkout: if the card hold went through, the request is live and the
 * player and YAT?STATS are told. Safe to call more than once (webhook and the
 * fan's return both call it).
 */
export async function confirmPaid(id: string): Promise<VideoRequest | null> {
  const r = await getRequest(id);
  if (!r || r.status !== 'pending_payment' || !r.stripe_session_id) return r;
  const session = await stripe().checkout.sessions.retrieve(r.stripe_session_id, { expand: ['payment_intent'] });
  const pi = session.payment_intent as Stripe.PaymentIntent | null;
  if (!pi || pi.status !== 'requires_capture') return r;
  const player = await getVideoPlayer(r.playerid);
  const days = player?.turnaround_days || 7;
  const { rows } = await query<VideoRequest>(
    `UPDATE public.connect_video_requests
        SET status = 'requested', stripe_payment_intent = $2, authorized_at = now(),
            due_at = now() + ($3 || ' days')::interval, updated_at = now()
      WHERE id = $1 AND status = 'pending_payment'
      RETURNING *`,
    [id, pi.id, String(days)]
  );
  const live = rows[0];
  if (!live) return getRequest(id); // the other caller got here first
  await Promise.all([
    notifyFan(live, 'booked').catch((e) => console.error('[connect-video] fan email failed', e)),
    notifyPlayer(live, player).catch((e) => console.error('[connect-video] player email failed', e)),
    notifyAdmins(live, `New video request for ${live.player_name}`, 'A fan booked a video. The card is on hold until it is delivered.')
      .catch((e) => console.error('[connect-video] admin email failed', e)),
  ]);
  return live;
}

/** The player's upload: a signed S3 form for the request's video. */
export function signRequestUpload(r: VideoRequest, contentType: string) {
  return signVideoPost(`players/connect-videos/${r.playerid}/requests/${r.id}-${randomUUID().slice(0, 8)}`, contentType);
}

export async function markSubmitted(r: VideoRequest, key: string) {
  if (!['requested', 'submitted'].includes(r.status)) throw new UserError('This request is closed.');
  if (!key.startsWith(`players/connect-videos/${r.playerid}/requests/${r.id}-`)) throw new UserError('Bad upload.');
  const { rows } = await query<VideoRequest>(
    `UPDATE public.connect_video_requests SET status = 'submitted', video_key = $2, submitted_at = now(), updated_at = now()
      WHERE id = $1 RETURNING *`,
    [r.id, key]
  );
  await notifyAdmins(rows[0], `${r.player_name} recorded a video`, 'Review it and approve to charge the fan and deliver it.')
    .catch((e) => console.error('[connect-video] admin email failed', e));
  return rows[0];
}

/** Approve: charge the card, then send the fan the video. */
export async function deliver(r: VideoRequest) {
  if (r.status !== 'submitted' || !r.video_key || !r.stripe_payment_intent) throw new UserError('There is no video to deliver yet.');
  const pi = await stripe().paymentIntents.capture(r.stripe_payment_intent);
  if (pi.status !== 'succeeded') throw new UserError('The charge did not go through: ' + pi.status);
  const { rows } = await query<VideoRequest>(
    `UPDATE public.connect_video_requests SET status = 'delivered', delivered_at = now(), updated_at = now()
      WHERE id = $1 RETURNING *`,
    [r.id]
  );
  await notifyFan(rows[0], 'delivered').catch((e) => console.error('[connect-video] fan email failed', e));
  return rows[0];
}

/** Decline or cancel: release the card hold and tell the fan. */
export async function closeRequest(r: VideoRequest, status: 'declined' | 'expired' | 'canceled', reason: string | null) {
  if (!['pending_payment', 'requested', 'submitted'].includes(r.status)) throw new UserError('This request is already closed.');
  if (r.stripe_payment_intent) {
    await stripe().paymentIntents.cancel(r.stripe_payment_intent).catch((e) => {
      // Already released by Stripe (hold expired) is fine.
      if (!String(e?.message || '').match(/canceled|status of/i)) throw e;
    });
  }
  const { rows } = await query<VideoRequest>(
    `UPDATE public.connect_video_requests SET status = $2, decline_reason = $3, payout_status = 'n/a', updated_at = now()
      WHERE id = $1 RETURNING *`,
    [r.id, status, reason]
  );
  if (r.status !== 'pending_payment') await notifyFan(rows[0], 'declined').catch((e) => console.error('[connect-video] fan email failed', e));
  return rows[0];
}

export async function setPayout(r: VideoRequest, status: 'unpaid' | 'paid', note: string | null) {
  const { rows } = await query<VideoRequest>(
    `UPDATE public.connect_video_requests SET payout_status = $2, payout_note = $3, updated_at = now() WHERE id = $1 RETURNING *`,
    [r.id, status, note]
  );
  return rows[0];
}

export async function listRequests(limit = 200): Promise<VideoRequest[]> {
  const { rows } = await query<VideoRequest>(
    `SELECT * FROM public.connect_video_requests
      WHERE status <> 'pending_payment' OR created_at > now() - interval '2 days'
      ORDER BY CASE status WHEN 'submitted' THEN 0 WHEN 'requested' THEN 1 ELSE 2 END, created_at DESC
      LIMIT $1`,
    [limit]
  );
  return rows;
}

export async function listVideoPlayers(): Promise<VideoPlayer[]> {
  const { rows } = await query<VideoPlayer>(`SELECT * FROM public.connect_video_players ORDER BY enabled DESC, player_name`);
  return rows;
}

export const requestVideoUrl = (r: VideoRequest) => storyAssetUrl(r.video_key);

/** The player's share and where it goes, for emails and the admin page. */
export function split(r: Pick<VideoRequest, 'price_cents' | 'platform_fee_cents' | 'beneficiary' | 'school_name'>) {
  const share = r.price_cents - r.platform_fee_cents;
  return { share, to: r.beneficiary === 'school' ? `${r.school_name || 'the high school'} baseball program` : 'the player' };
}

// ---------------------------------------------------------------------------
// Email (through ARMS / HighLevel, like the rest of the site)
// ---------------------------------------------------------------------------

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function wrap(title: string, body: string, cta?: { href: string; label: string }) {
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#1b1b1b">
  <div style="background:#111;color:#ffd21a;padding:16px 20px;font-weight:800;letter-spacing:2px">YAT?STATS · CONNECT</div>
  <div style="padding:20px;border:1px solid #ddd;border-top:0">
    <h2 style="margin:0 0 12px;font-size:20px">${esc(title)}</h2>
    ${body}
    ${cta ? `<p style="margin:22px 0 6px"><a href="${esc(cta.href)}" style="background:#ffd21a;color:#111;padding:12px 18px;text-decoration:none;font-weight:800;border-radius:4px">${esc(cta.label)}</a></p>` : ''}
  </div></div>`;
}

function requestSummary(r: VideoRequest) {
  return `<table style="font-size:14px;line-height:1.5;margin:8px 0" cellpadding="0" cellspacing="0">
    <tr><td style="color:#666;padding-right:12px">For</td><td>${esc(r.for_self ? (r.from_name || 'The fan') + ' (themselves)' : r.recipient_name)}</td></tr>
    ${r.from_name && !r.for_self ? `<tr><td style="color:#666;padding-right:12px">From</td><td>${esc(r.from_name)}</td></tr>` : ''}
    <tr><td style="color:#666;padding-right:12px">Occasion</td><td>${esc(occasionLabel(r.occasion))}</td></tr>
  </table>
  <p style="font-size:14px;background:#f6f3ea;padding:12px;border-radius:4px;white-space:pre-wrap">${esc(r.instructions)}</p>`;
}

async function emailTo(email: string, subject: string, html: string, firstName?: string) {
  const contactId = await findOrCreateGhlContact(email, firstName);
  if (!contactId) throw new Error('No ARMS contact for ' + email);
  const ok = await sendGHLEmail(contactId, subject, html);
  if (!ok) throw new Error('Email failed for ' + email);
}

async function notifyFan(r: VideoRequest, kind: 'booked' | 'delivered' | 'declined') {
  const name = r.player_name || 'the player';
  if (kind === 'booked') {
    await emailTo(r.fan_email, `Your video request for ${name} is in`, wrap(
      `${name} has your request`,
      `<p>Thanks for booking a personal video. ${esc(name)} has up to 7 days to record it.</p>${requestSummary(r)}
       <p style="font-size:13px;color:#555">Your card is on hold for ${esc(money(r.price_cents))} and is <b>only charged when the video is delivered</b>. If it isn't recorded, the hold is released.</p>`,
      { href: fanLink(r.id), label: 'View my request' }
    ), r.from_name || undefined);
  } else if (kind === 'delivered') {
    await emailTo(r.fan_email, `Your video from ${name} is ready`, wrap(
      `Your video from ${name} is ready`,
      `<p>${esc(name)} recorded your ${esc(occasionLabel(r.occasion).toLowerCase())} video. Watch it, download it and share it.</p>`,
      { href: fanLink(r.id), label: 'Watch my video' }
    ), r.from_name || undefined);
  } else {
    await emailTo(r.fan_email, `Your video request for ${name}`, wrap(
      `Your request was not completed`,
      `<p>${esc(name)} wasn't able to record this video${r.decline_reason ? `: ${esc(r.decline_reason)}` : '.'}</p>
       <p>The hold on your card has been released. You were not charged.</p>`
    ), r.from_name || undefined);
  }
}

async function notifyPlayer(r: VideoRequest, p: VideoPlayer | null) {
  if (!p?.player_email) return;
  const { share, to } = split(r);
  await emailTo(p.player_email, `New YAT?STATS video request: ${occasionLabel(r.occasion)}`, wrap(
    'A fan requested a video from you',
    `${requestSummary(r)}
     <p style="font-size:14px">Record it on your phone (hold it upright, about 30–60 seconds) and upload it from the link below within 7 days.
     Your share is <b>${esc(money(share))}</b>, going to ${esc(to)}.</p>
     <p style="font-size:12px;color:#666">Please don't show team logos or promote any product in the video.</p>`,
    { href: playerLink(r.id), label: 'Record & upload' }
  ), (p.player_name || '').split(' ')[0] || undefined);
}

export function adminEmails() {
  return String(process.env.CONNECT_VIDEO_ADMIN_EMAILS || process.env.CONTRIBUTE_REVIEWER_EMAILS || '')
    .split(',').map((v) => v.trim().toLowerCase()).filter(Boolean);
}

async function notifyAdmins(r: VideoRequest, subject: string, line: string) {
  const html = wrap(subject, `<p>${esc(line)}</p>
    <p style="font-size:14px"><b>${esc(r.player_name)}</b> · ${esc(money(r.price_cents))} · fan ${esc(r.fan_email)}</p>${requestSummary(r)}
    <p style="font-size:13px">Player link (send it by text if the player has no email on file):<br>${esc(playerLink(r.id))}</p>`,
    { href: `${SITE()}/connect-video/admin`, label: 'Open the video queue' });
  await Promise.all(adminEmails().map((e) => emailTo(e, subject, html)));
}
