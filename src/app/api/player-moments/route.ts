// src/app/api/player-moments/route.ts
// Golden Line fan-photo submission endpoint.
// Saves pending submissions in Postgres, uploads images to S3 when configured,
// creates/updates a HighLevel contact, tags the contact, and optionally fires a GHL workflow webhook.

import { NextRequest, NextResponse } from "next/server";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { query } from "@/lib/db";
import { addTagToGHLContact, findOrCreateGhlContact } from "@/lib/gohighlevel";

const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
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

type StoredImage = {
  imageUrl: string | null;
  imageS3Key: string | null;
  imageDataUrl: string | null;
};

let cachedS3Client: S3Client | null = null;

function getS3Bucket() {
  return process.env.YATSTATS_UPLOADS_S3_BUCKET || process.env.AWS_S3_BUCKET || process.env.S3_BUCKET_NAME || "";
}

function getS3Region() {
  return process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || DEFAULT_S3_REGION;
}

function getAssetBaseUrl(bucket: string, region: string) {
  return (process.env.YATSTATS_UPLOADS_PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_YATSTATS_ASSET_BASE_URL || `https://${bucket}.s3.${region}.amazonaws.com`).replace(/\/$/, "");
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
  return String(value || "unknown").toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "unknown";
}

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
      add column if not exists contributor_firebase_uid text,
      add column if not exists contributor_role text,
      add column if not exists contributor_plan text,
      add column if not exists contributor_home_hsid text,
      add column if not exists contributor_home_school_name text,
      add column if not exists player_name text,
      add column if not exists page_url text,
      add column if not exists photo_taken_date date,
      add column if not exists photo_taken_year integer,
      add column if not exists sort_date date,
      add column if not exists visibility text not null default 'public',
      add column if not exists is_private boolean not null default false,
      add column if not exists image_url text,
      add column if not exists image_s3_key text,
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

  await query(`
    create index if not exists player_moment_submissions_contributor_uid_idx
    on public.player_moment_submissions (contributor_firebase_uid, created_at desc)
  `);
}

function clean(value: FormDataEntryValue | null, fallback = "") {
  return String(value ?? fallback).trim();
}

function normalizeVisibility(value: unknown) {
  const raw = String(value || "public").trim().toLowerCase();
  return raw === "private" ? "private" : "public";
}

