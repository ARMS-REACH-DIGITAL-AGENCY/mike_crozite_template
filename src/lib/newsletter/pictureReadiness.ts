import { createHash } from 'node:crypto';
import { NEWSLETTER_ASSETS_BASE } from './newsletterImages';

const signature = Buffer.from([137,80,78,71,13,10,26,10]);
export const pngHash = (png: Buffer) => createHash('sha256').update(png).digest('hex');
export async function verifyNewsletterPng(url: string, request: typeof fetch = fetch, expectedHash?: string) {
  const response = await request(url, { cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(10000) });
  if (response.status !== 200 || !/^image\/png(?:;|$)/i.test(response.headers.get('content-type') || '')) throw new Error('Image unavailable: HTTP ' + response.status);
  const png = Buffer.from(await response.arrayBuffer());
  if (png.length < 24 || !png.subarray(0,8).equals(signature) || png.readUInt32BE(16) === 0 || png.readUInt32BE(20) === 0) throw new Error('Invalid PNG image');
  if (expectedHash && pngHash(png) !== expectedHash) throw new Error('Stored image bytes differ from rendered PNG');
}
export async function retryPicture<T>(run: () => Promise<T>, attempts = 3): Promise<T> {
  let last: unknown;
  for (let n=0; n<attempts; n++) {
    try { return await run(); } catch (error) { last = error; }
  }
  throw last;
}
export function generatedPictureUrls(html: string): string[] {
  return [...new Set([...html.matchAll(/<img\b[^>]*\bsrc=["']([^"']+)["']/gi)]
    .map(m => m[1].replace(/&amp;/g,'&')).filter(url => url.startsWith(NEWSLETTER_ASSETS_BASE + '/')))];
}
/** One shared cache for a cron invocation. A failed picture only holds editions referencing it. */
export function createEditionPictureVerifier(failedKeys: ReadonlySet<string> = new Set(), request: typeof fetch = fetch) {
  const results = new Map<string, Promise<boolean>>();
  return async (html: string) => {
    const urls = generatedPictureUrls(html);
    const failures = await Promise.all(urls.map(async url => {
      if (failedKeys.has('newsletter/' + url.slice(NEWSLETTER_ASSETS_BASE.length + 1))) return url;
      if (!results.has(url)) results.set(url, retryPicture(() => verifyNewsletterPng(url, request)).then(() => true, () => false));
      return await results.get(url) ? null : url;
    }));
    return failures.filter((url): url is string => url !== null);
  };
}
