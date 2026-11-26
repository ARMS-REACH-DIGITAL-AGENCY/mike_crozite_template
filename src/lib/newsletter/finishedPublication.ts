// Recovered from scripts/newsletter-preview.ts on ccr-0ad18095-umgndf.
// Contract: docs/newsletter-handoff-take-two.md; Nov 19 feedback supersedes
// the older public diagnostic panel and Weekly Tribune name. Layout only:
// finished lines, scores and table cells are printed without scoring math.
// No raw feeds, scorer, sender, sponsor lookup or database writes belong here.
import { createHash } from 'node:crypto';
import { newsletterImageBase } from './newsletterImages';
import { renderWeeklyGazetteLayout, type GazetteBatRow, type GazettePitchRow, type GazetteTables } from './weeklyGazetteLayout';
import { nearbyGames, regionTopGames } from './regionBoard';
import { renderDailyDigestLayout, type DailyDigestPresentation, type DailyDigestSlot } from './dailyDigestLayout';

export type Row = Record<string, any>;
/** The Gazette article's promotion of the three feature stories (Pete, Nov 25 2026, word for word). */
export const GAZETTE_PROMO_TEXT = 'As always, this version of the YAT-A-BOY Weekly Gazette includes our three Connect, Contribute, and Remember Feature stories.';
/** The Gazette article's thank-you to the home team's sponsor (Pete, Nov 25 2026, word for word). */
export const GAZETTE_SPONSOR_TEXT = 'And finally, a special thanks needs to go out to your home team\'s main sponsor and YAT?STATS business partner, American Solutions for Business. '
  + 'Act now and take advantage of their Special First Time Customer Promotion. Save 20% on your first promotional products order. '
  + 'Browse their collections of specialty products at peteismyagent.com or call 480.628.2588, mention YAT?STATS and ask for Pete.';
export type ReadDatabase = { query(sql: string, values?: any[]): Promise<{ rows: Row[] }> };
export type Cadence = 'daily' | 'weekly';
export type EditionRequest = {
  cadence: Cadence; date: string; email: string; seasonKey: string; region?: number; firebaseUid?: string;
};
export type FinishedEdition = {
  version: 'finished-publication-v1';
  ready: Row; recipient: Row; control: Row;
  presentation?: {
    baseUrl: string;
    schoolName?: string;
    schoolLocation?: string;
    daily?: DailyDigestPresentation;
    scoreboardTeams?: Record<string, { name?: string; city?: string; seed?: string }>;
    /** Gazette graphics drawn once per edition and saved on the site (never per fan). */
    gazette?: { mastheadUrl?: string; scoreboardUrl?: string; scoreboardAlt?: string; teamLogoBase?: string };
    provenance?: Record<string, unknown>;
  };
  /** nearby: the 7 schools closest to the home school, nearest first (school_nearest_schools). */
  selection: { seasonKey: string; region: number | null; favorites: string[]; picks: Row[]; nearby?: number[] };
  rows: {
    daily_stat_lines: Row[]; daily_game_stories: Row[]; daily_game_scores: Row[];
    weekly_player_lines: Row[]; weekly_box_scores: Row[];
    /** The fan's Superfan favorites' week (shared rows; optional for older facts). */
    weekly_player_totals?: Row[];
    /** The fan's favorites' transactions in the period (MLB's own words). */
    newsletter_transactions?: Row[];
  };
};
export type RenderedEdition = {
  subject: string; html: string; text: string; facts: FinishedEdition; layoutVersion: string;
  rowKeys: Record<string, unknown[]>; notes: string[];
  hashes: { facts: string; subject: string; html: string; text: string; content: string };
};
export const FINISHED_LAYOUT_VERSION = 'daily-digest-phone8-v2';
const WEEKLY_LAYOUT_VERSION = 'gazette-test3-v1';
const STATE_NAMES: Record<string, string> = { AL:'Alabama',AK:'Alaska',AZ:'Arizona',AR:'Arkansas',CA:'California',CO:'Colorado',CT:'Connecticut',DE:'Delaware',DC:'District of Columbia',FL:'Florida',GA:'Georgia',HI:'Hawaii',ID:'Idaho',IL:'Illinois',IN:'Indiana',IA:'Iowa',KS:'Kansas',KY:'Kentucky',LA:'Louisiana',ME:'Maine',MD:'Maryland',MA:'Massachusetts',MI:'Michigan',MN:'Minnesota',MS:'Mississippi',MO:'Missouri',MT:'Montana',NE:'Nebraska',NV:'Nevada',NH:'New Hampshire',NJ:'New Jersey',NM:'New Mexico',NY:'New York',NC:'North Carolina',ND:'North Dakota',OH:'Ohio',OK:'Oklahoma',OR:'Oregon',PA:'Pennsylvania',RI:'Rhode Island',SC:'South Carolina',SD:'South Dakota',TN:'Tennessee',TX:'Texas',UT:'Utah',VT:'Vermont',VA:'Virginia',WA:'Washington',WV:'West Virginia',WI:'Wisconsin',WY:'Wyoming' };
const iso = (value: unknown) => value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
const dayAfter = (date: string, offset = 1) => new Date(Date.parse(date + 'T00:00:00Z') + offset * 86400000).toISOString().slice(0, 10);
const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
export function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(stableJson).join(',') + ']';
  const row = value as Record<string, unknown>;
  return '{' + Object.keys(row).sort().map(key => JSON.stringify(key) + ':' + stableJson(row[key])).join(',') + '}';
}
function dateOnly(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || iso(new Date(value + 'T00:00:00Z')) !== value) throw new Error('A valid YYYY-MM-DD publication date is required');
}
function yat(value: unknown): string {
  if (typeof value !== 'string' || !/^YAT\d+$/.test(value)) throw new Error('Finished publication and favorites must identify players by YAT ID');
  return value;
}
function gameKey(row: Row): string { return [row.season_key, row.region, row.game_id].join('/'); }
function homeGames(rows: Row[], home: number, assigned?: number): Row[] {
  const found = rows.filter(row => (Number(row.home_hsid) === home || Number(row.away_hsid) === home) && (assigned == null || Number(row.region) === assigned));
  if (found.length > 1) throw new Error('More than one finished home game for the selected period; specify its region');
  return found;
}
function checkReady(ready: Row, request: EditionRequest) {
  if (ready.cadence !== request.cadence || iso(ready.period_start) !== request.date || ready.season_key !== request.seasonKey) throw new Error('The ready edition does not match the requested period and season');
  const end = request.cadence === 'weekly' ? dayAfter(request.date, 6) : request.date;
  if (iso(ready.period_end) !== end || (request.cadence === 'weekly' && new Date(request.date + 'T12:00:00Z').getUTCDay() !== 1)) throw new Error('Invalid finished publication period');
  if (new Date(ready.cutoff_at).toISOString() !== dayAfter(end) + 'T11:00:00.000Z') throw new Error('Edition cutoff is not the agreed 4 a.m. Arizona cutoff');
  if (Object.entries(ready.row_counts || {}).some(([name, count]) => name.startsWith('missing_') && Number(count) > 0)) throw new Error('The ready record reports missing publication rows');
}

