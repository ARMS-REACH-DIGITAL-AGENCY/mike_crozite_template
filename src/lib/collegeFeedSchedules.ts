// src/lib/collegeFeedSchedules.ts
// League-wide college baseball schedules from the governing bodies' own
// calendar (iCal) feeds. NAIA, CCCAA and NWAC all run on PrestoSports, which
// publishes every game the league has entered as one feed (no 500-game cap,
// unlike the HTML schedule page). Games carry a stable UID; teams are names
// only, so they reach a card only through college_feed_teams once Pete has
// approved which of our teamids each feed name is. Nothing here guesses a team.

export type FeedSource = 'naia' | 'cccaa' | 'nwac';

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

export type FeedGame = {
  uid: string;
  startsAt: string | null; // ISO instant; null when the feed lists a date only
  gameDate: string;        // YYYY-MM-DD, local to the league
  timeTba: boolean;
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
