import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { identifyContributor, isReviewer } from '@/lib/contributeServer';

export const runtime = 'nodejs';
// Restricted to verified, configured contribution reviewers. No public approval.
async function reviewer(req: NextRequest) {
  const token = req.headers.get('x-firebase-token');
  return isReviewer(await identifyContributor(req, token));
}
export async function GET(req: NextRequest) {
  if (!await reviewer(req)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const result = await query(
    `SELECT id, playerid, hsid, contact_email, display_name, location_city,
       location_state, occupation, company_name, business_website,
       linkedin_url, instagram_url, facebook_url, x_url, story, photo_url,
       sponsorship_interest, created_at
     FROM public.alumni_where_yat_now WHERE status='pending'
     ORDER BY created_at ASC LIMIT 100`);
  return NextResponse.json({ submissions: result.rows });
}
export async function POST(req: NextRequest) {
  if (!await reviewer(req)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  let data: { id?: number; status?: string };
  try { data = await req.json(); } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }); }
  if (!Number.isSafeInteger(data.id) || !['approved', 'rejected'].includes(data.status || ''))
    return NextResponse.json({ error: 'Invalid review action' }, { status: 400 });
  const result = await query(
    `UPDATE public.alumni_where_yat_now SET status=$2, reviewed_at=now()
       WHERE id=$1 AND status='pending' RETURNING id, playerid, status`,
    [data.id, data.status],
  );
  return NextResponse.json({ ok: result.rows.length > 0, item: result.rows[0] || null });
}
