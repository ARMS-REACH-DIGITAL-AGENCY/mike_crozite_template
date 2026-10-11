import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Campaign = {
  id: string; message_text: string; image_url: string | null;
  cta_label: string | null; cta_url: string | null; duration_seconds: number;
};

// Published-only, school-specific campaigns take priority over global campaigns.
// Drafts and staged content are never served to visitors.
export async function GET(request: NextRequest) {
  const page = request.nextUrl.searchParams.get('page')?.trim().toLowerCase() || '';
  const school = request.nextUrl.searchParams.get('school')?.trim() || '';
  if (!/^[a-z][a-z0-9_-]{0,39}$/.test(page) || school.length > 100) {
    return NextResponse.json({ error: 'Invalid page or school' }, { status: 400 });
  }
  try {
    const { rows } = await query<Campaign>(`
      SELECT id::text, message_text, image_url, cta_label, cta_url, duration_seconds
      FROM site_message_campaigns
      WHERE page_key = $1
        AND (school_hsid = $2 OR school_hsid IS NULL)
        AND status = 'published'
        AND (starts_at IS NULL OR starts_at <= now())
        AND (ends_at IS NULL OR ends_at > now())
      ORDER BY CASE WHEN school_hsid = $2 THEN 0 ELSE 1 END, display_order, id
      LIMIT 30
    `, [page, school]);
    return NextResponse.json({ messages: rows }, {
      headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' },
    });
  } catch (error) {
    console.error('site messages read failed', error);
    return NextResponse.json({ messages: [] }, { status: 503 });
  }
}
