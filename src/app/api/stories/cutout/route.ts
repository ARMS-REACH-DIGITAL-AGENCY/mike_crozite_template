// src/app/api/stories/cutout/route.ts
//   POST {key} - make the timeline hero cutout for one story photo that
//   doesn't have one yet (photos posted before cutouts existed, or ones
//   remove.bg didn't finish in time while posting). The timeline calls it
//   once when a cutout is missing. Only photos of live stories, each done
//   at most once (see makeStoryCutout: an existing cutout or a "nothing to
//   keep" marker is never redone).
import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { cutoutKeyFor, isStoryFullKey, makeStoryCutout, storyAssetUrl } from '@/lib/stories';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { key?: unknown };
  const key = String(body.key || '');
  if (!isStoryFullKey(key)) return NextResponse.json({ error: 'Not a story photo.' }, { status: 400 });
  try {
    const { rows } = await query(
      `SELECT 1 FROM player_moment_photos p
         JOIN player_moment_submissions m ON m.id = p.moment_id AND m.status = 'live'
        WHERE p.s3_key = $1 LIMIT 1`,
      [key]
    );
    if (!rows.length) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
    const result = await makeStoryCutout(key);
    const ok = result === 'made' || result === 'exists';
    return NextResponse.json({ result, cutout: ok ? storyAssetUrl(cutoutKeyFor(key)) : null });
  } catch (error) {
    console.error('[stories] cutout route failed', error);
    return NextResponse.json({ error: 'Cutout failed.' }, { status: 500 });
  }
}
