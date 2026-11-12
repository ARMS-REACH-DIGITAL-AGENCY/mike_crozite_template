/**
 * API Route: POST /api/promo/check
 *
 * Says whether a promo code is valid, without redeeming it. The JOIN form's
 * APPLY button uses it so the Superfan button can read "FREE" before the
 * fan creates an account (Pete, Nov 2026: "$2.99/MO" on the button scared
 * people who had a code). Redemption still happens in /api/promo/redeem.
 *
 * Body: { code: string }  ->  { ok: true, lifetime: boolean } | { ok: false }
 */

import { NextRequest, NextResponse } from 'next/server';
import { checkPromoCode } from '@/lib/promo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  let code = '';
  try {
    code = String((await req.json())?.code || '').slice(0, 64);
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const result = checkPromoCode(code);
  return NextResponse.json(result.ok ? { ok: true, lifetime: result.lifetime } : { ok: false });
}
