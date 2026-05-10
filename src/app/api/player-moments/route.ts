// src/app/api/player-moments/route.ts
// Lightweight Golden Line fan-photo submission endpoint.
// Stores small test uploads as data URLs in Postgres so the live UI can be tested
// before the full S3 + moderation workflow is finalized.

import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

async function ensureTable() {
  await query(`
    create table if not exists public.player_moment_submissions (
      id bigserial primary key,
      playerid text not null,
      hsid text,
      stage text not null,
      title text,
      caption text,
      contributor_name text,
      relationship text,
      image_data_url text,
      image_mime_type text,
      status text not null default 'pending',
      created_at timestamptz not null default now()
    )
  `);

  await query(`
    create index if not exists player_moment_submissions_playerid_created_idx
    on public.player_moment_submissions (playerid, created_at desc)
  `);
}

function clean(value: FormDataEntryValue | null, fallback = "") {
  return String(value ?? fallback).trim();
}

export async function GET(req: NextRequest) {
  try {
    await ensureTable();
    const { searchParams } = new URL(req.url);
    const playerId = searchParams.get("playerId");

    if (!playerId) {
      return NextResponse.json({ error: "playerId query parameter is required" }, { status: 400 });
    }

    const { rows } = await query(
      `
        select
          id::text,
          playerid,
          hsid,
          stage,
          title,
          caption,
          contributor_name,
          relationship,
          image_data_url,
          image_mime_type,
          status,
          created_at
        from public.player_moment_submissions
        where playerid = $1
        order by created_at desc
        limit 24
      `,
      [String(playerId)]
    );

    return NextResponse.json({ success: true, moments: rows });
  } catch (error) {
    console.error("Error in player-moments GET:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureTable();
    const formData = await req.formData();

    const playerId = clean(formData.get("playerId"));
    const hsid = clean(formData.get("hsid"));
    const stage = clean(formData.get("stage"), "Youth Baseball");
    const title = clean(formData.get("title"), `${stage} memory`);
    const caption = clean(formData.get("caption"));
    const contributorName = clean(formData.get("contributorName"), "Fan submission");
    const relationship = clean(formData.get("relationship"));
    const file = formData.get("photo");

    if (!playerId) {
      return NextResponse.json({ error: "playerId is required" }, { status: 400 });
    }

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "photo file is required" }, { status: 400 });
    }

    if (!file.type.startsWith("image/")) {
      return NextResponse.json({ error: "Only image uploads are supported" }, { status: 400 });
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: "Image must be 4MB or smaller for this test uploader" }, { status: 413 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const imageDataUrl = `data:${file.type};base64,${buffer.toString("base64")}`;

    const { rows } = await query(
      `
        insert into public.player_moment_submissions (
          playerid,
          hsid,
          stage,
          title,
          caption,
          contributor_name,
          relationship,
          image_data_url,
          image_mime_type,
          status
        ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,'pending')
        returning
          id::text,
          playerid,
          hsid,
          stage,
          title,
          caption,
          contributor_name,
          relationship,
          image_data_url,
          image_mime_type,
          status,
          created_at
      `,
      [playerId, hsid || null, stage, title, caption, contributorName, relationship, imageDataUrl, file.type]
    );

    return NextResponse.json({ success: true, moment: rows[0] });
  } catch (error) {
    console.error("Error in player-moments POST:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
