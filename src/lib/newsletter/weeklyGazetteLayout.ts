/**
 * The YAT-A-BOY Weekly Gazette (Pete, Nov 24 2026): the markup of the approved
 * TEST 3 proof, docs/newsletter-reference/gazette-round1-test3-2026-11-13.html,
 * with Pete's Nov 19 changes (nothing internal is printed: no test banner).
 *
 * Presentation only: every statistic, story and image address is supplied by
 * the finished-publication reader. Rates (OBP, SLG, OPS, WHIP, K/BB) are the
 * standard formulas over the supplied counts, as the proof printed them.
 * Shared graphics (masthead, scoreboard, team logos) are drawn once per edition
 * and passed in as addresses; nothing is drawn per fan.
 */

export type GazetteBatRow = {
  name: string; logo?: string; bold: boolean;
  opsPlus: number | null; wl: [number, number] | null;
  /** [PA, AB, H, 2B, 3B, HR, BB, HBP, SF] */
  b: number[];
};
export type GazettePitchRow = {
  name: string; logo?: string; bold: boolean;
  fipMinus: number | null; wl: [number, number] | null;
  /** outs, H, R, ER, HR, BB, HBP, K */
  outs: number; h: number; r: number; er: number; hr: number; bb: number; hbp: number; k: number;
  fip: number | null;
};
export type GazetteTables = {
  batters: GazetteBatRow[]; pitchers: GazettePitchRow[];
  /** The school's weekly OPS+ / FIP- from its stored game (null: a dash). */
  teamOpsPlus: number | null; teamFipMinus: number | null;
  /** Total club W-L over every listed player, or null for a dash-free 0-0. */
  totalWl: [number, number];
};
export type WeeklyGazetteInput = {
  subject: string;
  schoolName: string;
  /** "Chandler, Arizona" */
  schoolPlace: string;
  week: number;
  /** The Monday the Gazette arrives (the day after the week). */
  issueDateISO: string;
  periodStartISO: string;
  periodEndISO: string;
  firstName: string;
  mastheadUrl?: string;
  scoreboardUrl?: string;
  scoreboardAlt?: string;
  story: { title: string; paragraphs: string[] };
  alumniCount: number;
  alumni: GazetteTables;
  favorites?: { count: number; tables: GazetteTables };
  /** The fan's favorites' transactions that week, in MLB's own words (Pete, Nov 24 2026). */
  transactions?: { date: string; type: string; text: string }[];
  links: { statDrawer?: string };
  /** Bracket Madness (Pete, Nov 25 2026): the week's two-region boards, the fan's own pair first. */
  bracketMadness?: { subtitle: string; boards: { url: string; alt: string }[] };
};

const esc = (value: unknown): string => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#x27;' }[c]!));
function safeUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try { const u = new URL(value); return /^https?:$/.test(u.protocol) && !u.username && !u.password ? value : undefined; } catch { return undefined; }
}
const day = (iso: string, opts: Intl.DateTimeFormatOptions) => new Date(iso + 'T12:00:00Z').toLocaleDateString('en-US', { timeZone: 'UTC', ...opts });
const rate = (v: number) => v.toFixed(3).replace(/^0(?=\.)/, '').replace(/^-0(?=\.)/, '-');
const ipOf = (outs: number) => `${Math.floor(outs / 3)}.${outs % 3}`;
const dash = (v: number | null | undefined) => (v == null ? '—' : String(Math.round(v)));
const wlText = (wl: [number, number] | null) => (wl ? `${wl[0]}-${wl[1]}` : '0-0');

