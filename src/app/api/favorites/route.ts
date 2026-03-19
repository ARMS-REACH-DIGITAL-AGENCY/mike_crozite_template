// src/app/api/favorites/route.ts
// API endpoint to save a favorite player for an authenticated user.
// POST /api/favorites
// Body: { firebaseUid: string, contactId?: string, playerId: string, playerName?: string, schoolId?: string, type?: "fan" | "superfan" }
//
// Persists to:
//   1. PostgreSQL user_favorites table (canonical, survives devices/sessions)
//   2. GoHighLevel contact tag (secondary, for CRM segmentation)

import { NextRequest, NextResponse } from "next/server";
import { addTagToGHLContact } from "@/lib/gohighlevel";
import { saveFavorite } from "@/lib/userProfile";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { firebaseUid, contactId, playerId, playerName, schoolId, type } = body;

    if (!firebaseUid || !playerId) {
      return NextResponse.json(
        { error: "firebaseUid and playerId are required" },
        { status: 400 }
      );
    }

    // 1. Persist to PostgreSQL (canonical storage)
    const { created } = await saveFavorite(firebaseUid, playerId, {
      ghlContactId: contactId ?? null,
      schoolId: schoolId ?? null,
    });

    // 2. Tag the GHL contact (secondary / non-fatal)
    if (contactId) {
      const tagPrefix = type === "superfan" ? "superfav" : "fav";
      const tag = `${tagPrefix}:${playerId}`;
      const nameTag = `${tagPrefix}:${(playerName || playerId).replace(/\s+/g, "-").toLowerCase()}`;
      await Promise.allSettled([
        addTagToGHLContact(contactId, tag),
        addTagToGHLContact(contactId, nameTag),
      ]);
    }

    return NextResponse.json({
      success: true,
      created,
      message: `Player ${playerName || playerId} added to favorites`,
    });
  } catch (error) {
    console.error("Error in favorites API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
