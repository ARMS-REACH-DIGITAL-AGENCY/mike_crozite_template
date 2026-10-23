import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/tribune/db';
import { lookupGHLContactByEmail } from '@/lib/gohighlevel';
import { sendDailyPilotEmail } from '@/lib/alumniEmailSender';
import { buildTribuneEdition, getTribuneFan } from '@/lib/tribune/build';
import { getTribuneApproval, tribuneReadinessProblems } from '@/lib/tribune/approval';
import {
  getTribunePilotAudience, dueTribunePeriod, getTribunePreferences,
  tribuneReportingPeriod, validReportDate, type TribunePeriod, type TribunePreferences,
} from '@/lib/tribune/preferences';
import { renderTribuneHtml, renderTribuneText, tribuneSubject } from '@/lib/tribune/render';
import { storeTribuneEdition } from '@/lib/tribune/archive';
import { TRIBUNE_LAYOUT_VERSION } from '@/lib/tribune/types';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

/** Preview by default. The existing pilot allowlist is never expanded here. */
export async function POST(request: NextRequest) {
  if (!process.env.CRON_SECRET || request.headers.get('authorization') !== 'Bearer ' + process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const pilot = getTribunePilotAudience();
  if (!pilot.configured) return NextResponse.json({ status: 'held_for_pilot_configuration', reason: pilot.reason });
  const allowlist = new Set(pilot.emails);
  const body = await request.json().catch(() => null);
  const date: unknown = body?.date, emails: unknown = body?.emails;
  if (!validReportDate(date) || !Array.isArray(emails) || !emails.length || emails.length > allowlist.size || emails.some((email) => typeof email !== 'string' || !allowlist.has(email.trim().toLowerCase()))) {
    return NextResponse.json({ error: 'Invalid date or pilot recipients' }, { status: 400 });
  }
  const recipients = [...new Set((emails as string[]).map((email) => email.trim().toLowerCase()))];
  const send = body?.send === true;
  if (send) {
    const approval = await getTribuneApproval();
    if (!approval.approved) return NextResponse.json({ date, result: recipients.map((email) => ({ email, status: 'held_for_approval', reason: approval.reason })) });
    if (process.env.YATSTATS_SENDING_DOMAIN_VERIFIED !== 'true') {
      return NextResponse.json({ date, result: recipients.map((email) => ({ email, status: 'blocked_unverified_sending_domain' })) });
    }
  }

  const result: Array<Record<string, unknown>> = [];
  for (const email of recipients) {
    try {
      const fan = await getTribuneFan(email);
      if (!fan?.home_hsid) { result.push({ email, status: 'missing_profile' }); continue; }
      let preferences: TribunePreferences | null = null;
      try { preferences = await getTribunePreferences(fan.firebase_uid); }
      catch { if (send) { result.push({ email, status: 'preferences_unavailable' }); continue; } }
      if (send && !preferences) { result.push({ email, status: 'missing_preferences' }); continue; }
      if (send && !preferences?.subscribed) { result.push({ email, status: 'unsubscribed' }); continue; }
      const cadence = !send && body?.previewCadence === 'weekly' ? 'weekly' : !send && body?.previewCadence === 'daily' ? 'daily' : preferences?.cadence || 'daily';
      const period: TribunePeriod | null = send ? dueTribunePeriod(cadence) : tribuneReportingPeriod(cadence, date);
      if (!period || (send && period.end !== date)) { result.push({ email, status: 'not_due' }); continue; }

      const built = await buildTribuneEdition({ request, fan, period, preview: !send });
      let edition = built.edition;
      const statLineCount = built.statLineCount;
      const school = edition.school.name;
      const counts = { homePlayers: edition.homeRoster.playerCount, favorites: edition.follows?.playerCount || 0, statLines: statLineCount };
      if (!send) {
        result.push({ email, status: 'preview', school, ...counts, period,
          subject: tribuneSubject(edition), html: renderTribuneHtml(edition), text: renderTribuneText(edition),
          readiness: tribuneReadinessProblems({ ...edition, preview: false }, { requireArchive: false }) });
        continue;
      }
      const problems = tribuneReadinessProblems(edition, { requireArchive: false });
      if (problems.length) { result.push({ email, status: 'held_incomplete_edition', problems }); continue; }
      const contactId = await lookupGHLContactByEmail(email);
      if (!contactId) { result.push({ email, status: 'missing_arms_contact' }); continue; }
      edition = await storeTribuneEdition(edition, fan.firebase_uid);
      const archivedProblems = tribuneReadinessProblems(edition);
      if (archivedProblems.length) { result.push({ email, status: 'held_incomplete_edition', problems: archivedProblems }); continue; }
      // Re-read a possible unsubscribe/cadence change made while the issue was
      // prepared. The DB trigger independently checks approval at claim time.
      const latest = await getTribunePreferences(fan.firebase_uid);
      const approval = await getTribuneApproval();
      if (!approval.approved) { result.push({ email, status: 'held_for_approval', reason: approval.reason }); continue; }
      if (!latest?.subscribed) { result.push({ email, status: 'unsubscribed' }); continue; }
      if (latest.cadence !== period.cadence) { result.push({ email, status: 'preferences_changed' }); continue; }
      const claim = await query(
        `INSERT INTO tribune_private.alumni_daily_email_delivery
          (report_date,recipient_email,status,school_name,home_player_count,favorite_count,game_stat_count,template_version)
         VALUES ($1::date,$2,'sending',$3,$4,$5,$6,$7)
         ON CONFLICT (report_date,recipient_email) DO NOTHING RETURNING recipient_email`,
        [period.end, email, school, counts.homePlayers, counts.favorites, statLineCount, TRIBUNE_LAYOUT_VERSION],
      );
      if (!claim.rowCount) {
        const stillApproved = await getTribuneApproval();
        result.push({ email, status: stillApproved.approved ? 'previously_attempted' : 'held_for_approval', school });
        continue;
      }
      const sent = await sendDailyPilotEmail(contactId, tribuneSubject(edition), renderTribuneHtml(edition), renderTribuneText(edition), latest.format);
      await query(
        'UPDATE tribune_private.alumni_daily_email_delivery SET status=$3,error_detail=$4,updated_at=now() WHERE report_date=$1::date AND recipient_email=$2',
        [period.end, email, sent ? 'queued' : 'failed', sent ? null : 'HighLevel rejected or could not accept email'],
      );
      result.push({ email, status: sent ? 'queued' : 'send_failed', school, ...counts, period, format: latest.format });
    } catch (error) {
      console.error('[tribune] Pilot preparation failed', { code: (error as { code?: string })?.code || 'PREPARATION_FAILED' });
      result.push({ email, status: 'error', error: 'Newsletter preparation failed; no new delivery was confirmed.' });
    }
  }
  return NextResponse.json({ date, result });
}
