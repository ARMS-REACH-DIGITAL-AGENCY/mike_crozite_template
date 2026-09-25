// src/app/api/cutout/route.ts
// Serves a player's background-removed cutout (players/{kind}-cutouts/{id}.png
// on S3) with its transparent border trimmed off. The cutout pipeline keeps
// each source photo's full canvas, so how much empty space surrounds the
// figure varies photo to photo (Casey Legumina's HS cutout is ~27% empty
// top+bottom, Cooper Brass's is 0%) - which made the same CSS box render one
// player's figure far smaller than another's. The browser can't trim it
// itself: the S3 bucket sends no CORS headers, so page code can't read the
// image's pixels. Trimming here makes every figure fill its box the same way.

import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';

export const runtime = 'nodejs';

const S3_BASE = 'https://yatstats-assets.s3.us-west-2.amazonaws.com';
const KINDS = new Set(['then', 'back', 'now']);
const PLAYER_ID = /^[A-Za-z0-9_-]{1,40}$/;

export async function GET(req: NextRequest) {
  const kind = req.nextUrl.searchParams.get('kind') || '';
  const id = req.nextUrl.searchParams.get('id') || '';
  if (!KINDS.has(kind) || !PLAYER_ID.test(id)) {
    return NextResponse.json({ error: 'kind (then|back|now) and a valid id are required' }, { status: 400 });
  }

  const upstream = await fetch(`${S3_BASE}/players/${kind}-cutouts/${encodeURIComponent(id)}.png`, { cache: 'no-store' });
  // 403/404 both mean "no cutout for this player" on this bucket. Passed
  // through as a 404 so SmartImage's onError moves on to its next source.
  if (!upstream.ok) {
    return new NextResponse(null, { status: 404, headers: { 'Cache-Control': 'public, max-age=300, s-maxage=3600' } });
  }

  try {
    const input: Buffer = Buffer.from(await upstream.arrayBuffer());
    // Flip-card-back action photos are wide rectangles (~2.3-3.2:1) laid
    // out for the card back, where the name/stats sit over the LEFT third
    // and the photo fades behind them -- so the player is almost always in
    // the right two-thirds, and whatever the left third holds (an
    // outstretched glove arm, an interviewer, a bat) is secondary. Per
    // direct feedback, that left side DISSOLVES out rather than being cut
    // off: an alpha fade from fully transparent at 12% of the width to
    // fully opaque at 42% (smoothstep, then ^1.5 so it stays faint longer).
    // Then trimmed on all four sides like everything else, so the image's
    // right edge is the player's own right edge -- the timeline pins that
    // edge just past the headline column. A back cutout that's been
    // hand-cropped to something squarer (w:h under 2, e.g. Cody
    // Bellinger's, Casey Legumina's) is left unfaded.
    let source: Buffer = input;
    if (kind === 'back') {
      const { width = 0, height = 0 } = await sharp(input).metadata();
      if (width && height && width / height >= 2) {
        const row = Buffer.alloc(width * 4);
        for (let x = 0; x < width; x++) {
          const t = Math.min(1, Math.max(0, (x / width - 0.12) / 0.3));
          const a = Math.pow(t * t * (3 - 2 * t), 1.5);
          row[x * 4] = 255;
          row[x * 4 + 1] = 255;
          row[x * 4 + 2] = 255;
          row[x * 4 + 3] = Math.round(a * 255);
        }
        const mask = await sharp(row, { raw: { width, height: 1, channels: 4 } })
          .resize(width, height, { fit: 'fill', kernel: 'nearest' })
          .png()
          .toBuffer();
        source = await sharp(input)
          .ensureAlpha()
          .composite([{ input: mask, blend: 'dest-in' }])
          .png()
          .toBuffer();
      }
    }
    // With a transparent top-left pixel, sharp's trim removes the
    // transparent border on all four sides.
    const output = await sharp(source).trim({ threshold: 10 }).png().toBuffer();
    return new NextResponse(new Uint8Array(output), {
      headers: {
        'Content-Type': 'image/png',
        // Not immutable like the S3 originals: cutouts get replaced in
        // place at the same key, so the CDN re-checks daily.
        'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800',
      },
    });
  } catch (error) {
    console.error(`[api/cutout] trim failed for ${kind}/${id}:`, error);
    return new NextResponse(null, { status: 502 });
  }
}
