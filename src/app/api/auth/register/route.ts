/**
 * API Route: POST /api/auth/register
 * Handles user registration:
 *   1. Guard against duplicate email registrations (same email, different firebase uid).
 *   2. Find-or-create ARMS contact (non-fatal — profile is written even if GHL fails)
 *   3. Persist user profile in PostgreSQL (firebase_uid → home_hsid → arms_contact_id → plan)
 * Called from the client-side Firebase authentication after a user signs up.
 * home_hsid is set from the subdomain at first registration and never overwritten.
 */

import { NextRequest, NextResponse } from "next/server";
import { findOrCreateGhlContact } from "@/lib/gohighlevel";
import { getUserProfileByEmail, upsertUserProfile } from "@/lib/userProfile";

export const runtime = "nodejs";

interface RegisterRequestBody {
  uid: string;
  email: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  subdomain: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: RegisterRequestBody = await request.json();

    // Validate required fields
    if (!body.uid || !body.email) {
      return NextResponse.json(
        { error: "uid and email are required" },
        { status: 400 }
      );
    }

    // Guard: if a profile already exists for this email under a different firebase_uid,
    // reject the registration. (Firebase itself prevents duplicate email sign-ups, but
    // this adds a server-side check as belt-and-suspenders.)
    const existing = await getUserProfileByEmail(body.email);
    if (existing && existing.firebase_uid !== body.uid) {
      return NextResponse.json(
        { error: "This email already has a YAT?STATS account. Please sign in." },
        { status: 409 }
      );
    }

    // 1. Find-or-create ARMS contact (non-fatal)
    //    If GHL is down, rate-limited, or misconfigured, we still write the Neon profile.
    //    The login API will backfill arms_contact_id on the user's next sign-in.
    let armsContactId: string | null = null;
    try {
      armsContactId = await findOrCreateGhlContact(
        body.email,
        body.firstName,
        body.lastName
      );
    } catch (ghlErr) {
      console.error("GHL contact creation failed (non-fatal, will retry on login):", ghlErr);
    }

    // 2. Persist user profile in PostgreSQL
    //    home_hsid is set from the registration subdomain (first registration only;
    //    subsequent upserts preserve the original value via COALESCE).
    const profile = await upsertUserProfile(body.uid, {
      email: body.email,
      first_name: body.firstName ?? null,
      last_name: body.lastName ?? null,
      home_hsid: body.subdomain || null,
      arms_contact_id: armsContactId,
      arms_location_id: process.env.GHL_LOCATION_ID ?? null,
      plan: "fan",
    });

    return NextResponse.json(
      {
        success: true,
        contactId: armsContactId,
        plan: profile.plan,
        homeHsid: profile.home_hsid,
        message: "User registered and synced",
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error in registration API:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
