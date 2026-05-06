// src/app/api/favorites/route.ts
// API endpoint to manage favorite players for an authenticated user.
//
// POST   /api/favorites
//   Body: { firebaseUid, contactId?, playerId, playerName?, schoolId?, type? }
//   Persists to PostgreSQL user_favorites and tags the GHL contact.
//
// GET    /api/favorites?uid=<firebaseUid>&hsid=<currentHsid>&scope=home|all
//   Returns favorite player IDs plus one-row-per-player drawer items.
//
// DELETE /api/favorites
//   Body: { firebaseUid, playerId }
//   Removes the favorite from PostgreSQL.

import { NextRequest, NextResponse } from "next/server";
import { addTagToGHLContact } from "@/lib/gohighlevel";
import { query } from "@/lib/db";
import { getUserProfile, saveFavorite, getFavorites, removeFavorite } from "@/lib/userProfile";

function isSuperfanProfile(profile: Awaited<ReturnType<typeof getUserProfile>>) {
  if (!profile) return false;
  return (
    profile.plan === "superfan" ||
    profile.role === "superfan" ||
    profile.subscription_status === "active" ||
    profile.subscription_status === "trialing"
  );
}

async function getFavoriteDetails(firebaseUid: string, playerIds: string[]) {
  if (!playerIds.length) return [];

  const { rows } = await query(
    `
    with favorite_rows as (
      select
        uf.player_id::text as player_id,
        uf.school_id::text as favorite_school_id,
        uf.created_at
      from public.user_favorites uf
      where uf.firebase_uid = $1
        and uf.player_id = any($2::text[])
    ),
    stage_one as (
      select distinct on (f.playerid::text)
        f.playerid::text as player_id,
        f.hsid::text as stage_hsid,
        coalesce(
          nullif(trim(f.display_name), ''),
          nullif(trim(concat_ws(' ', f.first_name, f.last_name)), ''),
          f.playerid::text
        ) as display_name,
        f.current_team_name,
        f.current_org_or_conference_name,
        f.level_label,
        f.status_label
      from public.flip_card_front_stage f
      where f.playerid::text = any($2::text[])
      order by f.playerid::text, f.hsid::text
    ),
    tbc_one as (
      select
        p.playerid::text as player_id,
        nullif(trim(concat_ws(' ', p.firstname, p.lastname)), '') as tbc_display_name
      from public.tbc_players_raw p
      where p.playerid::text = any($2::text[])
    )
    select
      fr.player_id,
      coalesce(fr.favorite_school_id, s.stage_hsid) as school_id,
      coalesce(s.display_name, t.tbc_display_name, fr.player_id) as display_name,
      s.current_team_name,
      s.current_org_or_conference_name,
      s.level_label,
      s.status_label,
      fr.created_at
    from favorite_rows fr
    left join stage_one s on s.player_id = fr.player_id
    left join tbc_one t on t.player_id = fr.player_id
    order by coalesce(s.display_name, t.tbc_display_name, fr.player_id)
    `,
    [firebaseUid, playerIds]
  );

  return rows;
}

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

    const profile = await getUserProfile(firebaseUid);
    if (!profile) {
      return NextResponse.json(
        { error: "User profile not found. Please register first.", code: "NO_PROFILE" },
        { status: 404 }
      );
    }
    const isSuperfan = isSuperfanProfile(profile);
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

    const { created } = await saveFavorite(firebaseUid, playerId, {
      armsContactId: contactId ?? null,
      schoolId: schoolId ?? null,
    });

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

// ── GET — fetch scoped favorites for a user ─────────────────────────────────
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

    const scope = searchParams.get("scope") || "home";
    const profile = await getUserProfile(firebaseUid);
    const isSuperfan = isSuperfanProfile(profile);
    const homeHsid = profile?.home_hsid ? String(profile.home_hsid) : null;

    const favorites = await getFavorites(firebaseUid);
    const allPlayerIds = favorites.map((f) => String(f.player_id));
    const allFavoritePlayers = await getFavoriteDetails(firebaseUid, allPlayerIds);

    let favoritePlayers = allFavoritePlayers;
    let lockedReason: string | null = null;

    if (!profile) {
      favoritePlayers = [];
      lockedReason = "NO_PROFILE";
    } else if (!homeHsid) {
      favoritePlayers = [];
      lockedReason = "NO_HOME_HSID";
    } else if (scope === "all") {
      if (!isSuperfan) {
        favoritePlayers = [];
        lockedReason = "SUPERFAN_REQUIRED";
      }
      // Superfans see all schools here.
    } else {
      // Home School tab always means only favorites from the user's home school,
      // even when the user is a Super Fan.
      favoritePlayers = allFavoritePlayers.filter((p) => String(p.school_id || "") === homeHsid);
    }

    const playerIds = favoritePlayers.map((p) => String(p.player_id));

    return NextResponse.json({
      success: true,
      playerIds,
      favoritePlayers,
      favorites: favoritePlayers,
      scope,
      lockedReason,
      isSuperfan,
      homeHsid,
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
