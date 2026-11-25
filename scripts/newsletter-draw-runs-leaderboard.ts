/**
 * Draws the Gazette's Total Runs Leaderboards for a week (the Week 4 TEST 2
 * proof, Pete, Nov 2026): four boards, two regions each (1-2, 3-4, 5-6, 7-8),
 * each region's top 10 by season runs through that week. The four shared boards
 * are drawn once a week; a school's own pair is drawn once per school with its
 * row between the red rules (added under the top 10 when it is lower).
 *
 * Season runs count every final game through the week, bracket and runs-only
 * (stage 'total_runs'), in the site's order (most runs, run differential, wins,
 * seed): regionLeaders in src/lib/newsletter/regionBoard.ts.
 *
 * Read-only: master_bracket, and daily_game_scores for the Sunday's labels.
 *
 *   npx tsx scripts/newsletter-draw-runs-leaderboard.ts --date 2026-04-05 --season 2027 \
 *     --out <dir> [--hsid 5004 ...] [--connection-file <json with DATABASE_URL>]
 *
 * Writes <out>/<date>/pair-1-2.png ... pair-7-8.png and <out>/<date>/<hsid>.png.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { Pool } from 'pg';
import { regionLeaders, runsLeaderboardHtml, type RunStand } from '../src/lib/newsletter/regionBoard';

type Row = Record<string, any>;
const argv = process.argv.slice(2);
const arg = (name: string) => { const i = argv.indexOf('--' + name); return i < 0 ? undefined : argv[i + 1]; };
const args = (name: string) => argv.flatMap((v, i) => (v === '--' + name ? [argv[i + 1]] : []));
const PAIRS = [[1, 2], [3, 4], [5, 6], [7, 8]] as const;
// The proof's note (Pete, Nov 2026).
const NOTE = '* After Round 10 (Week 30), the team with the most runs in each of the 8 regions advances for the right to play the eventual 1,024-team bracket champion.';

async function main() {
  const date = arg('date'), season = arg('season') || '2027', out = arg('out');
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !out) throw new Error('--date YYYY-MM-DD (the week\'s Sunday) and --out are required');
  const url = arg('connection-file') ? JSON.parse(readFileSync(arg('connection-file')!, 'utf8')).DATABASE_URL : process.env.DATABASE_URL;
  if (!url) throw new Error('No database connection (DATABASE_URL or --connection-file)');
  const pool = new Pool({ connectionString: url, max: 2 });
  let games: Row[], labels: Map<number, string>;
  try {
    games = (await pool.query('SELECT stage, region, round, week, game_end_date, status, home_hsid, away_hsid, home_seed, away_seed, home_runs, away_runs, winner_hsid, home_school_name, away_school_name FROM public.master_bracket WHERE season_key=$1', [season])).rows;
    labels = new Map();
    for (const r of (await pool.query('SELECT home_hsid, away_hsid, home_label, away_label FROM public.daily_game_scores WHERE stats_date=$1 AND season_key=$2', [date, season])).rows) {
      labels.set(Number(r.home_hsid), String(r.home_label)); labels.set(Number(r.away_hsid), String(r.away_label));
    }
  } finally { await pool.end(); }
  const week = Math.max(...games.filter(g => g.stage === 'bracket' && new Date(g.game_end_date).toISOString().slice(0, 10) === date).map(g => Number(g.week)));
  if (!Number.isFinite(week)) throw new Error('No bracket week ends on ' + date);
  // Region and seed: each school's Round 1 line.
  const stands = new Map<number, RunStand & { name: string }>();
  for (const g of games.filter(g => g.stage === 'bracket' && Number(g.round) === 1)) for (const side of ['home', 'away'] as const) {
    const hsid = Number(g[side + '_hsid']);
    if (!stands.has(hsid)) stands.set(hsid, { hsid, region: Number(g.region), seed: Number(g[side + '_seed']), rf: 0, ra: 0, w: 0,
      name: labels.get(hsid) || String(g[side + '_school_name'] || '').replace(/\s*\(.*\)\s*$/, '') });
  }
  for (const g of games.filter(g => g.status === 'final' && Number(g.week) <= week)) {
    const h = stands.get(Number(g.home_hsid)), a = stands.get(Number(g.away_hsid));
    if (h) { h.rf += Number(g.home_runs) || 0; h.ra += Number(g.away_runs) || 0; if (Number(g.winner_hsid) === h.hsid) h.w++; }
    if (a) { a.rf += Number(g.away_runs) || 0; a.ra += Number(g.home_runs) || 0; if (Number(g.winner_hsid) === a.hsid) a.w++; }
  }
  const all = [...stands.values()];
  const side = (region: number, home: number | null) => {
    const r = regionLeaders(all, region, home);
    return { label: 'Region ' + region, summary: r.summary,
      rows: r.rows.map(s => ({ place: s.place, seed: s.seed, name: stands.get(s.hsid)!.name, runs: s.rf, framed: s.hsid === home })) };
  };
  const fontCss = `@font-face{font-family:Oswald;font-weight:200 700;src:url(data:font/woff2;base64,${readFileSync(path.join(process.cwd(), 'public/fonts/oswald-latin.woff2')).toString('base64')}) format('woff2')}`;
  const medallion = 'data:image/png;base64,' + readFileSync(path.join(process.cwd(), 'public/img/splash-sponsors/brands/asb-medallion.png')).toString('base64');
  mkdirSync(path.join(out, date), { recursive: true });
  const { chromium } = createRequire(path.join(process.cwd(), 'package.json'))('playwright');
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 1200 }, deviceScaleFactor: 1 });
  const draw = async (file: string, home: number | null, pair: readonly [number, number]) => {
    await page.setContent(runsLeaderboardHtml({ left: side(pair[0], home), right: side(pair[1], home), note: NOTE, medallion, fontCss }));
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(() => { for (const e of Array.from(document.querySelectorAll<HTMLElement>('.nm'))) { let s = 26; while (e.scrollWidth > 390 && s > 15) { s -= 1; e.style.fontSize = s + 'px'; } } });
    writeFileSync(file, await page.locator('#board').screenshot({ omitBackground: true }));
    console.log(file);
  };
  try {
    for (const pair of PAIRS) await draw(path.join(out, date, `pair-${pair[0]}-${pair[1]}.png`), null, pair);
    for (const hsid of args('hsid').map(Number)) {
      const me = stands.get(hsid);
      if (!me) throw new Error('School ' + hsid + ' is not in the ' + season + ' bracket');
      await draw(path.join(out, date, `${hsid}.png`), hsid, PAIRS.find(p => (p as readonly number[]).includes(me.region))!);
    }
  } finally { await browser.close(); }
  console.log(JSON.stringify({ throughWeek: week }));
}

main().catch(err => { console.error(err); process.exit(1); });
