import { NextRequest, NextResponse } from 'next/server';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

export const runtime = 'nodejs';
export const maxDuration = 60;

type Body = {
  playerId?: string;
  source?: 'then' | 'now';
  overwrite?: boolean;
};

const S3_PUBLIC_BASE = 'https://yatstats-assets.s3.us-west-2.amazonaws.com';

function json(status: number, data: Record<string, unknown>) {
  return NextResponse.json(data, { status });
}

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

function cleanPlayerId(value: unknown) {
  const playerId = String(value || '').trim();
  if (!playerId || !/^[A-Za-z0-9_-]+$/.test(playerId)) return '';
  return playerId;
}

async function objectExists(url: string) {
  try {
    const res = await fetch(url, { method: 'HEAD', cache: 'no-store' });
    return res.ok;
  } catch {
    return false;
  }
}

async function fetchFirstAvailable(urls: string[]) {
  for (const url of urls) {
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) continue;
      const blob = await res.blob();
      if (!blob.size) continue;
      return { url, blob };
    } catch {
      // Try the next candidate.
    }
  }
  return null;
}

async function removeBackgroundWithRemoveBg(blob: Blob) {
  const apiKey = requiredEnv('REMOVE_BG_API_KEY');
  const form = new FormData();
  form.append('image_file', blob, 'player-source.jpg');
  form.append('size', 'auto');
  form.append('format', 'png');

  const res = await fetch('https://api.remove.bg/v1.0/removebg', {
    method: 'POST',
    headers: { 'X-Api-Key': apiKey },
    body: form,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`remove.bg failed: ${res.status} ${text.slice(0, 300)}`);
  }

  return Buffer.from(await res.arrayBuffer());
}

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization') || '';
  const secret = process.env.CUTOUT_ADMIN_SECRET;
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return json(401, { ok: false, error: 'Unauthorized' });
  }

  let body: Body;
  try {
    body = await request.json();
  } catch {
    return json(400, { ok: false, error: 'Invalid JSON body' });
  }

  const playerId = cleanPlayerId(body.playerId);
  if (!playerId) {
    return json(400, { ok: false, error: 'Missing or invalid playerId' });
  }

  const source = body.source === 'now' ? 'now' : 'then';
  const encoded = encodeURIComponent(playerId);
  const outputKey = `players/cutouts/${playerId}.png`;
  const outputUrl = `${S3_PUBLIC_BASE}/${outputKey}`;

  if (!body.overwrite && await objectExists(outputUrl)) {
    return json(200, {
      ok: true,
      skipped: true,
      reason: 'Cutout already exists',
      playerId,
      outputKey,
      outputUrl,
    });
  }

  const candidates = [
    `${S3_PUBLIC_BASE}/players/${source}/${encoded}.jpg`,
    `${S3_PUBLIC_BASE}/players/${source}/${encoded}.jpeg`,
    `${S3_PUBLIC_BASE}/players/${source}/${encoded}.png`,
    `${S3_PUBLIC_BASE}/players/${source}/${encoded}.webp`,
  ];

  const sourceImage = await fetchFirstAvailable(candidates);
  if (!sourceImage) {
    return json(404, {
      ok: false,
      error: `No source image found in players/${source}`,
      playerId,
      tried: candidates,
    });
  }

  let png: Buffer;
  try {
    png = await removeBackgroundWithRemoveBg(sourceImage.blob);
  } catch (error) {
    return json(502, {
      ok: false,
      error: error instanceof Error ? error.message : 'Background removal failed',
      playerId,
      sourceUrl: sourceImage.url,
    });
  }

  const bucket = requiredEnv('S3_BUCKET');
  const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-west-2';
  const s3 = new S3Client({ region });

  await s3.send(new PutObjectCommand({
    Bucket: bucket,
    Key: outputKey,
    Body: png,
    ContentType: 'image/png',
    CacheControl: 'public, max-age=31536000, immutable',
  }));

  return json(200, {
    ok: true,
    playerId,
    source,
    sourceUrl: sourceImage.url,
    outputKey,
    outputUrl,
    bytes: png.length,
  });
}