export type NewsletterPreferenceRequest = Pick<EditionRequest, 'email' | 'cadence' | 'firebaseUid'>;
export type NewsletterPreferences = { recipient: Row; favorites: string[]; picks: Row[] };
export type NewsletterPreferenceLoader = (request: NewsletterPreferenceRequest) => Promise<NewsletterPreferences>;

/** One authoritative query path for live delivery and authorized QA review.
 * Call inside a new read-only, repeatable-read transaction for each edition.
 * Never use a previous edition's preferences to construct a new edition. */
export async function readNewsletterPreferences(db: ReadDatabase, request: NewsletterPreferenceRequest): Promise<NewsletterPreferences> {
  const email = request.email.trim().toLowerCase();
  if (!email || !['daily','weekly'].includes(request.cadence)) throw new Error('Valid newsletter recipient and cadence required');
  const recipients = (await db.query(
    'SELECT firebase_uid, email, first_name, home_hsid, home_school_name, plan, is_superfan FROM newsletter_recipients WHERE lower(btrim(email))=$1', [email])).rows;
  if (!recipients.length) throw new Error('Recipient must resolve to an existing fan');
  const accounts = [...new Map(recipients.map(row => [String(row.firebase_uid), row])).values()];
  if (request.firebaseUid && !accounts.some(row => row.firebase_uid === request.firebaseUid)) throw new Error('Requested account does not belong to recipient email');
  const validSchool = (row: Row) => Number.isInteger(Number(row.home_hsid)) && Number(row.home_hsid) > 0;
  // Prefer an entitled SuperFan with a valid home school; break ties by UID
  // so retries and both cadences always select the same home-school edition.
  const ordered = accounts.slice().sort((x,y) => Number(validSchool(y))-Number(validSchool(x)) ||
    Number(Boolean(y.is_superfan))-Number(Boolean(x.is_superfan)) || String(x.firebase_uid).localeCompare(String(y.firebase_uid)));
  const primary = ordered[0];
  if (!validSchool(primary)) throw new Error('Recipient has no valid home school');
  const superfan = accounts.some(row => row.is_superfan === true);
  const recipient: Row = {...primary, email, is_superfan: superfan, plan: superfan ? 'superfan' : 'fan',
    ...(accounts.length > 1 ? { account_uids: accounts.map(row => String(row.firebase_uid)).sort() } : {})};
  const favoriteRows = (await db.query("SELECT to_jsonb(f)->>'yatid' AS yatid FROM newsletter_favorites f WHERE firebase_uid=ANY($1::text[])", [accounts.map(row => String(row.firebase_uid))])).rows;
  const favorites = [...new Set(favoriteRows.map(row => yat(row.yatid)))].sort();
  const picks = request.cadence === 'daily'
    ? (await db.query('SELECT position, hsid, label FROM user_scoreboard_schools WHERE firebase_uid=$1 ORDER BY position', [recipient.firebase_uid])).rows : [];
  return { recipient, favorites, picks };
}

/** Validate an externally obtained preference snapshot before selecting finished rows. */
function checkedPreferences(value: NewsletterPreferences, request: NewsletterPreferenceRequest): NewsletterPreferences {
  if (!value?.recipient || String(value.recipient.email).trim().toLowerCase() !== request.email.trim().toLowerCase()
    || !value.recipient.firebase_uid || (request.firebaseUid && value.recipient.firebase_uid !== request.firebaseUid && !(Array.isArray(value.recipient.account_uids) && value.recipient.account_uids.includes(request.firebaseUid)))
    || !Number.isInteger(Number(value.recipient.home_hsid)) || !Array.isArray(value.favorites) || !Array.isArray(value.picks))
    throw new Error('Live newsletter preference snapshot does not match the requested account');
  return { recipient: value.recipient, favorites: [...new Set(value.favorites.map(yat))].sort(), picks: value.picks };
}

