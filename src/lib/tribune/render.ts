import {
  BATTING_COLUMNS,
  PITCHING_COLUMNS,
  TRIBUNE_BYLINE,
  TRIBUNE_NAME,
  TRIBUNE_TAGLINE,
  type TribuneEdition,
  type TribuneMatchup,
  type TribunePlayerRow,
  type TribuneRoster,
  type TribuneScoreSide,
  type TribuneStatsTable,
} from './types';

const C = {
  paper: '#f6f2e8', ink: '#202820', muted: '#646b60', line: '#c9cbbd',
  green: '#19583f', greenDark: '#123f2d', gold: '#edd476', pale: '#eaece0',
};
const SERIF = "Georgia,'Times New Roman',serif";
const SANS = 'Arial,Helvetica,sans-serif';
const MONO = "'Courier New',Courier,monospace";

/** Render external content as text. Only absolute HTTP(S) URLs become links/images. */
function esc(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]!));
}
function url(value?: string): string | undefined {
  if (!value) return undefined;
  try { const parsed = new URL(value); return /^https?:$/.test(parsed.protocol) ? parsed.href : undefined; }
  catch { return undefined; }
}
function color(value?: string): string {
  return value && /^#[0-9a-f]{6}$/i.test(value) ? value : C.green;
}
function textLink(label: string, destination?: string, style = ''): string {
  const href = url(destination);
  const base = `color:${C.green};text-decoration:underline;text-underline-offset:3px;${style}`;
  return href ? `<a href="${esc(href)}" style="${base}">${esc(label)}</a>` : `<span style="color:${C.muted};${style}">${esc(label)}</span>`;
}
function button(label: string, destination?: string, dark = false): string {
  const href = url(destination);
  if (!href) return `<span style="font:700 12px ${SANS};color:${C.muted}">${esc(label)} — link available with delivery</span>`;
  return `<a href="${esc(href)}" style="display:inline-block;background:${dark ? C.ink : C.green};border:1px solid ${dark ? C.ink : C.green};padding:13px 19px;color:#ffffff;text-decoration:none;font:700 12px ${SANS};letter-spacing:.5px;mso-padding-alt:0;text-align:center;">${esc(label)}</a>`;
}
function date(value: string, long = false): string {
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const d = new Date(dateOnly ? `${value}T12:00:00Z` : value);
  if (!Number.isFinite(d.getTime())) return value;
  return new Intl.DateTimeFormat('en-US', {
    month: long ? 'long' : 'short', day: 'numeric', year: 'numeric',
    timeZone: dateOnly ? 'UTC' : 'America/Phoenix',
  }).format(d);
}
function dateRange(start: string, end: string): string {
  return start === end ? date(start) : `${date(start)} – ${date(end)}`;
}
function columns(table: TribuneStatsTable): readonly string[] {
  return table.kind === 'batting' ? BATTING_COLUMNS : PITCHING_COLUMNS;
}
function rowStatus(row: TribunePlayerRow): string {
  return row.state === 'no-appearance' ? 'No appearance' : row.state === 'unavailable' ? 'Data unavailable' : '';
}
function rowContext(row: TribunePlayerRow, otherSchools: boolean): string {
  return [otherSchools ? row.school : undefined, row.team, row.level, rowStatus(row)].filter(Boolean).join(' · ');
}
function seriesLabel(m: TribuneMatchup): string {
  return `Round ${m.round} · Game ${m.game} · Week ${m.week}`;
}
function matchupStatus(m: TribuneMatchup): string {
  return ({ upcoming: 'UPCOMING', live: 'IN PROGRESS', final: 'FINAL', unavailable: 'RESULTS UNAVAILABLE' } as const)[m.status];
}
function metric(value: number | null | undefined): string {
  return value == null || !Number.isFinite(value) ? '—' : Math.round(value).toString();
}
function winPct(side: TribuneScoreSide): string {
  const total = side.clubRecord[0] + side.clubRecord[1];
  return total ? (side.clubRecord[0] / total).toFixed(3).replace(/^0/, '') : '—';
}
function score(side: TribuneScoreSide, m: TribuneMatchup): string {
  return m.status === 'upcoming' || m.status === 'unavailable' ? '—' : String(side.total);
}
function inningRun(m: TribuneMatchup, side: TribuneScoreSide, index: number): string {
  if (m.status === 'upcoming' || m.status === 'unavailable' || m.inningStates[index] === 'future') return '—';
  const value = side.runs[index];
  return value == null ? '—' : `${value}${m.inningStates[index] === 'provisional' ? '*' : ''}`;
}
function inningCount(m: TribuneMatchup): number {
  return Math.max(9, m.away.runs.length, m.home.runs.length, m.inningStates.length);
}
const SCORING_TEXT = 'Innings 1–7 compare each day’s OPS+ and FIP- (Monday–Sunday); inning 8 compares the full week; inning 9 compares real-game winning percentage. Higher OPS+ and lower FIP- are better.';
function matchupNote(m: TribuneMatchup): string {
  return (m.note ?? '')
    .replace(/^Innings 1[–-]7: Monday[–-]Sunday\.\s*Inning 8: the whole week\.\s*Inning 9: real-club winning percentage\.\s*/, '')
    .replace(/\bYellow innings are provisional\b/gi, 'Innings marked * are provisional')
    .trim();
}
function sponsorCredit(e: TribuneEdition): string | undefined {
  if (!e.sponsor) return undefined;
  if (e.sponsor.acknowledgment?.trim()) return e.sponsor.acknowledgment.trim();
  return `A tip of the cap to ${e.sponsor.name}. Their support helps keep these stories, stats and fantasy updates free for ${e.school.name} fans. Give them a little hometown love, too.`;
}
function proofNotice(e: TribuneEdition): { heading: string; body: string } | undefined {
  if (e.dataStatus === 'illustrative') return {
    heading: 'DESIGN PROOF · SYNTHETIC SAMPLE DATA',
    body: 'Example statistics and narrative for layout review. This is not a report of a real game or player performance.',
  };
  if (e.preview) return {
    heading: 'DESIGN PROOF · FOR LAYOUT APPROVAL',
    body: e.dataStatus === 'unavailable' ? 'Live statistics are unavailable in this proof. Missing results are not recorded as zero.' : 'Review copy. This edition has not been scheduled for delivery.',
  };
  if (e.dataStatus === 'unavailable') return {
    heading: 'STATISTICS UPDATE', body: 'Some statistics are unavailable. Missing results are not recorded as zero.',
  };
  return undefined;
}
function kicker(label: string, tint = C.green): string {
  return `<p style="margin:0 0 10px;color:${tint};font:700 10px ${SANS};line-height:1.4;letter-spacing:1.7px;text-transform:uppercase;">${esc(label)}</p>`;
}
function renderPublisherNote(e: TribuneEdition): string {
  const note = e.publisherNote;
  if (!note) return '';
  const image = url(note.imageUrl);
  const cta = url(note.ctaUrl);
  const title = note.title.trim() || 'Publisher’s Note';
  return `<tr><td class="pad" style="padding:24px 32px 0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;border:1px solid ${C.line};background:#fbfaf4;"><tr><td style="padding:21px 23px;">
    ${kicker('FROM THE PUBLISHER')}
    <h2 style="margin:0 0 12px;font:700 25px ${SERIF};line-height:1.25;">${esc(title)}</h2>
    ${image ? `<img src="${esc(image)}" alt="${esc(title)}" width="666" style="display:block;width:100%;max-width:666px;height:auto;border:0;margin:0 0 16px;">` : ''}
    ${note.paragraphs.map((paragraph, i) => `<p style="margin:${i ? '12px' : '0'} 0 0;font:15px ${SERIF};line-height:1.75;color:${C.ink};">${esc(paragraph).replace(/\r?\n/g, '<br>')}</p>`).join('')}
    ${note.byline ? `<p style="margin:14px 0 0;font:700 11px ${SANS};line-height:1.7;color:${C.muted};">${esc(note.byline)}</p>` : ''}
    ${note.ctaLabel && cta ? `<p style="margin:17px 0 0;">${button(note.ctaLabel, cta)}</p>` : ''}
  </td></tr></table></td></tr>`;
}

