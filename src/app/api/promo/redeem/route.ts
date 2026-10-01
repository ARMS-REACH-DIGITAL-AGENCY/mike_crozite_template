/**
 * API Route: POST /api/promo/redeem
 *
 * Redeems a promo code for free Superfan access (no Stripe checkout).
 * Body: { firebaseUid: string, email?: string, code: string }
 *
 * Success: { ok: true, expiresAt: string | null }  (null = lifetime grant)
 * Failure: { error: string, reason: string } with 4xx status.
 */

import { NextRequest, NextResponse } from 'next/server';
import { redeemPromoCode } from '@/lib/promo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  let body: { firebaseUid?: string; email?: string; code?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const firebaseUid = String(body.firebaseUid || '').trim();
  const code = String(body.code || '').trim();
  const email = body.email ? String(body.email).trim() : null;

  if (!firebaseUid || !code) {
    return NextResponse.json(
      { error: 'firebaseUid and code are required.' },
      { status: 400 }
    );
  }

  try {
    const result = await redeemPromoCode(firebaseUid, email, code);
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, reason: result.reason },
        { status: result.status }
      );
    }
    return NextResponse.json({ ok: true, expiresAt: result.expiresAt });
  } catch (error) {
    console.error('Promo redeem failed:', error);
    return NextResponse.json(
      { error: 'Could not apply the promo code. Try again.' },
      { status: 500 }
    );
  }
}
