/**
 * API Route: POST /api/auth/register
 * Handles user registration:
 *   1. Find-or-create GHL contact (prevents duplicates)
 *   2. Persist user profile in PostgreSQL (firebase_uid → ghl_contact_id → plan)
 * Called from the client-side Firebase authentication after a user signs up.
 */

import { NextRequest, NextResponse } from "next/server";
import { findOrCreateGhlContact } from "@/lib/gohighlevel";
import { upsertUserProfile } from "@/lib/userProfile";

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

    // 1. Find-or-create GHL contact (safe against duplicates)
    const ghlContactId = await findOrCreateGhlContact(
      body.email,
      body.firstName,
      body.lastName
    );

    // 2. Persist user profile in PostgreSQL
    const profile = await upsertUserProfile(body.uid, {
      email: body.email,
      first_name: body.firstName ?? null,
      last_name: body.lastName ?? null,
      ghl_contact_id: ghlContactId,
      ghl_location_id: process.env.GHL_LOCATION_ID ?? null,
      plan: "free",
    });

    return NextResponse.json(
      {
        success: true,
        contactId: ghlContactId,
        plan: profile.plan,
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
