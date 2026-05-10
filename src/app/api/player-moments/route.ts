// src/app/api/player-moments/route.ts
// Golden Line fan-photo submission endpoint.
// Saves pending submissions in Postgres, optionally creates/updates a HighLevel
// contact, tags the contact, and optionally fires a GHL workflow webhook.

import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { addTagToGHLContact, findOrCreateGhlContact } from "@/lib/gohighlevel";

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
    alter table public.player_moment_submissions
      add column if not exists contributor_email text,
      add column if not exists contributor_phone text,
      add column if not exists player_name text,
      add column if not exists page_url text,
      add column if not exists photo_taken_date date,
      add column if not exists photo_taken_year integer,
      add column if not exists sort_date date,
      add column if not exists ghl_contact_id text,
      add column if not exists arms_sync_status text not null default 'not_sent',
      add column if not exists arms_sync_error text,
      add column if not exists arms_synced_at timestamptz
  `);

  await query(`
    create index if not exists player_moment_submissions_playerid_sort_idx
    on public.player_moment_submissions (playerid, sort_date nulls last, created_at desc)
  `);

  await query(`
    create index if not exists player_moment_submissions_status_created_idx
    on public.player_moment_submissions (status, created_at desc)
  `);
}

function clean(value: FormDataEntryValue | null, fallback = "") {
  return String(value ?? fallback).trim();
}

function parsePhotoDate(value: string) {
  if (!value) return { photoTakenDate: null as string | null, photoTakenYear: null as number | null, sortDate: null as string | null };
  const match = value.match(/^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?$/);
  if (!match) return { photoTakenDate: null, photoTakenYear: null, sortDate: null };
  const year = Number(match[1]);
  const month = match[2] || "01";
  const day = match[3] || "01";
  if (!year || year < 1900 || year > 2100) return { photoTakenDate: null, photoTakenYear: null, sortDate: null };
  return { photoTakenDate: `${year}-${month}-${day}`, photoTakenYear: year, sortDate: `${year}-${month}-${day}` };
}

function splitName(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { firstName: "YAT?STATS", lastName: "Fan" };
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

function safeTag(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9:_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
}

async function postToArmsWebhook(payload: Record<string, unknown>) {
  const webhookUrl = process.env.GHL_GOLDEN_LINE_WEBHOOK_URL || process.env.ARMS_GOLDEN_LINE_WEBHOOK_URL;
  if (!webhookUrl) return { status: "skipped", error: "No GHL_GOLDEN_LINE_WEBHOOK_URL configured" };

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`ARMS webhook failed: ${response.status} ${text}`.slice(0, 500));
  }

  return { status: "sent", error: null };
}

async function syncSubmissionToArms(moment: any) {
  let ghlContactId: string | null = null;

  if (moment.contributor_email) {
    const { firstName, lastName } = splitName(moment.contributor_name || "YAT?STATS Fan");
    ghlContactId = await findOrCreateGhlContact(moment.contributor_email, firstName, lastName, moment.hsid || undefined, "YAT?STATS Golden Line");

    if (ghlContactId) {
      await Promise.allSettled([
        addTagToGHLContact(ghlContactId, "yatstats"),
        addTagToGHLContact(ghlContactId, "golden-line-memory"),
        addTagToGHLContact(ghlContactId, "needs-photo-review"),
        addTagToGHLContact(ghlContactId, `player:${safeTag(moment.playerid)}`),
        addTagToGHLContact(ghlContactId, `stage:${safeTag(moment.stage)}`),
        moment.hsid ? addTagToGHLContact(ghlContactId, `hsid:${safeTag(moment.hsid)}`) : Promise.resolve(),
      ]);
    }
  }

  const webhookResult = await postToArmsWebhook({
    event: "golden_line_memory_submitted",
    source: "YAT?STATS Player Profile",
    momentId: moment.id,
    playerId: moment.playerid,
    playerName: moment.player_name,
    hsid: moment.hsid,
    stage: moment.stage,
    title: moment.title,
    caption: moment.caption,
    photoTakenDate: moment.photo_taken_date,
    photoTakenYear: moment.photo_taken_year,
    contributorName: moment.contributor_name,
    contributorEmail: moment.contributor_email,
    contributorPhone: moment.contributor_phone,
    relationship: moment.relationship,
    status: moment.status,
    pageUrl: moment.page_url,
    imageMimeType: moment.image_mime_type,
    hasImage: Boolean(moment.image_data_url),
    ghlContactId,
    createdAt: moment.created_at,
  });

  return { ghlContactId, armsSyncStatus: webhookResult.status === "sent" || ghlContactId ? "sent" : "skipped", armsSyncError: webhookResult.error };
}

const returningSql = `
  id::text,
  playerid,
  hsid,
  stage,
  title,
  caption,
  contributor_name,
  contributor_email,
  contributor_phone,
  relationship,
  player_name,
  page_url,
  photo_taken_date,
  photo_taken_year,
  sort_date,
  image_data_url,
  image_mime_type,
  status,
  ghl_contact_id,
  arms_sync_status,
  arms_sync_error,
  arms_synced_at,
  created_at
