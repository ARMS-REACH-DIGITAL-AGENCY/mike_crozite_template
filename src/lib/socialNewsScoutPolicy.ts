// Pure, school-agnostic safeguards for automatic Instagram news publishing.
export const SCOUT_POLICY_VERSION = '3';
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
    'injury' | 'feature' | 'other';
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
    const owner = post.owner_type === 'player' && post.playerid === player.playerid;
    const tagged = (player.handles || []).some(h => mentions.includes(h.toLowerCase()));
    const fullName = (player.first_name + ' ' + player.last_name).toLowerCase()
      .replace(/[^a-z0-9]+/g,' ').trim();
    const named = fullName.length > 5 && words.includes(' ' + fullName + ' ');
    return owner || tagged || named;
  });
}
export function approvedNews(decision: ScoutDecision, candidates: ScoutPlayer[]): boolean {
  return Boolean(
    candidates.some(player => player.playerid === decision.subject_playerid) &&
    decision.decision === 'publish' && decision.family_safe &&
    !decision.duplicate && decision.category !== 'other' &&
    Number.isFinite(decision.confidence) && decision.confidence >= 0.9 &&
    decision.headline.trim().length >= 12 &&
    decision.summary.trim().length >= 20 &&
    decision.evidence.trim().length >= 12
  );
}
export function scoutHeadline(player: ScoutPlayer, raw: string): string {
  const name = (player.first_name + ' ' + player.last_name).trim();
  const clean = raw.replace(/[\r\n<>]/g,' ').replace(/\s+/g,' ').trim().slice(0,150);
  return clean.toLowerCase().includes(name.toLowerCase())
    ? clean : (name + ': ' + clean).slice(0,170);
}
