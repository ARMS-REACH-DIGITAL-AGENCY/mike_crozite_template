// Browser-only capture of the real Career Path Timeline.
import sharp from 'sharp';
import path from 'path';

export async function captureCareerTimeline(input: { origin: string; hsid: string; playerId: string; slug: string }): Promise<Buffer> {
  const [{ default: chromium }, { default: puppeteer }] = await Promise.all([
    import('@sparticuz/chromium'),
    import('puppeteer-core'),
  ]);
  const browser = await puppeteer.launch({
    args: chromium.args,
    executablePath: await chromium.executablePath(path.join(process.cwd(), 'chromium-bin')),
    headless: true,
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 960, deviceScaleFactor: 1 });
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

    // Increase the ACTUAL timeline row and all of its ancestors together.
    // The old implementation only increased #playerCareerImages. Its fixed
    // 200px parent clipped the hero, exposing Stories and advertisements.
    // This stylesheet runs in the offscreen screenshot browser ONLY.
    await page.addStyleTag({ content: [
      '.yat-row3-shell:has(.yat-profile-career-strip){height:630px!important;min-height:630px!important;overflow:hidden!important;}',
      '.yat-row3-shell .yat-profile-career-strip,.zt-timeline-host,.zt-native-viewport{height:630px!important;min-height:630px!important;}',
      '.zt-hero-bleed{height:calc(var(--row1-h,36px) + var(--row2-h,54px) + 630px)!important;}',
      '#playerCareerImages{width:100%!important;height:630px!important;min-height:630px!important;overflow:hidden!important;--hero-copy-left:47%;--hero-rail-left:52%;background:#060708 url("/img/career-path-default.webp") 0% 48% / cover no-repeat!important;}',
      '#playerCareerImages .zt-moment-cta,#playerCareerImages .zt-rail-mode-toggle{display:none!important;}',
      '#playerCareerImages .zt-copy{bottom:78px!important;padding-top:28px!important;max-width:none!important;}',
      '#playerCareerImages .zt-kick{font-size:22px!important;line-height:1.18!important;margin-bottom:14px!important;}',
      '#playerCareerImages .zt-title{font-size:clamp(42px,4.5vw,56px)!important;line-height:1.04!important;white-space:normal!important;overflow:visible!important;margin-bottom:16px!important;}',
      '#playerCareerImages .zt-bodycopy{font-size:24px!important;line-height:1.3!important;white-space:normal!important;}',
      '#playerCareerImages .zt-person-stack .zt-person-then{width:clamp(300px,35vw,440px)!important;left:calc(var(--hero-copy-left) - 18px - clamp(300px,35vw,440px))!important;}',
      '#playerCareerImages .zt-person-stack .zt-person-now{height:54%!important;bottom:16px!important;}',
      '#playerCareerImages .zt-rail{bottom:24px!important;height:20px!important;}',
      '#playerCareerImages .zt-rail-track{height:5px!important;}',
      '#playerCareerImages .zt-rail-tick{width:12px!important;height:12px!important;margin-left:-6px!important;background:#df402b!important;}',
      '#playerCareerImages *{animation:none!important;transition:none!important;}'
    ].join('\n') });
    await page.evaluate(async () => {
      document.getElementById('yatSplash')?.remove();
      await document.fonts.ready;
      const carousel = document.querySelector('#playerCareerImages .zt-carousel') as HTMLElement | null;
      const anchor = carousel?.querySelector('.zt-slide.zt-anchor') as HTMLElement | null;
      if (carousel && anchor) carousel.scrollTo({ left: anchor.offsetLeft, behavior: 'instant' });
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    });
    // Do not confuse an "active=anchor" state with a different slide that
    // has not yet scrolled into view. This was producing "THE YEAR IT ALL
    // BEGAN" instead of the graduation hero.
    await page.waitForFunction(() => {
      const strip = document.querySelector('#playerCareerImages');
      const carousel = strip?.querySelector('.zt-carousel');
      const anchor = carousel?.querySelector('.zt-slide.zt-anchor');
      if (!strip || !carousel || !anchor || strip.getAttribute('data-active-kind') !== 'anchor') return false;
      const box = strip.getBoundingClientRect();
      const parent = strip.closest('.yat-row3-shell')?.getBoundingClientRect();
      const slide = anchor.getBoundingClientRect();
      const rail = strip.querySelector('.zt-rail')?.getBoundingClientRect();
      const title = anchor.querySelector('.zt-title')?.textContent || '';
      return box.height >= 629 && parent && parent.height >= 629
        && slide.left >= box.left - 8 && slide.left <= box.left + 8
        && rail && rail.top >= box.top && rail.bottom <= box.bottom + 4
        && (title.includes("baseball player") || title.includes("Every player"));
    }, { timeout: 14000, polling: 200 });
    await page.evaluate(async () => {
      const strip = document.querySelector('#playerCareerImages');
      const images = [...(strip?.querySelectorAll('img') || [])] as HTMLImageElement[];
      await Promise.all(images.map(img => img.complete ? Promise.resolve() : Promise.race([
        new Promise<void>(resolve => {
          img.addEventListener('load', () => resolve(), {once:true});
          img.addEventListener('error', () => resolve(), {once:true});
        }),
        new Promise<void>(resolve => setTimeout(resolve, 1800)),
      ])));
    });
    const target = await page.$('#playerCareerImages');
    if (!target) throw new Error('Timeline crop target missing');
    const bounds = await target.boundingBox();
    if (!bounds || Math.abs(bounds.width - 1200) > 8 || Math.abs(bounds.height - 630) > 8) {
      throw new Error('Timeline crop geometry invalid: ' + JSON.stringify(bounds));
    }
    // Capture the actual composited pixels at the hero's rectangle.
    // Neither the story feed nor ad placements can fall inside this clip.
    const screenshot = Buffer.from(await page.screenshot({
      type: 'png', clip: { x: bounds.x, y: bounds.y, width: 1200, height: 630 },
      captureBeyondViewport: false,
    }));
    const meta = await sharp(screenshot).metadata();
    if (meta.width !== 1200 || meta.height !== 630) throw new Error('Unexpected image crop dimensions');
    return screenshot;
  } finally {
    await browser.close();
  }
}
