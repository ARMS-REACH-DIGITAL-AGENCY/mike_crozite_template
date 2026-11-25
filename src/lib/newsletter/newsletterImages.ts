/**
 * The newsletters' pictures (Pete, Nov 25 2026: "Make sure it knows where those
 * pictures are"): the Digest's board, and the Gazette's banner, team logos,
 * Bracket Madness boards and Total Runs Leaderboards. One place builds every
 * picture's page; the live 4 a.m. job (src/app/api/cron/fan-daily-pilot) draws
 * them with the server's Chromium and stores them in the site's asset bucket,
 * and the scripts/newsletter-draw-*.ts tools draw the same pages locally.
 *
 * Every picture is drawn once and shared: per school (board, banner, the fan's
 * own pair of regions), per team (logo) or per week (the shared boards).
 * Read-only on the database.
 */
import { normalizeTeamLogoId, teamLogoAssetUrls, TEAM_LOGO_S3_BASE } from '../teamLogo';
import {
  bracketMadnessGames, doubleRegionBoardHtml, nearbyGames, regionBoardHtml, regionLeaders, regionTopGames, runsLeaderboardHtml,
  type BoardGame, type BoardSide, type RunStand,
} from './regionBoard';

type Row = Record<string, any>;
export type ImageDatabase = { query(sql: string, values?: unknown[]): Promise<{ rows: Row[] }> };

/** Where the live pictures live: the site's own asset bucket (the same one as team and school logos). */
export const NEWSLETTER_ASSETS_BASE = `${TEAM_LOGO_S3_BASE}/newsletter`;
export const NEWSLETTER_IMAGE_DIRS = {
  board: 'digest', banner: 'gazette/banner', logo: 'gazette/logo', bracket: 'gazette/bracket', leaders: 'gazette/leaders',
} as const;
export type ImageKind = keyof typeof NEWSLETTER_IMAGE_DIRS;
const ENV: Record<ImageKind, string> = {
  board: 'NEWSLETTER_BOARD_IMAGE_BASE', banner: 'NEWSLETTER_GAZETTE_BANNER_BASE', logo: 'NEWSLETTER_TEAM_LOGO_BASE',
  bracket: 'NEWSLETTER_BRACKET_MADNESS_BASE', leaders: 'NEWSLETTER_RUNS_LEADERBOARD_BASE',
};
/**
 * The address a newsletter reads a kind of picture from: the live asset bucket,
 * unless the environment names another (a test replay's copies); an empty value
 * turns that picture off.
 */
export function newsletterImageBase(kind: ImageKind, env: Record<string, string | undefined> = process.env): string {
  const set = env[ENV[kind]];
  return (set === undefined ? `${NEWSLETTER_ASSETS_BASE}/${NEWSLETTER_IMAGE_DIRS[kind]}` : set).replace(/\/$/, '');
}

/** One picture to draw: its file (relative to the kind's folder), its page and the element to capture. */
export type Picture = { kind: ImageKind; file: string; html: string; selector: string; width: number; height: number; transparent: boolean };
/** Draws a page to a PNG once the page says it is ready (window.__ready). */
export type Shooter = (picture: Picture) => Promise<Buffer>;
/** The shared art: Oswald (the board's face), the ASB medallion and the Gazette's banner art. */
export type Assets = { fontCss: string; medallion: string; bannerArt: string };

export const ASSET_PATHS = { font: 'fonts/oswald-latin.woff2', medallion: 'img/splash-sponsors/brands/asb-medallion.png', bannerArt: 'img/newsletter/gazette-banner-blank.jpg' } as const;
export async function loadAssets(read: (publicPath: string) => Promise<Buffer>): Promise<Assets> {
  const [font, medallion, art] = await Promise.all([read(ASSET_PATHS.font), read(ASSET_PATHS.medallion), read(ASSET_PATHS.bannerArt)]);
  return {
    fontCss: `@font-face{font-family:Oswald;font-weight:200 700;src:url(data:font/woff2;base64,${font.toString('base64')}) format('woff2')}`,
    medallion: 'data:image/png;base64,' + medallion.toString('base64'),
    bannerArt: 'data:image/jpeg;base64,' + art.toString('base64'),
  };
}

// Every page says when it is ready: fonts and images loaded, long school names
// shrunk to fit their space (class "nm" with a max-width).
const READY = `<script>Promise.all([document.fonts.ready,...Array.from(document.images).map(i=>i.complete?0:new Promise(r=>{i.onload=i.onerror=r}))]).then(()=>{`
  + `for(const e of document.querySelectorAll('.nm')){const m=parseFloat(e.style.maxWidth);let s=parseFloat(getComputedStyle(e).fontSize);while(m&&e.scrollWidth>m&&s>13){s-=1;e.style.fontSize=s+'px';}}`
  + `window.__ready=true;});</script>`;
