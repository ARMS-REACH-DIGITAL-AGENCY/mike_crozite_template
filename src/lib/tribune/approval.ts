import { query } from '@/lib/db';
import { TOURNAMENT_2027 } from '@/lib/bracket/tournamentCalendar';
import { TRIBUNE_LAYOUT_VERSION, type TribuneEdition } from './types';

export type TribuneApproval = {
  approved: boolean;
  reason: 'approved' | 'awaiting_layout_approval' | 'layout_version_mismatch' | 'approval_unavailable';
};

/** Missing schema, missing row, disabled control and version drift all hold mail. */
export async function getTribuneApproval(): Promise<TribuneApproval> {
  try {
    const row = (await query<{ enabled: boolean; approved_layout_version: string | null }>(
      'SELECT enabled, approved_layout_version FROM public.alumni_newsletter_control WHERE singleton = true',
    )).rows[0];
    if (!row?.enabled || !row.approved_layout_version) return { approved: false, reason: 'awaiting_layout_approval' };
    if (row.approved_layout_version !== TRIBUNE_LAYOUT_VERSION) return { approved: false, reason: 'layout_version_mismatch' };
    return { approved: true, reason: 'approved' };
  } catch {
    console.error('[tribune] Approval control could not be read; delivery held.');
    return { approved: false, reason: 'approval_unavailable' };
  }
}

function httpsUrl(value?: string): boolean {
  if (!value) return false;
  try { return new URL(value).protocol === 'https:'; } catch { return false; }
}

/** A preview can show reserved spaces; outbound issues must be complete. */
export function tribuneReadinessProblems(edition: TribuneEdition, options: { requireArchive?: boolean } = {}): string[] {
  const problems: string[] = [];
  if (edition.preview || edition.dataStatus === 'illustrative') problems.push('preview_edition');
  if (edition.dataStatus !== 'verified') problems.push('stats_unavailable');
  if (!edition.homeRoster.playerCount) problems.push('empty_home_roster');
  // Evaluate the reported period, not the delivery clock: Monday's recap of
  // the final tournament week still needs its result after the season ends.
  const reportsTournamentPlay = edition.period.end >= TOURNAMENT_2027.start && edition.period.start <= TOURNAMENT_2027.end;
  if (reportsTournamentPlay && (!edition.matchup || edition.matchup.status === 'unavailable')) problems.push('missing_tournament_matchup');
  if (!httpsUrl(edition.links.hub) || !httpsUrl(edition.links.tournament) || !httpsUrl(edition.links.share)) problems.push('missing_public_links');
  if (!httpsUrl(edition.links.preferences) || !httpsUrl(edition.links.unsubscribe)) problems.push('missing_preference_links');
  if (options.requireArchive !== false && (!httpsUrl(edition.links.web) || !httpsUrl(edition.links.text))) problems.push('missing_edition_links');
  if (!httpsUrl(edition.links.officialRules)) problems.push('missing_official_rules');
  if (!edition.sender?.postalAddress.trim()) problems.push('missing_sender_address');
  return problems;
}
