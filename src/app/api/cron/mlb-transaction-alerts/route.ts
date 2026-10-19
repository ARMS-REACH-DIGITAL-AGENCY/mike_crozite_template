import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { findOrCreateGhlContact, sendGHLEmail } from "@/lib/gohighlevel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const JOB_NAME = "mlb_transaction_superfan_alerts";
const SOURCE = "MLB Transactions";
const DISCOVERY_SOURCE = "mlb_transactions";

const MEANINGFUL_TYPES = new Set([
  "Status Change",
  "Assigned",
  "Recalled",
  "Optioned",
  "Signed",
  "Released",
  "Signed as Free Agent",
  "Designated for Assignment",
  "Trade",
  "Outrighted",
  "Selected",
  "Declared Free Agency",
  "Claimed Off Waivers",
  "Acquired",
  "Retired",
  "Suspension",
  "Obtained",
]);

type TransactionRow = {
  id: string;
  playerid: string;
  transaction_type: string | null;
  from_team_name: string | null;
  to_team_name: string | null;
  effective_date: string | Date | null;
  created_at: string | Date;
  payload: Record<string, unknown> | null;
  player_name: string;
  first_name: string | null;
  last_name: string | null;
  hsid: string | null;
  level_label: string | null;
  current_team_name: string | null;
  current_org_or_conference_name: string | null;
  microsite_url: string | null;
  to_team_level: string | null;
};

type RecipientRow = {
  firebase_uid: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  arms_contact_id: string | null;
};

function isAuthorized(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  const bearer = req.headers.get("authorization") || "";
  return Boolean(expected && bearer === `Bearer ${expected}`);
}

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function slugifyName(first: string | null, last: string | null): string {
  return [first, last]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "player";
}

function payloadDescription(tx: TransactionRow): string {
  const payload = tx.payload || {};
  return text((payload as { description?: unknown }).description);
}

function isMlbCallup(tx: TransactionRow): boolean {
  const type = text(tx.transaction_type);
  return (type === "Recalled" || type === "Selected")
    && text(tx.to_team_level).toUpperCase() === "MLB";
}

function articleTitle(tx: TransactionRow): string {
  if (isMlbCallup(tx)) {
    const team = text(tx.to_team_name) || text(tx.current_team_name) || "the majors";
    return `YAT-A-BOY! ${tx.player_name} called up to ${team}`;
  }

  const description = payloadDescription(tx).replace(/[.\s]+$/, "");
  if (description) return description;

  const type = text(tx.transaction_type) || "Roster Update";
  const destination = text(tx.to_team_name);
  return [tx.player_name, type, destination ? `— ${destination}` : ""].filter(Boolean).join(" ");
}

function emailSubject(tx: TransactionRow): string {
  if (isMlbCallup(tx)) {
    const team = text(tx.to_team_name) || text(tx.current_team_name) || "MLB";
    return `YAT-A-BOY! ${tx.player_name} has been called up to ${team}`;
  }
  return `YAT?STATS Roster Alert: ${tx.player_name} — ${text(tx.transaction_type) || "Roster Update"}`;
}

function profileUrl(tx: TransactionRow): string {
  const hsid = text(tx.hsid);
  const slug = slugifyName(tx.first_name, tx.last_name);
  const base = text(tx.microsite_url).replace(/\/$/, "");
  if (base) return `${base}/player/${encodeURIComponent(tx.playerid)}/${slug}#ppTab-news`;
  if (hsid) return `https://yatstats.com/${encodeURIComponent(hsid)}/player/${encodeURIComponent(tx.playerid)}/${slug}#ppTab-news`;
  return "https://yatstats.com/news";
}

function buildEmailHtml(tx: TransactionRow, recipient: RecipientRow): string {
  const description = payloadDescription(tx) || articleTitle(tx);
  const firstName = text(recipient.first_name);
  const greeting = firstName ? `Hi ${escapeHtml(firstName)},` : "YAT?STATS roster alert:";
  const headline = articleTitle(tx);
  const url = profileUrl(tx);
  const badge = isMlbCallup(tx) ? "YAT-A-BOY!" : "ROSTER ALERT";

  return `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111;max-width:620px">
      <div style="font-size:12px;font-weight:700;letter-spacing:.08em;color:#666">${badge}</div>
      <h2 style="margin:6px 0 14px">${escapeHtml(headline)}</h2>
      <p>${greeting}</p>
      <p>${escapeHtml(description)}</p>
      <p style="margin:20px 0">
        <a href="${escapeHtml(url)}" style="display:inline-block;padding:11px 16px;border-radius:6px;background:#111;color:#fff;text-decoration:none;font-weight:700">View ${escapeHtml(tx.player_name)} on YAT?STATS</a>
      </p>
      <p style="font-size:12px;color:#666">You are receiving this because you are a YAT?STATS Super Fan and this player is in your Favorites.</p>
    </div>`;
}

