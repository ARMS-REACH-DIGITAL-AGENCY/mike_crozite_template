// src/app/api/connect-contribute/upload/route.ts
// Connect & Contribute photo upload endpoint.
// Accepts one photo per request (the drawer submits each filled row individually).
// Saves to Postgres (connect_uploads), uploads the image to S3 when configured,
// and syncs the contributor to their ARMS contact record.

import { NextRequest, NextResponse } from "next/server";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { query } from "@/lib/db";
import { addTagToGHLContact, findOrCreateGhlContact } from "@/lib/gohighlevel";

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const DEFAULT_S3_REGION = "us-west-2";

type YatSession = {
  uid?: string;
  email?: string;
  contactId?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  role?: string | null;
  plan?: string | null;
  isSuperfan?: boolean;
  homeHsid?: string | null;
  homeSchoolName?: string | null;
};

let cachedS3Client: S3Client | null = null;

function getS3Bucket() {
  return process.env.YATSTATS_UPLOADS_S3_BUCKET || process.env.AWS_S3_BUCKET || process.env.S3_BUCKET_NAME || "";
}

function getS3Region() {
  return process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || DEFAULT_S3_REGION;
}

function getAssetBaseUrl(bucket: string, region: string) {
  return (
    process.env.YATSTATS_UPLOADS_PUBLIC_BASE_URL ||
    process.env.NEXT_PUBLIC_YATSTATS_ASSET_BASE_URL ||
    `https://${bucket}.s3.${region}.amazonaws.com`
  ).replace(/\/$/, "");
}

function getS3Client() {
  if (cachedS3Client) return cachedS3Client;
  const region = getS3Region();
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  cachedS3Client = new S3Client({
    region,
    credentials: accessKeyId && secretAccessKey ? { accessKeyId, secretAccessKey } : undefined,
  });
  return cachedS3Client;
}

function extensionFromMime(mimeType: string) {
  if (mimeType.includes("png")) return "png";
  if (mimeType.includes("webp")) return "webp";
  if (mimeType.includes("gif")) return "gif";
  return "jpg";
}

function safePathPart(value: string) {
  return (
    String(value || "unknown").toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) ||
    "unknown"
  );
}

async function ensureTable() {
  await query(`
    create table if not exists public.connect_uploads (
      id bigserial primary key,
      playerid text,
      player_name text,
      player_school_hsid text,
      player_school_name text,
      hub_hsid text,
      placement text not null,
      photo_taken_date date,
      photo_taken_year integer,
      image_url text,
      image_s3_key text,
      image_mime_type text,
      contributor_name text,
      contributor_email text,
      contributor_firebase_uid text,
      contributor_role text,
      contributor_plan text,
      contributor_home_hsid text,
      contributor_home_school_name text,
      page_url text,
      status text not null default 'pending',
      ghl_contact_id text,
      arms_sync_status text not null default 'not_sent',
      arms_sync_error text,
      arms_synced_at timestamptz,
      created_at timestamptz not null default now()
    )
  `);
  await query(`
    create index if not exists connect_uploads_status_created_idx
    on public.connect_uploads (status, created_at desc)
  `);
  await query(`
    create index if not exists connect_uploads_contributor_uid_idx
    on public.connect_uploads (contributor_firebase_uid, created_at desc)
  `);
}

function getSession(req: NextRequest): YatSession | null {
  const raw = req.cookies.get("yat-platform-session")?.value || req.cookies.get("yat-session")?.value;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as YatSession;
    if (!parsed?.uid || !parsed?.email) return null;
    return parsed;
  } catch {
    return null;
  }
}

function getContributorName(session: YatSession) {
  const first = String(session.firstName || "").trim();
  const last = String(session.lastName || "").trim();
  const name = [first, last].filter(Boolean).join(" ").trim();
  return name || String(session.email || "YAT?STATS Fan").trim();
}

function parsePhotoDate(value: string) {
  if (!value) return { photoTakenDate: null as string | null, photoTakenYear: null as number | null };
  const match = value.match(/^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?$/);
  if (!match) return { photoTakenDate: null, photoTakenYear: null };
  const year = Number(match[1]);
  if (!year || year < 1900 || year > 2100) return { photoTakenDate: null, photoTakenYear: null };
  const month = match[2] || "01";
  const day = match[3] || "01";
  return { photoTakenDate: `${year}-${month}-${day}`, photoTakenYear: year };
}

function clean(value: FormDataEntryValue | null, fallback = "") {
  return String(value ?? fallback).trim();
}

async function storeImage(file: File, opts: { placement: string; playerId: string; contributorUid: string; year: number | null }) {
  const bucket = getS3Bucket();
  const region = getS3Region();
  if (!bucket) {
    // No bucket configured: keep the upload in the DB only.
    return { imageUrl: null as string | null, imageS3Key: null as string | null };
  }
  const ext = extensionFromMime(file.type || "");
  const stamp = Date.now().toString(36);
  const key = [
    "connect-contribute",
    safePathPart(opts.placement),
    safePathPart(opts.playerId || "unknown-player"),
    `${stamp}-${safePathPart(opts.contributorUid)}.${ext}`,
  ].join("/");
  const bytes = new Uint8Array(await file.arrayBuffer());
  await getS3Client().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: bytes,
      ContentType: file.type || "image/jpeg",
    })
  );
  return { imageUrl: `${getAssetBaseUrl(bucket, region)}/${key}`, imageS3Key: key };
}

