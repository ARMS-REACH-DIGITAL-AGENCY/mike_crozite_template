import { digestScoreboardFont } from './fonts/bebasNeue';

/**
 * Presentation only: every statistic, score, story and asset is supplied by the
 * finished-publication reader. This module must not query, score, or send.
 *
 * Layout reference: Pete's Daily-Oct07-pcdaction-phone-8(1).pdf. Masthead and
 * board palette/geometry were recovered from the Tribune release renderer
 * (0483e1a) and newsletter preview (7d1f0c3). The Nov 19 handoff removes public
 * rehearsal banners; its mobile scoreboard remains a single column.
 *
 * Masthead, Next Game line and ASB medallion: Pete's Nov 22 2026 phone mockups,
 * measured (eyebrow, rule, date | MY FAVORITES | weekday, school logo + city +
 * name left, public/img/newsletter/daily-digest-logo.png right, rule). Sizes are
 * the mockup's proportions at a 390 px phone; desktop is the same scaled up.
 */

export type DailyDigestFavoriteRow = {
  player_name?: string;
  /** e.g. "Wednesday, 10/14 vs PEO" — his team's next scheduled game, as saved with the edition. */
  next_game?: string;
  team_name?: string;
  level?: string;
  line: string;
};

export type DailyDigestSlot = {
  home: boolean;
  homeLabel: string;
  awayLabel: string;
  homeSeed?: string;
  awaySeed?: string;
  homeCity?: string;
  awayCity?: string;
  homeInnings: unknown[];
  awayInnings: unknown[];
  homeRuns: unknown;
  awayRuns: unknown;
};

export type DailyDigestEditorial = {
  kicker?: string;
  title: string;
  body: string;
  url: string;
  cta?: string;
};

export type DailyDigestPresentation = {
  schoolLogo?: string;
  /** The approved DAILY DIGEST masthead logo (Pete, Nov 22 2026). */
  mastheadLogo?: string;
  sponsor?: {
    name: string;
    logoUrl?: string;
    imageUrl?: string;
    url?: string;
    intro?: string;
  };
  dailyDouble?: { imageUrl: string; url?: string; alt?: string };
  connect?: DailyDigestEditorial;
  contribute?: DailyDigestEditorial;
  remember?: DailyDigestEditorial;
  links?: { home?: string; favorites?: string; scoreboard?: string; pickTeams?: string };
};

export type DailyDigestLayoutInput = {
  subject: string;
  schoolName: string;
  schoolLocation: string;
  issueDateISO: string;
  statsDateISO: string;
  firstName: string;
  isSuperfan: boolean;
  favoriteCount: number;
  favoriteRows: DailyDigestFavoriteRow[];
  /** The fan's favorites' transactions that day, in MLB's own words (Pete, Nov 24 2026). */
  transactions?: { date: string; type: string; text: string }[];
  regionLabel?: string;
  story?: { title: string; story: string; seriesNote: string; shoutouts: string[] };
  /** The home school's game first, then its region's top scores (Pete, Nov 24 2026). */
  slots: DailyDigestSlot[];
  /** The drawn region board for this school and day; when present it replaces the HTML board. */
  scoreboardImage?: string;
  presentation?: DailyDigestPresentation;
};

const escapeHtml = (value: unknown): string => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char]!));

const plain = (value: unknown): string => value === null || value === undefined ? '' : String(value);

/** Never accept script URLs; embedded raster assets allow offline previews. */
function safeUrl(value: string | undefined, image = false): string | undefined {
  if (!value || /[\u0000-\u001f\u007f]/.test(value)) return undefined;
  const candidate = value.trim();
  if (image && /^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(candidate)) return candidate;
  try {
    const parsed = new URL(candidate);
    return /^(?:https?:)$/.test(parsed.protocol) && !parsed.username && !parsed.password ? candidate : undefined;
  } catch {
    return undefined;
  }
}

function link(label: string, url?: string, className = ''): string {
  const href = safeUrl(url);
  return href ? `<a${className ? ` class="${className}"` : ''} href="${escapeHtml(href)}">${label}</a>` : label;
}