const ready = (html: string) => html.replace('</body>', READY + '</body>');

const PAIRS = [[1, 2], [3, 4], [5, 6], [7, 8]] as const;
const pairOf = (region: number) => PAIRS.find(p => (p as readonly number[]).includes(region))!;
const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v)).slice(0, 10);

async function bracketRows(db: ImageDatabase, season: string): Promise<Row[]> {
  return (await db.query('SELECT stage, region, round, series_no, game_no, game_id, week, game_end_date, status, home_hsid, away_hsid, home_seed, away_seed, home_runs, away_runs, winner_hsid, home_school_name, away_school_name FROM public.master_bracket WHERE season_key=$1', [season])).rows;
}
/**
 * Each team's series record as it stands on the board's day (Pete, Nov 25 2026: the
 * series score is always the current one): every game of its series that is over by
 * then, the game on the board included once it is final. A 1-1 series reads 1-1 on
 * the Sunday it was evened, never the 1-0 it was before that game.
 */
function seriesRecord(bracket: Row[], g: Row, hsid: number, asOf: string): string {
  if (!g || g.stage !== 'bracket') return '';
  const over = bracket.filter(r => r.stage === 'bracket' && r.region === g.region && r.round === g.round && r.series_no === g.series_no
    && Number(r.week) <= Number(g.week) && r.winner_hsid != null && iso(r.game_end_date) <= asOf);
  const w = over.filter(r => Number(r.winner_hsid) === hsid).length;
  return `${w}-${over.length - w}`;
}

/** The Digest's board for each school (Pete, Nov 24-25 2026): its game, then the 7 closest schools' games. */
export async function dailyBoardPictures(db: ImageDatabase, o: { date: string; season: string; hsids: number[]; assets: Assets }): Promise<{ pictures: Picture[]; skipped: number[] }> {
  const scores = (await db.query('SELECT * FROM public.daily_game_scores WHERE stats_date=$1 AND season_key=$2 ORDER BY region, game_id', [o.date, o.season])).rows;
  if (!scores.length) return { pictures: [], skipped: o.hsids };
  const bracket = await bracketRows(db, o.season);
  const byGame = new Map(bracket.map(r => [[r.week, r.region, r.game_id].join('/'), r]));
  const seedOf = new Map<number, number>();
  for (const r of bracket) {
    if (r.home_seed != null) seedOf.set(Number(r.home_hsid), Number(r.home_seed));
    if (r.away_seed != null) seedOf.set(Number(r.away_hsid), Number(r.away_seed));
  }
  const side = (game: Row, which: 'home' | 'away'): BoardSide => {
    const hsid = Number(game[which + '_hsid']);
    return { seed: seedOf.get(hsid) ?? null, name: String(game[which + '_label'] ?? ''), series: seriesRecord(bracket, byGame.get([game.week, game.region, game.game_id].join('/'))!, hsid, o.date),
      innings: (game[which + '_innings'] || []).map(String), runs: game[which + '_runs'] ?? '' };
  };
  const nearbyOf = new Map<number, number[]>();
  for (const r of (await db.query('SELECT home_hsid, neighbor_hsid FROM public.school_nearest_schools WHERE season_key=$1 ORDER BY home_hsid, rank', [o.season])
    .catch((err: { code?: string }) => { if (err?.code === '42P01') return { rows: [] as Row[] }; throw err; })).rows) {
    (nearbyOf.get(Number(r.home_hsid)) || nearbyOf.set(Number(r.home_hsid), []).get(Number(r.home_hsid))!).push(Number(r.neighbor_hsid));
  }
  const pictures: Picture[] = [], skipped: number[] = [];
  for (const hsid of o.hsids) {
    const home = scores.find(g => Number(g.home_hsid) === hsid || Number(g.away_hsid) === hsid);
    if (!home) { skipped.push(hsid); continue; }
    const near = nearbyOf.get(hsid) || [];
    const games: BoardGame[] = [home, ...(near.length ? nearbyGames(scores, home, near) : regionTopGames(scores, home, Number(home.region)))]
      .map(g => ({ away: side(g, 'away'), home: side(g, 'home'), framed: g === home }));
    pictures.push({ kind: 'board', file: `${o.date}/${hsid}.png`, html: ready(regionBoardHtml({ label: 'Region ' + home.region, games, medallion: o.assets.medallion, fontCss: o.assets.fontCss })),
      selector: '#board', width: 1200, height: 2000, transparent: true });
  }
  return { pictures, skipped };
}

