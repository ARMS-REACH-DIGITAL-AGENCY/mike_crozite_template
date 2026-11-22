// A verified provisional game is already scored and stored. Ratification is
// a database-only transition: it does not need a live stats API or the public
// renderer. This backup must NOT manufacture results from partial inputs.
import type { PoolClient } from 'pg';

export const SQL_RATIFY_VERIFIED = `
UPDATE public.master_bracket m
   SET status = 'final',
       winner_hsid = (m.box->'provisional'->>'projectedWinner')::integer,
       decided_by = m.box->'provisional'->>'decidedBy',
       decided_note = CASE
         WHEN m.decided_note IS NOT NULL THEN m.decided_note
         ELSE '4 AM Arizona: ratified stored verified snapshot ' || (m.box->'provisional'->>'snapshotId')
       END,
       locked_at = now()
  FROM public.fantasy_seasons s
 WHERE s.season_key = m.season_key
   AND m.season_key = $1
   AND ( $2::integer IS NULL OR m.region = $2::integer )
   AND s.opening_day::date + m.week * 7 <= $3::date
   AND m.locked_at IS NULL
   AND m.status = 'in_progress'
   AND jsonb_typeof(m.box->'provisional') = 'object'
   AND m.box->'provisional'->>'status' = 'verified'
   AND COALESCE(m.box->'provisional'->>'snapshotId','') <> ''
   AND COALESCE(m.box->'provisional'->>'decidedBy','') <> ''
   AND COALESCE((m.box->'provisional'->>'lastInning')::integer,0) >= 9
   AND (m.box->'provisional'->>'projectedWinner')::integer IN (m.home_hsid,m.away_hsid)
   AND cardinality(m.innings) >= 18
 RETURNING m.region,m.game_id,m.week,m.home_hsid,m.away_hsid,m.winner_hsid
`;

// Return all unresolved games at the deadline (including those with no
// verified precomputed winner); alert and retry, never silently advance.
export const SQL_PENDING_WEEKLY = `
SELECT m.region,m.game_id,m.week,m.status,m.home_hsid,m.away_hsid,
       m.box->'provisional'->>'snapshotId' AS snapshot_id
FROM public.master_bracket m
JOIN public.fantasy_seasons s ON s.season_key = m.season_key
WHERE m.season_key = $1
  AND ($2::integer IS NULL OR m.region = $2::integer)
  AND s.opening_day::date + m.week * 7 <= $3::date
  AND m.home_hsid IS NOT NULL AND m.away_hsid IS NOT NULL
  AND m.locked_at IS NULL
ORDER BY m.week,m.region,m.game_id
`;

export async function ratifyVerifiedStored(
  db: PoolClient, seasonKey: string, region: number | null, asof: string,
  dryRun = false,
) {
  await db.query('BEGIN');
  try {
    await db.query("SET LOCAL master_bracket.reason = '4 AM backup ratification from verified provisional snapshot'");
    if (!dryRun) await db.query(SQL_RATIFY_VERIFIED, [seasonKey,region,asof]);
    const pending = await db.query(SQL_PENDING_WEEKLY, [seasonKey,region,asof]);
    const details = pending.rows.map((r: Record<string, unknown>) =>
      ({ region:r.region, gameId:r.game_id, week:r.week, status:r.status, snapshotId:r.snapshot_id || null }));
    await db.query(dryRun ? 'ROLLBACK' : 'COMMIT');
    return { pending: details, ready: details.length === 0 };
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  }
}
