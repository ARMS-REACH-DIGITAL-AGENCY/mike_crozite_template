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
import { getUserProfile, saveFavorite, getFavorites, removeFavorite } from "@/lib/userProfile";

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

    // ── Server-side canonical home_hsid enforcement ───────────────────────────
    // This is the authoritative gate — the client-side check in FavoriteButton.tsx
    // is a UX convenience only. Fans may only favorite players from their home school.
    const profile = await getUserProfile(firebaseUid);
    if (!profile) {
      return NextResponse.json(
        { error: "User profile not found. Please register first.", code: "NO_PROFILE" },
        { status: 404 }
      );
    }
    const isSuperfan = profile.plan === "superfan";
    if (!isSuperfan) {
      if (!profile.home_hsid) {
        return NextResponse.json(
          { error: "Your account has no home school set. Please contact support.", code: "NO_HOME_HSID" },
          { status: 403 }
        );
      }
      if (schoolId && schoolId !== profile.home_hsid) {
        return NextResponse.json(
          {
            error: `Fan accounts can only favorite players from their home school (${profile.home_hsid}). Upgrade to Super Fan for global access.`,
            code: "CROSS_SCHOOL_BLOCKED",
            homeHsid: profile.home_hsid,
          },
          { status: 403 }
        );
      }
    }
    // ─────────────────────────────────────────────────────────────────────────

    // 1. Persist to PostgreSQL (canonical storage)
    const { created } = await saveFavorite(firebaseUid, playerId, {
      armsContactId: contactId ?? null,
      schoolId: schoolId ?? null,
    });

    // 2. Tag the GHL contact (secondary / non-fatal)
    if (contactId) {
      const tagPrefix = isSuperfan ? "superfav" : "fav";
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
    const currentHsid = searchParams.get("hsid"); // optional: current microsite context

    // For Fans (non-Super Fan), filter favorites to only return those from their home school.
    // This prevents cross-school favorites (created before enforcement) from
    // appearing in the gallery filter on the wrong microsite.
    const profile = await getUserProfile(firebaseUid);
    let playerIds: string[];
    if (profile && profile.plan !== "superfan" && profile.home_hsid) {
      if (currentHsid && currentHsid !== profile.home_hsid) {
        // User is browsing a foreign microsite — they have no favorites here
        playerIds = [];
      } else {
        // Return only favorites from their home school
        playerIds = favorites
          .filter((f) => !f.school_id || f.school_id === profile.home_hsid)
          .map((f) => f.player_id);
      }
    } else {
      // Superfan or null home_hsid (legacy): return all favorites
      playerIds = favorites.map((f) => f.player_id);
    }

    return NextResponse.json({
      success: true,
      playerIds,
      homeHsid: profile?.home_hsid ?? null,
      plan: profile?.plan ?? "fan",
    });
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