function renderLineScore(m: TribuneMatchup): string {
  const count = inningCount(m);
  const heading = Array.from({ length: count }, (_, i) => `<th scope="col" align="center" style="font-weight:700;padding:8px 3px;color:${C.gold};">${i + 1}</th>`).join('');
  const rows = [m.away, m.home].map((side, sideIndex) => `<tr>
    <th scope="row" align="left" style="padding:11px 10px 11px 13px;font:700 12px ${SANS};color:${sideIndex === 1 ? C.gold : '#ffffff'};width:155px;">${esc(side.name)}<br><span style="font-size:9px;font-weight:400;color:#cbd9c9;">${esc(side.location ?? '')}</span></th>
    ${Array.from({ length: count }, (_, i) => `<td align="center" style="padding:10px 3px;border-left:2px solid ${C.green};background:${C.greenDark};font:700 17px ${MONO};">${esc(inningRun(m, side, i))}</td>`).join('')}
    <td align="center" style="padding:8px 10px;background:${C.gold};color:${C.greenDark};font:700 25px ${SERIF};">${esc(score(side, m))}</td>
  </tr>`).join('');
  return `<div class="table-scroll" role="region" aria-label="Inning-by-inning score" tabindex="0" style="width:100%;max-width:100%;overflow-x:auto;-webkit-overflow-scrolling:touch;">
    <table class="line-score" width="100%" cellpadding="0" cellspacing="0" style="width:100%;min-width:${540 + (count - 9) * 34}px;border-collapse:separate;border-spacing:0 3px;background:${C.green};color:#ffffff;font:11px ${SANS};">
      <caption style="padding:0;text-align:left;"><span style="display:block;padding:12px 13px 8px;background:${C.green};color:#ffffff;font:700 10px ${SANS};letter-spacing:.8px;">${esc(seriesLabel(m))} &nbsp; / &nbsp; ${esc(matchupStatus(m))}</span></caption>
      <thead><tr><th scope="col" align="left" style="padding:8px 13px;font-size:9px;font-weight:400;color:#d8e3d6;">INNING</th>${heading}<th scope="col" align="center" style="padding:8px;color:${C.gold};">R</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}
function renderMetrics(m: TribuneMatchup): string {
  const header = Array.from({ length: 9 }, (_, i) => `<th scope="col" align="center" style="padding:5px 2px;font-size:9px;color:${C.gold};">${i + 1}</th>`).join('');
  const rows = [m.away, m.home].map((side) => `<tr><th scope="row" align="left" style="padding:8px 10px;color:${C.gold};font:700 17px ${SERIF};width:80px;">${esc(side.abbreviation)}<br><span style="font:9px ${SANS};color:#d7e1d3;">${esc(side.location ?? '')}</span></th>${Array.from({ length: 9 }, (_, i) => {
    const future = m.status === 'upcoming' || m.status === 'unavailable' || m.inningStates[i] === 'future';
    if (i === 8) return `<td align="center" style="padding:7px 3px;border-left:1px solid #3f7158;font:700 11px ${MONO};color:${C.gold};"><span style="font:8px ${SANS};color:#d7e1d3;">W%</span><br>${future ? '—' : esc(winPct(side))}<br><span style="font:9px ${MONO};color:#d7e1d3;">${future ? '—' : esc(side.clubRecord.join('–'))}</span></td>`;
    return `<td align="center" style="padding:7px 3px;border-left:1px solid #3f7158;font:700 11px ${MONO};"><span style="font:8px ${SANS};color:#d7e1d3;">OPS+</span> ${future ? '—' : esc(metric(side.opsPlus[i]))}<br><span style="font:8px ${SANS};color:#d7e1d3;">FIP-</span> ${future ? '—' : esc(metric(side.fipMinus[i]))}</td>`;
  }).join('')}</tr>`).join('');
  return `<div class="table-scroll" role="region" aria-label="Fantasy scoring metrics" tabindex="0" style="width:100%;max-width:100%;overflow-x:auto;-webkit-overflow-scrolling:touch;margin-top:9px;"><table width="100%" cellpadding="0" cellspacing="0" style="width:100%;min-width:670px;border-collapse:collapse;background:${C.greenDark};color:#ffffff;font-family:${SANS};"><caption style="text-align:left;padding:8px 10px;background:${C.green};color:#ffffff;font:700 9px ${SANS};letter-spacing:1px;">THE NUMBERS BEHIND THE RUNS</caption><thead><tr><th scope="col" align="left" style="padding:5px 10px;font-size:8px;color:#d7e1d3;">TEAM</th>${header}</tr></thead><tbody>${rows}</tbody></table></div>`;
}
function renderMatchup(e: TribuneEdition): string {
  const m = e.matchup;
  if (!m) return `<div style="padding:17px 19px;background:${C.pale};border-top:2px solid ${C.ink};"><p style="margin:0;font:700 15px ${SERIF};">Around the alumni diamonds</p><p style="margin:6px 0 0;font:12px ${SANS};line-height:1.6;">There is no current fantasy matchup in this edition. Alumni production appears in the complete box scores below.</p></div>`;
  const note = matchupNote(m);
  return `${renderLineScore(m)}${renderMetrics(m)}<p style="margin:10px 0 0;color:${C.muted};font:11px ${SANS};line-height:1.65;">Fantasy game: ${esc(dateRange(m.start, m.end))}. ${esc(SCORING_TEXT)} <strong>*</strong> Provisional. <strong>—</strong> Pending or unavailable.</p>${note ? `<p style="margin:6px 0 0;font:11px ${SANS};line-height:1.6;color:${C.muted};">${esc(note)}</p>` : ''}`;
}
function renderStats(table: TribuneStatsTable, otherSchools: boolean): string {
  const cols = columns(table);
  const label = table.kind === 'batting' ? 'BATTERS' : 'PITCHERS';
  const body = table.rows.map((row, index) => {
    const logo = url(row.logoUrl);
    const context = rowContext(row, otherSchools);
    const name = textLink(row.name, row.profileUrl, `color:${C.ink};font-weight:700;text-decoration:none;`);
    return `<tr bgcolor="${index % 2 === 0 ? '#fbfaf4' : '#f0f1e8'}"><th scope="row" align="left" style="width:175px;font:12px ${SANS};font-weight:400;border-bottom:1px solid #e0e2d7;">${logo ? `<img src="${esc(logo)}" width="16" height="16" alt="" style="display:inline-block;width:16px;height:16px;vertical-align:middle;margin-right:6px;">` : ''}${name}${context ? `<br><span style="font-size:9px;line-height:1.6;color:${row.state === 'unavailable' ? '#836037' : C.muted};">${esc(context)}</span>` : ''}</th>${cols.map((_, i) => `<td align="right">${esc(row.cells[i] ?? '—')}</td>`).join('')}</tr>`;
  }).join('');
  const empty = !table.rows.length ? `<tr><td colspan="${cols.length + 1}" align="left" style="padding:15px;color:${C.muted};font:12px ${SANS};">No ${table.kind === 'batting' ? 'batters' : 'pitchers'} are listed in this roster.</td></tr>` : '';
  return `<div class="table-scroll" role="region" aria-label="${label} statistics" tabindex="0" style="width:100%;max-width:100%;overflow-x:auto;-webkit-overflow-scrolling:touch;margin:13px 0 0;"><table class="stats" width="100%" cellpadding="5" cellspacing="0" style="width:100%;min-width:700px;border-collapse:collapse;color:${C.ink};background:#fbfaf4;font:11px ${MONO};text-align:right;line-height:1.35;">
    <thead><tr bgcolor="${C.green}"><th scope="col" align="left" style="padding:8px 7px;color:${C.gold};font:700 10px ${SANS};letter-spacing:.6px;">${label}</th>${cols.map((c) => `<th scope="col" align="right" style="color:${C.gold};font:700 10px ${SANS};white-space:nowrap;">${esc(c)}</th>`).join('')}</tr></thead>
    <tbody>${body}${empty}</tbody>
    <tfoot><tr style="border-top:2px solid ${C.green};font-weight:700;"><th scope="row" align="left" style="padding:10px 7px;font:700 10px ${SANS};">${label}</th>${cols.map((_, i) => `<td align="right" style="padding-top:10px;padding-bottom:10px;">${esc(table.totals[i] ?? '—')}</td>`).join('')}</tr></tfoot>
  </table></div>`;
}
function renderRoster(roster: TribuneRoster, otherSchools: boolean, e: TribuneEdition): string {
  const subheading = otherSchools ? 'YOUR SUPERFAN FOLLOW LIST' : `${e.period.cadence === 'daily' ? 'DAILY' : 'WEEKLY'} ALUMNI PRODUCTION`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;table-layout:fixed;"><tr><td class="pad section" style="padding:28px 32px 25px;border-top:3px solid ${C.ink};">
    ${kicker(subheading)}
    <h2 style="margin:0 0 8px;font:700 29px ${SERIF};line-height:1.15;letter-spacing:-.6px;">${otherSchools ? 'Beyond the home diamond.' : 'Every alum. Every box score.'}</h2>
    <p style="margin:0 0 10px;font:13px ${SANS};line-height:1.6;">${esc(roster.title)} &nbsp;·&nbsp; ${esc(String(roster.playerCount))} players &nbsp;·&nbsp; ${esc(e.period.label)}</p>
    ${otherSchools ? `<p style="margin:0 0 8px;font:12px ${SANS};line-height:1.7;color:${C.muted};">Players you follow from other schools. Their production is shown separately and does not count toward ${esc(e.school.name)}’s fantasy result.</p>` : `<p style="margin:0 0 8px;font:12px ${SANS};line-height:1.7;color:${C.muted};">The complete school roster, including players with no appearance in this period. Same columns and totals as your tournament’s stats table.</p>`}
    <p style="margin:0 0 6px;color:${C.muted};font:11px ${SANS};line-height:1.6;">On a small screen, swipe across the tables to see every column.${e.links.web ? ` ${textLink('Open the full-width edition', e.links.web)}.` : ' The browser edition will offer full-width tables.'}</p>
    ${renderStats(roster.batting, otherSchools)}${renderStats(roster.pitching, otherSchools)}
    ${roster.clubRecord ? `<p style="margin:8px 0 0;border-top:1px solid ${C.line};padding:10px 7px;font:700 11px ${SANS};">TEAM TOTAL &nbsp; ${esc(roster.clubRecord)} <span style="font-weight:400;color:${C.muted};">real-game W–L</span></p>` : ''}
    <p style="margin:12px 0 0;color:${C.muted};font:10px ${SANS};line-height:1.7;"><strong>No appearance</strong> = no recorded appearance in the period. <strong>Data unavailable</strong> = a result could not be verified. <strong>—</strong> = unavailable or not applicable; it is not a zero.</p>
    ${roster.note ? `<p style="margin:8px 0 0;color:${C.muted};font:11px ${SANS};line-height:1.6;">${esc(roster.note)}</p>` : ''}
  </td></tr></table>`;
}
function renderSponsor(e: TribuneEdition): string {
  const sponsor = e.sponsor;
  if (!sponsor) return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td class="pad" style="padding:4px 32px 28px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${C.line};"><tr><td align="center" style="padding:24px 18px;">${kicker('ADVERTISEMENT · SPONSOR SPACE')}<p style="margin:0 0 8px;font:700 24px ${SERIF};">A little hometown support goes a long way.</p><p style="margin:0;font:12px ${SANS};line-height:1.7;color:${C.muted};">Reserved for this school’s sponsor: their message, logo and offer.${e.links.sponsorInquiry ? ` ${textLink('Support this school’s edition', e.links.sponsorInquiry)}.` : ''}</p></td></tr></table></td></tr></table>`;
  const logo = url(sponsor.logoUrl);
  const image = url(sponsor.imageUrl);
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td class="pad" style="padding:4px 32px 28px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${C.ink};"><tr><td style="padding:9px 17px;border-bottom:1px solid ${C.line};font:700 9px ${SANS};letter-spacing:1.5px;color:${C.muted};">ADVERTISEMENT &nbsp; / &nbsp; ${esc(sponsor.label ?? 'YOUR SCHOOL’S COMMUNITY PARTNER')}</td></tr>${image ? `<tr><td><img src="${esc(image)}" alt="${esc(sponsor.imageAlt?.trim() || sponsor.name)}" width="714" style="width:100%;height:auto;display:block;border:0;"></td></tr>` : ''}<tr><td style="padding:23px 24px;">${logo ? `<img src="${esc(logo)}" alt="${esc(sponsor.name)} logo" width="142" style="max-width:142px;width:142px;height:auto;display:block;margin:0 0 15px;">` : `<p style="margin:0 0 11px;color:${C.green};font:700 11px ${SANS};letter-spacing:1.4px;text-transform:uppercase;">${esc(sponsor.name)}</p>`}<h2 style="margin:0 0 10px;font:700 29px ${SERIF};line-height:1.15;">${esc(sponsor.headline)}</h2><p style="margin:0 0 18px;max-width:580px;font:14px ${SANS};line-height:1.75;color:${C.muted};">${esc(sponsor.body)}</p>${button(sponsor.cta, sponsor.url)}</td></tr></table></td></tr></table>`;
}
const SWEEPSTAKES_TEXT = 'Your school’s fantasy bracket is also a fan sweepstakes, with a chance to win a trip to the 2027 Fall Classic. Registration and entry requirements apply. Read the official rules for eligibility, deadlines, entry limits and prize details.';
const SHARING_TEXT = 'Know an alum who still checks the box scores? Pass them the paper. Every new fan helps grow the school’s community and the value its sponsors can bring back to the program.';
function sweepstakesText(e: TribuneEdition): string {
  return e.sweepstakesReminder?.trim() || SWEEPSTAKES_TEXT;
}

