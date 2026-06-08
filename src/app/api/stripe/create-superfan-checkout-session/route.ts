/**
 * API Route: POST /api/stripe/create-superfan-checkout-session
 *
 * Creates a Stripe Checkout session for the recurring monthly Superfan subscription.
 * The session includes the Firebase UID in metadata so the webhook can update
 * the user profile after payment.
 */

import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getUserProfile, upsertUserProfile } from "@/lib/userProfile";

export const runtime = "nodejs";

function getStripeSuperfanPriceId(): string | undefined {
  return (
    process.env.STRIPE_SUPERFAN_PRICE_ID ||
    process.env.STRIPE_SUPERFAN_MONTHLY_PRICE_ID ||
    process.env.STRIPE_MONTHLY_PRICE_ID ||
    process.env.STRIPE_PRICE_ID
  );
}

function getAppBaseUrl(req: NextRequest): string {
  const origin = req.headers.get("origin") || "";
  if (origin) {
    try {
      return new URL(origin).origin;
    } catch {}
  }

  const referer = req.headers.get("referer") || "";
  if (referer) {
    try {
      return new URL(referer).origin;
    } catch {}
  }

  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  if (process.env.NEXTAUTH_URL) return process.env.NEXTAUTH_URL.replace(/\/$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "https://yatstats.com";
}

export async function POST(req: NextRequest) {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  const priceId = getStripeSuperfanPriceId();

  if (!secretKey || !priceId) {
    console.error("Stripe checkout configuration missing:", {
      hasSecretKey: Boolean(secretKey),
      hasPriceId: Boolean(priceId),
    });

    return NextResponse.json(
      { error: "Stripe checkout is not configured. Missing Stripe secret key or Superfan price ID." },
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

    // Fail early with a clear error if the configured price ID is wrong or inactive.
    const price = await stripe.prices.retrieve(priceId);
    if (!price.active) {
      return NextResponse.json(
        { error: "The configured Superfan Stripe price is inactive." },
        { status: 503 }
      );
    }

    let existingCustomer: string | null = null;

    try {
      let profile = await getUserProfile(firebaseUid);
      if (!profile) {
        profile = await upsertUserProfile(firebaseUid, { email, plan: "fan" });
      }
      existingCustomer = profile.stripe_customer_id;
    } catch (profileError) {
      console.error(
        "Stripe checkout profile lookup/upsert failed; continuing with customer_email fallback:",
        profileError
      );
    }

    const base = getAppBaseUrl(req);

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${base}/superfan/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}/superfan/cancel`,
      client_reference_id: firebaseUid,
      customer_update: existingCustomer ? { name: "auto", address: "auto" } : undefined,
      metadata: {
        firebaseUid,
        email,
        source: "yatstats-superfan-checkout",
      },
      subscription_data: {
        metadata: {
          firebaseUid,
          email,
          source: "yatstats-superfan-checkout",
        },
      },
    };

    if (existingCustomer) {
      sessionParams.customer = existingCustomer;
    } else {
      sessionParams.customer_email = email;
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    if (!session.url) {
      return NextResponse.json(
        { error: "Stripe did not return a checkout URL." },
        { status: 500 }
      );
    }

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
