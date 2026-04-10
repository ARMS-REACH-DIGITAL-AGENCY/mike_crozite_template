/**
 * API Route: POST /api/auth/login
 * Called after a successful Firebase sign-in to:
 *   1. Load (or create) the user profile
 *   2. Backfill armsContactId if missing (look up by email in ARMS/GHL)
 * Returns the current profile so the client can hydrate greeting, home_hsid, role, etc.
 */

import { NextRequest, NextResponse } from "next/server";
import { lookupGHLContactByEmail } from "@/lib/gohighlevel";
import { getUserProfile, upsertUserProfile } from "@/lib/userProfile";
import { getSchoolByHsid } from "@/lib/db";

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

    // If no profile exists yet, create a minimal one (no home_hsid — login doesn't set affiliation)
    if (!profile) {
      profile = await upsertUserProfile(body.uid, {
        email: body.email,
        first_name: body.firstName ?? null,
        last_name: body.lastName ?? null,
        plan: "fan",
      });
    }

    // Backfill armsContactId if still missing — look up by email in ARMS, do NOT create duplicate
    if (!profile.arms_contact_id) {
      const armsContactId = await lookupGHLContactByEmail(body.email);
      if (armsContactId) {
        profile = await upsertUserProfile(body.uid, {
          email: body.email,
          arms_contact_id: armsContactId,
          arms_location_id: process.env.GHL_LOCATION_ID ?? null,
        });
      }
    }

    // Look up the home school name for friendly UI messages
    let homeSchoolName: string | null = null;
    let homeSchoolLocation: string | null = null;
    if (profile.home_hsid) {
      try {
        const school = await getSchoolByHsid(String(profile.home_hsid));
        if (school) {
          homeSchoolName = school.hsname ?? null;
          homeSchoolLocation = school.hslocation ?? null;
        }
      } catch { /* non-fatal */ }
    }

    return NextResponse.json({
      success: true,
      contactId: profile.arms_contact_id,
      plan: profile.plan,
      isSuperfan: profile.plan === "superfan",
      firstName: profile.first_name,
      homeHsid: profile.home_hsid,
      homeSchoolName,
      homeSchoolLocation,
      role: profile.role,
      subscriptionStatus: profile.subscription_status,
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
