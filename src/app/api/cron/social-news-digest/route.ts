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
type ScoutStats = {runs:number;scanned:number;already_evaluated:number;unresolved:number;ai_reviewed:number;published:number;no_roster_subject:number;ignored:number;failures:number;ai_unavailable:number};
type Health = {
  status:string; latestRunAt:string|null; latestSuccessAt:string|null;
  lastPostAt:string|null; registered:number; attempted:number;
  succeeded:number; failed:number; failedHandles:string[];
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
function emailHtml(day: string, totals: Totals, rows: Story[], schoolOrigins: Map<string, string>,
  health: Health, scout: ScoutStats): string {
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
    '<p>Previously Meta-resolved professional player accounts (not a live health check): ',
    String(totals.monitored),'. Personal Instagram accounts cannot be read via Business Discovery.</p>',
    '<h3>Instagram sync health</h3>',
    '<p><b>Status: ',esc(health.status),'</b></p>',
    '<p>Registered handles: ',String(health.registered),
    ' | Latest sync attempted: ',String(health.attempted),
    ' | Succeeded: ',String(health.succeeded),
    ' | Failed: ',String(health.failed),'</p>',
    '<p>Latest sync attempt: ',esc(health.latestRunAt||'Not recorded'),
    ' | Last successful account sync: ',esc(health.latestSuccessAt||'Never recorded'),
    ' | Last Instagram post imported: ',esc(health.lastPostAt||'No posts imported'),'</p>',
    health.failedHandles.length
      ? '<p>Failed handles in latest attempt: '+esc(health.failedHandles.join(', '))+'</p>' : '',
    health.status==='AUTHENTICATION FAILED' || health.status==='TOKEN MISSING'
      ? '<p><b>Action required: Reauthorize Meta Instagram access and update META_IG_ACCESS_TOKEN in the Vercel production environment. Do not send the token by email.</b></p>' : '',
    health.status==='META RATE LIMITED'
      ? '<p><b>Meta rate limit reached. The sync stopped additional lookups; investigate quotas and retry after cooldown.</b></p>' : '',
    '<h3>News Scout activity (previous Arizona day)</h3>',
    '<p>Runs: ',String(scout.runs),' | Post checks (includes repeated checks): ',String(scout.scanned),
    ' | Previously evaluated: ',String(scout.already_evaluated),
    ' | No active-alumni subject: ',String(scout.no_roster_subject),
    ' | Truly unresolved matches: ',String(scout.unresolved),
    ' | AI reviews: ',String(scout.ai_reviewed),
    ' | AI rejected: ',String(scout.ignored),
    ' | Published: ',String(scout.published),
    ' | Failures: ',String(scout.failures),
    ' | AI unavailable: ',String(scout.ai_unavailable),'</p>',
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
    // Health is backed by explicit sync outcome audits; last_polled_at is only an attempt.
    const [syncLatest,syncSuccess,postLatest,sourceCounts,scoutCounts]=await Promise.all([
      query<{created_at:string;details:{attempted?:number;succeeded?:number;failed?:number;stoppedReason?:string|null;failures?:Array<{handle:string;category:string}>}}>(
        "SELECT created_at::text,details FROM fan_activity WHERE firebase_uid='system:instagram-sync' AND action='instagram_sync_run' ORDER BY id DESC LIMIT 1"),
      query<{created_at:string}>(
        "SELECT created_at::text FROM fan_activity WHERE firebase_uid='system:instagram-sync' AND action='instagram_sync_run' AND COALESCE((details->>'succeeded')::int,0)>0 ORDER BY id DESC LIMIT 1"),
      query<{last_post_at:string|null}>(
        "SELECT MAX(ingested_at)::text AS last_post_at FROM social_posts WHERE platform='instagram'"),
      query<{registered:number}>(
        "SELECT COUNT(*)::int AS registered FROM social_sources WHERE platform='instagram' AND status='active'"),
      query<ScoutStats>(boundaries + `
        SELECT COUNT(*)::int AS runs,
          COALESCE(SUM((a.details->>'scanned')::int),0)::int AS scanned,
          COALESCE(SUM((a.details->>'alreadyEvaluated')::int),0)::int AS already_evaluated,
          COALESCE(SUM((a.details->>'unresolved')::int),0)::int AS unresolved,
          COALESCE(SUM((a.details->>'noRosterSubject')::int),0)::int AS no_roster_subject,
          COALESCE(SUM((a.details->>'aiReviewed')::int),0)::int AS ai_reviewed,
          COALESCE(SUM((a.details->>'ignored')::int),0)::int AS ignored,
          COALESCE(SUM((a.details->>'failures')::int),0)::int AS failures,
          COALESCE(SUM((a.details->>'aiUnavailable')::int),0)::int AS ai_unavailable,
          COALESCE(SUM((a.details->>'published')::int),0)::int AS published
        FROM fan_activity a CROSS JOIN bounds b
        WHERE a.firebase_uid='system:social-news-scout' AND a.action='social_news_scout_run'
          AND a.created_at>=b.start_at AND a.created_at<b.end_at`),
    ]);
    const latest=syncLatest.rows[0];
    const raw=latest?.details||{};
    const status=raw.stoppedReason==='auth_invalid'?'AUTHENTICATION FAILED'
      :raw.stoppedReason==='missing_token'?'TOKEN MISSING'
      :raw.stoppedReason==='rate_limited'?'META RATE LIMITED'
      :!latest?'NO SYNC AUDIT AVAILABLE'
      :raw.failed?'PARTIAL SYNC FAILURES':'OPERATIONAL';
    const health:Health={
      status,latestRunAt:latest?.created_at||null,
      latestSuccessAt:syncSuccess.rows[0]?.created_at||null,
      lastPostAt:postLatest.rows[0]?.last_post_at||null,
      registered:sourceCounts.rows[0]?.registered||0,
      attempted:raw.attempted||0,succeeded:raw.succeeded||0,failed:raw.failed||0,
      failedHandles:(raw.failures||[]).map(x=>x.handle+' ('+x.category+')').slice(0,20),
    };
    const scout:ScoutStats=scoutCounts.rows[0]||{
      runs:0,scanned:0,already_evaluated:0,unresolved:0,ai_reviewed:0,published:0,
      no_roster_subject:0,ignored:0,failures:0,ai_unavailable:0,
    };
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
    const result = {date:day,...totals,listLength:stories.rows.length,unresolvedSchools,
      syncStatus:health.status,scoutRuns:scout.runs,scoutAiReviews:scout.ai_reviewed,
      scoutIgnored:scout.ignored,scoutNoRosterSubject:scout.no_roster_subject,scoutFailures:scout.failures,scoutAiUnavailable:scout.ai_unavailable};
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
        ' (' + totals.posted + ' posted)' +
        (health.status==='AUTHENTICATION FAILED' || health.status==='TOKEN MISSING' ? ' — ACTION REQUIRED' : ''),
      emailHtml(day,totals,stories.rows,schoolOrigins,health,scout));
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