const TABLE = '<table class="dr" cellpadding="2" cellspacing="0" border="1" frame="void" rules="rows" style="width:100%;border-collapse:collapse;border-color:#e3e5da;margin:0 0 22px;font:12px/24px Arial,Helvetica,sans-serif;color:#202820;white-space:nowrap">';
const HEAD = (first: string, cols: string[]) => `<tr align=center style="background:#2e8b57;color:#f5d76e;font-size:10px;font-weight:bold"><td align=left style="font-size:12px;letter-spacing:.06em;padding-left:6px">${first}${cols.map((c) => `<td>${c}`).join('')}`;
const nameCell = (row: { name: string; logo?: string }) => {
  const logo = safeUrl(row.logo);
  return `<td align=left style="font-size:13px">${logo ? `<img src="${esc(logo)}" width="16" height="16" alt="" style="vertical-align:middle"> ` : '<span style="display:inline-block;width:16px;margin-right:5px"></span>'}${esc(row.name)}`;
};
const TOTAL = (label: string) => `<tr align=center style="border-top:2px solid #c9cbbd;font-weight:bold"><td align=left style="font-size:13px">${label}`;
const GOLD = (v: string) => `<td style="color:#b8860b">${v}`;

function batCells(b: number[]) {
  const [, ab, h, d2, d3, hr, bb, hbp, sf] = b;
  const den = ab + bb + hbp + sf;
  const obp = den ? (h + bb + hbp) / den : 0;
  const slg = ab ? (h + d2 + 2 * d3 + 3 * hr) / ab : 0;
  return [ab, h, d2, d3, hr, bb, hbp, sf].map((v) => `<td>${v}`).join('') + `<td>${rate(obp)}<td>${rate(slg)}<td>${rate(obp + slg)}`;
}
function pitchCells(p: { outs: number; h: number; r: number; er: number; hr: number; bb: number; hbp: number; k: number }, fip: number | null) {
  const ip = p.outs / 3;
  const whip = ip ? (p.bb + p.h) / ip : 0;
  return `<td>${ipOf(p.outs)}` + [p.h, p.r, p.er, p.hr, p.bb, p.hbp, p.k].map((v) => `<td>${v}`).join('') +
    `<td>${whip.toFixed(2)}<td>${p.bb ? (p.k / p.bb).toFixed(2) : '—'}<td>${fip == null || !p.outs ? '—' : fip.toFixed(2)}`;
}

function tables(t: GazetteTables): { html: string; text: string[] } {
  const bat = [TABLE, HEAD('BATTERS', ['OPS+', 'W-L', 'AB', 'H', '2B', '3B', 'HR', 'BB', 'HBP', 'SF', 'OBP', 'SLG', 'OPS'])];
  const text: string[] = ['BATTERS | OPS+ | W-L | AB | H | 2B | 3B | HR | BB | HBP | SF | OBP | SLG | OPS'];
  const sum = Array(9).fill(0);
  for (const row of t.batters) {
    row.b.forEach((v, i) => { sum[i] += v; });
    bat.push(`<tr align=center${row.bold ? ' style="font-weight:bold"' : ''}>${nameCell(row)}${GOLD(dash(row.b[0] > 0 ? row.opsPlus : null))}<td>${wlText(row.wl)}${batCells(row.b)}`);
    text.push([row.name, dash(row.opsPlus), wlText(row.wl), ...row.b.slice(1)].join(' | '));
  }
  bat.push(`${TOTAL('BATTERS')}${GOLD(dash(t.teamOpsPlus))}<td>${wlText(t.totalWl)}${batCells(sum)}</table>`);
  const pit = [TABLE, HEAD('PITCHERS', ['FIP-', 'W-L', 'IP', 'H', 'R', 'ER', 'HR', 'BB', 'HBP', 'K', 'WHIP', 'K/BB', 'FIP'])];
  text.push('PITCHERS | FIP- | W-L | IP | H | R | ER | HR | BB | HBP | K');
  const tot = { outs: 0, h: 0, r: 0, er: 0, hr: 0, bb: 0, hbp: 0, k: 0 };
  let fipSum = 0, fipOuts = 0;
  for (const row of t.pitchers) {
    (Object.keys(tot) as (keyof typeof tot)[]).forEach((key) => { tot[key] += row[key]; });
    if (row.fip != null && row.outs) { fipSum += row.fip * row.outs; fipOuts += row.outs; }
    pit.push(`<tr align=center${row.bold ? ' style="font-weight:bold"' : ''}>${nameCell(row)}${GOLD(dash(row.outs > 0 ? row.fipMinus : null))}<td>${wlText(row.wl)}${pitchCells(row, row.fip)}`);
    text.push([row.name, dash(row.fipMinus), wlText(row.wl), ipOf(row.outs), row.h, row.r, row.er, row.hr, row.bb, row.hbp, row.k].join(' | '));
  }
  pit.push(`${TOTAL('PITCHERS')}${GOLD(dash(t.teamFipMinus))}<td>${wlText(t.totalWl)}${pitchCells(tot, fipOuts ? fipSum / fipOuts : null)}</table>`);
  return { html: bat.join('\n') + '\n' + pit.join('\n'), text };
}

