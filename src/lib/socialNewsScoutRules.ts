// Shared, deterministic first-pass social news detector.
// Meta's API supplies professional-account posts; this module never scrapes
// home feeds, private profiles, follower lists or Instagram Stories.
export type ScoutKind = 'college_commitment' | 'decommitment' | 'transfer_portal' | 'draft_selection';

export type ScoutSignal = {
  kind: ScoutKind;
  confidence: number;
  clue: string;
};

export function canonicalInstagramPostUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !['instagram.com', 'www.instagram.com'].includes(url.hostname.toLowerCase())) {
      return null;
    }
    const match = url.pathname.match(/^\/(p|reel)\/([A-Za-z0-9_-]{5,32})\/?$/);
    if (!match) return null;
    return `https://www.instagram.com/${match[1]}/${match[2]}/`;
  } catch {
    return null;
  }
}

export function instagramPostKey(value: string): string | null {
  const url = canonicalInstagramPostUrl(value);
  return url ? new URL(url).pathname.split('/')[2] : null;
}

export function classifySocialNewsCaption(raw: string): ScoutSignal | null {
  const caption = raw.replace(/\s+/g, ' ').trim();
  if (!caption) return null;

  // Negative recruiting statements must not be mistaken for commitments.
  // A separate clear positive assertion may still override "uncommitted".
  const decommit = /\b(?:decommitt?ed|decommitment|decommitting|reopen(?:ing|ed)? (?:my|his|her|their) recruitment)\b/i;
  if (decommit.test(caption)) return { kind: 'decommitment', confidence: 0.92, clue: 'decommitment' };

  const commitment = /\b(?:commit(?:ted|ting) to|my commitment to|(?:his|her|their) commitment to|(?:announc(?:e|ing|ed) (?:my|his|her|their|the) commitment)|(?:officially|verbally) committed|(?:signed|signing) (?:with|to) (?:[\w ]+ (?:university|college|baseball)))/i;
  if (commitment.test(caption)) {
    return { kind: 'college_commitment', confidence: 0.86, clue: 'explicit commitment language' };
  }

  const portal = /\b(?:enter(?:ed|ing)? (?:the|my) transfer portal|in (?:the|my) transfer portal|transfer(?:ring|red)? to)\b/i;
  if (portal.test(caption)) return { kind: 'transfer_portal', confidence: 0.83, clue: 'transfer announcement language' };

  const draft = /\b(?:drafted by|selected by [\w .'-]+ in the (?:mlb|baseball) draft|selected in the (?:mlb|baseball) draft)\b/i;
  if (draft.test(caption)) return { kind: 'draft_selection', confidence: 0.86, clue: 'draft announcement language' };

  // "Uncommitted", "official visit", "college baseball", and generic
  // motivational uses of "committed" aren't announcement evidence.
  return null;
}

export function socialNewsHeadline(name: string, kind: ScoutKind): string {
  switch (kind) {
    case 'college_commitment': return `${name} announces college commitment`;
    case 'decommitment': return `${name} announces recruiting change`;
    case 'transfer_portal': return `${name} shares transfer update`;
    case 'draft_selection': return `${name} shares draft news`;
  }
}