/** Call on one read-only, repeatable-read transaction when reading a database.
 * Production reads preferences from that transaction. The rehearsal supplies
 * the authenticated live source; the finished scores stay in its QA DB. */
export async function readFinishedEdition(db: ReadDatabase, request: EditionRequest,
  loadPreferences: NewsletterPreferenceLoader = r => readNewsletterPreferences(db,r)): Promise<FinishedEdition> {
  dateOnly(request.date);
  if (!['daily', 'weekly'].includes(request.cadence) || !request.email || !request.seasonKey) throw new Error('Cadence, recipient and season are required');
  const readyRows = (await db.query('SELECT cadence, period_start::text, period_end::text, season_key, week, cutoff_at, ready_at, row_counts FROM edition_ready WHERE cadence=$1 AND period_start=$2', [request.cadence, request.date])).rows;
  if (readyRows.length !== 1) throw new Error('No finished edition_ready record for the requested period; nothing to render');
  const ready = readyRows[0];
  checkReady(ready, request);
  const requiredTables = request.cadence === 'daily' ? ['daily_stat_lines', 'daily_game_stories', 'daily_game_scores'] : ['weekly_player_lines', 'weekly_box_scores'];
  for (const table of requiredTables) {
    // Table and date-column identifiers come only from the fixed list above.
    const column = request.cadence === 'daily' ? 'stats_date' : 'period_start';
    const actual = Number((await db.query('SELECT count(*)::int AS count FROM ' + table + ' WHERE ' + column + '=$1', [request.date])).rows[0]?.count);
    if (!Number.isInteger(ready.row_counts?.[table]) || actual !== ready.row_counts[table]) throw new Error('Finished publication count differs from edition_ready: ' + table);
  }
  const { recipient, favorites, picks } = checkedPreferences(await loadPreferences(request), request);
  const controls = (await db.query('SELECT enabled, approved_layout_version, approved_by FROM alumni_newsletter_control')).rows;
  if (controls.length !== 1) throw new Error('Newsletter control must have one existing record; preview does not change it');
  const rows: FinishedEdition['rows'] = { daily_stat_lines: [], daily_game_stories: [], daily_game_scores: [], weekly_player_lines: [], weekly_box_scores: [] };
  let nearby: number[] = [];
  let selected: Row[] = [];
  if (request.cadence === 'daily') {
    rows.daily_stat_lines = (await db.query('SELECT * FROM daily_stat_lines WHERE stats_date=$1 AND yatid=ANY($2::text[]) ORDER BY sort_key, stat_line_id', [request.date, favorites])).rows;
    rows.daily_stat_lines.forEach(row => yat(row.yatid));
    const scores = (await db.query('SELECT * FROM daily_game_scores WHERE stats_date=$1 AND season_key=$2 ORDER BY region, game_id', [request.date, request.seasonKey])).rows;
    selected = homeGames(scores, Number(recipient.home_hsid), request.region);
    const region = selected[0]?.region ?? request.region ?? null;
    // The scoreboard is the home school's game, then the games of the 7
    // schools closest to it (Pete, Nov 25 2026; school_nearest_schools). Until
    // that list exists for a season, the region's top scores.
    nearby = (await db.query("SELECT neighbor_hsid FROM school_nearest_schools WHERE season_key=$1 AND home_hsid=$2 ORDER BY rank", [request.seasonKey, Number(recipient.home_hsid)])
      .catch((err: { code?: string }) => { if (err?.code === '42P01') return { rows: [] as Row[] }; throw err; })).rows.map(row => Number(row.neighbor_hsid));
    const near = new Set(nearby);
    rows.daily_game_scores = nearby.length
      ? scores.filter(row => selected.includes(row) || near.has(Number(row.home_hsid)) || near.has(Number(row.away_hsid)))
      : region == null ? [] : scores.filter(row => Number(row.region) === Number(region));
    rows.daily_game_stories = (await db.query('SELECT * FROM daily_game_stories WHERE stats_date=$1 AND hsid=$2 AND season_key=$3 ORDER BY region, game_id', [request.date, Number(recipient.home_hsid), request.seasonKey])).rows.filter(row => region == null || Number(row.region) === Number(region));
    if (rows.daily_game_stories.length > 1) throw new Error('More than one finished home story for the selected period');
  } else {
    rows.weekly_player_lines = (await db.query('SELECT * FROM weekly_player_lines WHERE period_start=$1 AND hsid=$2 AND season_key=$3 ORDER BY sort_key, yatid', [request.date, Number(recipient.home_hsid), request.seasonKey])).rows;
    rows.weekly_player_lines.forEach(row => yat(row.yatid));
    // The Gazette's Superfan favorites: shared weekly rows, read for this fan's YAT IDs.
    rows.weekly_player_totals = favorites.length ? (await db.query('SELECT * FROM weekly_player_totals WHERE period_start=$1 AND yatid=ANY($2::text[]) ORDER BY yatid', [request.date, favorites])).rows : [];
    const boxes = (await db.query('SELECT * FROM weekly_box_scores WHERE period_start=$1 AND season_key=$2 AND week=$3 ORDER BY region, game_id', [request.date, request.seasonKey, ready.week])).rows;
    selected = homeGames(boxes, Number(recipient.home_hsid), request.region);
    const region = selected[0]?.region ?? request.region ?? null;
    rows.weekly_box_scores = boxes.filter(row => region != null && Number(row.region) === Number(region));
    // The optional Weekly recap is deliberately absent: the recovered contract
    // leaves its inclusion for Pete to decide. No raw story is regenerated.
  }
  // Pete, Nov 24 2026: the fan's favorites' transactions, in the Daily and the Weekly.
  rows.newsletter_transactions = favorites.length
    ? (await db.query('SELECT * FROM newsletter_transactions WHERE cadence=$1 AND period_start=$2 AND yatid=ANY($3::text[]) ORDER BY effective_date, transaction_id', [request.cadence, request.date, favorites])).rows
    : [];
  return clone({ version: 'finished-publication-v1', ready, recipient, control: controls[0],
    selection: { seasonKey: request.seasonKey, region: selected[0] ? Number(selected[0].region) : request.region ?? null, favorites, picks, ...(nearby.length ? { nearby } : {}) }, rows });
}

