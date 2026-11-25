import {
  publishTransactionNews,
  type TransactionNewsQuery,
} from '../../src/lib/transactionNews';

type IncomingMlbTransaction = {
  id?: number;
  person?: { id: number };
  typeDesc?: string;
  typeCode?: string;
  fromTeam?: { name?: string };
  toTeam?: { name?: string };
  effectiveDate?: string;
  date?: string;
};

export type TransactionReceipt = {
  transactionId: string | null;
  inserted: boolean;
  newsCreated: number;
  newsHeld: boolean;
  publicationError?: string;
};

// Sport-level feeds can repeat a move, but one trade ID may cover multiple players.
export function mlbTransactionFetchKey(transaction: IncomingMlbTransaction, nextNoId: () => number): string {
  return transaction.id == null
    ? `no-id:${nextNoId()}`
    : `event:${transaction.id}:person:${transaction.person?.id ?? ''}`;
}

export const RECEIVED_TRANSACTION_INSERT_SQL = `
  INSERT INTO public.player_transactions
    (playerid, transaction_type, from_team_name, to_team_name,
     effective_date, source, payload)
  SELECT $1::text, $2::text, $3::text, $4::text, $5, 'mlb_api', $6::jsonb
  WHERE NOT EXISTS (
    SELECT 1 FROM public.player_transactions pt
    WHERE pt.source = 'mlb_api'
      AND pt.yatid = public.yat_id_for($1::text)
      AND pt.payload#>>'{person,id}' = $6::jsonb#>>'{person,id}'
      AND $6::jsonb->>'id' IS NOT NULL
      AND pt.payload->>'id' = $6::jsonb->>'id'
  )
  ON CONFLICT DO NOTHING
  RETURNING id::text AS id
`;

// A retry may find a committed transaction whose article failed previously.
// Resolve that SAME source event through its YAT person; never create a new
// transaction or reset its timestamp simply to retry publication.
export const RECEIVED_TRANSACTION_EXISTING_SQL = `
  SELECT pt.id::text AS id, (article.uuid IS NOT NULL) AS news_exists
  FROM public.player_transactions pt
  LEFT JOIN public.news_articles article
    ON article.uuid = 'mlb-transaction:' || pt.id::text
  WHERE pt.source = 'mlb_api'
    AND pt.yatid = public.yat_id_for($1::text)
    AND pt.payload#>>'{person,id}' = $2::text
    AND (
      ($3::text IS NOT NULL AND pt.payload->>'id' = $3::text)
      OR ($3::text IS NULL
        AND pt.transaction_type IS NOT DISTINCT FROM $4::text
        AND pt.to_team_name IS NOT DISTINCT FROM $5::text
        AND pt.effective_date IS NOT DISTINCT FROM $6::timestamptz)
    )
  ORDER BY (article.uuid IS NOT NULL) DESC, pt.id
  LIMIT 1
`;

// The caller uses the importer's ordinary auto-committing writer connection.
// Its INSERT has completed before source identity registration or news begins.
// Publication errors leave the authoritative transaction intact and visible
// to both a repeated receipt and the independent catch-up job.
export async function receiveMlbTransaction(
  runQuery: TransactionNewsQuery,
  playerId: string,
  transaction: IncomingMlbTransaction,
  afterPersist?: () => Promise<void>,
): Promise<TransactionReceipt> {
  const type = transaction.typeDesc ?? transaction.typeCode ?? null;
  const effectiveDate = transaction.effectiveDate ?? transaction.date ?? null;
  const { rows: insertedRows } = await runQuery<{ id: string }>(RECEIVED_TRANSACTION_INSERT_SQL, [
    playerId, type, transaction.fromTeam?.name ?? null, transaction.toTeam?.name ?? null,
    effectiveDate, JSON.stringify(transaction),
  ]);
  let transactionId = insertedRows[0]?.id ?? null;
  const receipt: TransactionReceipt = {
    transactionId, inserted: transactionId !== null, newsCreated: 0, newsHeld: false,
  };
  let alreadyPublished = false;
  if (!transactionId) {
    const { rows: existingRows } = await runQuery<{ id: string; news_exists: boolean }>(RECEIVED_TRANSACTION_EXISTING_SQL, [
      playerId, transaction.person?.id == null ? null : String(transaction.person.id),
      transaction.id == null ? null : String(transaction.id), type,
      transaction.toTeam?.name ?? null, effectiveDate,
    ]);
    transactionId = existingRows[0]?.id ?? null;
    receipt.transactionId = transactionId;
    alreadyPublished = existingRows[0]?.news_exists === true;
  }

  try {
    // A new exact-name/identity match is registered before news verifies the
    // MLB-to-YAT link. Do this on retries too, if a prior registration failed.
    if (afterPersist) await afterPersist();
    if (!transactionId) {
      throw new Error('Duplicate transaction could not be resolved to the same canonical source event');
    }
    if (!alreadyPublished) {
      const news = await publishTransactionNews(runQuery, {
        transactionIds: [transactionId], batchSize: 1,
      });
      receipt.newsCreated = news.created;
      receipt.newsHeld = news.considered === 0;
    }
  } catch (error) {
    receipt.publicationError = error instanceof Error ? error.message : String(error);
  }
  return receipt;
}