export function tribuneSubject(e: TribuneEdition): string {
  const period = e.period.cadence === 'daily' ? 'daily' : 'weekly';
  const headline = e.story.headline.replace(/[\r\n]+/g, ' ').trim();
  return `${e.preview ? '[DESIGN PROOF] ' : ''}${TRIBUNE_NAME} | ${e.school.name} ${period} edition — ${headline}`.replace(/[\r\n]+/g, ' ');
}

/** Email-safe markup; tables stay complete even when a small-screen client needs the browser edition. */
export function renderTribuneHtml(e: TribuneEdition): string {
  const proof = proofNotice(e);
  const mastheadImage = url(e.masthead?.imageUrl);
  const schoolLogo = url(e.school.logoUrl);
  const schoolColor = color(e.school.color);
  const credit = sponsorCredit(e);
  const cadence = e.period.cadence === 'daily' ? 'Daily' : 'Weekly';
  const rulesUrl = url(e.links.officialRules);
  const articleParagraphs = e.story.paragraphs.map((p, i) => `<p style="margin:${i ? '15px' : '0'} 0 0;font:17px ${SERIF};line-height:1.75;color:${C.ink};">${esc(p)}</p>`).join('');
  const utility = [e.links.web ? textLink('View in browser', e.links.web) : 'Browser edition', e.links.text ? textLink('Plain-text edition', e.links.text) : 'Plain-text version included'].join(' &nbsp; / &nbsp; ');
  const proofHtml = proof ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td class="pad" style="padding:14px 32px;background:#fff0c7;border-bottom:1px solid #cfb966;"><p style="margin:0 0 4px;font:700 10px ${SANS};letter-spacing:1.1px;color:#775917;">${esc(proof.heading)}</p><p style="margin:0;font:11px ${SANS};line-height:1.6;color:#725f35;">${esc(proof.body)}</p></td></tr></table>` : '';
  const notices = (e.notices ?? []).map((n) => `<p style="margin:6px 0;font:11px ${SANS};line-height:1.6;color:${C.muted};">${esc(n)}</p>`).join('');
  const follows = e.recipientTier === 'superfan' && e.follows ? renderRoster(e.follows, true, e) : '';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>${esc(tribuneSubject(e))}</title><style>
    html,body{margin:0!important;padding:0!important;width:100%!important;}body{background:#e3e5dc;}table{mso-table-lspace:0pt;mso-table-rspace:0pt;}img{border:0;outline:none;text-decoration:none;}a{color:${C.green};}.table-scroll{max-width:100%;overflow-x:auto;}.stats td{white-space:nowrap;border-bottom:1px solid #e0e2d7;}.stats th{text-align:left;}.stats thead th:not(:first-child){text-align:right;}.stats tfoot th{white-space:nowrap;}
    @media only screen and (max-width:600px){.outer-pad{padding:0!important;}.paper{width:100%!important;}.pad{padding-left:19px!important;padding-right:19px!important;}.masthead{font-size:43px!important;letter-spacing:-2px!important;}.masthead-sub{font-size:40px!important;}.headline{font-size:35px!important;letter-spacing:-1px!important;}.edition-meta{font-size:9px!important;}.story-column,.sidebar-column{display:block!important;width:auto!important;max-width:none!important;}.story-column{padding-right:0!important;}.sidebar-column{padding:20px 0 0!important;border-left:0!important;border-top:1px solid ${C.line}!important;}.story-row{display:block!important;}.story-layout{display:block!important;width:100%!important;}.story-layout tbody{display:block!important;}.score-label{font-size:10px!important;}.footer-links{line-height:2.2!important;}.section h2{font-size:27px!important;}.edition-top{padding-top:19px!important;padding-bottom:18px!important;}.tagline{font-size:12px!important;}}
    @media print{body{background:white!important;}.outer-pad{padding:0!important;}.paper{width:100%!important;max-width:none!important;}.table-scroll{overflow:visible!important;}.stats,.line-score{min-width:0!important;}a{color:inherit!important;text-decoration:none!important;}}
  </style></head><body style="margin:0;padding:0;background:#e3e5dc;color:${C.ink};"><div style="display:none;font-size:1px;color:#e3e5dc;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${esc(e.story.deck)} · ${esc(e.period.label)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;background:#e3e5dc;"><tr><td class="outer-pad" align="center" style="padding:24px 12px 36px;">
  <!--[if mso]><table role="presentation" width="780" cellpadding="0" cellspacing="0"><tr><td><![endif]-->
  <table class="paper" role="presentation" width="780" cellpadding="0" cellspacing="0" style="width:100%;max-width:780px;table-layout:fixed;background:${C.paper};border-top:5px solid ${schoolColor};"><tr><td style="padding:0;">
    ${proofHtml}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;table-layout:fixed;"><tr><td class="pad" style="padding:12px 32px 0;font:10px ${SANS};color:${C.muted};text-align:center;line-height:1.6;">${utility}</td></tr>
      <tr><td class="pad edition-top" align="center" style="padding:23px 32px 20px;">
        <p style="margin:0 0 7px;font:700 9px ${SANS};letter-spacing:2.4px;text-transform:uppercase;color:${schoolColor};">YOUR HOMETOWN. THEIR NEXT CHAPTER.</p>
        <h1 class="masthead" style="margin:0;font:700 61px ${SERIF};line-height:.98;letter-spacing:-3px;color:${C.ink};">${mastheadImage ? `<img src="${esc(mastheadImage)}" alt="${esc(e.masthead?.alt?.trim() || TRIBUNE_NAME)}" width="714" style="display:block;width:100%;max-width:714px;height:auto;margin:0 auto;border:0;">` : `<span style="font-size:.38em;letter-spacing:-.5px;vertical-align:middle;">The</span> YAT-A-BOY<br><span class="masthead-sub" style="font-size:59px;letter-spacing:-2px;">Tribune</span>`}</h1>
        ${mastheadImage && e.masthead?.includesTagline ? '' : `<p class="tagline" style="margin:14px 0 0;font:italic 14px ${SERIF};line-height:1.6;color:${C.muted};">Dedicated to tell our fans, <strong style="color:${C.ink};font-style:normal;">WHERE THEY YAT!</strong><br>Through <strong style="color:${C.ink};font-style:normal;">STORIES &amp; STATS!</strong></p>`}
      </td></tr>
      <tr><td class="pad" style="padding:0 32px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:3px solid ${C.ink};border-bottom:1px solid ${C.ink};"><tr><td class="edition-meta" style="padding:10px 0;font:700 10px ${SANS};line-height:1.6;letter-spacing:.4px;">${schoolLogo ? `<img src="${esc(schoolLogo)}" width="21" height="21" alt="" style="display:inline-block;vertical-align:middle;margin-right:7px;">` : ''}${esc(e.school.name.toUpperCase())}<br><span style="font-weight:400;letter-spacing:0;color:${C.muted};">${esc(e.school.location)}</span></td><td class="edition-meta" align="right" style="padding:10px 0;font:700 10px ${SANS};line-height:1.6;letter-spacing:.3px;">${esc(cadence.toUpperCase())} EDITION<br><span style="font-weight:400;color:${C.muted};">${esc(date(e.generatedAt, true))}</span></td></tr></table></td></tr>
      ${renderPublisherNote(e)}
      <tr><td class="pad" style="padding:27px 32px 21px;">${kicker(e.matchup ? 'THE FANTASY DESK / REAL STATS. HOMETOWN PRIDE.' : 'THE ALUMNI DESK / REAL STATS. HOMETOWN PRIDE.')}
        <h2 class="headline" style="margin:0 0 13px;font:700 45px ${SERIF};line-height:1.07;letter-spacing:-1.8px;">${esc(e.story.headline)}</h2>
        <p style="margin:0;font:18px ${SERIF};line-height:1.5;color:${C.muted};">${esc(e.story.deck)}</p>
        <p style="margin:16px 0 0;font:700 10px ${SANS};letter-spacing:.3px;line-height:1.7;">By ${esc(TRIBUNE_BYLINE)}<br><span style="font-weight:400;color:${C.muted};">${e.story.source === 'preview' ? 'Illustrative fantasy sports column' : e.story.source === 'ai' ? 'AI-generated fantasy sports column, grounded in the recorded results' : 'Fantasy sports column from the recorded results'}</span></p>
      </td></tr>
      <tr><td class="pad" style="padding:0 32px 23px;">${renderMatchup(e)}</td></tr>
      <tr><td class="pad" style="padding:0 32px 28px;"><table class="story-layout" role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;table-layout:fixed;"><tr class="story-row">
        <td class="story-column" valign="top" width="71%" style="width:71%;padding:0 25px 0 0;">${articleParagraphs}${credit ? `<p style="margin:16px 0 0;font:italic 15px ${SERIF};line-height:1.8;color:${C.green};">${esc(credit)}</p>` : ''}</td>
        <td class="sidebar-column" valign="top" width="29%" style="width:29%;padding:3px 0 0 21px;border-left:1px solid ${C.line};">${kicker('IN THIS EDITION')}<p style="margin:0 0 8px;font:700 21px ${SERIF};line-height:1.2;">${esc(e.period.cadence === 'daily' ? 'A day on the diamonds.' : 'A week on the diamonds.')}</p><p style="margin:0 0 15px;font:12px ${SANS};line-height:1.8;color:${C.muted};">Alumni stats cover<br><strong style="color:${C.ink};">${esc(e.period.label)}</strong>.</p><p style="margin:0 0 14px;padding-top:12px;border-top:1px solid ${C.line};font:12px ${SANS};line-height:1.8;color:${C.muted};"><strong style="font:700 29px ${SERIF};color:${C.green};">${esc(e.homeRoster.playerCount)}</strong><br>players in your school’s complete roster</p>${e.matchup ? `<p style="margin:0 0 16px;font:12px ${SANS};line-height:1.8;color:${C.muted};">Fantasy scoreboard:<br><strong style="color:${C.ink};">${esc(dateRange(e.matchup.start, e.matchup.end))}</strong><br>${e.matchup.status === 'live' ? 'Week to date — still in play.' : e.matchup.status === 'final' ? 'The fantasy game is final.' : e.matchup.status === 'upcoming' ? 'First pitch is still ahead.' : 'Results are awaiting verification.'}</p>` : ''}<p style="margin:0;font:700 11px ${SANS};line-height:1.7;">${textLink('Visit the tournament →', e.links.tournament)}</p></td>
      </tr></table></td></tr>
    </table>
    ${renderSponsor(e)}
    ${renderRoster(e.homeRoster, false, e)}
    ${follows}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td class="pad" style="padding:26px 32px 28px;background:${C.greenDark};color:#ffffff;">${kicker('THE ROAD TO THE 2027 FALL CLASSIC', C.gold)}<h2 style="margin:0 0 12px;font:700 31px ${SERIF};line-height:1.15;color:#ffffff;">Follow your alumni.<br>Dream about October.</h2><p style="margin:0 0 20px;font:14px ${SANS};line-height:1.8;color:#e0e7d8;">${esc(sweepstakesText(e))}</p>${rulesUrl ? `<a href="${esc(rulesUrl)}" style="display:inline-block;padding:12px 17px;background:${C.gold};color:${C.greenDark};font:700 11px ${SANS};text-decoration:none;">READ THE OFFICIAL RULES →</a>` : `<p style="margin:0;font:12px ${SANS};line-height:1.7;color:${C.gold};">The official rules link will be included before delivery.</p>`}</td></tr>
      <tr><td class="pad" align="center" style="padding:30px 32px 29px;border-bottom:3px solid ${C.ink};">${kicker('PASS THE PAPER')}<h2 style="margin:0 0 12px;font:700 29px ${SERIF};line-height:1.2;">Good stories belong in good company.</h2><p style="margin:0 auto 19px;max-width:560px;font:15px ${SERIF};line-height:1.8;color:${C.muted};">${esc(SHARING_TEXT)}</p>${button('SHARE THE SCHOOL EDITION →', e.links.share, true)}<p style="margin:14px 0 0;font:11px ${SANS};line-height:1.7;color:${C.muted};">Invite another alumnus. Bring another fan home.</p></td></tr>
      <tr><td class="pad" align="center" style="padding:22px 32px 27px;"><p style="margin:0 0 8px;font:700 18px ${SERIF};">${esc(TRIBUNE_NAME)}</p><p style="margin:0 0 13px;font:11px ${SANS};line-height:1.8;color:${C.muted};">Your school. Your alumni. Their story keeps going.<br>${esc(cadence)} delivery · HTML and plain-text editions</p><p class="footer-links" style="margin:0;font:11px ${SANS};line-height:1.8;">${textLink('School community hub', e.links.hub)}${e.links.preferences ? ` &nbsp; / &nbsp; ${textLink('Choose daily / weekly / plain text', e.links.preferences)}` : e.preview ? ' &nbsp; / &nbsp; Delivery preferences available before launch' : ''}${e.links.unsubscribe ? ` &nbsp; / &nbsp; ${textLink('Unsubscribe', e.links.unsubscribe)}` : ''}</p>${e.sender ? `<p style="margin:13px 0 0;font:10px ${SANS};line-height:1.8;color:${C.muted};">${esc(e.sender.name)}<br>${esc(e.sender.postalAddress)}</p>` : e.preview ? `<p style="margin:13px 0 0;font:10px ${SANS};line-height:1.8;color:${C.muted};">Design proof. Sending details and personal preference links are added to the delivery edition.</p>` : ''}${notices}</td></tr></table>
  </td></tr></table><!--[if mso]></td></tr></table><![endif]-->
  </td></tr></table></body></html>`;
}

