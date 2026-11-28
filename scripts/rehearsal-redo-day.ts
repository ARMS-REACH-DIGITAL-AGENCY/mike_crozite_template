// TEST-ONLY: put the isolated rehearsal back to the end of the previous day so
// the latest day can be replayed (Pete, Nov 23 2026: March 27 left out the
// minor-league lines). Restores master_bracket from the previous day's saved
// stored_results, removes the latest day's Digest and checkpoint. Keeps the
// captured provider responses and the day's ingested game lines (re-ingest is
// idempotent). Never sends, never touches production.
import { readFileSync } from 'node:fs';
import { Pool } from 'pg';
import { addDays } from './rehearsal-day';

const arg = (name: string) => { const i = process.argv.indexOf('--' + name); return i < 0 ? '' : process.argv[i + 1]; };
const PRODUCTION_BRANCH = 'br-polished-lab-a4i35u5j';

async function main() {
  const day = arg('day'), season = arg('season') || '2027', expectedBranch = arg('expected-branch'), expectedEndpoint = arg('expected-endpoint');
  const config = JSON.parse(readFileSync(arg('connection-file'), 'utf8'));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !expectedBranch || expectedBranch === PRODUCTION_BRANCH || config.branch_id !== expectedBranch
      || new URL(config.DATABASE_URL).hostname !== expectedEndpoint) throw new Error('An explicit day and the verified isolated branch/endpoint are required');
  const pool = new Pool({ connectionString: config.DATABASE_URL, max: 2 });
  const db = await pool.connect();
  try {
    const { rows: [identity] } = await db.query("SELECT current_setting('neon.endpoint_id',true) AS endpoint");
    if (identity?.endpoint !== expectedEndpoint.split('.')[0].replace(/-pooler$/, '')) throw new Error('Actual Neon endpoint differs from the verified target');
    const { rows: days } = await db.query<{ report_date: string; phase: string; stored_results: unknown[] | null }>(
      'SELECT report_date::text, phase, stored_results FROM bracket_rehearsal_days WHERE season_key=$1 ORDER BY report_date DESC LIMIT 2', [season]);
    const prev = addDays(day, -1);
    if (days[0]?.report_date !== day || days[1]?.report_date !== prev || days[1].phase !== 'awaiting_review' || !Array.isArray(days[1].stored_results))
      throw new Error('Only the latest day can be redone, and the previous day must be reviewed with saved results');
    const cutoff = addDays(day, 1) + 'T11:00:00Z';
    await db.query('BEGIN');
    // The published rows are frozen; Pete ordered this redo (Nov 23 2026). Scoped to this transaction.
    await db.query("SELECT set_config('publication.unlock','on',true), set_config('publication.reason',$1,true)", ['Pete, Nov 23 2026: redo ' + day + ' in the isolated 2026 rehearsal with the minor-league lines']);
    const restored = await db.query(`UPDATE master_bracket m SET status=s.status, innings=CASE WHEN s.innings IS NULL OR jsonb_typeof(s.innings) <> 'array' THEN NULL ELSE ARRAY(SELECT x::smallint FROM jsonb_array_elements_text(s.innings) x) END, home_runs=s.home_runs, away_runs=s.away_runs,
        winner_hsid=s.winner_hsid, decided_by=s.decided_by, computed_at=s.computed_at::timestamptz, locked_at=s.locked_at::timestamptz, box=s.box
       FROM jsonb_to_recordset($2::jsonb) AS s(stage text, game_id integer, status text, innings jsonb, home_runs integer, away_runs integer,
            winner_hsid integer, decided_by text, computed_at text, locked_at text, box jsonb)
      WHERE m.season_key=$1 AND m.stage=s.stage AND m.game_id=s.game_id AND m.computed_at=$3::timestamptz`,
      [season, JSON.stringify(days[1].stored_results), cutoff]);
    const { rows: [left] } = await db.query('SELECT count(*)::int AS n FROM master_bracket WHERE season_key=$1 AND computed_at=$2::timestamptz', [season, cutoff]);
    if (left.n) throw new Error(left.n + ' results computed for ' + day + ' are not in the previous day snapshot');
    const removed: Record<string, number> = { master_bracket_restored: restored.rowCount ?? 0 };
    for (const [table, where] of [['daily_stat_lines', 'stats_date=$1'], ['daily_game_scores', 'stats_date=$1'], ['daily_game_stories', 'stats_date=$1'],
      ['edition_ready', "cadence='daily' AND period_start=$1"], ['bracket_rehearsal_editions', "cadence='daily' AND period_start=$1"]] as const) {
      removed[table] = (await db.query(`DELETE FROM public.${table} WHERE ${where}`, [day])).rowCount ?? 0;
    }
    if ((await db.query("SELECT to_regclass('public.bracket_rehearsal_edition_revisions') AS r")).rows[0].r)
      removed.bracket_rehearsal_edition_revisions = (await db.query("DELETE FROM bracket_rehearsal_edition_revisions WHERE cadence='daily' AND period_start=$1", [day])).rowCount ?? 0;
    removed.checkpoint = (await db.query('DELETE FROM bracket_rehearsal_days WHERE season_key=$1 AND report_date=$2', [season, day])).rowCount ?? 0;
    await db.query('COMMIT');
    console.log(JSON.stringify({ redo: day, back_to: prev, ...removed }));
  } catch (e) { await db.query('ROLLBACK').catch(() => {}); throw e; } finally { db.release(); await pool.end(); }
}
main().catch(e => { console.error(e); process.exit(1); });
