// src/app/api/player-moments/[id]/comments/route.ts
// Wall-post style comments on a fan-submitted memory. No moderation queue
// (unlike photo uploads) -- comments are plain text and post immediately.

import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { ensurePlayerMomentSocialTables, getMomentSession, getSessionDisplayName } from "@/lib/playerMomentSocial";

const MAX_COMMENT_LENGTH = 600;

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensurePlayerMomentSocialTables();

    const { id } = await params;
    const momentId = Number(id);
    if (!Number.isFinite(momentId)) {
      return NextResponse.json({ error: "Invalid moment id" }, { status: 400 });
    }

    const { rows } = await query(
      `select id::text, contributor_name, body, created_at
       from public.player_moment_comments
       where moment_id = $1 and status = 'visible'
       order by created_at asc
       limit 200`,
      [momentId]
    );

    return NextResponse.json({ success: true, comments: rows });
  } catch (error) {
    console.error("Error loading moment comments:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensurePlayerMomentSocialTables();

    const session = getMomentSession(req.cookies);
    if (!session?.uid) {
      return NextResponse.json({ error: "Sign in is required to comment on a memory." }, { status: 401 });
    }

    const { id } = await params;
    const momentId = Number(id);
    if (!Number.isFinite(momentId)) {
      return NextResponse.json({ error: "Invalid moment id" }, { status: 400 });
    }

    const body = await req.json().catch(() => ({} as { body?: string }));
    const text = String(body?.body || "").trim().slice(0, MAX_COMMENT_LENGTH);
    if (!text) {
      return NextResponse.json({ error: "Comment cannot be empty." }, { status: 400 });
    }

    const contributorName = getSessionDisplayName(session);

    const { rows } = await query(
      `insert into public.player_moment_comments (moment_id, contributor_firebase_uid, contributor_name, body)
       values ($1, $2, $3, $4)
       returning id::text, contributor_name, body, created_at`,
      [momentId, session.uid, contributorName, text]
    );

    return NextResponse.json({ success: true, comment: rows[0] });
  } catch (error) {
    console.error("Error adding moment comment:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
