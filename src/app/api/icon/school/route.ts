// A real, same-origin PNG icon with the dimensions declared by the PWA
// manifest. Chrome on Android may reject remote, mislabeled or non-square
// images and install a generic first-letter tile instead.
import sharp from 'sharp';
import { getSchoolCrestUrl } from '@/lib/schoolAssets';

export const runtime = 'nodejs';
export const maxDuration = 10;

const PUBLIC_CACHE = 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800';
const ID = /^[1-9][0-9]{0,19}$/;

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const hsid = url.searchParams.get('hsid') || '';
  const size = Number(url.searchParams.get('size'));
  const purpose = url.searchParams.get('purpose') || 'any';
  if (!ID.test(hsid) || (size !== 192 && size !== 512) ||
      (purpose !== 'any' && purpose !== 'maskable')) {
    return new Response('Invalid school icon', { status: 400, headers: { 'Cache-Control': 'no-store' } });
  }

  try {
    const upstream = await fetch(getSchoolCrestUrl(hsid), {
      signal: AbortSignal.timeout(5000),
      next: { revalidate: 86400 },
    });
    if (!upstream.ok) throw new Error('School crest unavailable: ' + upstream.status);
    const body = Buffer.from(await upstream.arrayBuffer());
    if (body.byteLength < 100 || body.byteLength > 5_000_000) {
      throw new Error('School crest size invalid');
    }
    // The maskable icon keeps the crest inside the Android launcher safe
    // area instead of allowing circular icon masks to cut off its edges.
    const crestSize = purpose === 'maskable' ? Math.floor(size * 0.72) : size;
    const foreground = await sharp(body, { failOn: 'error' })
      .resize(crestSize, crestSize, { fit: 'contain', background: '#00000000' })
      .png()
      .toBuffer();
    const result = purpose === 'maskable'
      ? await sharp({
          create: { width: size, height: size, channels: 4, background: '#000000' },
        }).composite([{ input: foreground, gravity: 'centre' }]).png().toBuffer()
      : foreground;
    return new Response(new Uint8Array(result), {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': PUBLIC_CACHE,
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    console.warn('[school-home-icon] failed', { hsid, size, purpose, error });
    return new Response('School icon temporarily unavailable', {
      status: 503,
      headers: { 'Cache-Control': 'no-store', 'Retry-After': '300' },
    });
  }
}
