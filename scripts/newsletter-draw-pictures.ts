/**
 * Draws the newsletters' pictures locally, with the same pages the live 4 a.m. job
 * draws (src/lib/newsletter/newsletterImages.ts): for a test replay, or to look at
 * them. The live job stores its own in the asset bucket; this writes files.
 *
 *   npx tsx scripts/newsletter-draw-pictures.ts --season 2027 --hsid 5004 --out <dir> \
 *     [--daily 2026-04-05] [--weekly 2026-03-30] [--connection-file <json with DATABASE_URL>]
 *
 * --daily <stats day>: each school's Digest board. --weekly <Monday>: each school's
 * banner, the week's team logos, Bracket Madness and the Total Runs Leaderboards.
 * Writes <out>/<folder>/<file>, the folders being the live ones (digest/,
 * gazette/banner/, gazette/logo/, gazette/bracket/, gazette/leaders/).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { Pool } from 'pg';
import {
  NEWSLETTER_IMAGE_DIRS, bracketMadnessPictures, dailyBoardPictures, gazetteBannerPicture, gazetteTeamIds, imageDataUrl,
  loadAssets, runsLeaderboardPictures, schoolLogoUrl, teamArt, teamLogoPicture, type Picture,
} from '../src/lib/newsletter/newsletterImages';

const argv = process.argv.slice(2);
const arg = (name: string) => { const i = argv.indexOf('--' + name); return i < 0 ? undefined : argv[i + 1]; };
const args = (name: string) => argv.flatMap((v, i) => (v === '--' + name ? [argv[i + 1]] : []));
const day = (v: string | undefined, name: string) => { if (v != null && !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new Error(`--${name} YYYY-MM-DD`); return v; };

async function main() {
  const season = arg('season') || '2027', out = arg('out');
  const daily = day(arg('daily'), 'daily'), weekly = day(arg('weekly'), 'weekly');
  const hsids = args('hsid').map(Number);
  if (!out || (!daily && !weekly) || !hsids.length) throw new Error('--out, --hsid and --daily and/or --weekly are required');
  const url = arg('connection-file') ? JSON.parse(readFileSync(arg('connection-file')!, 'utf8')).DATABASE_URL : process.env.DATABASE_URL;
  if (!url) throw new Error('No database connection (DATABASE_URL or --connection-file)');
  const assets = await loadAssets(async (p) => readFileSync(path.join(process.cwd(), 'public', p)));
  const pool = new Pool({ connectionString: url, max: 2 });
  const pictures: Picture[] = [];
  try {
    if (daily) {
      const boards = await dailyBoardPictures(pool, { date: daily, season, hsids, assets });
      pictures.push(...boards.pictures);
      if (boards.skipped.length) console.log(JSON.stringify({ noGameOn: daily, schools: boards.skipped }));
    }
    if (weekly) {
      const sunday = new Date(Date.parse(weekly + 'T12:00:00Z') + 6 * 86400000).toISOString().slice(0, 10);
      for (const hsid of hsids) pictures.push(gazetteBannerPicture(hsid, await imageDataUrl(schoolLogoUrl(hsid)), assets));
      const teams = await gazetteTeamIds(pool, { periodStart: weekly, season, hsids });
      const noArt: string[] = [];
      for (const teamid of teams) { const art = await teamArt(teamid); if (!art) noArt.push(teamid); pictures.push(teamLogoPicture(teamid, art)); }
      if (noArt.length) console.log(JSON.stringify({ noPublishedLogo: noArt }));
      pictures.push(...await bracketMadnessPictures(pool, { date: sunday, season, hsids, assets }));
      pictures.push(...await runsLeaderboardPictures(pool, { date: sunday, season, hsids, assets }));
    }
  } finally { await pool.end(); }
  // Playwright's Chromium draws the pages here (the live job uses the server's own).
  const { chromium } = createRequire(path.join(process.cwd(), 'package.json'))('playwright');
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ deviceScaleFactor: 1 });
    for (const p of pictures) {
      await page.setViewportSize({ width: p.width, height: p.height });
      await page.setContent(p.html);
      await page.waitForFunction(() => (window as unknown as { __ready?: boolean }).__ready === true, null, { timeout: 15000 });
      const file = path.join(out, NEWSLETTER_IMAGE_DIRS[p.kind], p.file);
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, await page.locator(p.selector).screenshot({ omitBackground: p.transparent }));
    }
  } finally { await browser.close(); }
  console.log(JSON.stringify({ drawn: pictures.length, out }));
}

main().catch(err => { console.error(err); process.exit(1); });