const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
const labelDate = (value: string) => new Date(value + 'T12:00:00Z').toLocaleDateString('en-US', { timeZone: 'UTC', month: 'long', day: 'numeric', year: 'numeric' });
const h2 = (text: string) => '<h2>' + esc(text) + '</h2>';
function publicText(value: unknown, field: string): string {
  const text = String(value ?? '');
  if (/\b(?:commissioner|pipeline|needs_decision|TEST-ONLY|source completeness|test season|fixture)\b/i.test(text)) throw new Error('Internal text is not public newsletter content: ' + field);
  return text;
}
function sideLabel(game: Row, side: 'home' | 'away'): string {
  return publicText(game[side + '_label'] ?? game[side + '_name'] ?? '', side + ' label');
}
function displayLabel(label: string): string { return label.split('\n').map(esc).join('<br>'); }
/**
 * The Digest scoreboard (Pete, Nov 24 2026; Daily-Oct07 phone PDF): the home
 * school's game first, then its region's top scores: the 7 other games with the
 * most runs, ties to the game with the better (lower) seed.
 */
function dailyBoard(facts: FinishedEdition): { slots: DailyDigestSlot[]; keys: unknown[] } {
  const home = homeGames(facts.rows.daily_game_scores, Number(facts.recipient.home_hsid), facts.selection.region ?? undefined)[0] || null;
  const region = home ? Number(home.region) : facts.selection.region;
  const teams = facts.presentation?.scoreboardTeams || {};
  const seed = (game: Row, side: 'home' | 'away'): string | undefined =>
    game[side + '_seed'] == null ? teams[String(game[side + '_hsid'])]?.seed : String(game[side + '_seed']);
  const bestSeed = (game: Row) => Math.min(...(['home', 'away'] as const).map(side => Number(seed(game, side) ?? Infinity)));
  const others = facts.selection.nearby?.length
    ? nearbyGames(facts.rows.daily_game_scores, home, facts.selection.nearby)
    : regionTopGames(facts.rows.daily_game_scores, home, region, bestSeed);
  const games = [...(home ? [home] : []), ...others];
  const display = (game: Row): DailyDigestSlot => ({ home: game === home,
    homeLabel: sideLabel(game, 'home'), awayLabel: sideLabel(game, 'away'),
    homeSeed: seed(game, 'home'), awaySeed: seed(game, 'away'),
    homeInnings: game.home_innings || [], awayInnings: game.away_innings || [],
    homeRuns: game.home_runs ?? '', awayRuns: game.away_runs ?? '' });
  return { slots: games.map(display),
    keys: games.map((game, i) => ({ slot: game === home ? 'home' : i, key: [iso(game.stats_date), game.season_key, game.region, game.game_id] })) };
}

