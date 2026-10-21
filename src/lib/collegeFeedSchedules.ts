// src/lib/collegeFeedSchedules.ts
// League-wide college baseball schedules from the governing bodies' own
// calendar (iCal) feeds. NAIA, CCCAA and NWAC all run on PrestoSports, which
// publishes every game the league has entered as one feed (no 500-game cap,
// unlike the HTML schedule page). Games carry a stable UID; teams are names
// only, so they reach a card only through college_feed_teams, where each feed
// name is linked to one of our teamids by a lookup in Pete's own team table
// (linkFeedTeams below) or by Pete. Nothing here guesses a team.
//
// NCAA-D1 has no league feed; College Baseball Insider posts each team's
// schedule as it comes out (see CBI below).

export type FeedSource = 'naia' | 'cccaa' | 'nwac' | 'cbi';

export const COLLEGE_FEEDS: { source: FeedSource; level: string; timeZone: string; url: (season: string) => string }[] = [
  { source: 'naia', level: 'NAIA', timeZone: 'America/Chicago', url: (s) => `https://naiastats.prestosports.com/sports/bsb/${s}/schedule?print=ical` },
  { source: 'cccaa', level: 'CCCAA', timeZone: 'America/Los_Angeles', url: (s) => `https://www.cccaasports.org/sports/bsb/${s}/schedule?print=ical` },
  // 404 until the NWAC creates its season; the job skips it until then.
  { source: 'nwac', level: 'NWAC', timeZone: 'America/Los_Angeles', url: (s) => `https://nwacsports.com/sports/bsb/${s}/schedule?print=ical` },
];

/** PrestoSports' season key: the fall-through-spring school year, e.g. "2026-27". */
export function collegeSeasonKey(now: Date = new Date()): string {
  const y = now.getUTCFullYear();
  const start = now.getUTCMonth() >= 6 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}

/** The spring a season key ends in: "2026-27" -> 2027. */
export function collegeSeasonYear(season: string): number {
  return Number(season.slice(0, 4)) + 1;
}

export type FeedGame = {
  uid: string;
  startsAt: string | null; // ISO instant; null when the feed lists a date only
  gameDate: string;        // YYYY-MM-DD, local to the league
  timeTba: boolean;
  localTime: string | null; // the time as printed, local to the park, when there is no instant
  awayName: string;
  homeName: string;
  neutral: boolean;        // "A vs. B": neutral site (or home not given)
  location: string | null;
  result: string | null;   // e.g. "Final, 3-5" or "Final - 5 innings, 1-11"
  notes: string | null;    // e.g. "Fall Non-Traditional Season"
  cancelled: boolean;
  modifiedAt: string | null;
};

function unescapeText(v: string): string {
  return v.replace(/\\n/gi, ' ').replace(/\\([,;\\])/g, '$1').trim();
}

