// Pure, school-agnostic safeguards for automatic Instagram news publishing.
export const SCOUT_POLICY_VERSION = '5';
export const SCOUT_WINDOW_DAYS = 7;
export const SCOUT_ACTIVE_STATUSES = [
  'ACTIVE', 'INJURED - FULL SEASON', 'INJURED 60-DAY',
  'RED SHIRT', 'REDSHIRT-MEDICAL', 'FREE AGENT'
] as const;

export type ScoutPlayer = {
  hsid: string;
  playerid: string;
  first_name: string;
  last_name: string;
  current_team_name: string | null;
  status_label: string;
  handles: string[];
};
export type ScoutPost = {
  id: string;
  hsid: string;
  playerid: string | null;
  owner_type: string;
  authorization_type?: string;
  handle: string;
  permalink: string;
  caption: string;
  published_at: string | null;
  thumbnail_url: string | null;
};
export type ScoutDecision = {
  decision: 'publish' | 'ignore';
  subject_playerid: string;
  category: 'commitment' | 'transfer' | 'signing' | 'draft' |
    'promotion' | 'award' | 'milestone' | 'performance' |
    'injury' | 'feature' | 'league_status' | 'other';
  confidence: number;
  headline: string;
  summary: string;
  evidence: string;
  reason: string;
  family_safe: boolean;
  duplicate: boolean;
};
export function postIsFresh(date: string | null, now = Date.now()): boolean {
  if (!date) return false;
  const timestamp = new Date(date).getTime();
  return Number.isFinite(timestamp) &&
    timestamp >= now - SCOUT_WINDOW_DAYS * 86400000 &&
    timestamp <= now + 5 * 60000;
}
// An account curated as a team/school/league source can be associated with a
// player for the Social tab, but it is NOT a personal announcement from him.
// Never infer the speaker from playerid for these registered sources.
export function sourceIsPlayerOwned(ownerType: string, authorizationType?: string): boolean {
  const provenance=String(authorizationType || '').toLowerCase();
  return ownerType === 'player' &&
    !/(team|school|club|organization|league)_account/.test(provenance);
}

export function findAlumniCandidates(post: ScoutPost, roster: ScoutPlayer[]): ScoutPlayer[] {
  const caption = String(post.caption || '');
  const mentions = [...caption.matchAll(/(?:^|[^A-Za-z0-9_.])@([A-Za-z0-9._]{2,30})/g)]
    .map(item => item[1].toLowerCase());
  // Match complete names only; a surname or first name alone is insufficient.
  const words = ' ' + caption.toLowerCase().replace(/[^a-z0-9]+/g,' ').trim() + ' ';
  return roster.filter(player => {
    if (player.hsid !== post.hsid ||
        !SCOUT_ACTIVE_STATUSES.includes(player.status_label as typeof SCOUT_ACTIVE_STATUSES[number]))
      return false;
    const owner = sourceIsPlayerOwned(post.owner_type, post.authorization_type) && post.playerid === player.playerid;
    const tagged = (player.handles || []).some(h => mentions.includes(h.toLowerCase()));
    const fullName = (player.first_name + ' ' + player.last_name).toLowerCase()
      .replace(/[^a-z0-9]+/g,' ').trim();
    const named = fullName.length > 5 && words.includes(' ' + fullName + ' ');
    return owner || tagged || named;
  });
}
// One transparent reason for every rejected potential story. The daily report
// can distinguish an actual AI rejection from a separate publication gate.
// Do not treat a model's general confidence score as a fact-check of a
// player's first-person statement. A lower confidence lane is allowed only
// when the registered player is clearly speaking and the evidence is an
// exact excerpt of the collected caption, not inferred from a video.
const DIRECT_CAREER_EVENTS = new Set([
  'commitment', 'transfer', 'signing', 'draft', 'promotion', 'injury', 'league_status'
]);
const normalizedExcerpt = (value: string) =>
  String(value || '').normalize('NFKC').replace(/\s+/g,' ').trim().toLowerCase();

export function verifiedDirectCareerStatement(
  decision: ScoutDecision, post: ScoutPost | undefined
): boolean {
  if (!post || !sourceIsPlayerOwned(post.owner_type,post.authorization_type) ||
      post.playerid !== decision.subject_playerid ||
      !DIRECT_CAREER_EVENTS.has(decision.category)) return false;
  const caption=normalizedExcerpt(post.caption);
  const evidence=normalizedExcerpt(decision.evidence);
  if (evidence.length < 20 || !caption.includes(evidence)) return false;
  if (!/\b(?:i|my|me|i've|i'm|i'd)\b/i.test(caption)) return false;
  // Claims about league restrictions must remain attributed to the player.
  if (decision.category === 'league_status' &&
      !/\b(?:says|states|reports|announces|according to)\b/i.test(decision.headline))
    return false;
  return true;
}

export function newsApprovalIssue(decision: ScoutDecision, candidates: ScoutPlayer[], post?: ScoutPost): string | null {
  if (decision.decision !== 'publish') return 'ai_ignored';
  if (!candidates.some(player => player.playerid === decision.subject_playerid))
    return 'unverified_player_subject';
  if (!decision.family_safe) return 'family_safety';
  if (decision.duplicate) return 'already_reported';
  if (decision.category === 'other') return 'no_news_category';
  const minimumConfidence = verifiedDirectCareerStatement(decision,post) ? 0.8 : 0.9;
  if (!Number.isFinite(decision.confidence) || decision.confidence < minimumConfidence)
    return 'insufficient_confidence';
  if (decision.headline.trim().length < 12) return 'missing_headline';
  if (decision.summary.trim().length < 20) return 'insufficient_summary';
  if (decision.evidence.trim().length < 12) return 'insufficient_source_evidence';
  return null;
}
export function approvedNews(decision: ScoutDecision, candidates: ScoutPlayer[], post?: ScoutPost): boolean {
  return newsApprovalIssue(decision, candidates, post) === null;
}
export function scoutHeadline(player: ScoutPlayer, raw: string): string {
  const name = (player.first_name + ' ' + player.last_name).trim();
  const clean = raw.replace(/[\r\n<>]/g,' ').replace(/\s+/g,' ').trim().slice(0,150);
  return clean.toLowerCase().includes(name.toLowerCase())
    ? clean : (name + ': ' + clean).slice(0,170);
}
