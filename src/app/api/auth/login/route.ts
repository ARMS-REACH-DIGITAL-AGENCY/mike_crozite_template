/**
 * API Route: POST /api/auth/login
 * Called after a successful Firebase sign-in to:
 *   1. Load (or create) the user profile
 *   2. Backfill ghlContactId if missing (look up by email in GHL)
 * Returns the current profile and plan so the client can update its state.
 */

import { NextRequest, NextResponse } from "next/server";
import { lookupGHLContactByEmail } from "@/lib/gohighlevel";
import { getUserProfile, upsertUserProfile } from "@/lib/userProfile";

export const runtime = "nodejs";

interface LoginRequestBody {
  uid: string;
  email: string;
  firstName?: string;
  lastName?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: LoginRequestBody = await request.json();

    if (!body.uid || !body.email) {
      return NextResponse.json(
        { error: "uid and email are required" },
        { status: 400 }
      );
    }

    // Load existing profile
    let profile = await getUserProfile(body.uid);

    // If no profile exists yet, create a minimal one
    if (!profile) {
      profile = await upsertUserProfile(body.uid, {
        email: body.email,
        first_name: body.firstName ?? null,
        last_name: body.lastName ?? null,
        plan: "free",
      });
    }

    // Backfill ghlContactId if still missing — look up by email, do NOT create duplicate
    if (!profile.ghl_contact_id) {
      const ghlContactId = await lookupGHLContactByEmail(body.email);
      if (ghlContactId) {
        profile = await upsertUserProfile(body.uid, {
          email: body.email,
          ghl_contact_id: ghlContactId,
          ghl_location_id: process.env.GHL_LOCATION_ID ?? null,
        });
      }
    }

    return NextResponse.json({
      success: true,
      contactId: profile.ghl_contact_id,
      plan: profile.plan,
      isSuperfan: profile.plan === "superfan",
    });
  } catch (error) {
    console.error("Error in login API:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
