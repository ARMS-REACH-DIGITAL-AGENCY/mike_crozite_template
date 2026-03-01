/**
 * API Route: POST /api/auth/register
 * Handles user registration and syncs the new user to GoHighLevel
 * Called from the client-side Firebase authentication after a user signs up
 */

import { NextRequest, NextResponse } from "next/server";
import { createGHLContact } from "@/lib/gohighlevel";

export const runtime = "nodejs";

interface RegisterRequestBody {
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
    if (!body.email || !body.subdomain) {
      return NextResponse.json(
        { error: "Email and subdomain are required" },
        { status: 400 }
      );
    }

    // Create the contact in GoHighLevel
    const ghlResult = await createGHLContact(
      {
        email: body.email,
        firstName: body.firstName,
        lastName: body.lastName,
        phone: body.phone,
      },
      body.subdomain
    );

    // Check if the contact was created successfully
    if ("error" in ghlResult) {
      console.error("Failed to create GoHighLevel contact:", ghlResult);
      // Note: We return success anyway because the user was created in Firebase
      // The GHL sync is a secondary operation
      return NextResponse.json(
        {
          success: true,
          warning: "User created but failed to sync to GoHighLevel",
          ghlError: ghlResult.error,
        },
        { status: 200 }
      );
    }

    // Success
    return NextResponse.json(
      {
        success: true,
        contactId: ghlResult.id,
        message: "User registered and synced to GoHighLevel",
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
