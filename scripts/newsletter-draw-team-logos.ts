/**
 * Draws the Gazette's team logos once per week (Pete, Nov 25 2026: the Week 4
 * TEST 2 proof puts each player's team logo before his name). The site keeps
 * its logos as WebP, which not every email client shows, so each team in the
 * week's tables is saved once as a small PNG (32 x 32, shown at 16).
 *
 * The art is the site's own: the same team-ID lookup as /api/team-logo
 * (src/lib/teamLogo.ts, exact team ID first). A team with no published logo
 * gets a blank square, like the proof's empty space: nothing is invented.
 *
 *   npx tsx scripts/newsletter-draw-team-logos.ts --date 2026-03-30 --season 2027 \
 *     --out <dir> [--connection-file <json with DATABASE_URL>]
 *
 * Reads weekly_player_lines (every school's alumni) and weekly_player_totals
 * (favorites) for that week. Writes <out>/<teamid>.png.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { Pool } from 'pg';
import { normalizeTeamLogoId, teamLogoAssetUrls } from '../src/lib/teamLogo';

const argv = process.argv.slice(2);
const arg = (name: string) => { const i = argv.indexOf('--' + name); return i < 0 ? undefined : argv[i + 1]; };
const SIZE = 32;

async function art(teamid: string): Promise<string | null> {
  for (const url of teamLogoAssetUrls(teamid)) {
    const res = await fetch(url).catch(() => null);
    const type = res?.headers.get('content-type') || '';
    if (res?.ok && type.startsWith('image/')) return `data:${type};base64,` + Buffer.from(await res.arrayBuffer()).toString('base64');
  }
  return null;
}

async function main() {
  const date = arg('date'), season = arg('season') || '2027', out = arg('out');
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !out) throw new Error('--date YYYY-MM-DD (the week\'s Monday) and --out are required');
  const url = arg('connection-file') ? JSON.parse(readFileSync(arg('connection-file')!, 'utf8')).DATABASE_URL : process.env.DATABASE_URL;
  if (!url) throw new Error('No database connection (DATABASE_URL or --connection-file)');
  const pool = new Pool({ connectionString: url, max: 2 });
  let ids: string[];
  try {
    const rows = (await pool.query(
      `SELECT DISTINCT stats->>'teamid' AS teamid FROM public.weekly_player_lines WHERE period_start=$1 AND season_key=$2
       UNION SELECT DISTINCT teamid::text FROM public.weekly_player_totals WHERE period_start=$1 AND season_key=$2`, [date, season])).rows;
    ids = [...new Set(rows.map(r => normalizeTeamLogoId(r.teamid)).filter((v): v is string => !!v))].sort((a, b) => Number(a) - Number(b));
  } finally { await pool.end(); }
  mkdirSync(out, { recursive: true });
  const { chromium } = createRequire(path.join(process.cwd(), 'package.json'))('playwright');
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: SIZE, height: SIZE }, deviceScaleFactor: 1 });
  const blank: string[] = [];
  try {
    for (const id of ids) {
      const src = await art(id);
      if (!src) blank.push(id);
      await page.setContent(`<!doctype html><html><body style="margin:0;background:transparent"><div id="l" style="width:${SIZE}px;height:${SIZE}px;display:flex;align-items:center;justify-content:center">`
        + (src ? `<img src="${src}" style="max-width:${SIZE}px;max-height:${SIZE}px">` : '') + `</div></body></html>`);
      await page.waitForFunction(() => Array.from(document.images).every(i => i.complete));
      writeFileSync(path.join(out, id + '.png'), await page.locator('#l').screenshot({ omitBackground: true }));
    }
  } finally { await browser.close(); }
  console.log(JSON.stringify({ week: date, teams: ids.length, noPublishedLogo: blank }));
}

main().catch(err => { console.error(err); process.exit(1); });