async function getRecipients(playerId: string): Promise<RecipientRow[]> {
  const { rows } = await query<RecipientRow>(`
    SELECT DISTINCT ON (lower(trim(up.email)))
      up.firebase_uid,
      trim(up.email) AS email,
      up.first_name,
      up.last_name,
      COALESCE(NULLIF(trim(up.arms_contact_id), ''), NULLIF(trim(uf.arms_contact_id), '')) AS arms_contact_id
    FROM public.user_favorites uf
    JOIN public.user_profiles up ON up.firebase_uid = uf.firebase_uid
    WHERE uf.playerid::text = $1
      AND NULLIF(trim(up.email), '') IS NOT NULL
      AND (
        (up.stripe_subscription_id IS NOT NULL
          AND lower(coalesce(up.subscription_status, '')) IN ('active','trialing'))
        OR (up.promo_code IS NOT NULL
          AND (up.promo_expires_at IS NULL OR up.promo_expires_at > now()))
        OR lower(coalesce(up.subscription_status, '')) IN ('demo_comped','demo-comped')
        OR (
          lower(coalesce(up.plan, '')) = 'superfan'
          AND up.promo_code IS NULL
          AND up.stripe_subscription_id IS NULL
          AND lower(coalesce(up.subscription_status, '')) NOT IN ('cancelled','canceled','unpaid','past_due')
        )
      )
    ORDER BY lower(trim(up.email)), up.updated_at DESC NULLS LAST
  `, [playerId]);
  return rows;
}

async function insertTransactionNews(tx: TransactionRow): Promise<boolean> {
  const title = articleTitle(tx);
  const description = payloadDescription(tx) || title;
  const uuid = `mlb-transaction:${tx.id}`;
  const url = profileUrl(tx);
  const newsworthiness = isMlbCallup(tx) ? "FEATURED" : "NORMAL";
  const sentiment = isMlbCallup(tx) ? "positive" : "neutral";

  const result = await query(`
    INSERT INTO public.news_articles (
      uuid, playerid, player_name, hsid, title, source, source_full,
      published_at, url, snippet, sentiment, categories, summary,
      discovery_source, raw_payload, verification_status, verification_score,
      verification_reason, verification_evidence, newsworthiness, verified_at
    )
    VALUES (
      $1,$2,$3,$4,$5,'MLB','MLB Transactions',
      COALESCE($6::timestamptz, NOW()),$7,$8,$9,$10::text[],$8,
      $11,$12::jsonb,'VERIFIED',1.0,
      'Direct MLB Stats API transaction matched to canonical YAT?STATS player identity',
      $13::jsonb,$14,NOW()
    )
    ON CONFLICT (uuid) DO NOTHING
  `, [
    uuid,
    tx.playerid,
    tx.player_name,
    tx.hsid,
    title,
    tx.effective_date,
    url,
    description,
    sentiment,
    ["transactions", text(tx.transaction_type).toLowerCase().replace(/\s+/g, "_")],
    DISCOVERY_SOURCE,
    JSON.stringify(tx.payload || {}),
    JSON.stringify({
      source: "mlb_stats_api_transactions",
      transactionId: tx.id,
      transactionType: tx.transaction_type,
      fromTeam: tx.from_team_name,
      toTeam: tx.to_team_name,
      yadaboy: isMlbCallup(tx),
    }),
    newsworthiness,
  ]);

  return (result.rowCount ?? 0) > 0;
}

async function postArmsWebhook(tx: TransactionRow, recipientCount: number) {
  const webhookUrl = process.env.ARMS_PLAYER_ALERT_WEBHOOK_URL?.trim();
  if (!webhookUrl) return;

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      event: "yatstats_mlb_transaction",
      source: "mlb_stats_api",
      transactionId: tx.id,
      playerid: tx.playerid,
      playerName: tx.player_name,
      hsid: tx.hsid,
      transactionType: tx.transaction_type,
      fromTeam: tx.from_team_name,
      toTeam: tx.to_team_name,
      description: payloadDescription(tx),
      yadaboy: isMlbCallup(tx),
      superFanRecipients: recipientCount,
      profileUrl: profileUrl(tx),
      occurredAt: tx.effective_date,
    }),
  });

  if (!response.ok) {
    const body = (await response.text().catch(() => "")).slice(0, 500);
    throw new Error(`ARMS transaction webhook failed: ${response.status} ${body}`);
  }
}

