// Browser-only capture of the real Career Path Timeline.
import sharp from 'sharp';

export async function captureCareerTimeline(input: { origin: string; hsid: string; playerId: string; slug: string }): Promise<Buffer> {
  const [{ default: chromium }, { default: puppeteer }] = await Promise.all([
    import('@sparticuz/chromium'),
    import('puppeteer-core'),
  ]);
  const browser = await puppeteer.launch({
    args: chromium.args,
    executablePath: await chromium.executablePath(),
    headless: true,
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1536, height: 960, deviceScaleFactor: 2 });
    await page.setCookie({ name: 'yat_seen', value: '1', url: input.origin });
    const url = new URL('/' + input.hsid + '/player/' + input.playerId + '/' + input.slug, input.origin);
    const result = await page.goto(url.href, { waitUntil: 'domcontentloaded', timeout: 26000 });
    if (!result?.ok()) throw new Error('Player page returned ' + (result?.status() || 'unknown'));
    // The timeline initializes asynchronously. Wait for the actual opening
    // anchor slide rather than photographing a loading state.
    await page.waitForFunction(() => {
      const strip = document.querySelector('#playerCareerImages');
      return strip?.getAttribute('data-active-kind') === 'anchor'
        && !!strip.querySelector('.zt-title')
        && !!strip.querySelector('.zt-person-then');
    }, { timeout: 21000, polling: 250 });
    await page.evaluate(async () => {
      await document.fonts.ready;
      document.getElementById('yatSplash')?.remove();
      const strip = document.querySelector('#playerCareerImages') as HTMLElement | null;
      if (!strip) return;
      // Freeze animation, remove navigation arrows; never touch the live page.
      const style = document.createElement('style');
      style.textContent = `#playerCareerImages{height:590px!important;min-height:590px!important}\n      .zt-timeline-host,.zt-native-viewport,.yat-profile-career-strip{height:590px!important;min-height:590px!important}\n      #playerCareerImages *{animation:none!important;transition:none!important}
      #playerCareerImages .zt-arrow,#playerCareerImages .zt-prev,#playerCareerImages .zt-next{display:none!important}`;
      document.head.appendChild(style);
      const images = [...strip.querySelectorAll('img')] as HTMLImageElement[];
      await Promise.all(images.map(async img => {
        if (img.complete) return;
        await Promise.race([new Promise<void>(resolve => { img.addEventListener('load', () => resolve(), {once:true}); img.addEventListener('error', () => resolve(), {once:true}); }), new Promise<void>(resolve => setTimeout(resolve, 1800))]);
      }));
    });
    const target = await page.$('#playerCareerImages');
    if (!target) throw new Error('Timeline crop target missing');
    const screenshot = await target.screenshot({ type: 'png' }) as Buffer;
    const bounds = await sharp(screenshot).metadata();
    if (!bounds.width || !bounds.height) throw new Error('Empty timeline screenshot');
    // Keep proportions exactly; no vertical stretch and no graphics redrawn.
    // The OG canvas is 1200x630 and preserves the entire 1536px-wide hero.
    return sharp(screenshot).resize(1200, 630, { fit: 'contain', background: '#080909' }).png().toBuffer();
  } finally {
    await browser.close();
  }
}
