// TEST-ONLY: reads immutable original/revised review copies. No rendering or writes.
import type { ReadDatabase } from './finishedPublication';

export type ReviewEdition = {
  html: string; plain_text: string; content_hash: string; layout_version?: string | null;
};

export async function readRehearsalEdition(db: ReadDatabase, request: {
  season: string; cadence: string; date: string; version?: string;
}): Promise<ReviewEdition | null> {
  if (request.version && !/^[a-f0-9]{64}$/.test(request.version)) throw new Error('Invalid edition version');
  const present = (await db.query("SELECT to_regclass('public.bracket_rehearsal_edition_revisions')::text AS relation")).rows[0]?.relation;
  const values = [request.season, request.cadence, request.date];
  if (request.version) values.push(request.version);
  const { rows } = await db.query(`WITH copies AS (
    SELECT recipient_email,html,plain_text,content_hash,created_at,NULL::text AS layout_version
    FROM public.bracket_rehearsal_editions WHERE season_key=$1 AND cadence=$2 AND period_start=$3
    ${present ? `UNION ALL
    SELECT recipient_email,html,plain_text,content_hash,created_at,layout_version
    FROM public.bracket_rehearsal_edition_revisions WHERE season_key=$1 AND cadence=$2 AND period_start=$3` : ''}
  ) SELECT html,plain_text,content_hash,layout_version FROM (
    SELECT DISTINCT ON (recipient_email) * FROM copies
    ${request.version ? 'WHERE content_hash=$4' : ''}
    ORDER BY recipient_email,created_at DESC,content_hash
  ) chosen`, values);
  // The review route intentionally has no recipient selector. Keep refusing
  // ambiguous periods instead of exposing a different recipient's edition.
  return rows.length === 1 ? rows[0] as ReviewEdition : null;
}
