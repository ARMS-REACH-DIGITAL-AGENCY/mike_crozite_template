/**
 * The live job's newsletter pictures (Pete, Nov 25 2026): drawn on the server with
 * its Chromium (the same @sparticuz/chromium the career timeline snapshots use)
 * and stored in the site's asset bucket under newsletter/, where every edition
 * reads them (newsletterImageBase). Only the recipients' schools are drawn; a
 * team logo already stored is not drawn again. A picture that fails is listed
 * and the editions still go out.
 */
import path from 'path';
import { HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { S3_BUCKET, S3_REGION } from '../storyAssets';
import {
  ASSET_PATHS, NEWSLETTER_IMAGE_DIRS, bracketMadnessPictures, dailyBoardPictures, gazetteBannerPicture, gazetteTeamIds, imageDataUrl,
  loadAssets, runsLeaderboardPictures, schoolLogoUrl, teamArt, teamLogoPicture, type ImageDatabase, type Picture,
} from './newsletterImages';

let s3: S3Client | null = null;
function client() {
  if (s3) return s3;
  const accessKeyId = process.env.YATSTATS_AWS_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.YATSTATS_AWS_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY;
  if (!accessKeyId || !secretAccessKey) throw new Error('S3 keys are not set');
  s3 = new S3Client({ region: S3_REGION, credentials: { accessKeyId, secretAccessKey } });
  return s3;
}
const keyOf = (p: Pick<Picture, 'kind' | 'file'>) => `newsletter/${NEWSLETTER_IMAGE_DIRS[p.kind]}/${p.file}`;
async function stored(key: string) {
  try { await client().send(new HeadObjectCommand({ Bucket: S3_BUCKET, Key: key })); return true; } catch { return false; }
}
// A day's or week's pictures can be redrawn (a late stat correction), so they revalidate.
async function store(key: string, png: Buffer) {
  await client().send(new PutObjectCommand({ Bucket: S3_BUCKET, Key: key, Body: png, ContentType: 'image/png', CacheControl: 'public, max-age=300, must-revalidate' }));
}

export type PictureRun = { drawn: string[]; failed: { key: string; error: string }[]; skipped: string[] };

/**
 * Draws and stores the pictures for the editions being published.
 *   daily  (date = the stats day):  each school's Digest board for that day
 *   weekly (date = the week's Monday): each school's banner, the week's team logos,
 *          Bracket Madness and the Total Runs Leaderboards for the Sunday
 */
export async function publishNewsletterPictures(db: ImageDatabase, o: {
  season: string; hsids: number[]; periods: { cadence: 'daily' | 'weekly'; date: string }[];
  /** The site's address, for its own art (fonts, medallion, banner). */
  base: string;
}): Promise<PictureRun> {
  const run: PictureRun = { drawn: [], failed: [], skipped: [] };
  const hsids = [...new Set(o.hsids.filter(h => Number.isInteger(h) && h > 0))];
  if (!hsids.length || !o.periods.length) return run;
  const assets = await siteAssets(o.base);
  const pictures: Picture[] = [];
  for (const period of o.periods) {
    if (period.cadence === 'daily') {
      const boards = await dailyBoardPictures(db, { date: period.date, season: o.season, hsids, assets });
      pictures.push(...boards.pictures);
      run.skipped.push(...boards.skipped.map(h => `board ${period.date}/${h}: no game that day`));
    } else {
      const sunday = new Date(Date.parse(period.date + 'T12:00:00Z') + 6 * 86400000).toISOString().slice(0, 10);
      for (const hsid of hsids) {
        const key = keyOf({ kind: 'banner', file: `${hsid}.png` });
        if (!(await stored(key))) pictures.push(gazetteBannerPicture(hsid, await imageDataUrl(schoolLogoUrl(hsid)), assets));
      }
      for (const teamid of await gazetteTeamIds(db, { periodStart: period.date, season: o.season, hsids })) {
        if (!(await stored(keyOf({ kind: 'logo', file: `${teamid}.png` })))) pictures.push(teamLogoPicture(teamid, await teamArt(teamid)));
      }
      pictures.push(...await bracketMadnessPictures(db, { date: sunday, season: o.season, hsids, assets }));
      pictures.push(...await runsLeaderboardPictures(db, { date: sunday, season: o.season, hsids, assets }));
    }
  }
  await drawAndStore(pictures, run);
  return run;
}

/** The site's own art (fonts, medallion, banner), read from the site itself. */
function siteAssets(base: string) {
  return loadAssets(async (p) => {
    const res = await fetch(new URL('/' + p, base));
    if (!res.ok) throw new Error(`Newsletter art ${p} is not served (${res.status})`);
    return Buffer.from(await res.arrayBuffer());
  });
}

/** Draws each picture with the server's Chromium and stores it; a failure is listed, the rest go on. */
async function drawAndStore(pictures: Picture[], run: PictureRun) {
  if (!pictures.length) return;
  const [{ default: chromium }, { default: puppeteer }] = await Promise.all([import('@sparticuz/chromium'), import('puppeteer-core')]);
  const browser = await puppeteer.launch({ args: chromium.args, executablePath: await chromium.executablePath(path.join(process.cwd(), 'chromium-bin')), headless: true });
  try {
    const page = await browser.newPage();
    for (const p of pictures) {
      const key = keyOf(p);
      try {
        await page.setViewport({ width: p.width, height: p.height, deviceScaleFactor: 1 });
        await page.setContent(p.html, { waitUntil: 'load' });
        await page.waitForFunction('window.__ready === true', { timeout: 15000 });
        const el = await page.$(p.selector);
        if (!el) throw new Error('nothing to capture');
        await store(key, Buffer.from(await el.screenshot({ type: 'png', omitBackground: p.transparent })));
        run.drawn.push(key);
      } catch (error) {
        run.failed.push({ key, error: error instanceof Error ? error.message : String(error) });
      }
    }
  } finally { await browser.close(); }
}

/**
 * Every fan's home school has its Gazette banner ready ahead of time (Pete, Nov 25
 * 2026: prove the pictures are stored before the season): draws the banners not
 * stored yet, or all of them with redraw (a school changed its logo).
 */
export async function publishSchoolBanners(o: { hsids: number[]; base: string; redraw?: boolean }): Promise<PictureRun & { already: number }> {
  const run: PictureRun & { already: number } = { drawn: [], failed: [], skipped: [], already: 0 };
  const hsids = [...new Set(o.hsids.filter(h => Number.isInteger(h) && h > 0))];
  if (!hsids.length) return run;
  const assets = await siteAssets(o.base);
  const pictures: Picture[] = [];
  for (const hsid of hsids) {
    if (!o.redraw && await stored(keyOf({ kind: 'banner', file: `${hsid}.png` }))) { run.already++; continue; }
    const logo = await imageDataUrl(schoolLogoUrl(hsid));
    if (!logo) run.skipped.push(`banner ${hsid}: no school logo in the store (schools/${hsid}.png); drawn without one`);
    pictures.push(gazetteBannerPicture(hsid, logo, assets));
  }
  await drawAndStore(pictures, run);
  return run;
}

export { ASSET_PATHS };