function dateParts(iso: string): { weekday: string; date: string; stats: string; masthead: string } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) throw new Error('Daily Digest needs an ISO publication date.');
  const date = new Date(`${iso}T12:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== iso) throw new Error('Daily Digest date is invalid.');
  return {
    weekday: new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: 'UTC' }).format(date),
    date: new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(date),
    stats: new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(date),
    // Masthead dateline, year first (Pete's Nov 22 2026 mockup): 2027 March 25.
    masthead: `${date.getUTCFullYear()} ${new Intl.DateTimeFormat('en-US', { month: 'long', timeZone: 'UTC' }).format(date)} ${date.getUTCDate()}`,
  };
}

// The Digest is a light design: say so to email apps, and keep it readable in
// apps that force dark mode anyway (Outlook's [data-ogsc]/[data-ogsb] rewrite,
// Pete, Nov 24 2026: Outlook showed dark gray text on dark).
const DARK_SAFE = `:root{color-scheme:light only;supported-color-schemes:light only}[data-ogsc] .fav-text,[data-ogsc] .fav-text strong,[data-ogsc] .intro,[data-ogsc] .mast-city,[data-ogsc] .mast-name,[data-ogsc] .mast-dateline td{color:#f2f2ea!important}[data-ogsc] .favorite-link a,[data-ogsc] .eyebrow{color:#9fd9b4!important}[data-ogsc] .fav-head{color:#f5d76e!important}@media (prefers-color-scheme:dark){.fav-text,.fav-text strong{color:#202820!important}.fav{background:#ffffff!important}}@media(max-width:600px){.fav-name,.fav-stat,.fav-team,.fav-slash,.favorite-next,.favorite-next-game,.fav-tx,.fav-head,.mast-name,.mast-city{font-size:11px!important}.mast-brand img{width:92px!important}.story-small-title{font-size:15px!important}}`;
const STYLE = DARK_SAFE + `
@font-face{font-family:"Digest Scoreboard";font-style:normal;font-weight:400 700;src:url("${digestScoreboardFont}") format("woff2");font-display:swap;}
*{box-sizing:border-box}html,body{margin:0;padding:0}body{background:#ffffff;color:#202820;font-family:Georgia,'Times New Roman',serif;-webkit-text-size-adjust:100%}a{color:#19583f}img{max-width:100%;height:auto;border:0}p{margin:0 0 15px}h1,h2,h3{margin:0;font-weight:700}table{border-spacing:0} .paper{width:100%;max-width:800px;margin:0 auto;background:#ffffff} .pad{padding:30px 36px}.masthead{text-align:center;padding-bottom:0}.eyebrow{font:700 11px/1.5 Arial,Helvetica,sans-serif;letter-spacing:2.3px;color:#19583f;text-transform:uppercase}.masthead h1{font-size:58px;line-height:1.04;letter-spacing:-2.8px;margin:7px 0 0}.powered{font-size:20px;font-weight:bold;line-height:1.1}.tagline{font-style:italic;color:#646b60;font-size:17px;line-height:1.3;margin:15px auto 17px;max-width:620px}.tagline strong{color:#202820;font-style:normal}.dateline{display:flex;justify-content:space-between;gap:12px;border-top:3px solid #202820;border-bottom:1px solid #202820;padding:10px 0;font:12px/1.25 Arial,Helvetica,sans-serif;text-align:left}.dateline strong{text-transform:uppercase}.dateline .location{color:#646b60}.issue-date{text-align:right}.favorites-head{display:flex;align-items:center;gap:18px;margin:0 0 18px;font-family:Arial,Helvetica,sans-serif}.school-logo{width:76px;height:76px;object-fit:contain}.stats-date{font-size:18px;margin-bottom:2px}.favorites-head h2{font-size:28px;line-height:1.1;letter-spacing:-.5px}.intro{font:18px/1.55 Arial,Helvetica,sans-serif;white-space:pre-line;margin:0 0 18px}.favorite-card{border:1px solid #c9cbbd;margin-top:18px}.favorite-card-head{background:#173b21;color:#f5d76e;display:flex;justify-content:space-between;gap:12px;padding:6px 10px;font:700 13px/1.2 Arial,Helvetica,sans-serif;letter-spacing:.6px}.favorite-row{padding:11px 10px;font:15px/1.4 Arial,Helvetica,sans-serif;border-bottom:1px solid #d7dacd}.favorite-row:last-child{border-bottom:0}.favorite-row-main{display:flex;justify-content:space-between;gap:14px}.favorite-name{font-size:15px;text-transform:uppercase;font-weight:700}.favorite-team{font-size:14px;color:#444;margin-top:2px}.favorite-level{font-size:11px;color:#646b60;margin-left:5px}.favorite-line{white-space:pre-line;text-align:right}.favorite-empty{font:15px/1.5 Arial,Helvetica,sans-serif;padding:16px 12px}.favorite-link{margin-top:11px;font:700 15px/1.4 Arial,Helvetica,sans-serif}.section{border-top:3px solid #202820;text-align:center;padding:25px 36px 28px}.section h2{font-size:49px;line-height:1.1;margin:0 0 7px;letter-spacing:-.6px}.fantasy .story-title{font-size:34px;line-height:1.12;margin:6px 0 17px}.story-body,.editorial-body{font-size:19px;line-height:1.65;white-space:pre-line}.series-note{font:13px/1.45 Arial,Helvetica,sans-serif;color:#646b60;margin-top:10px}.shoutouts{font-size:16px;line-height:1.5;margin-top:12px}.shoutouts p{margin:0 0 6px}.board{margin-top:25px;font-family:Arial,Helvetica,sans-serif;text-align:left}.board-crown{position:relative;padding-top:39px}.board-crown.no-medallion{padding-top:0}.board-marquee{background:url("data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20500%2036'%20preserveAspectRatio='none'%3E%3Cpath%20fill='%23173b21'%20d='M0%2036V18H25L45%200H455L475%2018H500V36Z'/%3E%3C/svg%3E") center bottom/100% 100% no-repeat;display:flex;justify-content:space-between;align-items:flex-end;gap:95px;min-height:36px;padding:7px 10% 2px;font:400 16px/1.1 'Digest Scoreboard','Arial Narrow',Impact,Arial,sans-serif;letter-spacing:.7px;color:#fff;text-transform:uppercase}.board-marquee>span{min-width:0;max-width:calc(50% - 40px)}.sponsor-medallion{position:absolute;z-index:1;top:0;left:50%;transform:translateX(-50%);width:79px;height:79px;border-radius:50%;background:#fff;border:2px solid #173b21;box-shadow:0 0 0 2px #f5f1e6;display:flex;align-items:center;justify-content:center;padding:3.3px}.sponsor-medallion>a{display:flex;align-items:center;justify-content:center;width:100%;height:100%}.sponsor-medallion img{width:100%;height:100%;object-fit:contain;border-radius:50%}.board-body{background:#173b21;border-radius:0 0 3px 3px;border-bottom:5px solid #0e2a16;padding:5px 7px 9px}.board-columns{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:10px}.score-slot{border-top:2px solid #3d6547;border-bottom:0;margin-top:5px;padding-top:4px}.score-slot.home-game{border-top:2px solid #d0021b;border-bottom:2px solid #d0021b;padding-bottom:4px}.score-table{border-collapse:collapse;width:100%;table-layout:fixed}.score-table th{font:400 11px/1.2 'Digest Scoreboard','Arial Narrow',Impact,Arial,sans-serif;color:#f5d76e;padding:3px 0;text-align:center}.score-table th.team-heading{text-align:left;padding-left:3px}.score-table td{height:19px;padding:0;border:1px solid #254a30;background:#0e2a16;text-align:center;vertical-align:middle;font:700 13px/1.25 'Courier New',Courier,monospace;color:#fff}.score-table .team-cell{background:#173b21;border:0;text-align:right;padding:1px 6px 1px 2px;font:400 18px/1.16 'Digest Scoreboard','Arial Narrow',Impact,Arial,sans-serif;overflow-wrap:anywhere}.team-row-label{display:flex;align-items:baseline;justify-content:flex-end;gap:4px}.seed{color:#f5d76e;font-size:14px;margin-right:auto;flex-shrink:0}.team-name{text-transform:uppercase}.team-city{display:block;font:9px/1.1 Arial,Helvetica,sans-serif;color:#d1dacf;margin-top:2px}.score-table .runs{color:#f5d76e;font-weight:700}.score-table .empty-team{font:700 9px/1.2 Arial,Helvetica,sans-serif;text-align:left;padding:4px 3px}.empty-team a,.empty-team span{color:#fff;text-decoration:none}.empty-team small{display:block;font:8px/1.25 Arial,Helvetica,sans-serif;color:#c8d8cc}.board-footer{text-align:center;color:#f5d76e;font:400 12px/1.3 'Digest Scoreboard','Arial Narrow',Impact,Arial,sans-serif;text-transform:uppercase;letter-spacing:1px;margin:10px 0 0}.pick-invite{font:16px/1.25 Arial,Helvetica,sans-serif;text-align:center;margin:13px 0 0}.pick-invite a{font-weight:700}.scoreboard-link{font:13px/1.4 Arial,Helvetica,sans-serif;text-align:center;margin:9px 0 0}.daily-double{background:#ffffff}.daily-double h2{margin-bottom:18px}.double-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:14px;max-width:680px;margin:auto}.double-card{background:#173b21;border-radius:12px 12px 0 0;overflow:hidden;padding:0 9px 10px;align-self:start}.double-kicker{color:#f5d76e;letter-spacing:2px;font:700 12px/1.2 Arial,Helvetica,sans-serif;padding:8px 3px}.double-media{background:#0a120c;line-height:0;padding:10px}.double-media img{display:block;width:100%;height:auto}.double-fallback{font:15px/1.6 Georgia,'Times New Roman',serif;color:#f5f1e6;padding:28px 15px;line-height:1.5}.double-fallback .partner-logo{max-width:210px;max-height:95px;object-fit:contain;display:block;margin:0 auto 16px;background:white;padding:8px}.editorial .eyebrow{margin:0 0 8px}.editorial h3{font-size:27px;line-height:1.25;margin:0 0 15px}.editorial-body{margin-bottom:18px}.button{display:inline-block;padding:13px 24px;background:#19583f;color:#fff;font:700 14px/1.35 Arial,Helvetica,sans-serif;letter-spacing:.6px;text-decoration:none;text-transform:uppercase}.neutral{font-size:18px;line-height:1.6;color:#646b60;margin:14px auto 0;max-width:540px}.footer{border-top:3px solid #202820;text-align:center;padding:25px 22px 27px}.footer strong{font-size:19px}.footer p{font:13px/1.5 Arial,Helvetica,sans-serif;color:#646b60;margin:7px 0 0}.mast-toprule{border-top:4px solid #646b60;margin-top:8px}.mast-dateline{width:100%;border-collapse:collapse;table-layout:fixed}.mast-dateline td{padding:8.4px 0 0;font:400 27.8px/1 Arial,Helvetica,sans-serif;color:#202820;white-space:nowrap}.mast-dateline .left{width:35%;text-align:left;padding-left:12px}.mast-dateline .mid{width:30%;text-align:center;font-weight:700;text-transform:uppercase}.mast-dateline .right{width:35%;text-align:right;padding-right:26.5px}.mast-row{width:100%;border-collapse:collapse;table-layout:fixed;margin-top:42.5px}.mast-row td{padding:0;vertical-align:bottom}.mast-school{width:30.6%;text-align:left}.mast-school .school-logo{display:block;width:57.8%;height:auto;margin:0 0 13.3px 5.9%}.mast-school-rule{width:97%;border-top:6px solid #646b60;margin:0}.mast-city{font:400 24.8px/1 Arial,Helvetica,sans-serif;color:#202820;margin-top:15.4px;white-space:nowrap}.mast-name{font:700 32.6px/1 Arial,Helvetica,sans-serif;text-transform:uppercase;color:#202820;margin-top:-2.7px;white-space:nowrap}.mast-brand{width:69.4%;text-align:left}.mast-brand img{display:block;width:97.7%;height:auto}.mast-title{text-align:right}.mast-title h1{font-size:46px}.mast-bottomrule{border-top:4px solid #646b60;margin-top:6.1px}.favorite-next{text-align:left;font:14px/1.3 Arial,Helvetica,sans-serif;color:#444;margin-top:8px}.favorite-next strong{color:#202820}
@media(max-width:600px){.mast-toprule{border-top-width:2px;margin-top:4px}.mast-dateline td{font-size:13.2px;padding-top:4px}.mast-dateline .left{padding-left:5.7px}.mast-dateline .right{padding-right:12.6px}.mast-row{margin-top:20.2px}.mast-school .school-logo{margin-bottom:6.3px}.mast-school-rule{border-top-width:3px}.mast-city{font-size:11.8px;margin-top:7.3px}.mast-name{font-size:15.5px;margin-top:-1.3px}.mast-title h1{font-size:32px}.mast-bottomrule{border-top-width:2px;margin-top:2.9px}.favorites.pad{padding-top:36px}.intro{font-size:14.7px!important;line-height:1.52!important}.favorite-next{font-size:12.5px}body{background:#ffffff}.pad{padding:24px 22px}.masthead{padding-bottom:0}.masthead h1{font-size:37px;letter-spacing:-1.8px}.powered{font-size:17px}.eyebrow{font-size:10px;letter-spacing:1.8px}.tagline{font-size:15px;margin-top:12px}.dateline{font-size:11px}.favorites-head{gap:15px;margin-bottom:17px}.school-logo{width:74px;height:68px}.stats-date{font-size:17px}.favorites-head h2{font-size:25px}.intro{font-size:16px;line-height:1.55}.favorite-card-head{font-size:12px;padding:5px 9px}.favorite-row{padding:10px 9px;font-size:14px}.favorite-name{font-size:13px}.favorite-team{font-size:13px}.favorite-row-main{gap:8px}.favorite-line{font-size:13px}.favorite-link{font-size:14px}.section{padding:23px 22px 25px}.section h2{font-size:43px}.fantasy .story-title{font-size:29px;line-height:1.1;margin-bottom:17px}.story-body,.editorial-body{font-size:18px;line-height:1.65}.board-columns{grid-template-columns:minmax(0,1fr);gap:5px}.board-marquee{font-size:16px}.score-table .team-cell{font-size:18px}.score-table td{font-size:14px;height:21px}.board-footer{font-size:12px}.pick-invite{font-size:15px}.double-grid{grid-template-columns:minmax(0,1fr);gap:12px;max-width:345px}.double-kicker{font-size:12px}.double-media{padding:10px 22px}.editorial h3{font-size:24px}.button{font-size:13px;padding:13px 22px}.footer strong{font-size:17px}}
@media print{body{background:#f5f1e6}.paper{max-width:none}.favorite-card,.score-slot,.double-card{break-inside:avoid}a{color:inherit}.button{color:#fff}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
`;

function boardSlot(slot: DailyDigestSlot | null, index: number, pickTeams?: string): string {
  // No arithmetic: width follows the supplied innings, and every cell is copied.
  const innings = Math.max(9, slot?.homeInnings.length ?? 0, slot?.awayInnings.length ?? 0);
  const head = `<thead><tr><th class="team-heading">${slot?.homeSeed || slot?.awaySeed ? 'SEED' : 'TEAM'} <span style="float:right">INNING</span></th>${Array.from({ length: innings }, (_, i) => `<th scope="col">${i + 1}</th>`).join('')}<th scope="col">R</th></tr></thead>`;
  const cells = (values: unknown[], runs: unknown) => Array.from({ length: innings }, (_, i) => `<td>${escapeHtml(plain(values[i])) || '&nbsp;'}</td>`).join('') + `<td class="runs">${escapeHtml(plain(runs)) || '&nbsp;'}</td>`;
  const row = (label: string, seed: string | undefined, city: string | undefined, values: unknown[], runs: unknown) => `<tr><td class="team-cell"><span class="team-row-label">${seed ? `<span class="seed">${escapeHtml(seed)}</span>` : ''}<span class="team-name">${escapeHtml(label)}</span></span>${city ? `<span class="team-city">${escapeHtml(city)}</span>` : ''}</td>${cells(values, runs)}</tr>`;
  const rows = slot
    ? row(slot.awayLabel, slot.awaySeed, slot.awayCity, slot.awayInnings, slot.awayRuns) + row(slot.homeLabel, slot.homeSeed, slot.homeCity, slot.homeInnings, slot.homeRuns)
    : `<tr><td rowspan="2" class="team-cell empty-team">${link('ADD A TEAM<small>to your daily scoreboard</small>', pickTeams)}</td>${cells([], '')}</tr><tr>${cells([], '')}</tr>`;
  return `<div class="score-slot${slot?.home ? ' home-game' : ''}" data-slot="${index}"><table class="score-table" aria-label="${escapeHtml(slot ? `${slot.awayLabel} at ${slot.homeLabel}` : 'Add a team')}"><colgroup><col style="width:43%">${Array.from({ length: innings + 1 }, () => '<col>').join('')}</colgroup>${head}<tbody>${rows}</tbody></table></div>`;
}

function editorial(heading: string, item: DailyDigestEditorial | undefined, empty: string): string {
  return `<section class="section editorial"><h2>${heading}</h2>${item
    ? `${item.kicker ? `<div class="eyebrow">${escapeHtml(item.kicker)}</div>` : ''}<h3>${escapeHtml(item.title)}</h3><p class="editorial-body">${escapeHtml(item.body)}</p>${safeUrl(item.url) ? link(`${escapeHtml(item.cta || 'Read more')} →`, item.url, 'button') : ''}`
    : `<p class="neutral">${empty}</p>`}</section>`;
}

function editorialText(heading: string, item: DailyDigestEditorial | undefined, empty: string): string {
  return item ? [heading, item.kicker, item.title, item.body, safeUrl(item.url)].filter(Boolean).join('\n') : `${heading}\n${empty}`;
}

export function renderDailyDigestLayout(input: DailyDigestLayoutInput): { html: string; text: string } {
  const issue = dateParts(input.issueDateISO);
  dateParts(input.statsDateISO); // the stats date must still be a valid day
  const presentation = input.presentation ?? {};
  const links = presentation.links ?? {};
  const sponsor = presentation.sponsor;
  const logo = safeUrl(presentation.schoolLogo, true);
  const mastheadLogo = safeUrl(presentation.mastheadLogo, true);
  const sponsorLogo = safeUrl(sponsor?.logoUrl, true);
  const partnerImage = safeUrl(sponsor?.imageUrl, true);
  const dailyImage = safeUrl(presentation.dailyDouble?.imageUrl, true);
  // No greeting (Pete, Nov 24 2026): the Digest opens on the masthead, then the favorites.
  const emptyFavorites = input.favoriteCount > 0 ? 'None of your players were in action yesterday.' : "You haven't picked any favorites yet.";
  // Each favorite as a 3-row, 2-column table (Pete, Nov 24 2026), so every
  // email app, Outlook included, keeps the columns:
  //   Name                 | yesterday's stat line
  //   Team (Level)         | season slash line
  //   Next Game | Day | Date vs./@ Opponent
  const cell = (align: 'left' | 'right', css: string, body: string, extra = '') => `<td align="${align}" valign="top"${extra} style="${css}">${body}</td>`;
  // Favorites (Pete, Nov 24 2026): ONE table, two tight lines per player -
  //   NAME                 | yesterday's stat line
  //   Team (Level)         | season slash line
  // names left, stats right, full width, no Next Game. One table, because
  // Gmail nested separate per-player tables and indented them.
  const T = 'font:12px/1.25 Arial,Helvetica,sans-serif;color:#202820;';
  const favCell = (align: 'left' | 'right', css: string, body: string, cls: string) =>
    `<td align="${align}" valign="top" class="${cls}" style="${T}text-align:${align};${css}"><span class="fav-text">${body}</span></td>`;
  const favoriteRowsHtml = input.favoriteRows.map((row, i) => {
    const [stat, ...rest] = String(row.line ?? '').split('\n');
    const season = rest.join(' ');
    const team = [row.team_name, row.level ? `(${row.level})` : ''].filter(Boolean).join(' ');
    const rule = i ? 'border-top:1px solid #d7dacd;' : '';
    return `<tr>${favCell('left', `${rule}padding:6px 6px 0 8px;font-weight:bold;text-transform:uppercase`, escapeHtml(row.player_name), 'fav-name')}`
      + `${favCell('right', `${rule}padding:6px 8px 0 6px;white-space:nowrap`, escapeHtml(stat), 'fav-stat')}</tr>`
      + `<tr>${favCell('left', 'padding:1px 6px 6px 8px', escapeHtml(team), 'fav-team')}`
      + `${favCell('right', 'padding:1px 8px 6px 6px;white-space:nowrap', escapeHtml(season), 'fav-slash')}</tr>`;
  }).join('');
  const favHead = (left: string, right: string) => `<tr><td align="left" class="fav-head" bgcolor="#173b21" style="background:#173b21;padding:6px 8px;font:bold 12px/1.25 Arial,Helvetica,sans-serif;letter-spacing:.4px;color:#f5d76e;text-align:left;white-space:nowrap">${left}</td><td align="right" class="fav-head" bgcolor="#173b21" style="background:#173b21;padding:6px 8px;font:bold 12px/1.25 Arial,Helvetica,sans-serif;letter-spacing:.4px;color:#f5d76e;text-align:right;white-space:nowrap">${right}</td></tr>`;
  const favTable = (rows: string) => `<table role="presentation" class="fav" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="width:100%;border-collapse:collapse;background:#ffffff">${rows}</table>`;
  const favoriteHtml = favTable(favHead('MY FAVORITES', escapeHtml(`${issue.weekday}, ${issue.date}`))
    + (input.favoriteRows.length ? favoriteRowsHtml : `<tr><td colspan="2" class="favorite-empty" style="${T}padding:8px">${emptyFavorites}</td></tr>`));
  // Pete, Nov 24 2026: any favorite in a transaction, under My Favorites.
  const txHtml = input.transactions?.length ? favTable(favHead('TRANSACTIONS', '')
    + input.transactions.map((t, i) => `<tr><td colspan="2" align="left" valign="top" class="fav-tx" style="${T}${i ? 'border-top:1px solid #d7dacd;' : ''}padding:6px 8px;text-align:left"><span class="fav-text">${escapeHtml(t.text)}</span></td></tr>`).join('')) : '';
  // The Fantasy Desk story in the small size of its series note, left-justified, tight lines (Pete, Nov 24 2026).
  const small = (css = '') => `margin:0 0 6px;font:13px/1.35 Arial,Helvetica,sans-serif;color:#202820;text-align:left;${css}`;
  const storyHtml = input.story ? `<h3 class="story-title story-small-title" style="${small('font-size:16px;font-weight:bold;margin:4px 0 6px;letter-spacing:0')}">${escapeHtml(input.story.title)}</h3><p class="story-body story-small" style="${small('white-space:pre-line')}">${escapeHtml(input.story.story)}</p>${input.story.seriesNote ? `<p class="series-note story-small" style="${small('color:#646b60')}">${escapeHtml(input.story.seriesNote)}</p>` : ''}${input.story.shoutouts.length ? `<div class="shoutouts">${input.story.shoutouts.map(item => `<p class="story-small" style="${small('margin:0 0 3px')}">${escapeHtml(item)}</p>`).join('')}</div>` : ''}` : `<p class="neutral story-small" style="${small()}">Follow your school’s alumni on the scoreboard below.</p>`;
  const slotHtml = input.slots.map((slot, index) => boardSlot(slot, index, links.pickTeams));
  const boardImage = safeUrl(input.scoreboardImage, true);
  const boardAlt = `${input.regionLabel || 'Region'} scoreboard: ` + input.slots.map(slot => `${slot.awayLabel} ${plain(slot.awayRuns)}, ${slot.homeLabel} ${plain(slot.homeRuns)}`).join('; ');  // Pete's board (the Nov 13 Gazette design) as one picture; without it, the same games as an HTML board.
  const boardHtml = (boardImage
    ? `<div class="board" style="margin:12px 0 0">${link(`<img src="${escapeHtml(boardImage)}" alt="${escapeHtml(boardAlt)}" width="800" style="display:block;width:100%;height:auto;margin:0;border:0">`, links.scoreboard)}</div>`
    : `<div class="board"><div class="board-crown${sponsorLogo ? '' : ' no-medallion'}">${sponsorLogo ? `<div class="sponsor-medallion">${link(`<img src="${escapeHtml(sponsorLogo)}" alt="${escapeHtml(sponsor?.name)}">`, sponsor?.url)}</div>` : ''}<div class="board-marquee"><span>${escapeHtml(input.regionLabel || 'Alumni Baseball')}</span><span>YAT?STATS</span></div></div><div class="board-body">${slotHtml.join('')}<div class="board-footer">YAT?STATS Alumni Baseball · Bracket Tournament</div></div></div>`)
    + (safeUrl(links.scoreboard) ? `<p class="scoreboard-link">${link('See the full scoreboard', links.scoreboard)}</p>` : '');
  const dailyCard = `<div class="double-card"><div class="double-kicker">IN THE NEWS</div>${dailyImage ? `<div class="double-media">${link(`<img src="${escapeHtml(dailyImage)}" alt="${escapeHtml(presentation.dailyDouble?.alt || 'Community news')}">`, presentation.dailyDouble?.url)}</div>` : '<div class="double-fallback">No community feature is included in this edition.</div>'}</div>`;
  const partnerCard = `<div class="double-card"><div class="double-kicker">FOUNDING PARTNER</div>${partnerImage ? `<div class="double-media">${link(`<img src="${escapeHtml(partnerImage)}" alt="${escapeHtml(sponsor?.name)}">`, sponsor?.url)}</div>` : `<div class="double-fallback">${sponsor ? `${sponsorLogo ? `<img class="partner-logo" src="${escapeHtml(sponsorLogo)}" alt="${escapeHtml(sponsor.name)}">` : ''}${link(escapeHtml(sponsor.name), sponsor.url)}` : 'No partner feature is included in this edition.'}</div>`}</div>`;
  const empty = { connect: 'No community story is included in this edition.', contribute: 'No contribution feature is included in this edition.', remember: 'No alumni memory is included in this edition.' };
  // The masthead, simplified (Pete, Nov 24 2026): white (Outlook darkens any
  // tinted background), one line of tagline, the school and its city in the
  // favorites' own size, and a small Daily Digest logo. Nothing wraps.
  const INK = '#202820', RULE = '#646b60';
  const M = `font:12px/1.25 Arial,Helvetica,sans-serif;color:${INK};`;
  const ruleRow = (px: number) => `<tr><td colspan="2" bgcolor="${RULE}" style="height:${px}px;line-height:${px}px;font-size:0;background:${RULE}">&nbsp;</td></tr>`;
  const mastheadHtml = `<table role="presentation" class="masthead-table" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="width:100%;border-collapse:collapse;background:#ffffff">`
    + `<tr><td colspan="2" class="eyebrow" align="center" bgcolor="#ffffff" style="background:#ffffff;padding:10px 8px 6px;font:bold 10px/1.2 Arial,Helvetica,sans-serif;letter-spacing:1px;text-transform:uppercase;color:#19583f;text-align:center;white-space:nowrap">Your hometown. Their next chapter.</td></tr>`
    + ruleRow(2)
    + `<tr><td class="mast-school" align="left" valign="middle" bgcolor="#ffffff" style="background:#ffffff;padding:6px 6px 6px 8px;text-align:left;vertical-align:middle">`
    + `<div class="mast-name" style="${M}margin:0;font-weight:bold;text-transform:uppercase;white-space:nowrap">${escapeHtml(input.schoolName)}</div>`
    + `<div class="mast-city" style="${M}margin:0;padding-top:1px;white-space:nowrap">${escapeHtml(input.schoolLocation)}</div></td>`
    + `<td class="mast-brand" align="right" valign="middle" bgcolor="#ffffff" style="background:#ffffff;padding:6px 8px 6px 6px;text-align:right;vertical-align:middle">`
    + (mastheadLogo
      ? `<img src="${escapeHtml(mastheadLogo)}" alt="The Daily Digest, powered by YAT?STATS" width="110" style="display:inline-block;width:110px;height:auto;border:0">`
      : `<span style="${M}font-weight:bold">The Daily Digest</span>`)
    + `</td></tr>`
    + ruleRow(2)
    + `</table>`;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light only"><title>${escapeHtml(input.subject)}</title><style>${STYLE}</style></head><body bgcolor="#ffffff" style="margin:0;padding:0;background:#ffffff"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="width:100%;border-collapse:collapse;background:#ffffff"><tr><td align="center" bgcolor="#ffffff" style="background:#ffffff"><main class="paper" style="display:block;width:100%;max-width:800px;margin:0 auto;background:#ffffff">${mastheadHtml}<section class="pad favorites" style="background:#ffffff;padding:14px 0 6px">${favoriteHtml}<div style="height:10px;line-height:10px;font-size:0">&nbsp;</div>${txHtml}${safeUrl(links.favorites) ? `<p class="favorite-link" style="margin:0 0 4px;padding:0 8px;font:bold 12px/1.25 Arial,Helvetica,sans-serif;text-align:left">${link('Add or change your favorite players →', links.favorites)}</p>` : ''}</section><section class="section fantasy" style="text-align:left;background:#ffffff;padding:16px 0 12px"><div style="padding:0 8px"><div class="eyebrow" style="text-align:left">The Fantasy Desk</div>${storyHtml}</div>${boardHtml}</section><section class="section daily-double"><h2>Daily Double</h2><div class="double-grid">${dailyCard}${partnerCard}</div></section>${editorial('Connect', presentation.connect, empty.connect)}${editorial('Contribute', presentation.contribute, empty.contribute)}${editorial('Remember', presentation.remember, empty.remember)}<footer class="footer"><strong>The Daily Digest powered by YAT?STATS</strong><p>Inform. Educate. Entertain.${safeUrl(links.home) ? ` · ${link(`${escapeHtml(input.schoolName)}’s hub`, links.home)}` : ''}</p></footer></main></td></tr></table></body></html>`;
  const scoreboardText = input.slots.map((slot, index) => slot ? `${slot.home ? '[HOME] ' : ''}${slot.awaySeed ? `${slot.awaySeed} ` : ''}${slot.awayLabel}${slot.awayCity ? ` (${slot.awayCity})` : ''}: ${slot.awayInnings.map(plain).join(' | ')} — R ${plain(slot.awayRuns)}\n${slot.homeSeed ? `${slot.homeSeed} ` : ''}${slot.homeLabel}${slot.homeCity ? ` (${slot.homeCity})` : ''}: ${slot.homeInnings.map(plain).join(' | ')} — R ${plain(slot.homeRuns)}` : 'ADD A TEAM').join('\n\n');
  const text = [
    'YOUR HOMETOWN. THEIR NEXT CHAPTER.', 'The Daily Digest powered by YAT?STATS', `${input.schoolName} · ${input.schoolLocation}`, `MY FAVORITES · ${issue.weekday}, ${issue.date}`,
    input.favoriteRows.length ? input.favoriteRows.map(row => [row.player_name, [row.team_name, row.level].filter(Boolean).join(' · '), row.line].filter(Boolean).join('\n')).join('\n\n') : emptyFavorites,
    input.transactions?.length ? ['TRANSACTIONS', ...input.transactions.map(t => t.text)].join('\n') : '',
    safeUrl(links.favorites) ? `Add or change your favorite players: ${safeUrl(links.favorites)}` : '', 'THE FANTASY DESK', input.story ? [input.story.title, input.story.story, input.story.seriesNote, ...input.story.shoutouts].filter(Boolean).join('\n') : 'Follow your school’s alumni on the scoreboard below.', scoreboardText,
    safeUrl(links.scoreboard), 'Daily Double', dailyImage ? [presentation.dailyDouble?.alt || 'Community news', safeUrl(presentation.dailyDouble?.url)].filter(Boolean).join('\n') : 'No community feature is included in this edition.', sponsor ? ['FOUNDING PARTNER', sponsor.name, safeUrl(sponsor.url)].filter(Boolean).join('\n') : 'No partner feature is included in this edition.',
    editorialText('Connect', presentation.connect, empty.connect), editorialText('Contribute', presentation.contribute, empty.contribute), editorialText('Remember', presentation.remember, empty.remember), 'The Daily Digest powered by YAT?STATS', 'Inform. Educate. Entertain.', safeUrl(links.home),
  ].filter(Boolean).join('\n\n');
  return { html, text };
}
