/**
 * API Route: POST /api/stripe/create-superfan-checkout-session
 *
 * Creates a Stripe Checkout session for the recurring monthly Superfan subscription.
 * The session includes the Firebase UID in metadata so the webhook can update
 * the user profile after payment.
 *
 * Required env vars:
 *   STRIPE_SECRET_KEY
 *   STRIPE_SUPERFAN_PRICE_ID
 *   NEXT_PUBLIC_APP_URL  (or NEXTAUTH_URL / VERCEL_URL as fallback)
 */

import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getUserProfile, upsertUserProfile } from "@/lib/userProfile";

export const runtime = "nodejs";

function getAppBaseUrl(req: NextRequest): string {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  if (process.env.NEXTAUTH_URL) return process.env.NEXTAUTH_URL.replace(/\/$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  // Fall back to the request origin
  const origin = req.headers.get("origin") || req.headers.get("referer") || "";
  if (origin) {
    try { return new URL(origin).origin; } catch { /* ignore */ }
  }
  return "https://yatstats.com";
}

export async function POST(req: NextRequest) {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  const priceId = process.env.STRIPE_SUPERFAN_PRICE_ID;

  if (!secretKey || !priceId) {
    return NextResponse.json(
      { error: "Stripe is not configured. Set STRIPE_SECRET_KEY and STRIPE_SUPERFAN_PRICE_ID." },
      { status: 503 }
    );
  }

  try {
    const body = await req.json();
    const { firebaseUid, email } = body as { firebaseUid?: string; email?: string };

    if (!firebaseUid || !email) {
      return NextResponse.json(
        { error: "firebaseUid and email are required" },
        { status: 400 }
      );
    }

    const stripe = new Stripe(secretKey);

    // Load or create the user profile so we can reuse an existing Stripe customer
    let profile = await getUserProfile(firebaseUid);
    if (!profile) {
      profile = await upsertUserProfile(firebaseUid, { email, plan: "free" });
    }

    const existingCustomer = profile.stripe_customer_id;
    const base = getAppBaseUrl(req);

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${base}/superfan/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}/superfan/cancel`,
      metadata: {
        firebaseUid,
      },
      subscription_data: {
        metadata: { firebaseUid },
      },
    };

    if (existingCustomer) {
      sessionParams.customer = existingCustomer;
    } else {
      sessionParams.customer_email = email;
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    return NextResponse.json({ url: session.url, sessionId: session.id });
  } catch (error) {
    console.error("Error creating Stripe checkout session:", error);
    return NextResponse.json(
      {
        error: "Failed to create checkout session",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
