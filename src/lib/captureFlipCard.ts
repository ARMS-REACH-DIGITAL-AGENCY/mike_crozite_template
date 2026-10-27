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
    const url = new URL('/' + encodeURIComponent(input.hsid) + '/?view=current&player=' + encodeURIComponent(input.playerId), input.origin);
    const result = await page.goto(url.toString(), { waitUntil: 'domcontentloaded', timeout: 26000 });
    if (!result?.ok()) throw new Error('Share card source returned ' + result?.status());
    const id = input.playerId;
    await page.waitForFunction((playerId) => !!Array.from(document.querySelectorAll('.yat-card[data-playerid]')).find(e => e.getAttribute('data-playerid') === playerId), {timeout: 16000}, id);
    await page.evaluate(async (playerId) => {
      // Isolate the existing real card. This is the shared production card UI,
      // not a reimplementation of its typography, chips, photo or placement.
      const target = Array.from(document.querySelectorAll<HTMLElement>('.yat-card[data-playerid]')).find(e => e.dataset.playerid === playerId);
      if (!target) throw new Error('Card not rendered');
      const section = target.closest<HTMLElement>('.yat-section');
      section?.classList.add('visible');
      section?.style.setProperty('display', 'block', 'important');
      for (const parent of [target.parentElement, section?.querySelector('.yat-grid')]) {
        (parent as HTMLElement | null)?.style.setProperty('display', 'block', 'important');
      }
      target.classList.remove('is-flipped');
      // Fixed intrinsic portrait dimension for social image; normal actual
      // card styles retain full control over every inner pixel.
      target.style.setProperty('width', '380px', 'important');
      target.style.setProperty('height', '560px', 'important');
      target.style.setProperty('position', 'fixed', 'important');
      target.style.setProperty('left', '30px', 'important');
      target.style.setProperty('top', '30px', 'important');
      target.style.setProperty('z-index', '2147483647', 'important');
      target.style.setProperty('transform', 'none', 'important');
      // Share is a website control, not part of the printed card artwork.
      target.querySelector('.yat-player-card-share')?.remove();
      document.getElementById('yatSplash')?.remove();
      await document.fonts.ready;
      await Promise.all(Array.from(target.querySelectorAll('img')).map(img =>
        img.complete ? Promise.resolve() : new Promise<void>(resolve => {
          img.addEventListener('load',()=>resolve(),{once:true});
          img.addEventListener('error',()=>resolve(),{once:true});
          setTimeout(resolve,3000);
        })
      ));
      await new Promise<void>(resolve => requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
    }, id);
    const target = await page.$('.yat-card[data-playerid="' + id.replace(/[^a-zA-Z0-9_-]/g, '') + '"]');
    if (!target) throw new Error('Card disappeared');
    const png = Buffer.from(await target.screenshot({type:'png'}));
    const metadata = await sharp(png).metadata();
    if (!metadata.width || !metadata.height || metadata.height < 300) throw new Error('Invalid card capture size');
    const fitted = await sharp(png).resize({height:610,fit:'inside',withoutEnlargement:false}).png().toBuffer();
    const fittedMeta = await sharp(fitted).metadata();
    const left = Math.round((1200 - (fittedMeta.width || 0))/2);
    const top = Math.round((630 - (fittedMeta.height || 0))/2);
    return sharp({create:{width:1200,height:630,channels:4,background:'#070707'}})
      .composite([{input:fitted,left,top}]).png().toBuffer();
  } finally {
    await browser.close();
  }
}
