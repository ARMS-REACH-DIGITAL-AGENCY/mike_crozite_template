/**
 * API Route: POST /api/stripe/webhook
 *
 * Handles Stripe webhook events to update user plan in the database.
 * The raw request body must be passed to Stripe for signature verification.
 *
 * Required env vars:
 *   STRIPE_SECRET_KEY
 *   STRIPE_WEBHOOK_SECRET
 *
 * Events handled:
 *   checkout.session.completed      — mark user as superfan + store Stripe IDs
 *   customer.subscription.created   — store subscription ID (may duplicate .completed, safe)
 *   customer.subscription.updated   — sync plan status changes (e.g. resume after pause)
 *   customer.subscription.deleted   — downgrade to Fan plan
 */

import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import {
  activateSuperfan,
  deactivateSuperfan,
  getUserProfileByStripeCustomerId,
} from "@/lib/userProfile";
import { addTagToGHLContact } from "@/lib/gohighlevel";

export const runtime = "nodejs";

// Disable body parsing so we can read the raw bytes for Stripe signature check
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!secretKey || !webhookSecret) {
    console.error("Stripe webhook: missing STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET");
    return NextResponse.json({ error: "Stripe not configured" }, { status: 503 });
  }

  const stripe = new Stripe(secretKey);
  const sig = req.headers.get("stripe-signature");

  if (!sig) {
    return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });
  }

  // Read the raw body as an ArrayBuffer then convert to Buffer
  const rawBody = await req.arrayBuffer();
  const buf = Buffer.from(rawBody);

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(buf, sig, webhookSecret);
  } catch (err) {
    console.error("Stripe webhook signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode !== "subscription") break;

        const firebaseUid = session.metadata?.firebaseUid;
        const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id ?? "";
        const subscriptionId = typeof session.subscription === "string"
          ? session.subscription
          : session.subscription?.id ?? "";

        if (!firebaseUid) {
          console.warn("checkout.session.completed: no firebaseUid in metadata", session.id);
          break;
        }

        await activateSuperfan(firebaseUid, customerId, subscriptionId);

        // Optionally tag the ARMS contact as Superfan
        const profile = await getUserProfileByStripeCustomerId(customerId);
        if (profile?.arms_contact_id) {
          await addTagToGHLContact(profile.arms_contact_id, "superfan").catch(() => { /* non-fatal */ });
        }

        console.log(`Superfan activated for uid=${firebaseUid}, customer=${customerId}`);
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const firebaseUid = sub.metadata?.firebaseUid;
        const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id ?? "";

        // Only activate if the subscription is active or trialing
        if (["active", "trialing"].includes(sub.status)) {
          if (firebaseUid) {
            await activateSuperfan(firebaseUid, customerId, sub.id);
          } else {
            // Try to look up profile by customer ID
            const profile = await getUserProfileByStripeCustomerId(customerId);
            if (profile) {
              await activateSuperfan(profile.firebase_uid, customerId, sub.id);
            } else {
              console.warn(`${event.type}: no profile found for customer ${customerId}`);
            }
          }
        } else if (["canceled", "unpaid", "past_due"].includes(sub.status)) {
          await deactivateSuperfan(sub.id);
        }
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        await deactivateSuperfan(sub.id);

        // Remove ARMS superfan tag
        const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id ?? "";
        const profile = await getUserProfileByStripeCustomerId(customerId);
        if (profile?.arms_contact_id) {
          // TODO: implement ARMS tag removal once a removeTagFromARMSContact helper is added
          console.log(`Subscription deleted, user ${profile.firebase_uid} downgraded to fan`);
        }
        break;
      }

      default:
        // Ignore unhandled events
        break;
    }
  } catch (err) {
    console.error(`Error processing Stripe event ${event.type}:`, err);
    // Return 200 to prevent Stripe from retrying indefinitely for processing errors
    return NextResponse.json({ received: true, warning: "Processing error" });
  }

  return NextResponse.json({ received: true });
}

// Also handle GET so Stripe can ping the endpoint during setup
export async function GET() {
  return NextResponse.json({ ok: true });
}
