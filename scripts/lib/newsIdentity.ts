// scripts/lib/newsIdentity.ts
// Precision-first identity resolver for Alumni News.
// Discovery sources may nominate candidates; only this resolver decides whether
// a candidate is safe to publish for a YAT?STATS player.

export type NewsIdentityContext = {
  playerid: string;
  firstname: string;
  lastname: string;
  hsid: string;
  highSchool?: string | null;
  classOf?: string | null;
  position?: string | null;
  currentTeam?: string | null;
  currentOrg?: string | null;
  currentLevel?: string | null;
  collegePath?: string | null;
};

export type NewsCandidate = {
  title?: string | null;
  text?: string | null;
  summary?: string | null;
  source?: string | null;
};

export type VerificationResult = {
  status: "VERIFIED" | "REVIEW" | "REJECTED";
  score: number;
  reason: string;
  playerRelevance: "PRIMARY" | "SECONDARY" | "MENTION";
  newsworthiness: "FEATURED" | "NORMAL" | "LOW";
  evidence: {
    exactName: boolean;
    nameInHeadline: boolean;
    anchors: string[];
    contradictions: string[];
    nameMentions: number;
  };
};

const OTHER_SPORT =
  /\b(football|touchdown|quarterback|running back|wide receiver|tight end|linebacker|nfl|basketball|nba|hockey|nhl|soccer|volleyball|lacrosse)\b/i;
const BASEBALL =
  /\b(baseball|mlb|milb|minor league|pitch(?:er|ed|ing)?|inning|homer(?:ed|s)?|home run|rbi|strikeouts?|shortstop|outfielder|infielder|catcher|dugout|bullpen|triple-a|double-a|single-a|draft)\b/i;

function norm(value: unknown): string {
  return String(value || "")
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[^a-z0-9' ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function containsPhrase(haystack: string, phrase: string | null | undefined): boolean {
  const p = norm(phrase);
  if (!p || p.length < 3) return false;
  return haystack.includes(p);
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

export function verifyNewsIdentity(
  candidate: NewsCandidate,
  player: NewsIdentityContext
): VerificationResult {
  const fullName = norm(`${player.firstname} ${player.lastname}`);
  const title = norm(candidate.title);
  const body = norm([candidate.summary, candidate.text].filter(Boolean).join(" "));
  const allText = `${title} ${body}`.trim();

  const exactName = !!fullName && allText.includes(fullName);
  const nameInHeadline = !!fullName && title.includes(fullName);
  const nameMentions = fullName
    ? allText.split(fullName).length - 1
    : 0;

  if (!exactName) {
    return {
      status: "REJECTED",
      score: 0,
      reason: "Exact full player name is not present in the article.",
      playerRelevance: "MENTION",
      newsworthiness: "LOW",
      evidence: { exactName, nameInHeadline, anchors: [], contradictions: ["missing exact full name"], nameMentions },
    };
  }

  // High school is useful context, but it is deliberately NOT a strong
  // autonomous identity anchor: a Hamilton-area story can mention Hamilton
  // without proving that a common-name person is our alumnus.
  const anchorCandidates = [
    ["current team", player.currentTeam],
    ["current organization/conference", player.currentOrg],
    ...String(player.collegePath || "")
      .split(";")
      .map((v) => ["career team", v.trim()] as const),
  ] as Array<readonly [string, string | null | undefined]>;

  const anchors = unique(
    anchorCandidates
      .filter(([, value]) => containsPhrase(allText, value))
      .map(([label, value]) => `${label}: ${String(value).trim()}`)
  );

  const contradictions: string[] = [];
  const nameIndex = allText.indexOf(fullName);
  const localContext =
    nameIndex >= 0
      ? allText.slice(Math.max(0, nameIndex - 260), nameIndex + fullName.length + 420)
      : allText.slice(0, 700);

  if (OTHER_SPORT.test(localContext) && !anchors.length) {
    contradictions.push("different sport appears in the context around the player name");
  }

  // If the story is not even baseball-adjacent and lacks a known identity
  // anchor, it is not safe to treat as this baseball alumnus.
  if (!BASEBALL.test(allText) && !anchors.length) {
    contradictions.push("no baseball context and no known team/career anchor");
  }

  if (contradictions.length) {
    return {
      status: "REJECTED",
      score: 0.05,
      reason: contradictions.join("; "),
      playerRelevance: nameInHeadline ? "PRIMARY" : "MENTION",
      newsworthiness: "LOW",
      evidence: { exactName, nameInHeadline, anchors, contradictions, nameMentions },
    };
  }

  const playerRelevance =
    nameInHeadline ? "PRIMARY" : nameMentions >= 2 ? "SECONDARY" : "MENTION";

  // Precision-first rule: exact name + at least one YAT?STATS-known identity
  // anchor is required for autonomous publication. Exact-name-only results
  // remain REVIEW, which is intentional for common-name players.
  if (anchors.length >= 1) {
    const score = Math.min(0.99, 0.90 + Math.min(anchors.length, 3) * 0.03 + (nameInHeadline ? 0.02 : 0));
    return {
      status: "VERIFIED",
      score,
      reason: `Exact name plus known identity anchor(s): ${anchors.join(", ")}`,
      playerRelevance,
      newsworthiness: playerRelevance === "PRIMARY" ? "FEATURED" : "NORMAL",
      evidence: { exactName, nameInHeadline, anchors, contradictions, nameMentions },
    };
  }

  return {
    status: "REVIEW",
    score: nameInHeadline ? 0.72 : 0.58,
    reason: "Exact name found, but no YAT?STATS-known team, organization, school, or career anchor confirmed identity.",
    playerRelevance,
    newsworthiness: playerRelevance === "MENTION" ? "LOW" : "NORMAL",
    evidence: { exactName, nameInHeadline, anchors, contradictions, nameMentions },
  };
}