export async function POST(req: NextRequest) {
  try {
    await ensureTable();

    const session = getSession(req);
    if (!session) {
      return NextResponse.json({ error: "Sign in is required before submitting photos." }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get("photo");
    const hsid = clean(formData.get("hsid"));
    const placement = clean(formData.get("placement"), "High School Photo (Flip Card Front)");
    const playerId = clean(formData.get("playerId"));
    const playerName = clean(formData.get("playerName"));
    const playerSchoolHsid = clean(formData.get("playerSchoolHsid"));
    const playerSchoolName = clean(formData.get("playerSchoolName"));
    const pageUrl = clean(formData.get("pageUrl"));
    const { photoTakenDate, photoTakenYear } = parsePhotoDate(clean(formData.get("photoTakenDate")));

    if (!(file instanceof File)) return NextResponse.json({ error: "A photo file is required." }, { status: 400 });
    if (!file.type.startsWith("image/")) return NextResponse.json({ error: "Only image uploads are supported." }, { status: 400 });
    if (file.size > MAX_UPLOAD_BYTES) return NextResponse.json({ error: "Images must be 10MB or smaller." }, { status: 413 });
    if (!playerName) return NextResponse.json({ error: "A player name is required." }, { status: 400 });

    const contributorName = getContributorName(session);
    const contributorEmail = String(session.email || "").trim().toLowerCase();
    const contributorUid = String(session.uid || "").trim();

    let stored: { imageUrl: string | null; imageS3Key: string | null };
    try {
      stored = await storeImage(file, { placement, playerId, contributorUid, year: photoTakenYear });
    } catch (s3Error: any) {
      console.error("Connect-contribute S3 upload failed:", s3Error);
      return NextResponse.json({ error: "Image storage failed. Please try again." }, { status: 500 });
    }

    const { rows } = await query(
      `insert into public.connect_uploads (
        playerid, player_name, player_school_hsid, player_school_name, hub_hsid,
        placement, photo_taken_date, photo_taken_year,
        image_url, image_s3_key, image_mime_type,
        contributor_name, contributor_email, contributor_firebase_uid,
        contributor_role, contributor_plan, contributor_home_hsid, contributor_home_school_name,
        page_url, status, ghl_contact_id, arms_sync_status
      ) values (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,'pending',$20,'queued'
      ) returning id, status, created_at`,
      [
        playerId || null,
        playerName,
        playerSchoolHsid || null,
        playerSchoolName || null,
        hsid || null,
        placement,
        photoTakenDate,
        photoTakenYear,
        stored.imageUrl,
        stored.imageS3Key,
        file.type,
        contributorName,
        contributorEmail || null,
        contributorUid,
        String(session.role || "fan").trim() || "fan",
        String(session.plan || "fan").trim() || "fan",
        String(session.homeHsid || "").trim() || null,
        String(session.homeSchoolName || "").trim() || null,
        pageUrl || null,
        session.contactId || null,
      ]
    );

    const upload = rows[0];

    // Sync the contributor to ARMS (best effort — never blocks the upload).
    try {
      const parts = contributorName.split(/\s+/).filter(Boolean);
      const firstName = parts[0] || contributorName;
      const lastName = parts.slice(1).join(" ") || "";
      const ghlContactId =
        session.contactId ||
        (await findOrCreateGhlContact(contributorEmail, firstName, lastName, hsid || undefined, "YAT?STATS Connect & Contribute"));
      if (ghlContactId) {
        await Promise.all([
          addTagToGHLContact(ghlContactId, "yatstats"),
          addTagToGHLContact(ghlContactId, "connect-contribute-upload"),
          addTagToGHLContact(ghlContactId, "needs-photo-review"),
        ]);
      }
      await query(
        `update public.connect_uploads set ghl_contact_id = $2, arms_sync_status = 'synced', arms_synced_at = now() where id = $1`,
        [upload.id, ghlContactId]
      );
    } catch (syncError: any) {
      console.error("Connect-contribute ARMS sync failed:", syncError);
      await query(
        `update public.connect_uploads set arms_sync_status = 'failed', arms_sync_error = $2, arms_synced_at = now() where id = $1`,
        [upload.id, String(syncError?.message || syncError).slice(0, 500)]
      );
    }

    return NextResponse.json({ ok: true, upload: { id: upload.id, status: upload.status } }, { status: 200 });
  } catch (error: any) {
    console.error("Connect-contribute upload failed:", error);
    return NextResponse.json({ error: "Upload failed. Please try again." }, { status: 500 });
  }
}
