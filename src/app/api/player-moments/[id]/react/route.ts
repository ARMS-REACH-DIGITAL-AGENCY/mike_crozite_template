// src/app/api/player-moments/[id]/react/route.ts
// Toggle a YAT-A-BOY reaction (the platform's existing "show some love"
// branding, reused here as a like button) on a fan-submitted memory.

import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { ensurePlayerMomentSocialTables, getMomentSession } from "@/lib/playerMomentSocial";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensurePlayerMomentSocialTables();

    const session = getMomentSession(req.cookies);
    if (!session?.uid) {
      return NextResponse.json({ error: "Sign in is required to YAT-A-BOY a memory." }, { status: 401 });
    }

    const { id } = await params;
    const momentId = Number(id);
    if (!Number.isFinite(momentId)) {
      return NextResponse.json({ error: "Invalid moment id" }, { status: 400 });
    }

    const existing = await query(
      `select id from public.player_moment_reactions
       where moment_id = $1 and contributor_firebase_uid = $2 and reaction_type = 'yataboy'`,
      [momentId, session.uid]
    );

    let reacted: boolean;
    if (existing.rows.length) {
      await query(`delete from public.player_moment_reactions where id = $1`, [existing.rows[0].id]);
      reacted = false;
    } else {
      await query(
        `insert into public.player_moment_reactions (moment_id, contributor_firebase_uid, reaction_type)
         values ($1, $2, 'yataboy')
         on conflict (moment_id, contributor_firebase_uid, reaction_type) do nothing`,
        [momentId, session.uid]
      );
      reacted = true;
    }

    const countResult = await query(
      `select count(*)::int as count from public.player_moment_reactions
       where moment_id = $1 and reaction_type = 'yataboy'`,
      [momentId]
    );

    return NextResponse.json({ success: true, reacted, count: countResult.rows[0]?.count ?? 0 });
  } catch (error) {
    console.error("Error toggling moment reaction:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
