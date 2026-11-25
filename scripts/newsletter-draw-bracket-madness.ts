/**
 * Draws the Gazette's Bracket Madness boards for a week (Pete, Nov 25 2026):
 * four Wrigley-style boards, two regions each (1-2, 3-4, 5-6, 7-8), the ASB
 * medallion at the top centre like the clock. Each region shows up to 8 of the
 * week's final bracket games: upsets first (the higher seed number won), then
 * the best seeds (bracketMadnessGames in src/lib/newsletter/regionBoard.ts).
 *
 * The four shared boards are drawn once a week. A school's own pair of regions
 * is also drawn once per school, with its game first and between the red rules
 * ("the fan's home school is the one that's between the red"): every fan of a
 * school gets the same picture.
 *
 * Read-only: master_bracket (stage 'bracket', the week's final games, seeds,
 * winners and series) and daily_game_scores (innings and labels for the Sunday).
 *
 *   npx tsx scripts/newsletter-draw-bracket-madness.ts --date 2026-04-05 --season 2027 \
 *     --out <dir> [--hsid 5004 ...] [--connection-file <json with DATABASE_URL>]
 *
 * Writes <out>/<date>/pair-1-2.png ... pair-7-8.png and <out>/<date>/<hsid>.png.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { Pool } from 'pg';
import { bracketMadnessGames, doubleRegionBoardHtml, type BoardGame, type BoardSide } from '../src/lib/newsletter/regionBoard';

type Row = Record<string, any>;
const argv = process.argv.slice(2);
const arg = (name: string) => { const i = argv.indexOf('--' + name); return i < 0 ? undefined : argv[i + 1]; };
const args = (name: string) => argv.flatMap((v, i) => (v === '--' + name ? [argv[i + 1]] : []));
export const PAIRS = [[1, 2], [3, 4], [5, 6], [7, 8]] as const;

async function main() {
  const date = arg('date'), season = arg('season') || '2027', out = arg('out');
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !out) throw new Error('--date YYYY-MM-DD (the week\'s Sunday) and --out are required');
  const url = arg('connection-file') ? JSON.parse(readFileSync(arg('connection-file')!, 'utf8')).DATABASE_URL : process.env.DATABASE_URL;
  if (!url) throw new Error('No database connection (DATABASE_URL or --connection-file)');
  const pool = new Pool({ connectionString: url, max: 2 });
  let bracket: Row[], week: Row[], scores: Map<string, Row>;
  try {
    bracket = (await pool.query('SELECT stage, region, round, series_no, game_no, game_id, week, home_hsid, away_hsid, home_seed, away_seed, winner_hsid, game_end_date FROM public.master_bracket WHERE season_key=$1', [season])).rows;
    week = bracket.filter(r => r.stage === 'bracket' && String(new Date(r.game_end_date).toISOString()).slice(0, 10) === date);
    if (!week.length) throw new Error('No bracket games end on ' + date);
    const rows = (await pool.query('SELECT * FROM public.daily_game_scores WHERE stats_date=$1 AND season_key=$2', [date, season])).rows as Row[];
    scores = new Map(rows.map(r => [`${r.region}/${r.game_id}`, r]));
  } finally { await pool.end(); }
  const missing = week.filter(r => !scores.has(`${r.region}/${r.game_id}`));
  if (missing.length) throw new Error(`${missing.length} bracket games have no final score on ${date}`);
  // Each team's series record before this game: its series' earlier games that have a winner.
  const series = (g: Row, hsid: number) => {
    const earlier = bracket.filter(r => r.stage === 'bracket' && r.region === g.region && r.round === g.round && r.series_no === g.series_no && Number(r.week) < Number(g.week) && r.winner_hsid != null);
    const w = earlier.filter(r => Number(r.winner_hsid) === hsid).length;
    return `${w}-${earlier.length - w}`;
  };
  const side = (g: Row, which: 'home' | 'away'): BoardSide => {
    const s = scores.get(`${g.region}/${g.game_id}`)!;
    const hsid = Number(g[which + '_hsid']);
    return { seed: g[which + '_seed'] ?? null, name: String(s[which + '_label'] ?? ''), series: series(g, hsid),
      innings: (s[which + '_innings'] || []).map(String), runs: s[which + '_runs'] ?? '' };
  };
  const region = (n: number, home: number | null) => ({ label: 'Region ' + n,
    games: bracketMadnessGames(week.filter(r => Number(r.region) === n), home).map((g): BoardGame => ({ away: side(g, 'away'), home: side(g, 'home'),
      framed: home != null && (Number(g.home_hsid) === home || Number(g.away_hsid) === home) })) });
  const fontCss = `@font-face{font-family:Oswald;font-weight:200 700;src:url(data:font/woff2;base64,${readFileSync(path.join(process.cwd(), 'public/fonts/oswald-latin.woff2')).toString('base64')}) format('woff2')}`;
  const medallion = 'data:image/png;base64,' + readFileSync(path.join(process.cwd(), 'public/img/splash-sponsors/brands/asb-medallion.png')).toString('base64');
  mkdirSync(path.join(out, date), { recursive: true });
  const { chromium } = createRequire(path.join(process.cwd(), 'package.json'))('playwright');
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 1400 }, deviceScaleFactor: 1 });
  const draw = async (file: string, home: number | null, pair: readonly [number, number]) => {
    await page.setContent(doubleRegionBoardHtml({ left: region(pair[0], home), right: region(pair[1], home), medallion, fontCss }));
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(() => { for (const e of Array.from(document.querySelectorAll<HTMLElement>('.nm'))) { let s = 22; e.style.fontSize = s + 'px'; while (e.scrollWidth > 212 && s > 13) { s -= 1; e.style.fontSize = s + 'px'; } } });
    writeFileSync(file, await page.locator('#board').screenshot({ omitBackground: true }));
    console.log(file);
  };
  try {
    for (const pair of PAIRS) await draw(path.join(out, date, `pair-${pair[0]}-${pair[1]}.png`), null, pair);
    for (const hsid of args('hsid').map(Number)) {
      const own = bracket.find(r => Number(r.home_hsid) === hsid || Number(r.away_hsid) === hsid);
      if (!own) throw new Error('School ' + hsid + ' is not in the ' + season + ' bracket');
      const pair = PAIRS.find(p => (p as readonly number[]).includes(Number(own.region)))!;
      await draw(path.join(out, date, `${hsid}.png`), hsid, pair);
    }
  } finally { await browser.close(); }
}

main().catch(err => { console.error(err); process.exit(1); });
