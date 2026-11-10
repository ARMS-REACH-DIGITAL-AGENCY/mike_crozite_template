// Builds and stores the Nov 9 Daily and Week 5 Weekly for one test bracket, in
// that bracket's own test database only, then renders its two emails.
// Production is opened READ ONLY (default_transaction_read_only) and only
// read: the real stat lines the test sites already score from.
import pg from 'pg';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
const N = Number(process.argv[2]);
const TEST = process.env[`T${N}`], PROD = process.env.PROD;
const DAY = '2026-11-09', WEEK = 5, MON = '2026-11-02', SUN = '2026-11-08';
const dir = `/tmp/nl/${N}`; mkdirSync(dir, { recursive: true });
const test = new pg.Client({ connectionString: TEST, ssl: { rejectUnauthorized: false } });
const prod = new pg.Client({ connectionString: PROD, ssl: { rejectUnauthorized: false }, options: '-c default_transaction_read_only=on' });
await test.connect(); await prod.connect();
const ro = (await prod.query('SHOW default_transaction_read_only')).rows[0].default_transaction_read_only;
if (ro !== 'on') throw new Error('production is not read only');
const log = (...a) => console.log(`[${N}]`, ...a);

const ACTIVE = ['ACTIVE','INJURED 7-DAY','INJURED 10-DAY','INJURED 15-DAY','INJURED 30-DAY','INJURED 60-DAY','INJURED - FULL SEASON','ADMINISTRATIVE LEAVE','BEREAVEMENT LIST','DEVELOPMENT LIST','INELIGIBLE LIST','MILITARY LEAVE','NOT YET REPORTED','OPTIONED','PATERNITY LIST','REASSIGNED TO MINORS','REHAB ASSIGNMENT','RESERVE LIST (MINORS)','RESTRICTED LIST','SUSPENDED','TEMPORARILY INACTIVE LIST','FREE AGENT','RED SHIRT','REDSHIRT-MEDICAL'];

// The bracket and its field (this test database).
const season = (await test.query(`SELECT season_key, is_test, opening_day::text, last_day::text, weeks, regions, schools_per_region FROM fantasy_seasons WHERE season_key='test-2026'`)).rows[0];
const rows = (await test.query(`SELECT season_key, stage, region, round, round_name, series_no, game_no, game_id, week, game_start_date::text, game_end_date::text,
  home_hsid, away_hsid, home_seed, away_seed, home_school_name, away_school_name, status, innings, winner_hsid, decided_by, decided_note, locked_at
  FROM master_bracket WHERE season_key='test-2026' AND region=$1 ORDER BY stage, round, series_no, game_no`, [N])).rows;
const rulings = (await test.query(`SELECT region, week, home_hsid, away_hsid, winner_hsid FROM commissioner_rulings WHERE season_key='test-2026' AND region=$1`, [N])).rows;
const field = [...new Set(rows.filter((r) => r.stage === 'bracket').flatMap((r) => [r.home_hsid, r.away_hsid]).filter((h) => h != null).map(String))];
log('field', field.length, 'rows', rows.length, 'rulings', rulings.length);

// 1. The real stat lines Oct 27 - Nov 9 of this field's alumni, copied from
//    production into this test database (the ones its site already scores).
const pids = (await prod.query(`SELECT DISTINCT playerid::text pid FROM flip_card_front_stage WHERE hsid::text = ANY($1)`, [field])).rows.map((r) => r.pid);
const sl = (await prod.query(`SELECT * FROM stat_lines WHERE playerid = ANY($1) AND game_date BETWEEN '2026-10-27' AND '2026-11-09'`, [pids])).rows;
const gl = (await prod.query(`SELECT * FROM player_game_logs WHERE id::text = ANY($1)`, [sl.filter((s) => s.source === 'mlb_api').map((s) => String(s.source_line_id))])).rows;
await test.query('BEGIN');
const g1 = await test.query(`INSERT INTO player_game_logs SELECT * FROM json_populate_recordset(null::player_game_logs, $1) ON CONFLICT DO NOTHING`, [JSON.stringify(gl)]);
const s1 = await test.query(`INSERT INTO stat_lines SELECT * FROM json_populate_recordset(null::stat_lines, $1) ON CONFLICT DO NOTHING`, [JSON.stringify(sl)]);
await test.query('COMMIT');
log('copied game logs', gl.length, 'new', g1.rowCount, '| stat lines', sl.length, 'new', s1.rowCount);