`;

export async function GET(req: NextRequest) {
  try {
    await ensureTable();
    const { searchParams } = new URL(req.url);
    const playerId = searchParams.get("playerId");

    if (!playerId) return NextResponse.json({ error: "playerId query parameter is required" }, { status: 400 });

    const { rows } = await query(
      `select ${returningSql}
       from public.player_moment_submissions
       where playerid = $1
       order by coalesce(sort_date, created_at::date) asc, created_at asc
       limit 48`,
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
    const playerName = clean(formData.get("playerName"));
    const pageUrl = clean(formData.get("pageUrl"));
    const stage = clean(formData.get("stage"), "Youth Baseball");
    const title = clean(formData.get("title"), `${stage} memory`);
    const caption = clean(formData.get("caption"));
    const contributorName = clean(formData.get("contributorName"), "Fan submission");
    const contributorEmail = clean(formData.get("contributorEmail")).toLowerCase();
    const contributorPhone = clean(formData.get("contributorPhone"));
    const relationship = clean(formData.get("relationship"));
    const { photoTakenDate, photoTakenYear, sortDate } = parsePhotoDate(clean(formData.get("photoTakenDate")));
    const file = formData.get("photo");

    if (!playerId) return NextResponse.json({ error: "playerId is required" }, { status: 400 });
    if (!(file instanceof File)) return NextResponse.json({ error: "photo file is required" }, { status: 400 });
    if (!file.type.startsWith("image/")) return NextResponse.json({ error: "Only image uploads are supported" }, { status: 400 });
    if (file.size > MAX_UPLOAD_BYTES) return NextResponse.json({ error: "Image must be 4MB or smaller for this test uploader" }, { status: 413 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const imageDataUrl = `data:${file.type};base64,${buffer.toString("base64")}`;

    const { rows } = await query(
      `insert into public.player_moment_submissions (
        playerid, hsid, stage, title, caption, contributor_name, contributor_email, contributor_phone, relationship,
        player_name, page_url, photo_taken_date, photo_taken_year, sort_date, image_data_url, image_mime_type, status, arms_sync_status
      ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'pending','queued')
      returning ${returningSql}`,
      [playerId, hsid || null, stage, title, caption, contributorName, contributorEmail || null, contributorPhone || null, relationship, playerName || null, pageUrl || null, photoTakenDate, photoTakenYear, sortDate, imageDataUrl, file.type]
    );

    let moment = rows[0];

    try {
      const sync = await syncSubmissionToArms(moment);
      const updateResult = await query(
        `update public.player_moment_submissions
         set ghl_contact_id = $2, arms_sync_status = $3, arms_sync_error = $4, arms_synced_at = now()
         where id = $1::bigint
         returning ${returningSql}`,
        [moment.id, sync.ghlContactId, sync.armsSyncStatus, sync.armsSyncError]
      );
      moment = updateResult.rows[0] || moment;
    } catch (syncError: any) {
      console.error("Golden Line ARMS sync failed:", syncError);
      const updateResult = await query(
        `update public.player_moment_submissions
         set arms_sync_status = 'failed', arms_sync_error = $2, arms_synced_at = now()
         where id = $1::bigint
         returning ${returningSql}`,
        [moment.id, String(syncError?.message || syncError).slice(0, 500)]
      );
      moment = updateResult.rows[0] || moment;
    }

    return NextResponse.json({ success: true, moment });
  } catch (error) {
    console.error("Error in player-moments POST:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
