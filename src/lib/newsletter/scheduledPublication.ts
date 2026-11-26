import type { Pool } from 'pg';
import {
  publishDaily, publishWeekly, verifyPublicationDatabase, type PublishOptions,
} from '../../../scripts/newsletter-publish';
import { readFinishedEdition, renderFinishedEdition, type Cadence, type RenderedEdition, type NewsletterPreferenceLoader } from './finishedPublication';

const DAY = 86400000;
export const publicationDayAfter = (day: string, offset = 1) =>
  new Date(Date.parse(day + 'T00:00:00Z') + offset * DAY).toISOString().slice(0, 10);

export function newsletterPeriods(day: string): Array<{ cadence: Cadence; date: string }> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(Date.parse(day + 'T00:00:00Z')) || publicationDayAfter(day, 0) !== day) {
    throw new Error('A valid newsletter reporting day is required');
  }
  const periods: Array<{ cadence: Cadence; date: string }> = [{ cadence: 'daily', date: day }];
  if (new Date(day + 'T00:00:00Z').getUTCDay() === 0) periods.push({ cadence: 'weekly', date: publicationDayAfter(day, -6) });
  return periods;
}

export type NewsletterDayOptions = Omit<PublishOptions, 'cutoffAt'> & {
  day: string; base: string; now?: Date; request?: typeof fetch;
};
export type ScoreAtCutoff = (pool: Pool, options: {
  asof: string; base: string; seasonKey: string; effectiveAt: string;
  withBox: boolean; request?: typeof fetch;
}) => Promise<{ seasons: Array<{ passes: Array<{ decisions: unknown[] }> }> }>;

/**
 * Shared daily boundary for the live cron and isolated historical rehearsal.
 * Scoring runs through the regular bracket job before the immutable edition is
 * published. This function does not select recipients or send email.
 */
export async function publishNewsletterDay(pool: Pool, opts: NewsletterDayOptions, score: ScoreAtCutoff) {
  const periods = newsletterPeriods(opts.day);
  const cutoffAt = publicationDayAfter(opts.day) + 'T11:00:00.000Z';
  if (opts.publicationTarget === 'live' && Date.parse(cutoffAt) > (opts.now || new Date()).getTime()) {
    throw new Error('The newsletter reporting day has not reached its 4 a.m. cutoff');
  }
  const publisher = { ...opts, cutoffAt };
  await verifyPublicationDatabase(pool, publisher);
  // An already published day must be read again without rewinding scoring.
  const { rows: ready } = await pool.query<{ cadence: Cadence; period_start: string }>(
    'SELECT cadence,period_start::text FROM public.edition_ready WHERE season_key=$1 AND ((cadence=\'daily\' AND period_start=$2::date) OR (cadence=\'weekly\' AND period_start=$3::date))',
    [opts.season, opts.day, periods.find(p => p.cadence === 'weekly')?.date || null],
  );
  const allReady = periods.every(period => ready.some(row => row.cadence === period.cadence && row.period_start === period.date));
  let scoring: Awaited<ReturnType<ScoreAtCutoff>> | undefined;
  if (!allReady) {
    const { rows: [future] } = await pool.query<{ count: number }>(
      'SELECT count(*)::int AS count FROM public.master_bracket WHERE season_key=$1 AND computed_at>$2::timestamptz',
      [opts.season, cutoffAt],
    );
    if (Number(future?.count) > 0) throw new Error('Later bracket results exist; publication cannot rewind the saved tournament');
    scoring = await score(pool, { asof: publicationDayAfter(opts.day), base: opts.base, seasonKey: opts.season,
      effectiveAt: cutoffAt, withBox: true, request: opts.request });
    if (scoring.seasons.some(season => season.passes.some(pass => pass.decisions.length > 0))) {
      throw new Error('Unresolved bracket decisions block newsletter publication');
    }
  }
  const publications = [];
  for (const period of periods) {
    publications.push(period.cadence === 'daily'
      ? await publishDaily(pool, { ...publisher, date: period.date })
      : await publishWeekly(pool, { ...publisher, periodStart: period.date }));
  }
  return { day: opts.day, cutoffAt, periods, scoring, publications };
}

/** The live sender and rehearsal archive use the same finished-row reader. */
export async function readNewsletterReview(pool: Pool, request: {
  cadence: Cadence; date: string; email: string; seasonKey: string; baseUrl?: string; firebaseUid?: string; reviewBaseUrl?: string;
}, loadPreferences?: NewsletterPreferenceLoader) {
  const db = await pool.connect();
  try {
    await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const facts = await readFinishedEdition(db, request, loadPreferences);
    let baseUrl = request.baseUrl;
    if (!baseUrl && request.reviewBaseUrl) {
      const url = new URL('/' + facts.recipient.home_hsid, request.reviewBaseUrl);
      url.hash = 'sec-fantasy';
      baseUrl = url.toString();
    }
    if (!baseUrl) {
      const { rows: [school] } = await db.query<{ microsite_url: string | null }>(
        'SELECT microsite_url FROM public.school_success WHERE hsid::text=$1', [String(facts.recipient.home_hsid)],
      );
      baseUrl = school?.microsite_url || undefined;
    }
    const rendered = renderFinishedEdition(facts, baseUrl ? { baseUrl } : {});
    await db.query('COMMIT');
    return rendered;
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  } finally {
    db.release();
  }
}

