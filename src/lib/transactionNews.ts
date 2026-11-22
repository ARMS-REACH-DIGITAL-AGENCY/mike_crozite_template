// Verified MLB transaction news is independent of the notification cursor.
// One stored transaction has one stable article, shared by every view of its
// YAT person. This module performs no email, webhook, or roster operations.

export type TransactionNewsQuery = <Row extends Record<string, unknown> = Record<string, unknown>>(
  statement: string,
  params?: unknown[],
) => Promise<{ rows: Row[]; rowCount?: number | null }>;

export type TransactionNewsRow = {
  id: string;
  yatid: string;
  player_name: string;
  first_name: string | null;
  last_name: string | null;
  hsid: string;
  transaction_type: string | null;
  from_team_name: string | null;
  to_team_name: string | null;
  effective_date: string | Date | null;
  mlb_person_id: string;
  to_team_level: string | null;
  payload: Record<string, unknown> | null;
};

// Do not use a date window or an alert watermark here. An interrupted run,
// an older import, or a player whose identity was just verified remains
// eligible until its article actually exists. School/card identity is YAT.
// The MLB ID must still belong to that person; old wrongly matched source
// rows must not become verified news just because they have a player number.
export const TRANSACTION_NEWS_CANDIDATES_SQL = `
  SELECT
    pt.id::text AS id, pt.yatid,
    COALESCE(NULLIF(btrim(f.display_name), ''),
             NULLIF(btrim(concat_ws(' ', f.first_name, f.last_name)), ''),
             NULLIF(btrim(concat_ws(' ', person.first_name, person.last_name)), ''),
             NULLIF(btrim(pt.payload#>>'{person,fullName}'), ''), pt.yatid) AS player_name,
    COALESCE(NULLIF(btrim(f.first_name), ''), person.first_name) AS first_name,
    COALESCE(NULLIF(btrim(f.last_name), ''), person.last_name) AS last_name,
    COALESCE(f.hsid, school.hsid) AS hsid,
    pt.transaction_type, pt.from_team_name, pt.to_team_name,
    pt.effective_date, pt.payload,
    pt.payload#>>'{person,id}' AS mlb_person_id,
    destination.level_label AS to_team_level
  FROM public.player_transactions pt
  CROSS JOIN LATERAL (
    SELECT CASE
      WHEN pt.payload->>'date' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
        AND pg_input_is_valid(pt.payload->>'date', 'date')
      THEN (pt.payload->>'date')::date::timestamp AT TIME ZONE 'UTC'
      ELSE NULL
    END AS announced_at
  ) publication
  JOIN public.yat_registry person ON person.yatid = pt.yatid
  LEFT JOIN LATERAL (
    SELECT card.display_name, card.first_name, card.last_name, card.hsid
    FROM public.flip_card_front_stage card
    WHERE card.yatid = pt.yatid AND NULLIF(btrim(card.hsid), '') IS NOT NULL
    ORDER BY card.hsid
    LIMIT 1
  ) f ON true
  LEFT JOIN LATERAL (
    SELECT link.hsid::text AS hsid
    FROM public.yat_school_links link
    WHERE link.yatid = pt.yatid AND f.hsid IS NULL
    ORDER BY link.hsid
    LIMIT 1
  ) school ON true
  LEFT JOIN LATERAL (
    SELECT canonical.level_label
    FROM public.team_id_map mapping
    JOIN public.teamid_universe_mapping canonical
      ON canonical.teamid = mapping.tbc_teamid::text
    WHERE mapping.mlb_stats_api_id::text = pt.payload#>>'{toTeam,id}'
    ORDER BY canonical.teamid
    LIMIT 1
  ) destination ON true
  WHERE pt.source = 'mlb_api'
    AND pt.yatid IS NOT NULL
    -- news_articles.hsid is required. A verified school link is enough;
    -- a card need not exist yet. Unplaced people wait for their real school.
    AND COALESCE(f.hsid, school.hsid) IS NOT NULL
    AND COALESCE(publication.announced_at, pt.effective_date) IS NOT NULL
    AND ($2::bigint[] IS NULL OR pt.id = ANY($2::bigint[]))
    AND EXISTS (
      SELECT 1 FROM public.yat_mlb_links identity
      WHERE identity.yatid = pt.yatid
        AND identity.mlb_id = pt.payload#>>'{person,id}'
        AND identity.proven
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.yat_registry_rejections rejected
      WHERE rejected.yatid = pt.yatid AND rejected.source = 'mlb'
        AND rejected.source_id = pt.payload#>>'{person,id}'
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.news_articles existing
      WHERE existing.uuid = 'mlb-transaction:' || pt.id::text
    )
  ORDER BY COALESCE(publication.announced_at, pt.effective_date) DESC, pt.id DESC
  LIMIT $1
`;

