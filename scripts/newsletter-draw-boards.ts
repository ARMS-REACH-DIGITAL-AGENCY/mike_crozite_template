/**
 * Draws the Digest's region scoreboard once per school per day (Pete, Nov 24
 * 2026): the school's own game first, then its region's 7 top scores, in
 * Pete's design (the Nov 13 Gazette board, nl/gz3/55.png). Every fan of that
 * school gets the same picture; nothing is drawn per fan.
 *
 * Read-only: the finished daily_game_scores rows for the day, and
 * master_bracket for each school's seed and its series record before the game.
 *
 *   npx tsx scripts/newsletter-draw-boards.ts --date 2026-03-31 --season 2027 \
 *     --out <dir> [--hsid 5004 ...] [--connection-file <json with DATABASE_URL>]
 *
 * Writes <out>/<date>/<hsid>.png (1200px wide).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { Pool } from 'pg';
import { nearbyGames, regionBoardHtml, regionTopGames, type BoardGame, type BoardSide } from '../src/lib/newsletter/regionBoard';

type Row = Record<string, any>;
const argv = process.argv.slice(2);
const arg = (name: string) => { const i = argv.indexOf('--' + name); return i < 0 ? undefined : argv[i + 1]; };
const args = (name: string) => argv.flatMap((v, i) => (v === '--' + name ? [argv[i + 1]] : []));

async function main() {
  const date = arg('date'), season = arg('season') || '2027', out = arg('out');
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !out) throw new Error('--date YYYY-MM-DD and --out are required');
  const url = arg('connection-file') ? JSON.parse(readFileSync(arg('connection-file')!, 'utf8')).DATABASE_URL : process.env.DATABASE_URL;
  if (!url) throw new Error('No database connection (DATABASE_URL or --connection-file)');
  const pool = new Pool({ connectionString: url, max: 2 });
  try {
    const scores = (await pool.query('SELECT * FROM public.daily_game_scores WHERE stats_date=$1 AND season_key=$2 ORDER BY region, game_id', [date, season])).rows as Row[];
    if (!scores.length) throw new Error('No finished game scores for ' + date);
    const bracket = (await pool.query('SELECT stage, region, round, series_no, game_no, game_id, week, home_hsid, away_hsid, home_seed, away_seed, winner_hsid FROM public.master_bracket WHERE season_key=$1', [season])).rows as Row[];
    const byGame = new Map(bracket.map(r => [[r.week, r.region, r.game_id].join('/'), r]));
    const seedOf = new Map<number, number>();
    for (const r of bracket) {
      if (r.home_seed != null) seedOf.set(Number(r.home_hsid), Number(r.home_seed));
      if (r.away_seed != null) seedOf.set(Number(r.away_hsid), Number(r.away_seed));
    }
    // Each team's series record before this game: its series' earlier games that have a winner.
    const series = (game: Row, hsid: number): string => {
      const me = byGame.get([game.week, game.region, game.game_id].join('/'));
      if (!me || me.stage !== 'bracket') return '';
      const earlier = bracket.filter(r => r.stage === me.stage && r.region === me.region && r.round === me.round
        && r.series_no === me.series_no && Number(r.week) < Number(me.week) && r.winner_hsid != null);
      const w = earlier.filter(r => Number(r.winner_hsid) === hsid).length;
      return `${w}-${earlier.length - w}`;
    };
    const side = (game: Row, which: 'home' | 'away'): BoardSide => {
      const hsid = Number(game[which + '_hsid']);
      return { seed: seedOf.get(hsid) ?? null, name: String(game[which + '_label'] ?? ''), series: series(game, hsid),
        innings: (game[which + '_innings'] || []).map(String), runs: game[which + '_runs'] ?? '' };
    };
    const fontCss = `@font-face{font-family:Oswald;font-weight:200 700;src:url(data:font/woff2;base64,${readFileSync(path.join(process.cwd(), 'public/fonts/oswald-latin.woff2')).toString('base64')}) format('woff2')}`;
    const medallion = 'data:image/png;base64,' + readFileSync(path.join(process.cwd(), 'public/img/splash-sponsors/brands/asb-medallion.png')).toString('base64');
    const nearbyOf = new Map<number, number[]>();
    for (const r of (await pool.query('SELECT home_hsid, neighbor_hsid FROM public.school_nearest_schools WHERE season_key=$1 ORDER BY home_hsid, rank', [season])
      .catch((err: { code?: string }) => { if (err?.code === '42P01') return { rows: [] as Row[] }; throw err; })).rows as Row[]) {
      (nearbyOf.get(Number(r.home_hsid)) || nearbyOf.set(Number(r.home_hsid), []).get(Number(r.home_hsid))!).push(Number(r.neighbor_hsid));
    }
    const wanted = args('hsid').map(Number);
    const schools = wanted.length ? wanted : [...new Set(scores.flatMap(g => [Number(g.home_hsid), Number(g.away_hsid)]))];
    mkdirSync(path.join(out, date), { recursive: true });
    // Playwright's Chromium draws the page (installed globally on the runner, not a site dependency).
    const { chromium } = createRequire(path.join(process.cwd(), 'package.json'))('playwright');
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1200, height: 2000 }, deviceScaleFactor: 1 });
    try {
      for (const hsid of schools) {
        const home = scores.find(g => Number(g.home_hsid) === hsid || Number(g.away_hsid) === hsid);
        if (!home) throw new Error('School ' + hsid + ' has no game on ' + date);
        // The home game, then the 7 closest schools' games (Pete, Nov 25 2026); the
        // region's top scores until the season has its closest-schools list.
        const near = nearbyOf.get(hsid) || [];
        const games: BoardGame[] = [home, ...(near.length ? nearbyGames(scores, home, near) : regionTopGames(scores, home, Number(home.region)))]
          .map(g => ({ away: side(g, 'away'), home: side(g, 'home'), framed: g === home }));
        await page.setContent(regionBoardHtml({ label: 'Region ' + home.region, games, medallion, fontCss }));
        await page.evaluate(() => document.fonts.ready);
        const file = path.join(out, date, hsid + '.png');
        writeFileSync(file, await page.locator('#board').screenshot({ omitBackground: true }));
        console.log(file);
      }
    } finally { await browser.close(); }
  } finally { await pool.end(); }
}

main().catch(err => { console.error(err); process.exit(1); });
