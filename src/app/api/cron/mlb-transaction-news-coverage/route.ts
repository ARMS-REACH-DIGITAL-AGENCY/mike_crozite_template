import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

// Fills gaps in the existing 15-minute MLB transaction-news publisher.
// It does not send Super Fan email or create a second article for a transaction.
// Preview deployments and ?dry=1 always remain read-only.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const LIMIT = 500;

const candidatesSql = [
  "WITH candidates AS (",
  " SELECT pt.id::text tx_id, pt.playerid::text playerid, pt.transaction_type,",
  " pt.to_team_name, pt.effective_date, pt.created_at, pt.payload,",
  " f.hsid::text hsid, f.first_name, f.last_name,",
  " COALESCE(NULLIF(BTRIM(f.display_name), ''),",
  " NULLIF(BTRIM(CONCAT_WS(' ',f.first_name,f.last_name)), ''),",
  " pt.playerid::text) player_name, ss.microsite_url",
  " FROM public.player_transactions pt",
  " JOIN public.flip_card_front_stage f ON f.playerid::text = pt.playerid::text",
  " LEFT JOIN public.school_success ss ON ss.hsid::text = f.hsid::text",
  " WHERE pt.source = 'mlb_api'",
  " AND pt.created_at >= NOW() - INTERVAL '30 days'",
  " AND NULLIF(BTRIM(pt.transaction_type), '') IS NOT NULL",
  " AND NULLIF(BTRIM(f.hsid::text), '') IS NOT NULL",
  " AND NOT EXISTS (",
  "   SELECT 1 FROM public.news_articles n",
  "   WHERE n.uuid = 'mlb-transaction:' || pt.id::text",
  " )",
  " ORDER BY pt.created_at ASC, pt.id ASC",
  " LIMIT " + LIMIT,
  ")"
].join(" ");

const insertSql = [
  candidatesSql,
  ", inserted AS (",
  " INSERT INTO public.news_articles (",
  " uuid,playerid,player_name,hsid,title,source,source_full,",
  " published_at,url,snippet,summary,sentiment,categories,",
  " discovery_source,raw_payload,verification_status,verification_score,",
  " verification_reason,verification_evidence,newsworthiness,verified_at",
  " )",
  " SELECT 'mlb-transaction:' || c.tx_id, c.playerid, c.player_name, c.hsid,",
  " COALESCE(NULLIF(BTRIM(c.payload->>'description'), ''),",
  "   CONCAT_WS(' ',c.player_name,c.transaction_type,c.to_team_name)),",
  " 'MLB','MLB Transactions',",
  " COALESCE(c.effective_date,c.created_at),",
  " COALESCE(NULLIF(RTRIM(c.microsite_url,'/'), ''),",
  "   'https://yatstats.com/' || c.hsid)",
  "   || '/player/' || c.playerid || '/'",
  "   || COALESCE(NULLIF(BTRIM(BOTH '-' FROM",
  "       regexp_replace(lower(CONCAT_WS('-',c.first_name,c.last_name)),",
  "       '[^a-z0-9]+','-','g')), ''),'player')",
  "   || '#ppTab-news',",
  " COALESCE(NULLIF(BTRIM(c.payload->>'description'), ''),",
  "   CONCAT_WS(' ',c.player_name,c.transaction_type,c.to_team_name)),",
  " COALESCE(NULLIF(BTRIM(c.payload->>'description'), ''),",
  "   CONCAT_WS(' ',c.player_name,c.transaction_type,c.to_team_name)),",
  " 'neutral',ARRAY['transactions',",
  "   regexp_replace(lower(c.transaction_type),'[^a-z0-9]+','_','g')]::text[],",
  " 'mlb_transactions',COALESCE(c.payload,'{}'::jsonb),'VERIFIED',1.0,",
  " 'Direct MLB Stats API transaction matched to canonical YAT?STATS player identity',",
  " jsonb_build_object('source','mlb_stats_api_transactions',",
  "   'transactionId',c.tx_id,'transactionType',c.transaction_type,",
  "   'recoveredBy','mlb_transaction_news_coverage'),",
  " CASE WHEN c.transaction_type IN ('Recalled','Selected')",
  "   THEN 'FEATURED' ELSE 'NORMAL' END,NOW()",
  " FROM candidates c",
  " ON CONFLICT (uuid) DO NOTHING",
  " RETURNING uuid",
  ") SELECT COUNT(*)::int inserted_count FROM inserted"
].join(" ");

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== "Bearer " + secret) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const dryRun = req.nextUrl.searchParams.get("dry") === "1" ||
    process.env.VERCEL_ENV === "preview";
  try {
    if (dryRun) {
      const { rows } = await query<{ eligible_count: number }>(
        candidatesSql + " SELECT COUNT(*)::int eligible_count FROM candidates"
      );
      return NextResponse.json({
        ok: true, dryRun: true, eligible: rows[0]?.eligible_count ?? 0,
        batchLimit: LIMIT
      });
    }
    const { rows } = await query<{ inserted_count: number }>(insertSql);
    const inserted = Number(rows[0]?.inserted_count ?? 0);
    console.info("[mlb-transaction-news-coverage]", { inserted, batchLimit: LIMIT });
    return NextResponse.json({ ok: true, dryRun: false, inserted, batchLimit: LIMIT });
  } catch (error) {
    console.error("[mlb-transaction-news-coverage] failed", error);
    return NextResponse.json(
      { ok: false, error: "Transaction news catch-up failed" },
      { status: 500 }
    );
  }
}
