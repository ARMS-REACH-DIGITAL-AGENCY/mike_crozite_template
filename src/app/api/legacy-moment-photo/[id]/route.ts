// Serve preserved early-2026 career-photo submissions without exposing their
// base64 image data in /api/stories JSON. Only PUBLIC and LIVE moments are readable.
import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

export const runtime = 'nodejs';

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  if (!/^\d{1,15}$/.test(id)) return new NextResponse(null, { status: 404 });
  const { rows } = await query<{ image_data_url: string | null }>(
    `SELECT image_data_url FROM player_moment_submissions
       WHERE id=$1::bigint AND status='live'
         AND COALESCE(is_private, false) = false AND visibility = 'public'
         AND image_data_url LIKE 'data:image/jpeg;base64,%'
       LIMIT 1`, [id]
  );
  const image = rows[0]?.image_data_url;
  if (!image) return new NextResponse(null, { status: 404 });
  const encoded = image.slice('data:image/jpeg;base64,'.length);
  if (!/^[A-Za-z0-9+/=]+$/.test(encoded) || encoded.length > 6000000)
    return new NextResponse(null, { status: 404 });
  const bytes = Buffer.from(encoded, 'base64');
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8)
    return new NextResponse(null, { status: 404 });
  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: {
      'Content-Type': 'image/jpeg',
      'Cache-Control': 'public, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
