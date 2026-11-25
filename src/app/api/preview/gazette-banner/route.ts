import { NextRequest } from 'next/server';
import { previewSchoolBanner } from '@/lib/newsletter/newsletterImagesServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Approval proof only: never expose a browser-rendering endpoint in production.
// No database access, no writes to S3, no newsletter delivery.
export async function GET(request: NextRequest) {
  if (process.env.VERCEL_ENV !== 'preview') return new Response('Not found', { status: 404 });
  const hsid = request.nextUrl.searchParams.get('hsid') ?? '';
  if (!/^[1-9][0-9]{0,7}$/.test(hsid)) return new Response('Valid hsid required', { status: 400 });
  try {
    const png = await previewSchoolBanner(Number(hsid));
    return new Response(new Uint8Array(png), { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'private, max-age=60' } });
  } catch (error) {
    console.error('[gazette-banner-preview]', error instanceof Error ? error.message : String(error));
    return new Response('Gazette banner rendering failed', { status: 500 });
  }
}
