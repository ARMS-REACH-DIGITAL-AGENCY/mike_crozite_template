import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { writerQuery } from '@/lib/dbWriter';
import { findOrCreateGhlContact, sendGHLEmail } from '@/lib/gohighlevel';
import { resolveSchoolNewsOrigins, schoolNewsStoryUrl, schoolNewsReviewUrl } from '@/lib/schoolNewsLinks';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// A daily, after-the-fact review email for the YAT?STATS operator.
// Vercel cron is UTC: 14:30 UTC = 07:30 Arizona time, year-round.
// It reports the previous completed Arizona calendar day, even when empty.
const REPORT_EMAIL = 'pete@yatstats.com';
const tz = 'America/Phoenix';
const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (character) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character] || character));

type Story = {
  uuid: string; playerid: string | null; player_name: string | null;
  hsid: string; title: string; url: string; published_at: string;
  ingested_at: string; verification_status: string;
  source_handle: string | null;
};
type Totals = {
  found: number; posted: number; removed: number; monitored: number;
};
const boundaries = `WITH bounds AS (
  SELECT
    (date_trunc('day',now() AT TIME ZONE 'America/Phoenix')-interval '1 day')
      AT TIME ZONE 'America/Phoenix' AS start_at,
    date_trunc('day',now() AT TIME ZONE 'America/Phoenix')
      AT TIME ZONE 'America/Phoenix' AS end_at
)`;
function previousArizonaDate(): string {
  return new Intl.DateTimeFormat('en-CA',{
    timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit',
  }).format(new Date(Date.now()-86400000));
}
function azTime(timestamp: string): string {
  const t = new Date(timestamp);
  return Number.isNaN(t.getTime()) ? '' : t.toLocaleString('en-US',{
    timeZone:tz,month:'short',day:'numeric',hour:'numeric',minute:'2-digit',
  });
}
function emailHtml(day: string, totals: Totals, rows: Story[], schoolOrigins: Map<string, string>): string {
  const visible = rows.slice(0,200);
  const details = visible.map((story) => {
    const schoolBase = schoolOrigins.get(story.hsid);
    const link = schoolNewsStoryUrl(schoolBase, story.uuid);
    const reviewLink = schoolNewsReviewUrl(schoolBase);
    const removal = story.verification_status !== 'VERIFIED' ? ' (Removed)' : '';
    return [
      '<li style="margin:0 0 14px">',
      '<b>',esc(story.title),'</b>',esc(removal),
      '<div>',esc(story.player_name || story.playerid || 'Unknown player'),
      ' | School HSID ',esc(story.hsid),
      ' | ',esc(azTime(story.ingested_at)),' AZ</div>',
      story.source_handle ? '<div>Instagram: @' + esc(story.source_handle) + '</div>' : '',
      link ? '<a href="' + esc(link) + '">View published story</a>' :
        '<span>School microsite link unavailable; investigate school URL configuration</span>',
      ' &nbsp;|&nbsp; <a href="',esc(story.url),'">Original Instagram post</a>',
      reviewLink ? ' &nbsp;|&nbsp; <a href="' + esc(reviewLink) + '">Review / remove</a>' : '',
      '</li>',
    ].join('');
  }).join('');
  return [
    '<div style="font-family:Arial,sans-serif;color:#171717;line-height:1.55;max-width:750px">',
    '<h2>YAT?STATS Daily Instagram News Scout — ',esc(day),'</h2>',
    '<p>This is the automated after-publication review for the previous Arizona calendar day.</p>',
    '<p><b>News tips captured: ',String(totals.found),
    ' &nbsp; | &nbsp; Stories currently published: ',String(totals.posted),
    ' &nbsp; | &nbsp; Stories removed: ',String(totals.removed),'</b></p>',
    '<p>Professional player accounts currently resolved by Meta across monitored schools: ',
    String(totals.monitored),'. Instagram personal accounts are not accessible through Business Discovery.</p>',
    '<h3>Stories discovered and posted</h3>',
    visible.length ? '<ol>' + details + '</ol>' :
      '<p>No new Instagram Scout stories were recorded for this day. Existing fan-submitted News is not counted here.</p>',
    rows.length > visible.length ? '<p>Showing 200 newest stories; open the review queue for the full list.</p>' : '',
    '<p>Each story links to its own school microsite and reviewer queue. Unresolved school URLs are flagged rather than replaced by a corporate-site link.</p>',
    '<p style="font-size:12px;color:#666">',
    'YAT?STATS operational report for ',esc(REPORT_EMAIL),
    '. Counts are based on when a story was added to the site, not the original Instagram post date.',
    '</p></div>',
  ].join('');
}
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== 'Bearer ' + secret) {
    return NextResponse.json({ok:false,error:'Unauthorized'},{status:401});
  }
  try {
    const day = previousArizonaDate();
    const [stories,counts] = await Promise.all([
      query<Story>(boundaries + `
        SELECT n.uuid,n.playerid,n.player_name,n.hsid,n.title,n.url,
               n.published_at::text,n.ingested_at::text,n.verification_status,
               n.raw_payload->>'sourceHandle' AS source_handle
        FROM news_articles n CROSS JOIN bounds b
        WHERE n.discovery_source='social_scout' AND n.ingested_at >= b.start_at
          AND n.ingested_at < b.end_at
        ORDER BY n.ingested_at DESC,n.id DESC LIMIT 1000`),
      query<Totals>(boundaries + `
        SELECT
          (SELECT COUNT(*)::int FROM news_tip_queue q CROSS JOIN bounds b
           WHERE q.intake_source='social_scout' AND q.submitted_at >= b.start_at
             AND q.submitted_at < b.end_at) AS found,
          (SELECT COUNT(*)::int FROM news_articles n CROSS JOIN bounds b
           WHERE n.discovery_source='social_scout' AND n.verification_status='VERIFIED'
             AND n.ingested_at >= b.start_at AND n.ingested_at < b.end_at) AS posted,
          (SELECT COUNT(*)::int FROM news_articles n CROSS JOIN bounds b
           WHERE n.discovery_source='social_scout' AND n.verification_status='REJECTED'
             AND n.ingested_at >= b.start_at AND n.ingested_at < b.end_at) AS removed,
          (SELECT COUNT(*)::int FROM social_sources s
           WHERE s.owner_type='player'
             AND s.external_account_id IS NOT NULL AND s.status='active') AS monitored`),
    ]);
    // Resolve every school from the same canonical directory used by player
    // profiles and global search; this supports 8,000+ school subdomains.
    const schoolOrigins = await resolveSchoolNewsOrigins(
      [...new Set(stories.rows.map((story) => story.hsid))],
      (sql, params = []) => query(sql, params),
    );
    const unresolvedSchools = [...new Set(stories.rows
      .filter((story) => !schoolOrigins.has(story.hsid))
      .map((story) => story.hsid))];
    if (unresolvedSchools.length) {
      console.error('[social-news-digest] unresolved school microsite URLs', unresolvedSchools);
    }
    const totals = counts.rows[0] || {found:0,posted:0,removed:0,monitored:0};
    const result = {date:day,...totals,listLength:stories.rows.length,unresolvedSchools};
    // Preview never sends mail or creates a delivery-log record.
    if (process.env.VERCEL_ENV === 'preview') {
      return NextResponse.json({ok:true,dryRun:true,...result});
    }
    const {rows:sent} = await query<{id:string}>(`
      SELECT id::text FROM fan_activity
      WHERE firebase_uid='system:social-news-digest'
        AND action='social_news_digest_sent' AND details->>'day'=$1
      ORDER BY id DESC LIMIT 1`,[day]);
    if (sent.length) return NextResponse.json({ok:true,alreadySent:true,...result});
    const contactId = await findOrCreateGhlContact(REPORT_EMAIL,'Pete','DeLuca',
      undefined,'YAT?STATS Operations');
    if (!contactId) throw new Error('Unable to resolve YAT?STATS daily report contact');
    const ok = await sendGHLEmail(contactId,
      'YAT?STATS Instagram Scout Daily Report — ' + day +
        ' (' + totals.posted + ' posted)',
      emailHtml(day,totals,stories.rows,schoolOrigins));
    if (!ok) throw new Error('HighLevel rejected the daily Instagram Scout report');
    await writerQuery(`
      INSERT INTO fan_activity(firebase_uid,action,details)
      VALUES('system:social-news-digest','social_news_digest_sent',$1::jsonb)`,
      [JSON.stringify({day,...result,recipient:REPORT_EMAIL})]);
    return NextResponse.json({ok:true,sent:true,...result});
  } catch (error) {
    console.error('[social-news-digest] failed',error);
    return NextResponse.json({ok:false,error:'Daily Instagram news digest failed'}, {status:500});
  }
}