function plainLink(label: string, destination?: string): string {
  const href = url(destination);
  return href ? `${label}: ${href}` : `${label}: available with the delivery edition`;
}
function plainPublisherNote(e: TribuneEdition): string {
  const note = e.publisherNote;
  if (!note) return '';
  return [
    `FROM THE PUBLISHER\n${note.title.trim() || 'Publisher’s Note'}`,
    ...note.paragraphs,
    note.byline,
    note.ctaLabel && url(note.ctaUrl) ? plainLink(note.ctaLabel, note.ctaUrl) : undefined,
    url(note.imageUrl) ? plainLink('Publisher’s Note image', note.imageUrl) : undefined,
  ].filter(Boolean).join('\n\n');
}
function plainStats(table: TribuneStatsTable, otherSchools: boolean): string {
  const cols = columns(table);
  const rows = table.rows.map((row) => {
    const context = rowContext(row, otherSchools);
    const chunks: string[] = [];
    for (let i = 0; i < cols.length; i += 5) {
      chunks.push(`  ${cols.slice(i, i + 5).map((col, offset) => `${col} ${row.cells[i + offset] ?? '—'}`).join(' | ')}`);
    }
    const profile = url(row.profileUrl);
    return `${row.name}${context ? ` — ${context}` : ''}\n${chunks.join('\n')}${profile ? `\n  Player profile: ${profile}` : ''}`;
  });
  const totals = cols.map((col, i) => `${col} ${table.totals[i] ?? '—'}`);
  const totalChunks: string[] = [];
  for (let i = 0; i < totals.length; i += 5) totalChunks.push(`  ${totals.slice(i, i + 5).join(' | ')}`);
  const label = table.kind === 'batting' ? 'BATTERS' : 'PITCHERS';
  return `${label}\n\n${rows.length ? rows.join('\n\n') : `No ${label.toLowerCase()} are listed in this roster.`}\n\n${label} TOTALS\n${totalChunks.join('\n')}`;
}
function plainRoster(roster: TribuneRoster, otherSchools: boolean, e: TribuneEdition): string {
  return `${otherSchools ? 'BEYOND THE HOME DIAMOND — YOUR SUPERFAN FOLLOW LIST' : 'EVERY ALUM. EVERY BOX SCORE.'}\n${roster.title} | ${roster.playerCount} players | ${e.period.label}\n\n${otherSchools ? `Players you follow from other schools. Their production is shown separately and does not count toward ${e.school.name}’s fantasy result.` : 'The complete school roster, including players with no appearance in this period. The statistics use the same columns and totals as the tournament table.'}\n\n${plainStats(roster.batting, otherSchools)}\n\n${plainStats(roster.pitching, otherSchools)}${roster.clubRecord ? `\n\nTEAM TOTAL: ${roster.clubRecord} real-game W–L` : ''}\n\nNo appearance = no recorded appearance in the period.\nData unavailable = a result could not be verified.\n— = unavailable or not applicable; it is not a zero.${roster.note ? `\n${roster.note}` : ''}`;
}
function plainMatchup(m?: TribuneMatchup): string {
  if (!m) return 'AROUND THE ALUMNI DIAMONDS\nThere is no current fantasy matchup in this edition. Alumni production appears in the complete box scores below.';
  const note = matchupNote(m);
  const innings = Array.from({ length: inningCount(m) }, (_, i) => {
    const label = i < 7 ? `Inning ${i + 1} (day ${i + 1})` : i === 7 ? 'Inning 8 (whole week)' : i === 8 ? 'Inning 9 (real-game winning percentage)' : `Inning ${i + 1} (extra inning)`;
    return `${label}: ${m.away.abbreviation} ${inningRun(m, m.away, i)} | ${m.home.abbreviation} ${inningRun(m, m.home, i)}`;
  });
  const metrics = [m.away, m.home].map((side) => {
    const lines = Array.from({ length: 8 }, (_, i) => {
      const future = m.status === 'upcoming' || m.status === 'unavailable' || m.inningStates[i] === 'future';
      return `  Inning ${i + 1}: OPS+ ${future ? '—' : metric(side.opsPlus[i])} | FIP- ${future ? '—' : metric(side.fipMinus[i])}`;
    });
    const future = m.status === 'upcoming' || m.status === 'unavailable' || m.inningStates[8] === 'future';
    lines.push(`  Inning 9: W% ${future ? '—' : winPct(side)} | W–L ${future ? '—' : side.clubRecord.join('–')}`);
    return `${side.name} (${side.abbreviation})${side.location ? ` · ${side.location}` : ''}\n${lines.join('\n')}`;
  });
  return `${seriesLabel(m).toUpperCase()} | ${matchupStatus(m)}\nFantasy game: ${dateRange(m.start, m.end)}\n\n${m.away.name}: ${score(m.away, m)} runs\n${m.home.name}: ${score(m.home, m)} runs\n\nINNING BY INNING\n${innings.join('\n')}\n\nTHE NUMBERS BEHIND THE RUNS\n${metrics.join('\n\n')}\n\n${SCORING_TEXT}\n* Provisional. — Pending or unavailable.${note ? `\n${note}` : ''}`;
}

