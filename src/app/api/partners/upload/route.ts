import { NextRequest, NextResponse } from 'next/server';
import { PartnerAccessError, requirePartnerAccess } from '@/lib/partners/access';
import { assertPartnerAssetAccess, PARTNER_ASSET_MAX_BYTES, parsePartnerAssetKind, storePartnerAsset } from '@/lib/partners/assets';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_MULTIPART_BYTES = PARTNER_ASSET_MAX_BYTES + 64 * 1024;
const RESPONSE_HEADERS = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };

async function boundedUploadForm(request: NextRequest): Promise<FormData> {
  const contentType = request.headers.get('content-type') || '';
  if (!/^multipart\/form-data\s*;/i.test(contentType)) {
    throw new PartnerAccessError(415, 'Upload the image using a multipart form.');
  }
  const declaredLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_MULTIPART_BYTES) {
    throw new PartnerAccessError(413, 'Choose an image no larger than 3 MB.');
  }
  if (!request.body) throw new PartnerAccessError(400, 'Choose an image to upload.');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      length += chunk.value.byteLength;
      if (length > MAX_MULTIPART_BYTES) {
        await reader.cancel();
        throw new PartnerAccessError(413, 'Choose an image no larger than 3 MB.');
      }
      chunks.push(chunk.value);
    }
  } finally {
    reader.releaseLock();
  }
  try {
    return await new Response(new Uint8Array(Buffer.concat(chunks)), {
      headers: { 'Content-Type': contentType },
    }).formData();
  } catch {
    throw new PartnerAccessError(400, 'The upload form could not be read.');
  }
}

export async function POST(request: NextRequest) {
  try {
    const access = await requirePartnerAccess(request);
    const form = await boundedUploadForm(request);
    if ([...form.keys()].some((key) => !['file', 'kind', 'sponsorId'].includes(key)) ||
        form.getAll('file').length !== 1 || form.getAll('kind').length !== 1 || form.getAll('sponsorId').length > 1) {
      throw new PartnerAccessError(400, 'Provide one image, its kind, and its sponsor when required.');
    }
    const file = form.get('file');
    if (!file || typeof file === 'string') throw new PartnerAccessError(400, 'Choose an image to upload.');
    if (!file.size || file.size > PARTNER_ASSET_MAX_BYTES) {
      throw new PartnerAccessError(413, 'Choose an image no larger than 3 MB.');
    }
    const kind = parsePartnerAssetKind(form.get('kind'));
    const sponsorId = form.get('sponsorId');
    if (sponsorId != null && typeof sponsorId !== 'string') {
      throw new PartnerAccessError(400, 'Choose a valid sponsor.');
    }
    assertPartnerAssetAccess(access, kind, sponsorId);
    const asset = await storePartnerAsset(access, {
      kind,
      sponsorId,
      body: Buffer.from(await file.arrayBuffer()),
      contentType: file.type,
    });
    return NextResponse.json({ asset }, { status: 201, headers: RESPONSE_HEADERS });
  } catch (error) {
    const known = error instanceof PartnerAccessError;
    return NextResponse.json({ error: known ? error.message : 'The upload could not be completed.' }, {
      status: known ? error.status : 500,
      headers: RESPONSE_HEADERS,
    });
  }
}