export type TransactionNewsArticle = {
  uuid: string;
  playerid: string;
  yatid: string;
  player_name: string;
  player_firstname: string | null;
  player_lastname: string | null;
  hsid: string;
  title: string;
  published_at: string;
  url: string;
  image_url: string;
  snippet: string;
  sentiment: string;
  categories: string[];
  raw_payload: Record<string, unknown>;
  verification_evidence: Record<string, unknown>;
  newsworthiness: string;
};

function text(value: unknown): string {
  return String(value ?? '').trim();
}

export function transactionNewsArticle(tx: TransactionNewsRow): TransactionNewsArticle {
  if (!/^\d+$/.test(tx.id) || !/^YAT\d{6,}$/.test(tx.yatid)
    || !/^\d+$/.test(tx.mlb_person_id) || !text(tx.hsid)) {
    throw new Error('Transaction news requires a verified YAT person, MLB ID, school, and transaction ID');
  }
  // MLB's date is when the news broke; effectiveDate can be retroactive.
  // Keep the source's effective date in the payload/evidence/body unchanged.
  const announcement = text(tx.payload?.date);
  const announcedAt = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(announcement)
    ? new Date(`${announcement}T00:00:00.000Z`) : null;
  const validAnnouncement = announcedAt && Number.isFinite(announcedAt.getTime())
    && announcedAt.toISOString().slice(0, 10) === announcement;
  const effectiveAt = tx.effective_date === null ? null : new Date(tx.effective_date);
  const publishedAt = validAnnouncement ? announcedAt!.toISOString()
    : effectiveAt && Number.isFinite(effectiveAt.getTime()) ? effectiveAt.toISOString() : null;
  if (!publishedAt) {
    throw new Error(`Transaction ${tx.id} has no valid source event date`);
  }
  const type = text(tx.transaction_type);
  const callup = (type === 'Recalled' || type === 'Selected')
    && text(tx.to_team_level).toUpperCase() === 'MLB';
  const description = text(tx.payload?.description);
  const destination = text(tx.to_team_name);
  const title = callup
    ? `YAT-A-BOY! ${tx.player_name} called up to ${destination || 'the majors'}`
    : description.replace(/[.\s]+$/, '')
      || [tx.player_name, type || 'Roster Update', destination ? `— ${destination}` : ''].filter(Boolean).join(' ');
  const image = `https://img.mlbstatic.com/mlb-photos/image/upload/w_400,q_auto:good/v1/people/${tx.mlb_person_id}/headshot/67/current`;

  return {
    // Preserve the existing article identifier: database transaction ID,
    // NOT MLB's payload ID. Retries cannot duplicate a previously posted move.
    uuid: `mlb-transaction:${tx.id}`,
    playerid: tx.yatid,
    yatid: tx.yatid,
    player_name: tx.player_name,
    player_firstname: tx.first_name,
    player_lastname: tx.last_name,
    hsid: tx.hsid,
    title,
    published_at: publishedAt,
    url: `https://www.mlb.com/transactions/${publishedAt.slice(0, 10).replace(/-/g, '/')}`,
    image_url: image,
    snippet: description || title,
    sentiment: callup ? 'positive' : 'neutral',
    categories: ['transactions', type.toLowerCase().replace(/\s+/g, '_')].filter(Boolean),
    raw_payload: tx.payload || {},
    verification_evidence: {
      source: 'mlb_stats_api_transactions',
      transactionId: tx.id,
      mlbTransactionId: tx.payload?.id ?? null,
      mlbPlayerId: tx.mlb_person_id,
      yatid: tx.yatid,
      transactionType: tx.transaction_type,
      announcementDate: tx.payload?.date ?? null,
      effectiveDate: tx.payload?.effectiveDate ?? tx.effective_date,
      fromTeam: tx.from_team_name,
      toTeam: tx.to_team_name,
      yadaboy: callup,
    },
    newsworthiness: callup ? 'FEATURED' : 'NORMAL',
  };
}

