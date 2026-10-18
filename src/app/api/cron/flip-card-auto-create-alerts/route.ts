import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const JOB_NAME = "flip_card_auto_create_review";
const SOURCE_NOTE = "AUTO_BASELINE:mlb_roster_sync";

function isAuthorized(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  const bearer = req.headers.get("authorization") || "";
  return Boolean(expected && bearer === `Bearer ${expected}`);
}

async function postAlert(payload: Record<string, unknown>) {
  const webhookUrl = process.env.ARMS_PLAYER_ALERT_WEBHOOK_URL?.trim();
  if (!webhookUrl) throw new Error("ARMS_PLAYER_ALERT_WEBHOOK_URL is not configured");

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = (await response.text().catch(() => "")).slice(0, 500);
    throw new Error(`ARMS player alert webhook failed: ${response.status} ${text}`);
  }
}

async function ensureHealthRow() {
  await query(`
    create table if not exists public.ingest_job_health (
      job_name text primary key,
      last_success_at timestamptz,
      last_failure_at timestamptz,
      consecutive_failures integer not null default 0,
      last_error text,
      last_result jsonb,
      updated_at timestamptz not null default now()
    )
  `);
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  await ensureHealthRow();

  const { rows: stateRows } = await query(
    `select last_result from public.ingest_job_health where job_name = $1`,
    [JOB_NAME],
  );
  const lastResult = stateRows[0]?.last_result || {};
  const lastCreatedAt = String(lastResult.lastCreatedAt || "1970-01-01T00:00:00.000Z");
  const lastCreatedPlayerId = String(lastResult.lastCreatedPlayerId || "");
  const lastHeldAt = String(lastResult.lastHeldAt || "1970-01-01T00:00:00.000Z");
  const lastHeldPlayerId = String(lastResult.lastHeldPlayerId || "");

  const [createdResult, heldResult] = await Promise.all([
    query(
      `select
         playerid::text as playerid,
         hsid::text as hsid,
         display_name,
         created_at,
         current_team_name,
         level_label,
         current_org_or_conference_name
       from public.flip_card_front_stage
       where source_notes like '%' || $1 || '%'
         and (created_at > $2::timestamptz or (created_at = $2::timestamptz and playerid::text > $3))
       order by created_at, playerid::text
       limit 100`,
      [SOURCE_NOTE, lastCreatedAt, lastCreatedPlayerId],
    ),
    query(
      `select
         x.playerid,
         x.hsid,
         x.reason,
         x.created_at,
         p.firstname,
         p.lastname
       from public.player_hsid_exclusion x
       left join public.tbc_players_raw p on p.playerid::text = x.playerid
       where x.source = 'mlb_auto_baseline_identity_guard'
         and (x.created_at > $1::timestamptz or (x.created_at = $1::timestamptz and x.playerid > $2))
       order by x.created_at, x.playerid
       limit 100`,
      [lastHeldAt, lastHeldPlayerId],
    ),
  ]);

  const created = createdResult.rows;
  const held = heldResult.rows;

  if (created.length > 0) {
    await postAlert({
      event: "yatstats_flip_cards_auto_created",
      source: "mlb_roster_sync",
      count: created.length,
      reviewRequired: true,
      message: `YAT?STATS automatically created ${created.length} new FlipCard baseline row(s). Please verify these are truly new players and not duplicate identities.`,
      players: created,
      occurredAt: new Date().toISOString(),
    });
  }

  if (held.length > 0) {
    await postAlert({
      event: "yatstats_flip_cards_held_for_identity_review",
      source: "mlb_roster_sync",
      count: held.length,
      reviewRequired: true,
      message: `YAT?STATS held ${held.length} potential FlipCard(s) instead of creating them because of a duplicate/crosswalk identity concern.`,
      players: held,
      occurredAt: new Date().toISOString(),
    });
  }

  const createdCursor = created.length
    ? created[created.length - 1]
    : { created_at: lastCreatedAt, playerid: lastCreatedPlayerId };
  const heldCursor = held.length
    ? held[held.length - 1]
    : { created_at: lastHeldAt, playerid: lastHeldPlayerId };

  const result = {
    newFlipCardsNotified: created.length,
    heldForIdentityReviewNotified: held.length,
    lastCreatedAt: createdCursor.created_at,
    lastCreatedPlayerId: createdCursor.playerid,
    lastHeldAt: heldCursor.created_at,
    lastHeldPlayerId: heldCursor.playerid,
  };

  await query(
    `insert into public.ingest_job_health (
       job_name, last_success_at, consecutive_failures, last_error, last_result, updated_at
     ) values ($1, now(), 0, null, $2::jsonb, now())
     on conflict (job_name) do update set
       last_success_at = excluded.last_success_at,
       consecutive_failures = 0,
       last_error = null,
       last_result = excluded.last_result,
       updated_at = now()`,
    [JOB_NAME, JSON.stringify(result)],
  );

  return NextResponse.json({ ok: true, ...result });
}
