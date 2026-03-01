// src/app/api/favorites/route.ts
// API endpoint to add "favorite player" tags to a GHL contact
// POST /api/favorites
// Body: { contactId: string, playerId: string, playerName: string, type: "fan" | "superfan" }

import { NextRequest, NextResponse } from "next/server";
import { addTagToGHLContact } from "@/lib/gohighlevel";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { contactId, playerId, playerName, type } = body;

    if (!contactId || !playerId) {
      return NextResponse.json(
        { error: "contactId and playerId are required" },
        { status: 400 }
      );
    }

    // Build the tag based on type
    // Fan favorites: "fav:{playerId}" — limited to school players
    // SuperFan favorites: "superfav:{playerId}" — global access
    const tagPrefix = type === "superfan" ? "superfav" : "fav";
    const tag = `${tagPrefix}:${playerId}`;

    // Also add a human-readable tag with the player name
    const nameTag = `${tagPrefix}:${(playerName || playerId).replace(/\s+/g, "-").toLowerCase()}`;

    // Add both tags to the contact
    const result1 = await addTagToGHLContact(contactId, tag);
    const result2 = await addTagToGHLContact(contactId, nameTag);

    if (!result1.success) {
      return NextResponse.json(
        { error: result1.error || "Failed to add favorite tag" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Player ${playerName || playerId} added as ${type === "superfan" ? "SuperFan" : "Fan"} favorite`,
      tags: [tag, nameTag],
    });
  } catch (error) {
    console.error("Error in favorites API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