function getSession(req: NextRequest): YatSession | null {
  const raw = req.cookies.get("yat-session")?.value;
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

async function storeImage(file: File, options: { playerId: string; hsid: string; contributorUid: string; photoTakenYear: number | null }): Promise<StoredImage> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const bucket = getS3Bucket();

  if (!bucket) {
    return {
      imageUrl: null,
      imageS3Key: null,
      imageDataUrl: `data:${file.type};base64,${buffer.toString("base64")}`,
    };
  }

  const region = getS3Region();
  const ext = extensionFromMime(file.type);
  const now = new Date();
  const stamp = now.toISOString().replace(/[^0-9]/g, "").slice(0, 14);
  const random = Math.random().toString(36).slice(2, 10);
  const year = options.photoTakenYear ? String(options.photoTakenYear) : "undated";
  const key = [
    "player-moments",
    safePathPart(options.hsid || "unknown-school"),
    safePathPart(options.playerId),
    year,
    `${stamp}-${safePathPart(options.contributorUid)}-${random}.${ext}`,
  ].join("/");

  await getS3Client().send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: buffer,
    ContentType: file.type,
    CacheControl: "public, max-age=31536000, immutable",
  }));

  return {
    imageUrl: `${getAssetBaseUrl(bucket, region)}/${key}`,
    imageS3Key: key,
    imageDataUrl: null,
  };
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
  let ghlContactId: string | null = moment.ghl_contact_id || null;

  if (!ghlContactId && moment.contributor_email) {
    const { firstName, lastName } = splitName(moment.contributor_name || "YAT?STATS Fan");
    ghlContactId = await findOrCreateGhlContact(moment.contributor_email, firstName, lastName, moment.hsid || undefined, "YAT?STATS Golden Line");
  }

  if (ghlContactId) {
    await Promise.allSettled([
      addTagToGHLContact(ghlContactId, "yatstats"),
      addTagToGHLContact(ghlContactId, "golden-line-memory"),
      addTagToGHLContact(ghlContactId, "needs-photo-review"),
      addTagToGHLContact(ghlContactId, "fan-upload"),
      addTagToGHLContact(ghlContactId, `visibility:${safeTag(moment.visibility || "public")}`),
      addTagToGHLContact(ghlContactId, `player:${safeTag(moment.playerid)}`),
      addTagToGHLContact(ghlContactId, `stage:${safeTag(moment.stage)}`),
      moment.hsid ? addTagToGHLContact(ghlContactId, `hsid:${safeTag(moment.hsid)}`) : Promise.resolve(),
    ]);
  }

  const imageUrl = moment.image_url || moment.image_data_url || null;
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
    visibility: moment.visibility,
    isPrivate: Boolean(moment.is_private),
    contributorFirebaseUid: moment.contributor_firebase_uid,
    contributorName: moment.contributor_name,
    contributorEmail: moment.contributor_email,
    contributorPhone: moment.contributor_phone,
    contributorRole: moment.contributor_role,
    contributorPlan: moment.contributor_plan,
    contributorHomeHsid: moment.contributor_home_hsid,
    contributorHomeSchoolName: moment.contributor_home_school_name,
    relationship: moment.relationship,
    status: moment.status,
    pageUrl: moment.page_url,
    imageUrl,
    imageS3Key: moment.image_s3_key,
    imageMimeType: moment.image_mime_type,
    hasImage: Boolean(imageUrl),
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
  contributor_firebase_uid,
  contributor_role,
  contributor_plan,
  contributor_home_hsid,
  contributor_home_school_name,
  relationship,
  player_name,
  page_url,
  photo_taken_date,
  photo_taken_year,
  sort_date,
  visibility,
  is_private,
  image_url,
  image_s3_key,
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

    const session = getSession(req);
    const viewerUid = String(session?.uid || "").trim();

    const { rows } = await query(
      `select ${returningSql}
       from public.player_moment_submissions
       where playerid = $1
         and (coalesce(is_private, false) = false or contributor_firebase_uid = $2)
       order by coalesce(sort_date, created_at::date) asc, created_at asc
       limit 48`,
      [String(playerId), viewerUid]
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

    const session = getSession(req);
    if (!session) {
      return NextResponse.json({ error: "Sign in is required before submitting a Golden Line memory." }, { status: 401 });
    }

    const formData = await req.formData();

    const playerId = clean(formData.get("playerId"));
    const hsid = clean(formData.get("hsid"));
    const playerName = clean(formData.get("playerName"));
    const pageUrl = clean(formData.get("pageUrl"));
    const stage = clean(formData.get("stage"), "Fan Memory");
    const title = clean(formData.get("title"), `${stage} memory`);
    const caption = clean(formData.get("caption"));
    const contributorName = getContributorName(session);
    const contributorEmail = String(session.email || "").trim().toLowerCase();
    const contributorFirebaseUid = String(session.uid || "").trim();
    const contributorRole = String(session.role || "fan").trim() || "fan";
    const contributorPlan = String(session.plan || "fan").trim() || "fan";
    const contributorHomeHsid = String(session.homeHsid || "").trim();
    const contributorHomeSchoolName = String(session.homeSchoolName || "").trim();
    const relationship = clean(formData.get("relationship"));
    const visibility = normalizeVisibility(formData.get("visibility"));
    const isPrivate = visibility === "private";
    const { photoTakenDate, photoTakenYear, sortDate } = parsePhotoDate(clean(formData.get("photoTakenDate")));
    const file = formData.get("photo");

    if (!playerId) return NextResponse.json({ error: "playerId is required" }, { status: 400 });
    if (!photoTakenDate) return NextResponse.json({ error: "Approximate date taken is required." }, { status: 400 });
    if (!(file instanceof File)) return NextResponse.json({ error: "photo file is required" }, { status: 400 });
    if (!file.type.startsWith("image/")) return NextResponse.json({ error: "Only image uploads are supported" }, { status: 400 });
    if (file.size > MAX_UPLOAD_BYTES) return NextResponse.json({ error: "Image must be 4MB or smaller for this test uploader" }, { status: 413 });

    let storedImage: StoredImage;
    try {
      storedImage = await storeImage(file, { playerId, hsid, contributorUid: contributorFirebaseUid, photoTakenYear });
    } catch (s3Error: any) {
      console.error("Golden Line S3 upload failed:", s3Error);
      return NextResponse.json({ error: `Image storage failed: ${String(s3Error?.message || s3Error).slice(0, 220)}` }, { status: 500 });
    }

    const { rows } = await query(
      `insert into public.player_moment_submissions (
        playerid, hsid, stage, title, caption,
        contributor_name, contributor_email, contributor_phone, contributor_firebase_uid, contributor_role, contributor_plan,
        contributor_home_hsid, contributor_home_school_name, relationship,
        player_name, page_url, photo_taken_date, photo_taken_year, sort_date,
        visibility, is_private, image_url, image_s3_key, image_data_url, image_mime_type, status, ghl_contact_id, arms_sync_status
      ) values ($1,$2,$3,$4,$5,$6,$7,null,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,'pending',$25,'queued')
      returning ${returningSql}`,
      [
        playerId, hsid || null, stage, title, caption,
        contributorName, contributorEmail || null, contributorFirebaseUid, contributorRole, contributorPlan,
        contributorHomeHsid || null, contributorHomeSchoolName || null, relationship,
        playerName || null, pageUrl || null, photoTakenDate, photoTakenYear, sortDate,
        visibility, isPrivate, storedImage.imageUrl, storedImage.imageS3Key, storedImage.imageDataUrl, file.type, session.contactId || null,
      ]
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
