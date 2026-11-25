/**
 * Draws the Gazette banner once per school (Pete, Nov 25 2026: the Week 4
 * TEST 2 proof is the approved Gazette). The art is the proof's banner with
 * Hamilton's H taken out (public/img/newsletter/gazette-banner-blank.jpg); each
 * school's own logo (schools/<hsid>.png in the asset store, the same logo its
 * page shows) goes where the H was. Every fan of a school gets the same picture.
 *
 *   npx tsx scripts/newsletter-draw-gazette-banner.ts --out <dir> --hsid 5004 [--hsid ...]
 *
 * Writes <out>/<hsid>.png (1200 x 279). A school with no logo in the store is
 * listed and skipped: nothing is invented for it.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const ASSETS = 'https://yatstats-assets.s3.us-west-2.amazonaws.com';
// Where the proof's H sat: centred at (970, 120), at most 230 x 170.
const BOX = { cx: 970, cy: 120, w: 230, h: 170 };

const argv = process.argv.slice(2);
const arg = (name: string) => { const i = argv.indexOf('--' + name); return i < 0 ? undefined : argv[i + 1]; };
const args = (name: string) => argv.flatMap((v, i) => (v === '--' + name ? [argv[i + 1]] : []));

function gazetteBannerHtml(art: string, logo: string | null): string {
  const img = logo
    ? `<img id="logo" src="${logo}" style="position:absolute;max-width:${BOX.w}px;max-height:${BOX.h}px;left:${BOX.cx}px;top:${BOX.cy}px;transform:translate(-50%,-50%)">`
    : '';
  return `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:0;background:#fff}</style></head>`
    + `<body><div id="banner" style="position:relative;width:1200px;height:279px;overflow:hidden">`
    + `<img src="${art}" width="1200" height="279" style="display:block">${img}</div></body></html>`;
}

async function main() {
  const out = arg('out');
  const schools = args('hsid').map(Number).filter(n => Number.isInteger(n) && n > 0);
  if (!out || !schools.length) throw new Error('--out and at least one --hsid are required');
  mkdirSync(out, { recursive: true });
  const art = 'data:image/jpeg;base64,' + readFileSync(path.join(process.cwd(), 'public/img/newsletter/gazette-banner-blank.jpg')).toString('base64');
  const { chromium } = createRequire(path.join(process.cwd(), 'package.json'))('playwright');
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 279 }, deviceScaleFactor: 1 });
  const missing: number[] = [];
  try {
    for (const hsid of schools) {
      const res = await fetch(`${ASSETS}/schools/${hsid}.png`);
      const type = res.headers.get('content-type') || '';
      if (!res.ok || !type.startsWith('image/')) { missing.push(hsid); continue; }
      const logo = `data:${type};base64,` + Buffer.from(await res.arrayBuffer()).toString('base64');
      await page.setContent(gazetteBannerHtml(art, logo));
      await page.waitForFunction(() => Array.from(document.images).every(i => i.complete));
      const file = path.join(out, hsid + '.png');
      writeFileSync(file, await page.locator('#banner').screenshot());
      console.log(file);
    }
  } finally { await browser.close(); }
  if (missing.length) console.log(JSON.stringify({ noLogoInStore: missing }));
}

main().catch(err => { console.error(err); process.exit(1); });
