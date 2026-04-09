// src/app/api/favorites/route.ts
// API endpoint to manage favorite players for an authenticated user.
//
// POST   /api/favorites
//   Body: { firebaseUid, contactId?, playerId, playerName?, schoolId?, type? }
//   Persists to PostgreSQL user_favorites and tags the GHL contact.
//
// GET    /api/favorites?uid=<firebaseUid>
//   Returns the list of player_ids the user has favorited.
//
// DELETE /api/favorites
//   Body: { firebaseUid, playerId }
//   Removes the favorite from PostgreSQL.

import { NextRequest, NextResponse } from "next/server";
import { addTagToGHLContact } from "@/lib/gohighlevel";
import { saveFavorite, getFavorites, removeFavorite } from "@/lib/userProfile";

// ── POST — save a favorite ───────────────────────────────────────────────────
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
    console.error("Error in favorites POST:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// ── GET — fetch all favorites for a user ────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const firebaseUid = searchParams.get("uid");

    if (!firebaseUid) {
      return NextResponse.json(
        { error: "uid query parameter is required" },
        { status: 400 }
      );
    }

    const favorites = await getFavorites(firebaseUid);
    // Return only the player_ids for a lightweight client payload
    const playerIds = favorites.map((f) => f.player_id);

    return NextResponse.json({ success: true, playerIds });
  } catch (error) {
    console.error("Error in favorites GET:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// ── DELETE — remove a favorite ───────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json();
    const { firebaseUid, playerId } = body;

    if (!firebaseUid || !playerId) {
      return NextResponse.json(
        { error: "firebaseUid and playerId are required" },
        { status: 400 }
      );
    }

    const { deleted } = await removeFavorite(firebaseUid, playerId);

    return NextResponse.json({
      success: true,
      deleted,
      message: deleted
        ? `Player ${playerId} removed from favorites`
        : `Player ${playerId} was not in favorites`,
    });
  } catch (error) {
    console.error("Error in favorites DELETE:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
