// Shared, deterministic, credit-aware discovery planning for the Webz.io
// News API. This module is pure: no API calls, secrets, or database writes.
//
// Webz.io searches the open news index. These clauses do not restrict source
// domains. Quoted player names stay mandatory; known CURRENT affiliations may
// recover news whose article body never uses the word "baseball".

export const WEBZ_PLAN_VERSION = "v2-player-context-and-fairness";
export const WEBZ_BASEBALL_TERMS = [
  "baseball", "MLB", "MiLB", "minor league", "minor leagues",
  "Triple-A", "Double-A", "Class-A", "shortstop", "second baseman",
  "pitcher", "catcher", "outfielder", "infield", "innings",
  "spring training", "home run", "draft", "call-up", "promoted",
  "Arizona Fall League",
];
export const WEBZ_EXCLUSIONS = [
  "fantasy", "betting", "sportsbook", "promo code", "best bets",
  "prop bets", "PrizePicks", "DFS",
];

function cleanLiteral(value) {
  return String(value || "")
    .replace(/["\\()[\]{}<>:]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 95);
}

function phrase(value) {
  const safe = cleanLiteral(value);
  return safe ? '"' + safe + '"' : "";
}

function fullName(player) {
  return [player.firstname, player.lastname].map((part) => cleanLiteral(part))
    .filter(Boolean).join(" ");
}

function distinct(values) {
  return [...new Set(values.filter(Boolean))];
}

function meaningfulCurrentAffiliations(player) {
  const team = cleanLiteral(player.current_team);
  const org = cleanLiteral(player.current_org);
  const out = [];
  // No unanchored city or vague organization clauses; current team names
  // are exact and associated with that individual player.
  if (team && (team.split(" ").length >= 2 || (team.length >= 5 && /^[A-Z]{3,}$/.test(team)))) {
    out.push(team);
  }
  if (org && org !== team && org.length >= 6 &&
      !/^(New York|Los Angeles|Chicago|Arizona|California|Florida|Texas)$/i.test(org)) {
    out.push(org);
  }
  return distinct(out).slice(0, 2);
}

export function buildWebzNewsQuery(players) {
  if (!Array.isArray(players) || players.length < 1 || players.length > 8) {
    throw new Error("Webz.io discovery query requires 1-8 roster-backed players.");
  }
  const names = distinct(players.map((p) => phrase(fullName(p))));
  if (names.length !== players.length) {
    throw new Error("Duplicate or empty player names must be disambiguated before querying.");
  }
  const sports = WEBZ_BASEBALL_TERMS.map(phrase).join(" OR ");
  const broad = "(" + names.join(" OR ") + ") (" + sports + ")";
  // These AND clauses bind EACH name to HIS current team/org, rather than
  // allowing another alumnus's team to match a namesake in an unrelated story.
  const contextual = distinct(players.flatMap((p) => {
    const name = phrase(fullName(p));
    return meaningfulCurrentAffiliations(p).map((affiliation) =>
      "(" + name + " " + phrase(affiliation) + ")");
  }));
  const positive = contextual.length
    ? "(" + [broad, ...contextual].join(" OR ") + ")"
    : "(" + broad + ")";
  return positive + " NOT (" + WEBZ_EXCLUSIONS.map(phrase).join(" OR ") + ")";
}

export function planWebzNewsBatches(players, options = {}) {
  const batchSize = Math.min(8, Math.max(1, Number(options.batchSize) || 8));
  const breakoutThreshold = Number(options.breakoutThreshold) || 15;
  const maxIsolated = Math.max(0, Math.min(3, Number(options.maxIsolated ?? 2)));
  const available = players.map((p) => ({
    ...p,
    recent_news_count: Number(p.recent_news_count || 0),
    recent_verified_count: Number(p.recent_verified_count || 0),
  }));
  const highVolume = available
    .filter((p) => p.recent_news_count >= breakoutThreshold)
    .sort((a, b) => b.recent_news_count - a.recent_news_count || fullName(a).localeCompare(fullName(b)))
    .slice(0, maxIsolated);
  const isolatedIds = new Set(highVolume.map((p) => String(p.playerid)));
  // Less-covered alumni appear early, protecting them if a pre-paid account
  // reaches its credit floor. This is not a claim that everyone has news.
  const quieter = available
    .filter((p) => !isolatedIds.has(String(p.playerid)))
    .sort((a, b) =>
      a.recent_verified_count - b.recent_verified_count ||
      a.recent_news_count - b.recent_news_count ||
      fullName(a).localeCompare(fullName(b)));
  const batches = [];
  for (let i = 0; i < quieter.length; i += batchSize) {
    batches.push({ kind: "balanced", players: quieter.slice(i, i + batchSize) });
  }
  for (const player of highVolume) {
    batches.push({ kind: "high-volume-isolated", players: [player] });
  }
  return batches.map((batch) => ({
    ...batch,
    names: batch.players.map(fullName),
    query: buildWebzNewsQuery(batch.players),
  }));
}