// Where the proof's H sat on the banner art: centred at (970, 120), at most 230 x 170.
const BANNER_BOX = { cx: 970, cy: 120, w: 230, h: 170 };
/** The Gazette's banner for a school: the proof's art with the school's own logo (schools/<hsid>.png). */
export function gazetteBannerPicture(hsid: number, logo: string | null, assets: Assets): Picture {
  const img = logo ? `<img src="${logo}" style="position:absolute;max-width:${BANNER_BOX.w}px;max-height:${BANNER_BOX.h}px;left:${BANNER_BOX.cx}px;top:${BANNER_BOX.cy}px;transform:translate(-50%,-50%)">` : '';
  return { kind: 'banner', file: `${hsid}.png`, selector: '#banner', width: 1200, height: 279, transparent: false,
    html: ready(`<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:0;background:#fff}</style></head><body><div id="banner" style="position:relative;width:1200px;height:279px;overflow:hidden">`
      + `<img src="${assets.bannerArt}" width="1200" height="279" style="display:block">${img}</div></body></html>`) };
}
export const schoolLogoUrl = (hsid: number) => `${TEAM_LOGO_S3_BASE}/schools/${hsid}.png`;

/** A team's logo as a 32px PNG (the site's own art, exact team ID first); a team with none gets a blank square. */
export function teamLogoPicture(teamid: string, art: string | null): Picture {
  return { kind: 'logo', file: `${teamid}.png`, selector: '#l', width: 32, height: 32, transparent: true,
    html: ready(`<!doctype html><html><body style="margin:0;background:transparent"><div id="l" style="width:32px;height:32px;display:flex;align-items:center;justify-content:center">`
      + (art ? `<img src="${art}" style="max-width:32px;max-height:32px">` : '') + `</div></body></html>`) };
}
export { teamLogoAssetUrls };
/** The teams in these schools' Gazette tables this week (their alumni) and in the favorites' rows. */
export async function gazetteTeamIds(db: ImageDatabase, o: { periodStart: string; season: string; hsids?: number[] }): Promise<string[]> {
  const rows = (await db.query(
    `SELECT DISTINCT stats->>'teamid' AS teamid FROM public.weekly_player_lines WHERE period_start=$1 AND season_key=$2 AND ($3::int[] IS NULL OR hsid = ANY($3::int[]))
     UNION SELECT DISTINCT teamid::text FROM public.weekly_player_totals WHERE period_start=$1 AND season_key=$2`, [o.periodStart, o.season, o.hsids?.length ? o.hsids : null])).rows;
  return [...new Set(rows.map(r => normalizeTeamLogoId(r.teamid)).filter((v): v is string => !!v))].sort((a, b) => Number(a) - Number(b));
}

/**
 * Bracket Madness for the week ending `date` (Pete, Nov 25 2026): four two-region
 * boards (shared), and each school's own pair with its game first between the red rules.
 */
export async function bracketMadnessPictures(db: ImageDatabase, o: { date: string; season: string; hsids: number[]; assets: Assets }): Promise<Picture[]> {
  const bracket = await bracketRows(db, o.season);
  const week = bracket.filter(r => r.stage === 'bracket' && iso(r.game_end_date) === o.date);
  if (!week.length) return [];
  const scores = new Map((await db.query('SELECT * FROM public.daily_game_scores WHERE stats_date=$1 AND season_key=$2', [o.date, o.season])).rows.map(r => [`${r.region}/${r.game_id}`, r]));
  const games = week.filter(r => scores.has(`${r.region}/${r.game_id}`));
  const side = (g: Row, which: 'home' | 'away'): BoardSide => {
    const s = scores.get(`${g.region}/${g.game_id}`)!;
    return { seed: g[which + '_seed'] ?? null, name: String(s[which + '_label'] ?? ''), series: seriesRecord(bracket, g, Number(g[which + '_hsid']), o.date),
      innings: (s[which + '_innings'] || []).map(String), runs: s[which + '_runs'] ?? '' };
  };
  const region = (n: number, home: number | null) => ({ label: 'Region ' + n,
    games: bracketMadnessGames(games.filter(r => Number(r.region) === n), home).map((g): BoardGame => ({ away: side(g, 'away'), home: side(g, 'home'),
      framed: home != null && (Number(g.home_hsid) === home || Number(g.away_hsid) === home) })) });
  const picture = (file: string, pair: readonly [number, number], home: number | null): Picture => ({ kind: 'bracket', file, selector: '#board', width: 1200, height: 1400, transparent: true,
    html: ready(doubleRegionBoardHtml({ left: region(pair[0], home), right: region(pair[1], home), medallion: o.assets.medallion, fontCss: o.assets.fontCss })) });
  const out = PAIRS.map(p => picture(`${o.date}/pair-${p[0]}-${p[1]}.png`, p, null));
  for (const hsid of o.hsids) {
    const own = bracket.find(r => Number(r.home_hsid) === hsid || Number(r.away_hsid) === hsid);
    if (own) out.push(picture(`${o.date}/${hsid}.png`, pairOf(Number(own.region)), hsid));
  }
  return out;
}