export type NewsletterDelivery = {
  lookupContact: (email: string) => Promise<string | null>;
  send: (contact: string, edition: RenderedEdition, format: 'html' | 'text') => Promise<boolean>;
  domainVerified: boolean;
};

/** Existing send approval, recipient preference and claim gates remain final. */
export async function deliverNewsletterEdition(pool: Pool, edition: RenderedEdition, delivery: NewsletterDelivery) {
  const email = String(edition.facts.recipient.email).trim().toLowerCase();
  const cadence = edition.facts.ready.cadence as Cadence;
  if (!['daily', 'weekly'].includes(cadence)) throw new Error('Unsupported newsletter delivery cadence');
  // Fixed identifiers only. Preserve the existing daily claim key and keep
  // Gazette delivery separate without changing the deployed pilot's contract.
  const table = cadence === 'daily' ? 'alumni_daily_email_delivery' : 'alumni_weekly_email_delivery';
  const date = String(edition.facts.ready.period_start).slice(0, 10);
  // Every registered Fan and SuperFan was promised both the Daily Digest and the
  // Weekly Gazette (Pete, Nov 25 2026): no preference row means both, as HTML. A row
  // keeps its format; a row marked unsubscribed stops both (an unsubscribe is honored).
  const { rows: recipients } = await pool.query<{ firebase_uid: string }>(
    'SELECT firebase_uid FROM public.newsletter_recipients WHERE lower(email)=$1', [email],
  );
  if (recipients.length !== 1) return { email, cadence, status: 'not_a_registered_fan' };
  const { rows: preferences } = await pool.query<{ cadence: string; format: string; subscribed: boolean }>(
    'SELECT cadence,format,subscribed FROM public.alumni_newsletter_preferences WHERE firebase_uid=$1', [recipients[0].firebase_uid],
  );
  if (preferences.length > 1) return { email, cadence, status: 'ambiguous_preferences' };
  const pref = preferences[0] || { cadence, format: 'html', subscribed: true };
  if (!pref.subscribed) return { email, cadence, status: 'not_subscribed' };
  if (!['html', 'text'].includes(pref.format)) return { email, cadence, status: 'unsupported_format' };
  const { rows: controls } = await pool.query<{ enabled: boolean; approved_layout_version: string | null }>(
    'SELECT enabled,approved_layout_version FROM public.alumni_newsletter_control',
  );
  // The send switch approves each layout by name; several may be approved at once
  // (the Digest's and the Gazette's), separated by commas.
  const approved = String(controls[0]?.approved_layout_version || '').split(',').map(v => v.trim()).filter(Boolean);
  if (controls.length !== 1 || !controls[0].enabled || !approved.includes(edition.layoutVersion)) {
    return { email, cadence, status: 'blocked_newsletter_control' };
  }
  if (!delivery.domainVerified) return { email, cadence, status: 'blocked_unverified_sending_domain' };
  const contact = await delivery.lookupContact(email);
  if (!contact) return { email, cadence, status: 'missing_arms_contact' };
  const home = String(edition.facts.recipient.home_hsid);
  const homePlayers = cadence === 'weekly' ? edition.facts.rows.weekly_player_lines.length
    : edition.facts.rows.daily_stat_lines.filter(row => String(row.hsid) === home).length;
  const claim = await pool.query(
    `INSERT INTO public.${table}
      (report_date,recipient_email,status,school_name,home_player_count,favorite_count,game_stat_count,template_version,content_hash)
     VALUES ($1::date,$2,'sending',$3,$4,$5,$6,$7,$8)
     ON CONFLICT (report_date,recipient_email) DO NOTHING RETURNING recipient_email`,
    [date, email, edition.facts.recipient.home_school_name, homePlayers, edition.facts.selection.favorites.length,
      cadence === 'daily' ? edition.facts.rows.daily_stat_lines.length : edition.facts.rows.weekly_player_lines.length,
      edition.layoutVersion, edition.hashes.content],
  );
  if (!claim.rowCount) {
    const { rows: [prior] } = await pool.query<{ status: string }>(
      `SELECT status FROM public.${table} WHERE report_date=$1::date AND recipient_email=$2`, [date, email],
    );
    return { email, cadence, status: prior?.status === 'queued' ? 'previously_queued' : 'blocked_prior_attempt' };
  }
  // A failed or ambiguous attempt is never automatically claimed again.
  let accepted = false;
  try {
    accepted = await delivery.send(contact, edition, pref.format as 'html' | 'text');
  } catch {
    await pool.query(
      `UPDATE public.${table} SET status='failed',error_detail='Delivery outcome unknown; manual review required',updated_at=now() WHERE report_date=$1::date AND recipient_email=$2`,
      [date, email],
    );
    return { email, cadence, status: 'send_outcome_unknown' };
  }
  await pool.query(
    `UPDATE public.${table} SET status=$3,error_detail=$4,updated_at=now() WHERE report_date=$1::date AND recipient_email=$2`,
    [date, email, accepted ? 'queued' : 'failed', accepted ? null : 'HighLevel did not accept email'],
  );
  return { email, cadence, status: accepted ? 'queued' : 'send_failed' };
}