const STYLE = '.p{padding:22px 22px}.h{text-align:center;font:bold 30px/1.1 Georgia,serif;margin:0 0 12px}.k{text-align:center;font:bold 10px Arial;letter-spacing:.17em;color:#19583f;margin:0 0 6px}.sec{border-bottom:3px solid #202820}@media only screen and (max-width:600px){.lz td.lzc{display:block!important;width:100%!important;padding:0!important}.lz td.lzg{display:none!important}.dr td{font-size:9.5px!important;padding-left:1px!important;padding-right:1px!important}.dr td:first-child{font-size:11px!important;padding-left:3px!important}}';
const P = (text: string, extra = '') => `<p style="margin:0 0 14px;font:17px/1.7 Georgia,serif${extra}">${esc(text)}</p>`;

export function renderWeeklyGazetteLayout(input: WeeklyGazetteInput): { html: string; text: string } {
  for (const iso of [input.issueDateISO, input.periodStartISO, input.periodEndISO]) if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) throw new Error('The Gazette needs ISO dates.');
  const school = input.schoolName;
  const masthead = safeUrl(input.mastheadUrl);
  const board = safeUrl(input.scoreboardUrl);
  const weekOf = `Week of ${day(input.periodStartISO, { month: 'long', day: 'numeric' })}–${day(input.periodEndISO, { month: 'long', day: 'numeric', year: 'numeric' })}`;
  const issue = day(input.issueDateISO, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const greeting = input.firstName ? `Hi ${input.firstName},` : 'Hi,';
  const alumni = tables(input.alumni);
  const favs = input.favorites ? tables(input.favorites.tables) : null;
  const drawer = safeUrl(input.links.statDrawer);
  const madness = (input.bracketMadness?.boards || []).flatMap((b) => { const url = safeUrl(b.url); return url ? [{ url, alt: b.alt }] : []; });
  const html = [
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(input.subject)}</title><style>${STYLE}</style></head><body style="margin:0;background:#e3e5dc"><div style="max-width:720px;margin:0 auto;background:#ffffff;border-top:5px solid #19583f;color:#202820;font-family:Arial,Helvetica,sans-serif">`,
    masthead ? `<div style="padding:14px 12px 4px"><img src="${esc(masthead)}" width="600" alt="Yataboy Gazette" style="display:block;width:100%;max-width:600px;height:auto;margin:0 auto"></div>` : '',
    `<div style="padding:0 22px"><table width="100%" cellpadding="0" cellspacing="0" style="border-bottom:1px solid #202820">`,
    `<tr><td style="padding:8px 0;font:bold 11px Arial,Helvetica,sans-serif">${esc(school.toUpperCase())}<br><span style="font-weight:normal;color:#666">${esc(input.schoolPlace)}</span></td><td align=right style="padding:8px 0;font:bold 11px Arial,Helvetica,sans-serif">WEEKLY EDITION · WEEK ${input.week}<br><span style="font-weight:normal;color:#666">${esc(issue)}</span></td></tr></table>`,
    `</div>`,
    `<div style="padding:26px 22px 24px;border-bottom:3px solid #202820"><p style="margin:0 0 8px;text-align:center;font:bold 12px Arial,Helvetica,sans-serif;letter-spacing:.2em;color:#19583f">${esc(school.toUpperCase())}'S WEEK</p>`,
    `<h2 style="margin:0 0 14px;font:bold 24px/1.2 Georgia,serif;text-align:center"><span style="display:inline-block">${esc(input.story.title)}</span></h2>${P(greeting, ';margin-bottom:6px')}`,
    ...input.story.paragraphs.map((p) => P(p)),
    board ? `<img src="${esc(board)}" width="600" alt="${esc(input.scoreboardAlt || 'Scoreboard')}" style="display:block;width:100%;max-width:600px;height:auto;margin:6px auto 0">` : '',
    `</div>`,
    `<div style="padding:26px 22px 24px;border-bottom:3px solid #202820"><h2 style="margin:0 0 4px;font:bold 28px/1.15 Georgia,serif;text-align:center">${esc(school)} Alumni Stats</h2><p style="margin:0 0 4px;text-align:center;font:bold 14px Arial,Helvetica,sans-serif">${esc(weekOf)}</p>`,
    `<p style="margin:0 0 16px;text-align:center;font:12px Arial,Helvetica,sans-serif;color:#666">${esc(school)}'s ${input.alumniCount} active alumni. Your favorites are in bold.</p>`,
    alumni.html,
    favs && input.favorites ? `<p style="margin:22px 0 8px;font:bold 13px Arial,Helvetica,sans-serif;letter-spacing:.06em;color:#19583f">YOUR ${input.favorites.count} SUPERFAN FAVORITES</p>\n${favs.html}` : '',
    input.transactions?.length ? `<p style="margin:22px 0 8px;font:bold 13px Arial,Helvetica,sans-serif;letter-spacing:.06em;color:#19583f">YOUR FAVORITES' TRANSACTIONS</p>\n${TABLE}\n${HEAD('DATE', ['TRANSACTION'])}\n` +
      input.transactions.map((t) => `<tr><td align=left valign=top style="font-size:12px;padding-left:6px;white-space:nowrap">${esc(day(t.date, { month: 'short', day: 'numeric' }))}<td align=left style="white-space:normal;line-height:18px;padding:4px 6px">${esc(t.text)}`).join('\n') + '</table>' : '',
    `<p style="margin:0 0 14px;font:11px Arial,Helvetica,sans-serif;color:#666">OPS+, FIP- and club W-L come from each school's bracket game and show a dash for players outside ${esc(school)}'s.</p>`,
    drawer ? `<p style="margin:0;text-align:center;font:bold 13px Arial,Helvetica,sans-serif"><a href="${esc(drawer)}" style="color:#19583f">See each day of the week in the stat drawer →</a></p>` : '',
    `</div>`,
    madness.length ? `<div style="padding:26px 22px 24px;border-bottom:3px solid #202820"><h2 style="margin:0 0 4px;font:bold 28px/1.15 Georgia,serif;text-align:center">Bracket Madness Around the Country</h2>`
      + `<p style="margin:0 0 16px;text-align:center;font:13px Arial,Helvetica,sans-serif;color:#666">${esc(input.bracketMadness!.subtitle)}</p>`
      + madness.map((b) => `<img src="${esc(b.url)}" width="600" alt="${esc(b.alt)}" style="display:block;width:100%;max-width:600px;height:auto;margin:0 auto 16px">`).join('') + `</div>` : '',
    `</div></body></html>`,
  ].filter(Boolean).join('\n');
  const text = [
    'YAT-A-BOY WEEKLY GAZETTE', `${school} · ${input.schoolPlace}`, `WEEKLY EDITION · WEEK ${input.week} · ${issue}`,
    `${school.toUpperCase()}'S WEEK`, input.story.title, greeting, ...input.story.paragraphs,
    `${school} Alumni Stats`, weekOf, `${school}'s ${input.alumniCount} active alumni. Your favorites are in bold.`, ...alumni.text,
    ...(favs && input.favorites ? [`YOUR ${input.favorites.count} SUPERFAN FAVORITES`, ...favs.text] : []),
    ...(input.transactions?.length ? ["YOUR FAVORITES' TRANSACTIONS", ...input.transactions.map((t) => `${day(t.date, { month: 'short', day: 'numeric' })}: ${t.text}`)] : []),
    drawer ? `See each day of the week in the stat drawer: ${drawer}` : '',
    ...(madness.length ? ['BRACKET MADNESS AROUND THE COUNTRY', input.bracketMadness!.subtitle, ...madness.map((b) => b.alt)] : []),
  ].filter(Boolean).join('\n\n');
  return { html, text };
}
