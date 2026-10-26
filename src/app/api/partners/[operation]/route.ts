import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { revalidateTag } from 'next/cache';
import { PartnerAccessError, requirePartnerAccess } from '@/lib/partners/access';
import { dashboard, saveBrand, saveCreative, saveMembership, saveNote, savePlacement, saveSplashPlacement, savePublication, searchSchools, searchSponsors } from '@/lib/partners/service';
import { publicationPreview } from '@/lib/partners/preview';
import { validationFields } from '@/lib/partners/validation';
import { saveSponsorCard, saveSponsorCardPlacement, sponsorCardDashboard, sponsorCardPreview } from '@/lib/partners/sponsorCards';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;
type Context = { params: Promise<{ operation: string }> };
const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };
function response(data: unknown, status = 200) { return NextResponse.json(data, { status, headers }); }
function failure(error: unknown) {
  if (error instanceof PartnerAccessError) return response({ error: error.message }, error.status);
  if (error instanceof z.ZodError) return response({ error: 'Check the highlighted fields.', fieldErrors: validationFields(error) }, 400);
  const code = (error as { code?: string })?.code;
  if (code === '23503') return response({ error: 'A selected record is no longer available. Refresh and try again.' }, 409);
  if (code === '23505') return response({ error: 'That record already exists.' }, 409);
  console.error('[partner-portal] request failed', { code: code || 'unknown' });
  return response({ error: 'The partner portal is temporarily unavailable. Your changes have not been confirmed.' }, 503);
}
export async function GET(request: NextRequest, context: Context) {
  try {
    const access = await requirePartnerAccess(request);
    const { operation } = await context.params;
    if (operation === 'dashboard') {
      const data = await dashboard(access, request.nextUrl.searchParams.get('sponsorId'));
      return response({ ...data, ...await sponsorCardDashboard(access, data.selectedSponsorId) });
    }
    if (operation === 'schools') return response(await searchSchools(access, request.nextUrl.searchParams.get('q') || ''));
    if (operation === 'sponsors') return response(await searchSponsors(access, request.nextUrl.searchParams.get('q') || ''));
    return response({ error: 'Not found.' }, 404);
  } catch (error) { return failure(error); }
}
export async function POST(request: NextRequest, context: Context) {
  try {
    const access = await requirePartnerAccess(request);
    if (!(request.headers.get('content-type') || '').toLowerCase().startsWith('application/json')) return response({ error: 'Send a JSON request.' }, 415);
    // Check the actual bytes as well as Content-Length; chunked bodies cannot bypass this limit.
    const reader = request.body?.getReader();
    if (!reader) return response({ error: 'Add the form content.' }, 400);
    const chunks: Uint8Array[] = []; let size = 0;
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.length;
      if (size > 32768) { await reader.cancel(); return response({ error: 'This form is too large.' }, 413); }
      chunks.push(value);
    }
    let body: Record<string, unknown>;
    try {
      const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') throw new Error('object required');
      body = parsed;
    } catch { return response({ error: 'The form could not be read. Refresh and try again.' }, 400); }
    const { operation } = await context.params;
    const handlers = { creatives: saveCreative, brands: saveBrand, placements: savePlacement, 'splash-placements': saveSplashPlacement, notes: saveNote, publication: savePublication,
      memberships: saveMembership, preview: publicationPreview, cards: saveSponsorCard, 'card-placements': saveSponsorCardPlacement, 'card-preview': sponsorCardPreview };
    const handler = handlers[operation as keyof typeof handlers];
    if (!handler) return response({ error: 'Not found.' }, 404);
    const result = await handler(access, body);
    if (operation === 'card-preview') {
      const local = process.env.NODE_ENV !== 'production' && ['localhost', '127.0.0.1', '[::1]'].includes(request.nextUrl.hostname);
      const previewHost = process.env.VERCEL_ENV === 'preview' ? process.env.VERCEL_URL : '';
      const origin = local ? request.nextUrl.origin : previewHost && /^[a-z0-9.-]+\.vercel\.app$/i.test(previewHost)
        ? `https://${previewHost}` : 'https://mike-crozite-template.vercel.app';
      return response({ ...result, previewUrl: new URL('/embed/sponsor-card/preview', origin).href });
    }
    if (operation === 'brands' || operation === 'card-placements' || (operation === 'cards' && ['submit', 'publish', 'archive'].includes(String(body.action)))) {
      revalidateTag('partner-sponsor-cards', { expire: 0 });
    }
    return response(result);
  } catch (error) { return failure(error); }
}