/** Same edition and substantive content as HTML; narrow, labeled lines remain readable on phones. */
export function renderTribuneText(e: TribuneEdition): string {
  const proof = proofNotice(e);
  const credit = sponsorCredit(e);
  const parts = [
    proof ? `${proof.heading}\n${proof.body}` : '',
    `${TRIBUNE_NAME.toUpperCase()}\n${TRIBUNE_TAGLINE}`,
    `${e.school.name} · ${e.school.location}\n${e.period.cadence === 'daily' ? 'Daily' : 'Weekly'} Edition · ${date(e.generatedAt, true)}\nAlumni production: ${e.period.label}`,
    [e.links.web ? plainLink('View in browser', e.links.web) : '', e.links.text ? plainLink('Plain-text edition', e.links.text) : 'This is the complete plain-text edition.'].filter(Boolean).join('\n'),
    plainPublisherNote(e),
    `${e.story.headline}\n\n${e.story.deck}\n\nBy ${TRIBUNE_BYLINE}\n${e.story.source === 'preview' ? 'Illustrative fantasy sports column' : e.story.source === 'ai' ? 'AI-generated fantasy sports column, grounded in the recorded results' : 'Fantasy sports column from the recorded results'}`,
    plainMatchup(e.matchup),
    e.story.paragraphs.join('\n\n'),
    credit ?? '',
    `IN THIS EDITION\nAlumni stats cover ${e.period.label}.\n${e.homeRoster.playerCount} players in your school’s complete roster.\n${plainLink('Visit the tournament', e.links.tournament)}`,
    e.sponsor ? `ADVERTISEMENT — ${e.sponsor.label ?? 'YOUR SCHOOL’S COMMUNITY PARTNER'}\n${e.sponsor.name}\n${e.sponsor.headline}\n\n${e.sponsor.body}\n${plainLink(e.sponsor.cta, e.sponsor.url)}` : `ADVERTISEMENT — SPONSOR SPACE\nA little hometown support goes a long way.\nReserved for this school’s sponsor: their message, logo and offer.${e.links.sponsorInquiry ? `\n${plainLink('Support this school’s edition', e.links.sponsorInquiry)}` : ''}`,
    plainRoster(e.homeRoster, false, e),
    e.recipientTier === 'superfan' && e.follows ? plainRoster(e.follows, true, e) : '',
    `THE ROAD TO THE 2027 FALL CLASSIC\nFollow your alumni. Dream about October.\n\n${sweepstakesText(e)}\n${e.links.officialRules ? plainLink('Official rules', e.links.officialRules) : 'The official rules link will be included before delivery.'}`,
    `PASS THE PAPER\nGood stories belong in good company.\n\n${SHARING_TEXT}\n${plainLink('Share the school edition', e.links.share)}\nInvite another alumnus. Bring another fan home.`,
    `${TRIBUNE_NAME.toUpperCase()}\nYour school. Your alumni. Their story keeps going.\n${plainLink('School community hub', e.links.hub)}\n${e.links.preferences ? plainLink('Choose daily / weekly / plain text', e.links.preferences) : e.preview ? 'Delivery preferences available before launch.' : ''}${e.links.unsubscribe ? `\n${plainLink('Unsubscribe', e.links.unsubscribe)}` : ''}${e.sender ? `\n\n${e.sender.name}\n${e.sender.postalAddress}` : e.preview ? '\n\nDesign proof. Sending details and personal preference links are added to the delivery edition.' : ''}`,
    (e.notices ?? []).join('\n'),
  ];
  return parts.filter(Boolean).join('\n\n----------------------------------------\n\n') + '\n';
}