// The proof's note (Pete, Nov 2026).
export const LEADERBOARD_NOTE = '* After Round 10 (Week 30), the team with the most runs in each of the 8 regions advances for the right to play the eventual 1,024-team bracket champion.';
/**
 * The Total Runs Leaderboards through the week ending `date`: four two-region boards
 * (shared), and each school's own pair with its row between the red rules. Season runs
 * count every final game through the week, bracket and runs-only, in the site's order.
 */
export async function runsLeaderboardPictures(db: ImageDatabase, o: { date: string; season: string; hsids: number[]; assets: Assets }): Promise<Picture[]> {
  const games = await bracketRows(db, o.season);
  const ends = games.filter(g => g.stage === 'bracket' && iso(g.game_end_date) === o.date).map(g => Number(g.week));
  if (!ends.length) return [];
  const week = Math.max(...ends);
  const labels = new Map<number, string>();
  for (const r of (await db.query('SELECT home_hsid, away_hsid, home_label, away_label FROM public.daily_game_scores WHERE stats_date=$1 AND season_key=$2', [o.date, o.season])).rows) {
    labels.set(Number(r.home_hsid), String(r.home_label)); labels.set(Number(r.away_hsid), String(r.away_label));
  }
  const stands = new Map<number, RunStand & { name: string }>();
  for (const g of games.filter(g => g.stage === 'bracket' && Number(g.round) === 1)) for (const s of ['home', 'away'] as const) {
    const hsid = Number(g[s + '_hsid']);
    if (!stands.has(hsid)) stands.set(hsid, { hsid, region: Number(g.region), seed: Number(g[s + '_seed']), rf: 0, ra: 0, w: 0,
      name: labels.get(hsid) || String(g[s + '_school_name'] || '').replace(/\s*\(.*\)\s*$/, '') });
  }
  for (const g of games.filter(g => g.status === 'final' && Number(g.week) <= week)) {
    const h = stands.get(Number(g.home_hsid)), a = stands.get(Number(g.away_hsid));
    if (h) { h.rf += Number(g.home_runs) || 0; h.ra += Number(g.away_runs) || 0; if (Number(g.winner_hsid) === h.hsid) h.w++; }
    if (a) { a.rf += Number(g.away_runs) || 0; a.ra += Number(g.home_runs) || 0; if (Number(g.winner_hsid) === a.hsid) a.w++; }
  }
  const all = [...stands.values()];
  const side = (region: number, home: number | null) => {
    const r = regionLeaders(all, region, home);
    return { label: 'Region ' + region, summary: r.summary, rows: r.rows.map(s => ({ place: s.place, seed: s.seed, name: stands.get(s.hsid)!.name, runs: s.rf, framed: s.hsid === home })) };
  };
  const picture = (file: string, pair: readonly [number, number], home: number | null): Picture => ({ kind: 'leaders', file, selector: '#board', width: 1200, height: 1200, transparent: true,
    html: ready(runsLeaderboardHtml({ left: side(pair[0], home), right: side(pair[1], home), note: LEADERBOARD_NOTE, medallion: o.assets.medallion, fontCss: o.assets.fontCss })) });
  const out = PAIRS.map(p => picture(`${o.date}/pair-${p[0]}-${p[1]}.png`, p, null));
  for (const hsid of o.hsids) { const me = stands.get(hsid); if (me) out.push(picture(`${o.date}/${hsid}.png`, pairOf(me.region), hsid)); }
  return out;
}

/** Fetches an image as a data: URL (null when it isn't there). */
export async function imageDataUrl(url: string, request: typeof fetch = fetch): Promise<string | null> {
  const res = await request(url).catch(() => null);
  const type = res?.headers.get('content-type') || '';
  return res?.ok && type.startsWith('image/') ? `data:${type};base64,` + Buffer.from(await res.arrayBuffer()).toString('base64') : null;
}
/** A team's art: the first published of its exact-ID candidates (the /api/team-logo lookup). */
export async function teamArt(teamid: string, request: typeof fetch = fetch): Promise<string | null> {
  for (const url of teamLogoAssetUrls(teamid)) { const art = await imageDataUrl(url, request); if (art) return art; }
  return null;
}
