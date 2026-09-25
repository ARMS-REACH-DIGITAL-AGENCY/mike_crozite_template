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
    const input = Buffer.from(await upstream.arrayBuffer());
    // With a transparent top-left pixel, sharp's trim removes the
    // transparent border on all four sides.
    const output = await sharp(input).trim({ threshold: 10 }).png().toBuffer();
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