function table(value: Row, title: string): { html: string; text: string } {
  if (!value || !Array.isArray(value.columns) || !Array.isArray(value.rows)) throw new Error('Finished box-score table is incomplete');
  const rows = [...value.rows, ...(Array.isArray(value.totals) && value.totals.length ? [value.totals] : [])] as unknown[][];
  const cells = (row: unknown[], tag: string) => row.map(value => '<' + tag + '>' + esc(publicText(value, 'box cell')) + '</' + tag + '>').join('');
  return { html: '<h3>' + esc(title) + '</h3><div class="box-scroll"><table class="box-table"><thead><tr>' + cells(value.columns, 'th') + '</tr></thead><tbody>' + rows.map(row => '<tr>' + cells(row, 'td') + '</tr>').join('') + '</tbody></table></div>',
    text: title + '\n' + [value.columns, ...rows].map(row => row.map(value => publicText(value, 'box cell')).join(' | ')).join('\n') };
}
function weeklyBox(box: Row): { html: string; text: string } {
  const away = sideLabel(box, 'away'), home = sideLabel(box, 'home');
  const line = box.line_score;
  if (!line || !Array.isArray(line.columns) || !Array.isArray(line.home) || !Array.isArray(line.away)) throw new Error('Finished weekly line score is incomplete');
  const parts = [table({ columns: ['TEAM', ...line.columns], rows: [[away, ...line.away], [home, ...line.home]] }, away + ' at ' + home),
    table(box.away_batting, away + ' batting'), table(box.home_batting, home + ' batting'),
    table(box.away_pitching, away + ' pitching'), table(box.home_pitching, home + ' pitching')];
  const extra = [...(box.extra_base_hits?.away || []), ...(box.extra_base_hits?.home || [])].map(value => publicText(value, 'extra-base hits'));
  return { html: parts.map(part => part.html).join('\n') + (extra.length ? '<p>Extra-base hits: ' + extra.map(esc).join('; ') + '</p>' : ''),
    text: parts.map(part => part.text).join('\n\n') + (extra.length ? '\n\nExtra-base hits: ' + extra.join('; ') : '') };
}
const CSS = 'body{margin:0;background:#ece8df;color:#1d1d1b;font:15px/1.55 Georgia,"Times New Roman",serif}.paper{max-width:760px;margin:20px auto;padding:24px;background:#fffdf7;border:1px solid #d8d2c4}header{text-align:center;border-bottom:4px double #1d1d1b;padding-bottom:14px}h1{margin:0;font-size:32px;line-height:1.15}header p{margin:6px 0 0;font:13px Arial,sans-serif}h2{font-size:21px;border-bottom:2px solid #1d1d1b;margin:26px 0 10px}h3{font:700 14px Arial,sans-serif;margin:18px 0 6px}.finished-lines{padding-left:20px}.finished-lines li{margin:8px 0}.scoreboard{background:#173b21;padding:12px;color:#fff}.board-title{text-align:center;font:bold 18px Arial,sans-serif;padding:8px}.board-invite{text-align:center;font:bold 18px/1.4 Arial,sans-serif;color:#f5d76e}.board-columns{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:12px}.board-column{min-width:0}.score-panel{overflow-x:auto;margin:8px 0;border-top:3px solid #356043;border-bottom:3px solid #356043}.home-game{border-color:#d0021b}.score-panel table{width:100%;border-collapse:collapse;font:11px "Courier New",monospace}.score-panel th,.score-panel td{padding:3px 2px;text-align:center}.score-panel tbody th{text-align:left;font:700 10px Arial,sans-serif;min-width:92px}.score-panel td{background:#0e2a16;border:1px solid #173b21;min-width:13px}.score-panel thead{color:#f5d76e}.runs{font-weight:bold}.box-scroll{overflow-x:auto}.box-table{width:100%;border-collapse:collapse;font:12px/1.5 Arial,sans-serif}.box-table th,.box-table td{padding:5px 6px;text-align:right;border-bottom:1px solid #ded9cc;white-space:nowrap}.box-table th:first-child,.box-table td:first-child{text-align:left}.league-score{break-inside:avoid;border-bottom:1px solid #ded9cc;padding:8px 0}a{color:#1f4d2b}@media(max-width:600px){.paper{margin:0;padding:15px;border:0}h1{font-size:29px}.board-columns{grid-template-columns:minmax(0,1fr)}.scoreboard{padding:8px}.score-panel tbody th{min-width:110px;font-size:11px}.score-panel table{font-size:12px}.score-panel td{padding:5px 2px}}';

/** The card's next game, saved with the stat line in the card's own wording: "Friday | April 2, 2027 vs. Peoria Javelinas". */
function nextGame(row: Row): string | undefined {
  if (!row.next_game_date || !row.next_game_opponent) return undefined;
  return [row.next_game_date, row.next_game_home_away || 'vs.', row.next_game_opponent].map((v, i) => publicText(v, ['next game date', 'next game', 'next game opponent'][i])).join(' ');
}

