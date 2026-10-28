// Pixel-exact Open Graph capture: browser-rendered shared PlayerCardFront.
// Do not recreate the card with a separate OG layout.
import sharp from 'sharp';
import path from 'path';

export async function captureFlipCard(input: { origin: string; hsid: string; playerId: string }): Promise<Buffer> {
  const [{ default: chromium }, { default: puppeteer }] = await Promise.all([
    import('@sparticuz/chromium'), import('puppeteer-core')
  ]);
  const browser = await puppeteer.launch({
    args: chromium.args,
    executablePath: await chromium.executablePath(path.join(process.cwd(), 'chromium-bin')),
    headless: true,
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1000, height: 900, deviceScaleFactor: 1 });
    await page.setCookie({ name: 'yat_seen', value: '1', url: input.origin });
    const url = new URL('/embed/share-card/' + encodeURIComponent(input.playerId), input.origin);
    const result = await page.goto(url.toString(), { waitUntil: 'domcontentloaded', timeout: 26000 });
    if (!result?.ok()) throw new Error('Share card source returned ' + result?.status());
    await page.waitForSelector('[data-share-card-root] .yat-front .yat-bg-photo', {timeout:16000});
    await page.evaluate(async () => {
      await document.fonts.ready;
      const img = document.querySelector('[data-share-card-root] .yat-bg-photo') as HTMLImageElement;
      if (img && !img.complete) await Promise.race([img.decode().catch(()=>{}), new Promise(r=>setTimeout(r,5000))]);
    });
    const target = await page.$('[data-share-card-root] .yat-card');
    if (!target) throw new Error('Isolated card missing');
    const png = Buffer.from(await target.screenshot({type:'png'}));
    const metadata = await sharp(png).metadata();
    if (!metadata.width || !metadata.height || metadata.height < 300) throw new Error('Invalid card capture size');
    const fitted = await sharp(png).resize({height:630,fit:'inside',withoutEnlargement:false}).png().toBuffer();
    const fittedMeta = await sharp(fitted).metadata();
    const left = Math.round((1200 - (fittedMeta.width || 0))/2);
    const top = Math.round((630 - (fittedMeta.height || 0))/2);
    return sharp({create:{width:1200,height:630,channels:4,background:'#070707'}})
      .composite([{input:fitted,left,top}]).png().toBuffer();
  } finally {
    await browser.close();
  }
}