async function loadTransactions(
  createdAfter: string,
  afterId: string,
): Promise<TransactionRow[]> {
  const { rows } = await query<TransactionRow>(`
    SELECT
      pt.id::text AS id,
      pt.playerid::text AS playerid,
      pt.transaction_type,
      pt.from_team_name,
      pt.to_team_name,
      pt.effective_date,
      pt.created_at,
      pt.payload,
      COALESCE(
        NULLIF(trim(f.display_name), ''),
        NULLIF(trim(concat_ws(' ', f.first_name, f.last_name)), ''),
        NULLIF(trim(concat_ws(' ', p.firstname, p.lastname)), ''),
        pt.playerid::text
      ) AS player_name,
      COALESCE(NULLIF(trim(f.first_name), ''), NULLIF(trim(p.firstname), '')) AS first_name,
      COALESCE(NULLIF(trim(f.last_name), ''), NULLIF(trim(p.lastname), '')) AS last_name,
      f.hsid::text AS hsid,
      f.level_label,
      f.current_team_name,
      f.current_org_or_conference_name,
      ss.microsite_url,
      to_lookup.level AS to_team_level
    FROM public.player_transactions pt
    LEFT JOIN public.flip_card_front_stage f ON f.playerid::text = pt.playerid::text
    LEFT JOIN public.tbc_players_raw p ON p.playerid::text = pt.playerid::text
    LEFT JOIN public.school_success ss ON ss.hsid::text = f.hsid::text
    LEFT JOIN public.team_id_map tim
      ON tim.mlb_stats_api_id::text = pt.payload->'toTeam'->>'id'
    LEFT JOIN public."150-pro_team_look_up_tbc_mlb" to_lookup
      ON to_lookup.teamid::text = tim.tbc_teamid::text
    WHERE pt.source = 'mlb_api'
      AND (
        pt.created_at > $1::timestamptz
        OR (pt.created_at = $1::timestamptz AND pt.id > $2::bigint)
      )
    ORDER BY pt.created_at, pt.id
    LIMIT 250
  `, [createdAfter, afterId || "0"]);
  return rows;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  // ingest_job_health is provisioned by database migrations. Cron jobs must
  // never attempt schema DDL with the restricted runtime database role.
  try {
    const { rows: stateRows } = await query(
      `SELECT last_result FROM public.ingest_job_health WHERE job_name = $1`,
      [JOB_NAME],
    );
    const state = stateRows[0]?.last_result || {};

    // First run intentionally starts near "now" instead of replaying years of
    // transactions and flooding Super Fans with old email.
    const initialCreatedAt = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const lastCreatedAt = text(state.lastCreatedAt) || initialCreatedAt;
    const lastTransactionId = text(state.lastTransactionId) || "0";

    const transactions = await loadTransactions(lastCreatedAt, lastTransactionId);

    let newsCreated = 0;
    let meaningful = 0;
    let emailsSent = 0;
    let emailFailures = 0;
    let webhookFailures = 0;

    for (const tx of transactions) {
      if (!MEANINGFUL_TYPES.has(text(tx.transaction_type))) continue;
      meaningful++;

      if (await insertTransactionNews(tx)) newsCreated++;

      const recipients = await getRecipients(tx.playerid);

      for (const recipient of recipients) {
        const contactId = text(recipient.arms_contact_id) || await findOrCreateGhlContact(
          recipient.email,
          text(recipient.first_name) || undefined,
          text(recipient.last_name) || undefined,
          text(tx.hsid) || undefined,
          undefined,
        );

        if (!contactId) {
          emailFailures++;
          continue;
        }

        const sent = await sendGHLEmail(
          contactId,
          emailSubject(tx),
          buildEmailHtml(tx, recipient),
        );
        if (sent) emailsSent++;
        else emailFailures++;
      }

      try {
        await postArmsWebhook(tx, recipients.length);
      } catch (error) {
        webhookFailures++;
        console.error("MLB transaction ARMS webhook failed", { transactionId: tx.id, error });
      }
    }

    const cursor = transactions.length
      ? transactions[transactions.length - 1]
      : { created_at: lastCreatedAt, id: lastTransactionId };

    const result = {
      transactionsSeen: transactions.length,
      meaningfulTransactions: meaningful,
      newsCardsCreated: newsCreated,
      superFanEmailsSent: emailsSent,
      emailFailures,
      webhookFailures,
      lastCreatedAt: cursor.created_at,
      lastTransactionId: cursor.id,
    };

    await query(
      `INSERT INTO public.ingest_job_health (
         job_name, last_success_at, consecutive_failures, last_error, last_result, updated_at
       ) VALUES ($1, NOW(), 0, NULL, $2::jsonb, NOW())
       ON CONFLICT (job_name) DO UPDATE SET
         last_success_at = EXCLUDED.last_success_at,
         consecutive_failures = 0,
         last_error = NULL,
         last_result = EXCLUDED.last_result,
         updated_at = NOW()`,
      [JOB_NAME, JSON.stringify(result)],
    );

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await query(
      `INSERT INTO public.ingest_job_health (
         job_name, last_failure_at, consecutive_failures, last_error, updated_at
       ) VALUES ($1, NOW(), 1, $2, NOW())
       ON CONFLICT (job_name) DO UPDATE SET
         last_failure_at = EXCLUDED.last_failure_at,
         consecutive_failures = public.ingest_job_health.consecutive_failures + 1,
         last_error = EXCLUDED.last_error,
         updated_at = NOW()`,
      [JOB_NAME, message.slice(0, 1000)],
    ).catch(() => undefined);

    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