/** Deterministic layout of an immutable edition. Never reads or writes data. */
export function renderFinishedEdition(input: FinishedEdition, options: { baseUrl?: string } = {}): RenderedEdition {
  const facts = clone(input), { ready, recipient, rows } = facts;
  if (options.baseUrl) {
    const url = new URL(options.baseUrl);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Preview links require an HTTP(S) URL without credentials');
    facts.presentation = { ...facts.presentation, baseUrl: url.toString() };
  }
  const link = facts.presentation?.baseUrl;
  if (facts.version !== 'finished-publication-v1') throw new Error('Unsupported finished publication version');
  const cadence = ready.cadence as Cadence;
  checkReady(ready, { cadence, date: iso(ready.period_start), email: recipient.email, seasonKey: facts.selection.seasonKey });
  for (const name of ['daily_stat_lines', 'daily_game_stories', 'daily_game_scores'] as const) {
    if (rows[name].some(row => iso(row.stats_date) !== iso(ready.period_start))) throw new Error('Finished daily row belongs to a different reporting date');
  }
  for (const name of ['weekly_player_lines', 'weekly_box_scores'] as const) {
    if (rows[name].some(row => iso(row.period_start) !== iso(ready.period_start))) throw new Error('Finished weekly row belongs to a different reporting period');
  }
  if ([...rows.daily_game_stories, ...rows.daily_game_scores, ...rows.weekly_box_scores].some(row => row.season_key !== facts.selection.seasonKey)) throw new Error('Finished game row belongs to a different season');
  if (rows.daily_game_stories.some(row => Number(row.hsid) !== Number(recipient.home_hsid)) || rows.weekly_player_lines.some(row => Number(row.hsid) !== Number(recipient.home_hsid))) throw new Error('Finished home-school section contains a different school');
  const own = cadence === 'daily' ? homeGames(rows.daily_game_scores, Number(recipient.home_hsid), facts.selection.region ?? undefined) : homeGames(rows.weekly_box_scores, Number(recipient.home_hsid), facts.selection.region ?? undefined);
  const ownSide = own[0] && (Number(own[0].home_hsid) === Number(recipient.home_hsid) ? 'home' : 'away');
  const school = publicText(recipient.home_school_name || rows.daily_game_stories[0]?.school_name || (ownSide ? sideLabel(own[0], ownSide) : ''), 'school');
  if (!school) throw new Error('The finished edition has no home school display name');
  const title = cadence === 'daily' ? 'YAT?STATS Daily Digest' : 'YAT-A-BOY Weekly Gazette';
  const period = labelDate(iso(ready.period_start)) + (cadence === 'weekly' ? ' – ' + labelDate(iso(ready.period_end)) : '');
  const subject = (title + ' | ' + school.replace(/\n/g, ' ') + ' | ' + period).replace(/[\r\n]+/g, ' ');
  const body: string[] = [], plain: string[] = [title.toUpperCase(), school, period];
  let dailyLayout: { html: string; text: string } | undefined;
  let gazetteLayout: { html: string; text: string } | undefined;
  const rowKeys: Record<string, unknown[]> = {}, notes: string[] = [];
  if (cadence === 'daily') {
    const favoriteIds = new Set(facts.selection.favorites.map(yat));
    for (const row of rows.daily_stat_lines) if (!favoriteIds.has(yat(row.yatid))) throw new Error('Daily edition includes a player outside the recipient favorites');
    const story = rows.daily_game_stories[0];
    const scores = dailyBoard(facts);
    const presentation = facts.presentation?.daily || {};
    const schoolParts = school.split(' — ');
    const homeUrl = link ? new URL(link) : undefined;
    const section = (hash: string) => { if (!homeUrl) return undefined; const url = new URL(homeUrl); url.hash = hash; return url.toString(); };
    const schoolName = publicText(facts.presentation?.schoolName || story?.school_name || schoolParts[0], 'school');
    dailyLayout = renderDailyDigestLayout({ subject, schoolName,
      schoolLocation: publicText(facts.presentation?.schoolLocation || schoolParts.slice(1).join(' — '), 'school location'),
      issueDateISO: dayAfter(iso(ready.period_end)), statsDateISO: iso(ready.period_start),
      firstName: String(recipient.first_name || ''), isSuperfan: Boolean(recipient.is_superfan),
      favoriteCount: favoriteIds.size,
      regionLabel: facts.selection.region == null ? undefined : 'Region ' + facts.selection.region,
      favoriteRows: rows.daily_stat_lines.map((row, index, all) => ({ player_name: publicText(row.player_name, 'player name'),
        team_name: publicText(row.team_name, 'team name'), level: publicText(row.level, 'level'), line: publicText(row.line, 'daily stat line'),
        // Once per player, under his last line of the day.
        next_game: all.slice(index + 1).some(other => yat(other.yatid) === yat(row.yatid)) ? undefined : nextGame(row) })),
      transactions: (rows.newsletter_transactions || []).map(t => ({ date: iso(t.effective_date), type: publicText(t.transaction_type, 'transaction type'), text: publicText(t.description, 'transaction') })),
      story: story ? { title: publicText(story.title, 'story title'), story: publicText(story.story, 'story'),
        seriesNote: publicText(story.series_note, 'series note'), shoutouts: (story.shout_outs || []).map((row: Row) => publicText(row.line, 'shout-out')) } : undefined,
      slots: scores.slots,
      // The board picture, drawn once per school per day by
      // src/lib/newsletter/newsletterImages.ts (the 4 a.m. job; scripts/newsletter-draw-pictures.ts locally) (Pete's Nov 13 Gazette design).
      // The live asset bucket unless the environment names another copy (newsletterImageBase).
      scoreboardImage: newsletterImageBase('board') && scores.slots.length
        ? `${newsletterImageBase('board')}/${iso(ready.period_start)}/${Number(recipient.home_hsid)}.png` : undefined,
      // The approved masthead logo is served by the site itself (public/img/newsletter).
      presentation: { mastheadLogo: link ? new URL('/img/newsletter/daily-digest-logo.png', link).toString() : undefined, ...presentation, links: { home: section('sec-active'), favorites: section('sec-active'),
        scoreboard: section('sec-fantasy'), ...presentation.links } },
    });
    rowKeys.daily_stat_lines = rows.daily_stat_lines.map(row => [iso(row.stats_date), row.stat_line_id]);
    rowKeys.daily_game_stories = rows.daily_game_stories.map(row => [iso(row.stats_date), row.hsid, row.region, row.game_id]);
    rowKeys.daily_game_scores = scores.keys;
    if (!presentation.links?.pickTeams) notes.push('No saved pick-page destination is available in the recovered contract; empty slots have no invented link.');
  } else {
    // The Gazette (Pete, Nov 24 2026): the approved TEST 3 proof, docs/newsletter-reference/.
    const game = own[0];
    if (!game) throw new Error('The Gazette needs the home school\'s finished game for the week');
    const side = ownSide as 'home' | 'away';
    const story = game[side + '_story'];
    if (!story?.title || !Array.isArray(story.paragraphs)) throw new Error('The Gazette letter is missing from the finished week');
    // The banner (drawn once per school by src/lib/newsletter/newsletterImages.ts)
    // and the home school's final board of the week (the Digest's board for the
    // Sunday) come from the saved images unless the facts name others (Pete,
    // Nov 25 2026: the Week 4 TEST 2 proof).
    const homeHsid = Number(recipient.home_hsid);
    const bannerBase = newsletterImageBase('banner'), boardBase = newsletterImageBase('board');
    const madnessBase = newsletterImageBase('bracket');
    const leadersBase = newsletterImageBase('leaders');
    const gz: NonNullable<NonNullable<FinishedEdition['presentation']>['gazette']> = {
      mastheadUrl: bannerBase ? `${bannerBase}/${homeHsid}.png` : undefined,
      scoreboardUrl: boardBase ? `${boardBase}/${iso(ready.period_end)}/${homeHsid}.png` : undefined,
      scoreboardAlt: `${publicText(school.split(' — ')[0], 'school')} and its 7 closest schools: final scores for the week`,
      ...(facts.presentation?.gazette || {}),
    };
    // Team logos: small PNGs drawn once per week by src/lib/newsletter/newsletterImages.ts
    // (email clients cannot all show the site's WebP art), unless the facts name a base.
    const logoBase = newsletterImageBase('logo');
    const logo = (teamid: unknown) => (!/^\d{1,10}$/.test(String(teamid ?? '')) ? undefined
      : gz.teamLogoBase ? gz.teamLogoBase + String(teamid) : logoBase ? `${logoBase}/${String(teamid)}.png` : undefined);
    const favoriteIds = new Set(facts.selection.favorites);
    const lastOf = (name: string) => name.trim().split(/\s+/).slice(-1)[0] || name;
    // TEST 3 prints last names; a shared last name gets the first initial, and a
    // shared initial too ("C. Bellinger" twice) gets the full name.
    const shortNames = (names: string[]) => {
      const last = new Map<string, number>(), initial = new Map<string, number>();
      const ini = (n: string) => n.trim()[0] + '. ' + lastOf(n);
      for (const n of names) { last.set(lastOf(n), (last.get(lastOf(n)) || 0) + 1); initial.set(ini(n), (initial.get(ini(n)) || 0) + 1); }
      return (n: string) => (last.get(lastOf(n))! < 2 ? lastOf(n) : initial.get(ini(n))! < 2 ? ini(n) : n.trim());
    };
    const sortRows = <T extends { name: string }>(list: (T & { full: string })[]) => list.sort((a, b) => lastOf(a.full).localeCompare(lastOf(b.full)) || a.full.localeCompare(b.full));
    const wlOf = (v: unknown): [number, number] | null => (Array.isArray(v) && v.length === 2 ? [Number(v[0]) || 0, Number(v[1]) || 0] : null);
    const pitchFrom = (p: number[] | null | undefined, fip: number | null) => {
      const q = Array.isArray(p) ? p.map(Number) : [];
      return { outs: q[0] || 0, hr: q[1] || 0, bb: q[2] || 0, hbp: q[3] || 0, k: q[4] || 0, h: q[5] || 0, r: q[6] || 0, er: q[7] || 0, fip };
    };
    const zero = [0, 0, 0, 0, 0, 0, 0, 0, 0];
    const alumniList = rows.weekly_player_lines.map(row => ({ row, st: (row.stats || {}) as Record<string, any> }));
    const nameAlumni = shortNames(alumniList.map(x => publicText(x.row.player_name, 'player name')));
    const aBat = sortRows(alumniList.filter(x => Array.isArray(x.st.bat) || !Array.isArray(x.st.pit)).map(x => ({ full: String(x.row.player_name), name: nameAlumni(String(x.row.player_name)), logo: logo(x.st.teamid), bold: favoriteIds.has(yat(x.row.yatid)),
      opsPlus: x.st.ops_plus ?? null, wl: wlOf(x.st.club_wl), b: Array.isArray(x.st.bat) ? x.st.bat.map(Number) : zero } as GazetteBatRow & { full: string })));
    const aPit = sortRows(alumniList.filter(x => Array.isArray(x.st.pit)).map(x => ({ full: String(x.row.player_name), name: nameAlumni(String(x.row.player_name)), logo: logo(x.st.teamid), bold: favoriteIds.has(yat(x.row.yatid)),
      fipMinus: x.st.fip_minus ?? null, wl: wlOf(x.st.club_wl), ...pitchFrom(x.st.pit, Array.isArray(x.st.pit) ? Number(x.st.pit[8]) : null) } as GazettePitchRow & { full: string })));
    const totalWl = alumniList.reduce((t, x) => { const w = wlOf(x.st.club_wl); return w ? [t[0] + w[0], t[1] + w[1]] as [number, number] : t; }, [0, 0] as [number, number]);
    const teamVal = (table: any, i: number) => { const v = table?.totals?.[i]; return v === '' || v == null || !Number.isFinite(Number(v)) ? null : Number(v); };
    const alumni: GazetteTables = { batters: aBat, pitchers: aPit, totalWl,
      teamOpsPlus: teamVal(game[side + '_batting'], 11), teamFipMinus: teamVal(game[side + '_pitching'], 10) };
    // The proof lists only favorites outside the home school: its own alumni are
    // already in the table above, in bold (Pete, Nov 25 2026: Week 4 TEST 2 proof).
    const alumniIds = new Set(alumniList.map(x => yat(x.row.yatid)));
    const favRows = (rows.weekly_player_totals || []).filter(row => favoriteIds.has(yat(row.yatid)) && !alumniIds.has(yat(row.yatid)));
    const nameFav = shortNames(favRows.map(row => String(row.player_name || '')));
    const fBat = sortRows(favRows.filter(row => !row.pitcher).map(row => ({ full: String(row.player_name || ''), name: nameFav(String(row.player_name || '')), logo: logo(row.teamid), bold: true,
      opsPlus: null, wl: null, b: Array.isArray(row.bat) ? row.bat.map(Number) : zero } as GazetteBatRow & { full: string })));
    const fPit = sortRows(favRows.filter(row => row.pitcher).map(row => ({ full: String(row.player_name || ''), name: nameFav(String(row.player_name || '')), logo: logo(row.teamid), bold: true,
      fipMinus: null, wl: null, ...pitchFrom(row.pit, null) } as GazettePitchRow & { full: string })));
    const place = (facts.presentation?.schoolLocation || String(recipient.home_school_name || '').split(' — ').slice(1).join(' — ') || '').replace(/,\s*([A-Z]{2})$/, (_m: string, st: string) => ', ' + (STATE_NAMES[st] || st));
    const base = facts.presentation?.baseUrl;
    const drawer = base ? (() => { const u = new URL(base); u.hash = 'sec-fantasy'; return u.toString(); })() : undefined;
    gazetteLayout = renderWeeklyGazetteLayout({ subject, schoolName: publicText(school.split(' — ')[0], 'school'), schoolPlace: place, week: Number(ready.week),
      issueDateISO: dayAfter(iso(ready.period_end)), periodStartISO: iso(ready.period_start), periodEndISO: iso(ready.period_end),
      firstName: String(recipient.first_name || ''), mastheadUrl: gz.mastheadUrl, scoreboardUrl: gz.scoreboardUrl, scoreboardAlt: gz.scoreboardAlt,
      story: { title: publicText(story.title, 'gazette title'), paragraphs: story.paragraphs.map((p: unknown) => publicText(p, 'gazette letter')) },
      alumniCount: alumniList.length, alumni,
      transactions: recipient.is_superfan ? (rows.newsletter_transactions || []).map(t => ({ date: iso(t.effective_date), type: publicText(t.transaction_type, 'transaction type'), text: publicText(t.description, 'transaction') })) : [],
      // The article's close (Pete, Nov 25 2026, word for word). Every school's sponsor is
      // American Solutions for Business today (public/img/splash-sponsors: Hamilton's own and global).
      promo: GAZETTE_PROMO_TEXT,
      sponsor: { name: 'American Solutions for Business', text: GAZETTE_SPONSOR_TEXT, link: { label: 'peteismyagent.com', url: 'https://peteismyagent.com' } },
      // SuperFans only (Pete, Nov 25 2026): their favorites from outside the home school.
      favorites: recipient.is_superfan && favRows.length ? { count: favRows.length, tables: { batters: fBat, pitchers: fPit, teamOpsPlus: null, teamFipMinus: null, totalWl: [0, 0] } } : undefined,
      links: { statDrawer: drawer },
      // Bracket Madness: four two-region boards drawn once a week by
      // src/lib/newsletter/newsletterImages.ts; the fan's own pair is drawn per
      // school (its game first, between the red rules) and comes first.
      bracketMadness: madnessBase ? (() => {
        const pairs = [[1, 2], [3, 4], [5, 6], [7, 8]];
        const mine = pairs.find(p => p.includes(Number(game.region)));
        const dir = `${madnessBase}/${iso(ready.period_end)}`;
        const boards = [...(mine ? [{ url: `${dir}/${homeHsid}.png`, pair: mine }] : []),
          ...pairs.filter(p => p !== mine).map(p => ({ url: `${dir}/pair-${p[0]}-${p[1]}.png`, pair: p }))];
        return { subtitle: `Week ${Number(ready.week)} finals: upsets first, then the top seeds, up to eight series in every region. Each series is best of three.`,
          boards: boards.map(b => ({ url: b.url, alt: `Bracket Madness: Region ${b.pair[0]} and Region ${b.pair[1]} final scores` })) };
      })() : undefined,
      // The Total Runs Leaderboards, drawn once a week by src/lib/newsletter/newsletterImages.ts
      // (the fan's own pair once per school, its row between the red rules), the fan's pair first.
      // Runs-only (knocked-out) games start in Week 4 (master_bracket stage 'total_runs').
      runsLeaders: leadersBase ? (() => {
        const pairs = [[1, 2], [3, 4], [5, 6], [7, 8]];
        const mine = pairs.find(p => p.includes(Number(game.region)));
        const dir = `${leadersBase}/${iso(ready.period_end)}`;
        const boards = [...(mine ? [{ url: `${dir}/${homeHsid}.png`, pair: mine }] : []),
          ...pairs.filter(p => p !== mine).map(p => ({ url: `${dir}/pair-${p[0]}-${p[1]}.png`, pair: p }))];
        return { subtitle: `Season runs through Week ${Number(ready.week)}.${Number(ready.week) >= 4 ? ' Knocked-out schools keep scoring here.' : ''}`,
          boards: boards.map(b => ({ url: b.url, alt: `Total Runs Leaderboard: Region ${b.pair[0]} and Region ${b.pair[1]}` })) };
      })() : undefined });
    rowKeys.weekly_player_lines = rows.weekly_player_lines.map(row => [iso(row.period_start), row.hsid, row.yatid, row.team_name]);
    rowKeys.weekly_box_scores = rows.weekly_box_scores.map(row => [row.season_key, row.region, row.game_id]);
    rowKeys.weekly_player_totals = favRows.map(row => [iso(row.period_start), row.yatid]);
  }
  notes.push('Rendered from finished publication rows. Delivery is handled separately by the approved sender. No sponsor is inferred.');
  const html = dailyLayout?.html || gazetteLayout?.html || '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + esc(subject) + '</title><style>' + CSS + '</style></head><body><main class="paper"><header><h1>' + esc(title) + '</h1><p>' + displayLabel(school) + ' · ' + esc(period) + '</p></header>' + body.join('\n') + '</main></body></html>';
  const text = dailyLayout?.text || gazetteLayout?.text || plain.filter(value => value !== '').join('\n\n') + '\n';
  const layoutVersion = cadence === 'daily' ? FINISHED_LAYOUT_VERSION : WEEKLY_LAYOUT_VERSION;
  const hashes = { facts: sha(stableJson(facts)), subject: sha(subject), html: sha(html), text: sha(text), content: '' };
  hashes.content = sha(stableJson({ facts: hashes.facts, subject: hashes.subject, html: hashes.html, text: hashes.text, layout: layoutVersion }));
  return { subject, html, text, facts, rowKeys, notes, hashes, layoutVersion };
}