function icsInstant(v: string): string | null {
  const m = v.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
  return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z` : null;
}

function localDate(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
}

type RawEvent = Record<string, { params: string; value: string }>;

function rawEvents(ics: string): RawEvent[] {
  // Unfold continuation lines (RFC 5545: CRLF followed by a space or tab).
  const text = ics.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '');
  return text.split('BEGIN:VEVENT').slice(1).map((block) => {
    const ev: RawEvent = {};
    for (const line of block.split('\n')) {
      const i = line.indexOf(':');
      if (i < 1) continue;
      const [name, ...params] = line.slice(0, i).split(';');
      ev[name] = { params: params.join(';'), value: line.slice(i + 1) };
    }
    return ev;
  });
}

const SEPARATOR = / (at|vs\.) /g;

function matchupText(summary: string): string {
  return unescapeText(summary).replace(/^\(Baseball\)\s*/, '').replace(/\s*\(\d+-\d+\)$/, '').trim();
}

// Every way to cut "A at B" in two. A name can itself contain " at "
// ("Southern University at New Orleans (LA) at Philander Smith (AR)").
function splits(text: string): { away: string; home: string; neutral: boolean }[] {
  const out: { away: string; home: string; neutral: boolean }[] = [];
  for (const m of text.matchAll(SEPARATOR)) {
    const away = text.slice(0, m.index).trim(), home = text.slice((m.index ?? 0) + m[0].length).trim();
    if (away && home) out.push({ away, home, neutral: m[1] === 'vs.' });
  }
  return out;
}

/** Parse one league feed. Ambiguous matchups take the cut whose two names
 *  appear on their own most often elsewhere in the same feed. */
export function parseCollegeFeed(ics: string, timeZone: string): FeedGame[] {
  const events = rawEvents(ics);
  const texts = events.map((e) => matchupText(e.SUMMARY?.value || ''));
  const seen = new Map<string, number>();
  for (const t of texts) {
    const s = splits(t);
    if (s.length === 1) for (const n of [s[0].away, s[0].home]) seen.set(n, (seen.get(n) || 0) + 1);
  }
  const games: FeedGame[] = [];
  events.forEach((e, idx) => {
    const uid = e.UID?.value?.trim();
    const cuts = splits(texts[idx]);
    if (!uid || !cuts.length || !e.DTSTART) return;
    const cut = cuts.length === 1 ? cuts[0]
      : cuts.reduce((best, c) => ((seen.get(c.away) || 0) + (seen.get(c.home) || 0) > (seen.get(best.away) || 0) + (seen.get(best.home) || 0) ? c : best), cuts[cuts.length - 1]);
    const dateOnly = /VALUE=DATE(?!-)/.test(e.DTSTART.params) || /^\d{8}$/.test(e.DTSTART.value.trim());
    const startsAt = dateOnly ? null : icsInstant(e.DTSTART.value.trim());
    const d = e.DTSTART.value.trim();
    const gameDate = startsAt ? localDate(startsAt, timeZone) : `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
    // DESCRIPTION repeats the summary, then ", <notes or result>".
    const desc = unescapeText(e.DESCRIPTION?.value || '').replace(/^Baseball:\s*/, '');
    const tail = desc.split(', ').slice(1).join(', ').trim();
    const isResult = /^(Final|Cancel|Postpon|Suspend)/i.test(tail);
    games.push({
      uid,
      startsAt,
      gameDate,
      timeTba: !startsAt,
      localTime: null,
      awayName: cut.away,
      homeName: cut.home,
      neutral: cut.neutral,
      location: e.LOCATION ? unescapeText(e.LOCATION.value) || null : null,
      result: isResult ? tail : null,
      notes: !isResult && tail ? tail : null,
      cancelled: (e.STATUS?.value || '').trim().toUpperCase() === 'CANCELLED',
      modifiedAt: e['LAST-MODIFIED'] ? icsInstant(e['LAST-MODIFIED'].value.trim()) : null,
    });
  });
  return games;
}

// College Baseball Insider (collegebaseballinsider.com, WordPress) posts one
// schedule per NCAA-D1 team, "2027 Arizona Baseball Schedule", one game a line:
//   2/19 Arizona vs. Oklahoma (Globe Life Field, Arlington, Texas) 3 pm
//   3/19 * Arizona @ Baylor                  (* = conference game)
//   4/30 * Virginia @ Miami (Fla.)
//   3/23 Utah @ Salt Lake Bees (exhibition) 6:30 pm
//   3/20 Brown @ Bryant DH 12 pm             (DH = two games that day)
// "vs." is a neutral site. Dates carry no year and times no time zone, so a
// game keeps its calendar date and the time as printed. A game is in both
// teams' posts; its uid is built from the date and teams so the two dedupe.
export const CBI = {
  source: 'cbi' as const,
  level: 'NCAA-D1',
  postsUrl: (seasonYear: number, page: number) =>
    `https://collegebaseballinsider.com/wp-json/wp/v2/posts?search=${seasonYear}%20baseball%20schedule&per_page=100&page=${page}&_fields=slug,title,modified_gmt,content`,
  isTeamPost: (slug: string, seasonYear: number) =>
    new RegExp(`^${seasonYear}-(?!college-baseball-team-schedules$).+-baseball-schedule$`).test(slug),
};

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function decodeHtml(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] !== '#') return ENTITIES[e.toLowerCase()] ?? m;
    const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1));
    return Number.isFinite(n) ? String.fromCodePoint(n) : m;
  });
}

function postLines(html: string): string[] {
  const text = decodeHtml(html.replace(/<br\s*\/?>|<\/p>|<\/li>/gi, '\n').replace(/<[^>]+>/g, ''));
  return text.replace(/[\u2018\u2019]/g, "'").split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
}

/** The team a post is for: "2027 Arizona Baseball Schedule" -> "Arizona" (the name its lines use). */
export function cbiPostTeam(title: string, seasonYear: number): string | null {
  const m = decodeHtml(title).replace(/[\u2018\u2019]/g, "'").trim().match(new RegExp(`^${seasonYear} (.+) Baseball Schedule$`, 'i'));
  return m ? m[1].trim() : null;
}

