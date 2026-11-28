// TEST-ONLY clock adapter. Official scores and boxes still use preparedIndex.
import { query } from '@/lib/db';

export type RehearsalClock = { reportDate: string; effectiveAt: string; asof: string; phase: string };
export async function readRehearsalClock(season: string): Promise<RehearsalClock | null> {
  const branch = process.env.REHEARSAL_NEON_BRANCH, endpoint = process.env.REHEARSAL_NEON_ENDPOINT;
  if (!branch && !endpoint) return null;
  if (!branch || branch === 'br-polished-lab-a4i35u5j' || !endpoint ||
      !process.env.DATABASE_URL || process.env.PLAYERS_DATABASE_URL !== process.env.DATABASE_URL ||
      new URL(process.env.DATABASE_URL).hostname !== endpoint) throw new Error('Invalid isolated rehearsal clock target');
  const { rows: [identity] } = await query<{ endpoint: string }>("SELECT current_setting('neon.endpoint_id',true) AS endpoint");
  if (identity?.endpoint !== endpoint.split('.')[0].replace(/-pooler$/, '')) throw new Error('Rehearsal clock target mismatch');
  const { rows: [row] } = await query<{ report_date: string; effective_at: string; phase: string }>(
    "SELECT report_date::text,effective_at::text,phase FROM public.bracket_rehearsal_days WHERE season_key=$1 AND branch_id=$2 AND phase IN ('scored','awaiting_review') ORDER BY report_date DESC LIMIT 1", [season, branch]);
  // A reset deliberately removes every completed checkpoint. The opening
  // bracket is still available from the stored schedule. Never fall back to
  // the real-world date or pretend an unreviewed day is complete.
  if (!row) {
    const { rows: [opening] } = await query<{ opening_day: string }>(
      "SELECT opening_day::text FROM public.fantasy_seasons WHERE season_key=$1", [season]);
    if (!opening?.opening_day || !/^\d{4}-\d{2}-\d{2}$/.test(opening.opening_day)) {
      throw new Error('Invalid isolated rehearsal opening date');
    }
    const instant = Date.parse(opening.opening_day + 'T11:00:00Z');
    if (!Number.isFinite(instant)) throw new Error('Invalid isolated rehearsal opening clock');
    return { reportDate: new Date(instant - 86400000).toISOString().slice(0, 10),
      effectiveAt: new Date(instant).toISOString(), asof: opening.opening_day, phase: 'opening' };
  }
  const instant = Date.parse(row.effective_at);
  if (!Number.isFinite(instant)) throw new Error('Invalid persisted rehearsal clock');
  return { reportDate: row.report_date, effectiveAt: new Date(instant).toISOString(),
    asof: new Date(instant - 11 * 3600000).toISOString().slice(0, 10), phase: row.phase };
}