// 2. lines.json, as on Oct 27 (each line in by its cutoff).
const L = await test.query(`WITH card AS (
  SELECT f.playerid::text AS pid, f.hsid::text AS hsid,
         coalesce(nullif(btrim(f.display_name), ''), btrim(coalesce(f.first_name, '') || ' ' || coalesce(f.last_name, ''))) AS nm
    FROM public.flip_card_front_stage f
   WHERE f.hsid::text = ANY($1) AND upper(btrim(coalesce(f.status_label, ''))) = ANY($2)
     AND NOT (upper(btrim(coalesce(f.level_label, ''))) IN ('HIGH SCHOOL', 'HS') OR upper(btrim(coalesce(f.display_level_label, ''))) IN ('HIGH SCHOOL', 'HS'))),
src AS (
  SELECT DISTINCT ON (s.playerid, s.source_game_id, s.stat_type) s.*, g.raw_payload->'sport'->>'abbreviation' AS sport
    FROM public.stat_lines s
    JOIN public.player_game_logs g ON s.source = 'mlb_api' AND g.id::text = s.source_line_id
   WHERE s.playerid IN (SELECT pid FROM card)
     AND s.removed_at IS NULL AND s.hold_reason IS NULL AND s.is_final
     AND ((s.game_date BETWEEN DATE '${MON}' AND DATE '${SUN}' AND g.created_at <= TIMESTAMPTZ '2026-11-09 11:00+00')
       OR (s.game_date = DATE '${DAY}' AND g.created_at <= TIMESTAMPTZ '2026-11-10 11:00+00'))
   ORDER BY s.playerid, s.source_game_id, s.stat_type, g.updated_at DESC)
SELECT coalesce(json_agg(json_build_array(c.hsid, s.playerid, c.nm, s.game_date::text, CASE WHEN s.stat_type = 'batting' THEN 'b' ELSE 'p' END,
  CASE WHEN s.stat_type = 'batting' THEN json_build_array(coalesce(bat_pa,0),coalesce(bat_ab,0),coalesce(bat_h,0),coalesce(bat_2b,0),coalesce(bat_3b,0),coalesce(bat_hr,0),coalesce(bat_bb,0),coalesce(bat_hbp,0),coalesce(bat_sf,0))
       ELSE json_build_array(coalesce(pit_outs,0),coalesce(pit_hr,0),coalesce(pit_bb,0),coalesce(pit_hbp,0),coalesce(pit_so,0),coalesce(pit_h,0),coalesce(pit_r,0),coalesce(pit_er,0)) END,
  s.source_game_id::text, s.team_name, coalesce(s.sport, ''), s.level, s.opponent_name,
  CASE WHEN s.stat_type = 'batting' THEN json_build_array(coalesce(bat_r,0),coalesce(bat_rbi,0),coalesce(bat_so,0),coalesce(bat_sb,0))
       ELSE json_build_array(coalesce(pit_w,0),coalesce(pit_l,0),coalesce(pit_sv,0),coalesce(pit_hld,0)) END,
  s.is_final) ORDER BY c.hsid, s.playerid, s.game_date, s.source_game_id, s.stat_type), '[]') AS t
  FROM src s JOIN card c ON c.pid = s.playerid`, [field, ACTIVE]);
const lines = L.rows[0].t;
log('lines', lines.length, 'daily', lines.filter((l) => l[3] === DAY).length);
for (const [f, v] of [['season.json', season], ['rows.json', rows], ['rulings.json', rulings], ['lines.json', lines]]) writeFileSync(`${dir}/${f}`, JSON.stringify(v));

// 3. Build the two editions with the site's own scoring.
const out = execFileSync('node', ['/tmp/nlb/publish.mjs', '--dir', dir, '--daily', DAY, '--week', String(WEEK)], { encoding: 'utf8' });
log(out.trim().split('\n').slice(-6).join(' | '));
if (process.argv[3] === 'dry') { await test.end(); await prod.end(); process.exit(0); }

// 4. Store them in this test database: each edition one transaction.
for (const f of ['daily.json', 'weekly.json']) {
  const stmts = JSON.parse(readFileSync(`${dir}/${f}`, 'utf8'));
  await test.query('BEGIN');
  try { for (const s of stmts) await test.query(s); await test.query('COMMIT'); log('stored', f, stmts.length, 'statements'); }
  catch (e) { await test.query('ROLLBACK'); throw new Error(`${f}: ${e.message}`); }
}
await test.end(); await prod.end();

// 5. The two emails for this bracket's test fan.
const email = `test${N}@yatstats.com`;
const p = execFileSync('node', ['/tmp/nlb/preview.mjs', '--daily', DAY, '--weekly', MON, '--out', `/tmp/out/${N}`, '--emails', email, '--seasons', `${email}=${N}`],
  { encoding: 'utf8', env: { ...process.env, DATABASE_URL: TEST } });
log(p.trim().split('\n').slice(-4).join(' | '));