const CBI_LINE = /^(\d{1,2})\/(\d{1,2}) (\* ?)?(.+?) (@|vs\.?) (.+)$/;
const CBI_TIME = / (\d{1,2}(?::\d{2})? ?[ap]\.?m\.?|TBA|TBD)$/i;
const CBI_TRAILING_PARENS = / ?\(([^()]*)\)$/;

/** Parse one CBI team post. Lines that aren't a game (headings, notes) are counted, not guessed at. */
export function parseCbiPost(html: string, seasonYear: number, modifiedAt: string | null): { games: FeedGame[]; skipped: number } {
  const games: FeedGame[] = [];
  const repeats = new Map<string, number>();
  let skipped = 0;
  for (const line of postLines(html)) {
    const m = line.match(CBI_LINE);
    const month = m ? Number(m[1]) : 0, day = m ? Number(m[2]) : 0;
    if (!m || month < 1 || month > 12 || day < 1 || day > 31) { skipped++; continue; }
    let home = m[6];
    const time = home.match(CBI_TIME);
    if (time) home = home.slice(0, time.index);
    const doubleheader = / DH$/i.test(home);
    if (doubleheader) home = home.slice(0, -3);
    // Trailing parentheses: "(exhibition)" is a note, "(Truist Park)" or
    // "(Jacksonville, Fla.)" a site, and a one-word "(Fla.)" or "(Ohio)" is
    // part of the team's name.
    const notes = m[3] ? ['Conference'] : [];
    if (doubleheader) notes.push('Doubleheader');
    let location: string | null = null;
    for (let p = home.match(CBI_TRAILING_PARENS); p; p = home.match(CBI_TRAILING_PARENS)) {
      const inner = p[1].trim();
      if (/^[a-z]/.test(inner)) notes.push(inner[0].toUpperCase() + inner.slice(1));
      else if (/[ ,]/.test(inner)) location = location ?? inner;
      else break;
      home = home.slice(0, p.index).trim();
    }
    const away = m[4].trim(), neutral = m[5] !== '@';
    if (!away || !home) { skipped++; continue; }
    const gameDate = `${month >= 7 ? seasonYear - 1 : seasonYear}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const key = `${gameDate}|${neutral ? [away, home].sort().join('|') : `${away}|${home}`}`;
    const printed = time && !/^TB[AD]$/i.test(time[1]) ? time[1] : null;
    for (let k = 0; k < (doubleheader ? 2 : 1); k++) {
      const n = (repeats.get(key) || 0) + 1;
      repeats.set(key, n);
      games.push({
        uid: `${key}|${n}`,
        startsAt: null,
        gameDate,
        timeTba: !(printed && k === 0),
        localTime: k === 0 ? printed : null, // a doubleheader's time is the first game's
        awayName: away,
        homeName: home,
        neutral,
        location,
        result: null,
        notes: notes.length ? notes.join(', ') : null,
        cancelled: false,
        modifiedAt,
      });
    }
  }
  return { games, skipped };
}

/** One game per uid across all posts. Each team's post may print what the
 *  other leaves out (a start time, the site), so the copies fill each other in. */
export function mergeCbiGames(games: FeedGame[]): FeedGame[] {
  const byUid = new Map<string, FeedGame>();
  for (const g of games) {
    const had = byUid.get(g.uid);
    if (!had) { byUid.set(g.uid, { ...g }); continue; }
    if (!had.localTime && g.localTime) { had.localTime = g.localTime; had.timeTba = false; }
    had.location = had.location ?? g.location;
    had.notes = had.notes ?? g.notes;
    if (g.modifiedAt && (!had.modifiedAt || g.modifiedAt > had.modifiedAt)) had.modifiedAt = g.modifiedAt;
  }
  return [...byUid.values()];
}

// Linking a feed's team names to our teams (Pete, Oct 21 2026): a feed name
// is one of our teams when it is that team's short name in
// teamid_universe_mapping, at the feed's level, once both drop a state tag
// ("Avila (MO)", "St. Francis (IL)") and the words College / University
// (and their short forms: CC, Col, U). A state tag on the feed name must be
// the team's own state. A link is made only when exactly one team fits and
// no other name in the same feed reads the same way; everything else stays
// unlinked and simply shows no schedule.

const STATES: Record<string, string> = {};
for (const [state, ...forms] of [
  ['Alabama', 'al', 'ala'], ['Alaska', 'ak'], ['Arizona', 'az', 'ariz'], ['Arkansas', 'ar', 'ark'],
  ['California', 'ca', 'cal', 'calif'], ['Colorado', 'co', 'colo'], ['Connecticut', 'ct', 'conn'],
  ['Delaware', 'de', 'del'], ['DC', 'dc'], ['Florida', 'fl', 'fla'], ['Georgia', 'ga'], ['Hawaii', 'hi'],
  ['Idaho', 'id'], ['Illinois', 'il', 'ill'], ['Indiana', 'in', 'ind'], ['Iowa', 'ia'], ['Kansas', 'ks', 'kan', 'kans'],
  ['Kentucky', 'ky'], ['Louisiana', 'la'], ['Maine', 'me'], ['Maryland', 'md'], ['Massachusetts', 'ma', 'mass'],
  ['Michigan', 'mi', 'mich'], ['Minnesota', 'mn', 'minn'], ['Mississippi', 'ms', 'miss'], ['Missouri', 'mo'],
  ['Montana', 'mt', 'mont'], ['Nebraska', 'ne', 'neb', 'nebr'], ['Nevada', 'nv', 'nev'], ['New Hampshire', 'nh'],
  ['New Jersey', 'nj'], ['New Mexico', 'nm'], ['New York', 'ny'], ['North Carolina', 'nc'], ['North Dakota', 'nd'],
  ['Ohio', 'oh'], ['Oklahoma', 'ok', 'okla'], ['Oregon', 'or', 'ore'], ['Pennsylvania', 'pa'], ['Rhode Island', 'ri'],
  ['South Carolina', 'sc'], ['South Dakota', 'sd'], ['Tennessee', 'tn', 'tenn'], ['Texas', 'tx', 'tex'], ['Utah', 'ut'],
  ['Vermont', 'vt'], ['Virginia', 'va'], ['Washington', 'wa', 'wash'], ['West Virginia', 'wv', 'wva'],
  ['Wisconsin', 'wi', 'wis', 'wisc'], ['Wyoming', 'wy', 'wyo'], ['British Columbia', 'bc'],
]) for (const f of [state, ...forms]) STATES[f.toLowerCase().replace(/[. ]/g, '')] = state;

/** "Fla." / "FL" / "Florida" -> "Florida"; null when it isn't a state. */
export function stateName(v: string | null | undefined): string | null {
  return v ? STATES[v.toLowerCase().replace(/[. ]/g, '')] ?? null : null;
}

const SCHOOL_WORDS = /\b(?:community college|junior college|college|university|col of|col|cc|u)\b\.?/g;

/** A team name as compared: no state tag, no College / University, any case. */
export function teamNameKey(name: string): { key: string; state: string | null } {
  let n = name.trim(), state: string | null = null;
  const tag = n.match(/\s*\(([^()]+)\)$/);
  if (tag && stateName(tag[1])) { state = stateName(tag[1]); n = n.slice(0, tag.index); }
  const key = n.toLowerCase().replace(SCHOOL_WORDS, ' ').replace(/-/g, ' ').replace(/\s+/g, ' ').trim();
  return { key, state };
}

/** Feed name -> teamid, for the names that link (see above). */
export function linkFeedTeams(feedNames: string[], teams: { teamid: string; shortName: string; location: string | null }[]): Map<string, string> {
  const byKey = new Map<string, { teamid: string; state: string | null }[]>();
  for (const t of teams) {
    const { key, state: tagged } = teamNameKey(t.shortName);
    // The team's state: from its location ("Kansas City,Missouri"), else its own tag.
    const state = stateName((t.location || '').split(',').pop()?.trim()) ?? tagged;
    if (key) byKey.set(key, [...(byKey.get(key) || []), { teamid: t.teamid, state }]);
  }
  const feed = feedNames.map((name) => ({ name, ...teamNameKey(name) }));
  const links = new Map<string, string>();
  for (const f of feed) {
    const sameKey = feed.filter((o) => o.key === f.key);
    // Another name in this feed reads the same: "Bethel" beside "Bethel (KS)",
    // or "Bethel (IN)" beside "Bethel (Ind.)". Only a state tag tells them apart.
    if (sameKey.length > 1 && (!f.state || sameKey.some((o) => o !== f && o.state === f.state))) continue;
    const fits = (byKey.get(f.key) || []).filter((t) => !f.state || t.state === f.state);
    if (fits.length === 1) links.set(f.name, fits[0].teamid);
  }
  return links;
}
