// src/app/api/stories/[id]/share/route.ts
//   POST - registered fan share tracking (the browser share UI is also gated).
import { NextRequest, NextResponse } from 'next/server';
import { identifyRegisteredFan } from '@/lib/fanIdentity';
import { fail, loadLiveStory, logFanActivity, parseStoryId } from '@/lib/storySocial';

export const runtime = 'nodejs';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const id = parseStoryId((await params).id);
  if (!id) return fail('Story not found.', 404);
  const fan = await identifyRegisteredFan(req);
  if (!fan) return fail('Register or log in to share a story.', 401);
  try {
    const story = await loadLiveStory(id);
    if (!story) return fail('Story not found.', 404);
    const body = (await req.json().catch(() => ({}))) as { method?: unknown };
    await logFanActivity(fan.uid, 'story_shared', story, { method: String(body.method || 'link').slice(0, 20) });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[stories] share log failed', error);
    return NextResponse.json({ ok: true });
  }
}