// One atomic insert per bounded batch. The unique UUID remains the final
// concurrency guard if the alert publisher and catch-up overlap. Recheck the
// authoritative identity inside the write, not only when loading candidates.
export const TRANSACTION_NEWS_INSERT_SQL = `
  INSERT INTO public.news_articles (
    uuid, playerid, yatid, player_name, player_firstname, player_lastname,
    hsid, title, source, source_full, published_at, url,
    image_url, display_image_url, image_verification_status,
    snippet, summary, sentiment, categories, discovery_source, raw_payload,
    verification_status, verification_score, verification_reason,
    verification_evidence, newsworthiness, verified_at
  )
  SELECT
    article.uuid, article.yatid, article.yatid, article.player_name,
    article.player_firstname, article.player_lastname,
    article.hsid, article.title, 'MLB', 'MLB Transactions',
    article.published_at::timestamptz, article.url,
    article.image_url, article.image_url, 'SOURCE_VERIFIED',
    article.snippet, article.snippet, article.sentiment, article.categories,
    'mlb_transactions', article.raw_payload,
    'VERIFIED', 1.0,
    'Direct MLB Stats API transaction matched to the verified canonical YAT person',
    article.verification_evidence, article.newsworthiness, NOW()
  FROM jsonb_to_recordset($1::jsonb) AS article(
    uuid text, yatid text, player_name text, player_firstname text,
    player_lastname text, hsid text, title text, published_at text, url text,
    image_url text, snippet text, sentiment text, categories text[],
    raw_payload jsonb, verification_evidence jsonb, newsworthiness text
  )
  WHERE EXISTS (
    SELECT 1 FROM public.yat_mlb_links identity
    WHERE identity.yatid = article.yatid
      AND identity.mlb_id = article.raw_payload#>>'{person,id}'
      AND identity.proven
  )
    AND NOT EXISTS (
      SELECT 1 FROM public.yat_registry_rejections rejected
      WHERE rejected.yatid = article.yatid AND rejected.source = 'mlb'
        AND rejected.source_id = article.raw_payload#>>'{person,id}'
    )
  ON CONFLICT (uuid) DO NOTHING
  RETURNING uuid, yatid, hsid
`;

export type TransactionNewsReport = {
  considered: number;
  created: number;
  hasMore: boolean;
  samples: Array<{ uuid: string; yatid: string; player: string; title: string; date: string }>;
};

export async function publishTransactionNews(
  runQuery: TransactionNewsQuery,
  { batchSize = 500, transactionIds, dryRun = false }: {
    batchSize?: number;
    transactionIds?: string[];
    dryRun?: boolean;
  } = {},
): Promise<TransactionNewsReport> {
  const limit = Number.isFinite(batchSize) ? Math.max(1, Math.min(1000, Math.floor(batchSize))) : 500;
  if (transactionIds?.some(id => !/^\d+$/.test(id))) throw new Error('Invalid transaction ID');
  const report: TransactionNewsReport = { considered: 0, created: 0, hasMore: false, samples: [] };
  if (transactionIds?.length === 0) return report;
  const { rows } = await runQuery<TransactionNewsRow>(TRANSACTION_NEWS_CANDIDATES_SQL, [limit, transactionIds ?? null]);
  const articles = rows.map(transactionNewsArticle);
  report.considered = articles.length;
  report.hasMore = articles.length === limit;
  report.samples = articles.slice(0, 10).map(article => ({
    uuid: article.uuid, yatid: article.yatid, player: article.player_name,
    title: article.title, date: article.published_at,
  }));
  if (dryRun || !articles.length) return report;
  const inserted = await runQuery<{ uuid: string; yatid: string; hsid: string }>(
    TRANSACTION_NEWS_INSERT_SQL, [JSON.stringify(articles)],
  );
  report.created = inserted.rows.length;
  return report;
}
