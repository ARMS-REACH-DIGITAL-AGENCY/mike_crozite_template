// Previews of the Daily Digest and the YAT-A-BOY Weekly Tribune, read from
// the finished publication rows (docs/newsletter-handoff-take-two.md,
// sections 5, 6 and 13) and printed as they are. Nothing here computes a
// statistic, a score, a result or a sentence: every query is a SELECT of
// finished rows, and the renderer only lays them out.
//
// Connect as the newsletter's read-only role (SELECT on the publication
// tables, master_bracket and the two fan views):
//
//   DATABASE_URL=... npx --yes tsx scripts/newsletter-preview.ts \
//     --daily 2026-10-26 --weekly 2026-10-19 --out <dir> --emails a@x.com,b@y.com \
//     [--seasons a@x.com=1,b@y.com=6]
//
// Each recipient follows ONE season: one bracket, a season-long tournament
// on its own (Pete, Oct 27). The six October test brackets are six separate
// test seasons that run at the same time; they are stored as regions 1-6 of
// season test-2026, and --seasons says which one each test recipient follows.
// Without it, the recipient's home school must be in exactly one bracket (as
// every school is in 2027). Every row printed comes from that bracket only.
//
// For each recipient it writes <dir>/daily/<name>.html|.txt and
// <dir>/weekly/<name>.html|.txt, and <dir>/report.json with every preview's
// identity, counts and warnings. It never sends anything.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';

type R = Record<string, any>;

function arg(name: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}

const SITE = 'https://yatstats.com/';
// The pick page isn't built yet (handoff section 14), so its link has no
// address. The preview shows the link and warns.
const PICK_PAGE: string | null = null;

const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const iso = (d: unknown) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10));
const longDate = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
const shortDate = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' });
const monthDay = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' });
const fileName = (email: string) => email.toLowerCase().replace(/[^a-z0-9]+/g, '-');

// ---------- Reader: the section 13 queries ----------

async function ready(db: Client, cadence: 'daily' | 'weekly', start: string) {
  const r = await db.query('SELECT cadence, period_start::text, period_end::text, season_key, week, cutoff_at, ready_at, row_counts FROM edition_ready WHERE cadence = $1 AND period_start = $2', [cadence, start]);
  if (!r.rows[0]) throw new Error(`No ${cadence} edition_ready row for ${start}: not ready, nothing to preview`);
  return r.rows[0];
}

type Season = { season_key: string; region: number; label: string; school: string | null };

// The one bracket this recipient follows: the --seasons assignment, checked
// against master_bracket, or else the only bracket the home school is in.
async function seasonOf(db: Client, seasonKey: string, who: R, assigned?: number): Promise<Season> {
  const home = Number(who.home_hsid);
  const rows = (await db.query(
    `SELECT region, min(CASE WHEN home_hsid = $2 THEN home_school_name ELSE away_school_name END) AS school
       FROM master_bracket
      WHERE season_key = $1 AND stage = 'bracket' AND $2 IN (home_hsid, away_hsid)
      GROUP BY region ORDER BY region`, [seasonKey, home])).rows;
  const regions = rows.map((r) => Number(r.region));
  const region = assigned ?? (regions.length === 1 ? regions[0] : undefined);
  if (region === undefined) throw new Error(`${who.email}: home school ${home} is in ${regions.length} brackets of ${seasonKey} (${regions.join(', ') || 'none'}); assign one with --seasons`);
  if (!regions.includes(region)) throw new Error(`${who.email}: home school ${home} is not in bracket ${region} of ${seasonKey}`);
  return {
    season_key: seasonKey, region,
    label: seasonKey.startsWith('test') ? `Test Season ${region}` : `Region ${region}`,
    school: rows.find((r) => Number(r.region) === region)?.school ?? null,
  };
}

async function readDaily(db: Client, D: string, who: R, s: Season) {
  const home = Number(who.home_hsid);
  const favorites = Number((await db.query('SELECT count(*) FROM newsletter_favorites WHERE firebase_uid = $1', [who.firebase_uid])).rows[0].count);
  const lines = (await db.query(
    `SELECT l.stats_date, l.stat_line_id, l.line FROM daily_stat_lines l
      WHERE l.stats_date = $1 AND l.playerid IN (SELECT f.playerid FROM newsletter_favorites f WHERE f.firebase_uid = $2)
      ORDER BY l.sort_key`, [D, who.firebase_uid])).rows;
  // Only the recipient's own bracket: at most one game, one story.
  const stories = (await db.query('SELECT * FROM daily_game_stories WHERE stats_date = $1 AND hsid = $2 AND season_key = $3 AND region = $4', [D, home, s.season_key, s.region])).rows;
  const homeGames = (await db.query('SELECT * FROM daily_game_scores WHERE stats_date = $1 AND season_key = $2 AND region = $3 AND $4 IN (home_hsid, away_hsid)', [D, s.season_key, s.region, home])).rows;
  const picks = (await db.query(
    `SELECT p.position, p.hsid, p.label, g.season_key, g.region, g.game_id, g.home_label, g.away_label, g.home_innings, g.away_innings,
            g.home_runs, g.away_runs, g.through_inning, g.is_final
       FROM user_scoreboard_schools p
       LEFT JOIN daily_game_scores g ON g.stats_date = $1 AND g.season_key = $3 AND g.region = $4 AND p.hsid IN (g.home_hsid, g.away_hsid)
      WHERE p.firebase_uid = $2 ORDER BY p.position`, [D, who.firebase_uid, s.season_key, s.region])).rows;
  if (stories.length > 1 || homeGames.length > 1) throw new Error(`${who.email}: more than one game for school ${home} in ${s.label} on ${D}`);
  return { favorites, lines, stories, homeGames, picks };
}

async function readWeekly(db: Client, M: string, ed: R, who: R, s: Season) {
  const home = Number(who.home_hsid);
  const roster = (await db.query('SELECT playerid, games, line FROM weekly_player_lines WHERE period_start = $1 AND hsid = $2 ORDER BY sort_key', [M, home])).rows;
  const boxes = (await db.query('SELECT * FROM weekly_box_scores WHERE season_key = $1 AND week = $2 AND region = $3 AND $4 IN (home_hsid, away_hsid)', [s.season_key, ed.week, s.region, home])).rows;
  const recap = (await db.query('SELECT title, story, shout_outs, region, game_id FROM daily_game_stories WHERE stats_date = $1 AND hsid = $2 AND season_key = $3 AND region = $4 AND is_final', [ed.period_end, home, s.season_key, s.region])).rows;
  if (boxes.length > 1) throw new Error(`${who.email}: more than one box score for school ${home} in ${s.label}, week ${ed.week}`);
  // The league is the recipient's bracket: its games that week, final and locked.
  const games = (await db.query(
    `SELECT m.region, m.game_id, m.home_school_name, m.home_runs, m.away_school_name, m.away_runs, m.decided_by
       FROM master_bracket m
      WHERE m.season_key = $1 AND m.stage = 'bracket' AND m.week = $2 AND m.region = $3
        AND m.status = 'final' AND m.locked_at IS NOT NULL
      ORDER BY m.series_no, m.game_no`, [s.season_key, ed.week, s.region])).rows;
  return { roster, boxes, recap, league: games.length ? [{ region: s.region, games }] : [] };
}

// ---------- Renderer: layout only ----------

const PAGE = (title: string, body: string) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)}</title></head>
<body style="margin:0;padding:0;background:#ece8df;font-family:Georgia,'Times New Roman',serif;color:#1d1d1b">${body}</body></html>
`;

function previewPanel(p: R) {
  const row = (k: string, v: string) => `<tr><td style="padding:2px 10px 2px 0;color:#555;white-space:nowrap;vertical-align:top">${esc(k)}</td><td style="padding:2px 0">${v}</td></tr>`;
  const warn = p.warnings.length ? `<ul style="margin:4px 0 0 18px;padding:0">${p.warnings.map((w: string) => `<li>${esc(w)}</li>`).join('')}</ul>` : 'none';
  return `<div style="max-width:680px;margin:16px auto 0;padding:12px 16px;background:#fff8d6;border:2px dashed #b08900;font:13px/1.45 Arial,Helvetica,sans-serif">
<div style="font-weight:bold;letter-spacing:.06em;margin-bottom:6px">PREVIEW ONLY. NOT SENT.</div>
<table style="border-collapse:collapse;font-size:13px">
${row('Recipient', `${esc(p.recipient.email)} (${esc(p.recipient.first_name)}, home_hsid ${esc(p.recipient.home_hsid)}, plan ${esc(p.recipient.plan)})`)}
${row('Cadence', esc(p.cadence))}
${row('Period', esc(p.period))}
${row('Season / week', `${esc(p.season_key)}, <b>${esc(p.season_label)}</b>, week ${esc(p.week)}`)}
${row('Ready row', esc(p.ready_row))}
${row('Subject', `<b>${esc(p.subject)}</b>`)}
${row('Counts', esc(Object.entries(p.counts).map(([k, v]) => `${k} ${v}`).join(', ')))}
${row('Sponsor', esc(p.sponsor))}
${row('Complete', p.complete ? 'yes' : `<b>no</b>: ${esc(p.incomplete_because.join('; '))}`)}
${row('Warnings', warn)}
</table></div>`;
}

const SPONSOR_HTML = `<div style="margin:22px 0 0;padding:14px;border:1px dashed #9a9a9a;color:#666;text-align:center;font:12px Arial,Helvetica,sans-serif">
SPONSOR SLOT: not filled. No sponsor source is approved for the newsletter yet (sponsor-incomplete).</div>`;
const SPONSOR_TEXT = '[SPONSOR SLOT: not filled. No sponsor source is approved for the newsletter yet (sponsor-incomplete).]';

const h2 = (s: string) => `<h2 style="margin:26px 0 8px;padding-bottom:4px;border-bottom:2px solid #1d1d1b;font-size:19px;letter-spacing:.03em">${esc(s)}</h2>`;
const masthead = (name: string, sub: string) => `<div style="text-align:center;border-bottom:4px double #1d1d1b;padding-bottom:10px">
<div style="font-size:30px;font-weight:bold;letter-spacing:.02em">${esc(name)}</div>
<div style="font:13px Arial,Helvetica,sans-serif;color:#555;margin-top:4px">${esc(sub)}</div></div>`;
const sheet = (inner: string) => `<div style="max-width:680px;margin:12px auto 24px;padding:22px 26px;background:#fffdf7;border:1px solid #d8d2c4">${inner}</div>`;

// One scoreboard slot: a game's two rows of nine inning cells and R, like a
// Wrigley Field panel. Cells beyond the innings played so far, and every cell
// of an empty slot, are blank panels.
function slotHtml(g: R | null, opts: { home?: boolean; label?: string; slot?: number } = {}) {
  const line = opts.home ? '#d0021b' : '#173b21';
  const cell = (v: unknown, w = 17) =>
    `<td style="width:${w}px;height:17px;padding:0;border:1px solid #173b21;background:#0e2a16;text-align:center;font:bold 12px 'Courier New',monospace;color:#fff">${v === undefined || v === null || v === '' ? '&nbsp;' : esc(v)}</td>`;
  const blanks = (runs = '') => `${Array.from({ length: 9 }, () => cell('')).join('')}${cell(runs, 21)}`;
  const teamRow = (label: string, cells: string[], runs: unknown) =>
    `<tr><td style="width:118px;max-width:118px;height:17px;padding:0 5px;overflow:hidden;white-space:nowrap;font:bold 10px Arial,Helvetica,sans-serif;color:#fff">${label ? esc(label) : '&nbsp;'}</td>${Array.from({ length: 9 }, (_, i) => cell(cells[i])).join('')}${cell(runs, 21)}</tr>`;
  // An empty pick slot looks like a search box (Pete's mockup, Oct 27). Email
  // can't run a search, so it's a link to the pick page, opened on this slot.
  const searchBox = (slot: number) => {
    const href = PICK_PAGE ? `${PICK_PAGE}?slot=${slot}` : `#pick-page-not-built-slot-${slot}`;
    return `<tr><td rowspan="2" style="width:118px;max-width:118px;padding:2px 3px"><a href="${esc(href)}" style="display:block;padding:3px 6px;background:#0b1f10;border:1px solid #3d6b49;border-radius:4px;text-decoration:none;color:#fff;font:bold 9px/1.2 Arial,Helvetica,sans-serif;white-space:nowrap;overflow:hidden">ADD A TEAM &#128269;<br><span style="font-weight:normal;font-size:8px;color:#c8d8cc">to your daily scoreboard</span></a></td>${blanks()}</tr><tr>${blanks()}</tr>`;
  };
  const rows = g && g.home_label
    ? teamRow(g.away_label, g.away_innings ?? [], g.away_runs) + teamRow(g.home_label, g.home_innings ?? [], g.home_runs)
    : !opts.home && !opts.label && opts.slot
      ? searchBox(opts.slot)
      : teamRow(opts.label ?? '', [], '') + teamRow('', [], '');
  return `<td style="padding:4px 5px;vertical-align:top"><table style="border-collapse:collapse;background:#1f4d2b;border-top:3px solid ${line};border-bottom:3px solid ${line}">${rows}</table></td>`;
}

// The board's top, shaped like Wrigley Field's: a bar with the two titles and
// the sponsor's round logo standing on it where Wrigley's clock is (Pete's
// mockup, Oct 27). No sponsor source is approved yet, so the circle is empty
// and says so.
function boardTopHtml() {
  const bar = (text: string, align: string) =>
    `<td style="padding:0;vertical-align:bottom"><div style="background:#173b21;padding:10px 12px;font:bold 15px Arial,Helvetica,sans-serif;letter-spacing:.03em;color:#fff;white-space:nowrap;text-align:${align}">${esc(text)}</div></td>`;
  return `<table style="border-collapse:collapse;width:100%"><tr>
${bar('YAT?STATS ALUMNI BASEBALL', 'left')}
<td style="width:124px;padding:0;vertical-align:bottom;text-align:center;background:linear-gradient(to bottom,transparent 76px,#173b21 76px)">
<div style="box-sizing:border-box;width:108px;height:108px;margin:0 auto 6px;padding-top:38px;border-radius:50%;background:#fff;border:5px solid #173b21;box-shadow:0 0 0 2px #f5d76e;text-align:center;font:bold 11px/1.3 Arial,Helvetica,sans-serif;color:#8a8a8a">SPONSOR<br><span style="font-weight:normal;font-size:10px">not filled</span></div></td>
${bar('BRACKET TOURNAMENT (2027)', 'right')}
</tr></table>`;
}

function scoreboardHtml(slots: ({ game: R | null; label?: string } | null)[], homeGame: R | null, empty: number) {
  // Wrigley-style: slots 1-5 down the left, the home game bottom left between
  // red lines, slots 6-11 down the right.
  const head = `<td style="padding:4px 5px 0"><table style="border-collapse:collapse"><tr><td style="width:118px;padding:0 5px;font:bold 10px Arial,Helvetica,sans-serif;color:#f5d76e">&nbsp;</td>${[1, 2, 3, 4, 5, 6, 7, 8, 9, 'R'].map((n) => `<td style="width:${n === 'R' ? 21 : 17}px;padding:0 1px;text-align:center;font:bold 11px Arial,Helvetica,sans-serif;color:#f5d76e">${n}</td>`).join('')}</tr></table></td>`;
  // While slots are empty, the invitation sits on the board itself, big, above
  // the games (Pete, Oct 27: "must be bigger, repositioned").
  const invite = empty > 0
    ? `<tr><td colspan="2" style="padding:12px 10px 10px;text-align:center;border-bottom:2px solid #0e2a16">
<div style="font:bold 22px/1.25 Arial,Helvetica,sans-serif;color:#f5d76e;letter-spacing:.02em">PICK YOUR OWN FAVORITE 11</div>
<div style="font:16px/1.4 Arial,Helvetica,sans-serif;color:#fff;margin:4px 0 10px">and we'll send them to you every day.</div>
<a href="${esc(PICK_PAGE ?? '#pick-page-not-built')}" style="display:inline-block;padding:9px 22px;background:#f5d76e;color:#173b21;font:bold 15px Arial,Helvetica,sans-serif;text-decoration:none;border-radius:3px">PICK YOUR TEAMS</a></td></tr>`
    : '';
  let rows = `${invite}<tr>${head}${head}</tr>`;
  for (let r = 0; r < 6; r++) {
    const ls = slots[r];
    const rs = slots[5 + r];
    const l = r < 5 ? slotHtml(ls?.game ?? null, { label: ls?.label, slot: r + 1 }) : slotHtml(homeGame, { home: true });
    rows += `<tr>${l}${slotHtml(rs?.game ?? null, { label: rs?.label, slot: 6 + r })}</tr>`;
  }
  return `<table style="border-collapse:collapse;margin:0 auto">
<tr><td style="padding:0">${boardTopHtml()}</td></tr>
<tr><td style="padding:0;background:#173b21"><table style="border-collapse:collapse;width:100%">${rows}</table></td></tr></table>
<p style="margin:8px 0 0;font:13px Arial,Helvetica,sans-serif;text-align:center"><a href="${SITE}" style="color:#1f4d2b">See the full scoreboard</a></p>`;
}

function slotText(g: R | null, label?: string) {
  if (g && g.home_label) {
    const fmt = (lab: string, inn: string[], runs: unknown) => `${lab.padEnd(28)} ${Array.from({ length: 9 }, (_, i) => (inn[i] ?? ' ').padStart(2)).join('')}  ${String(runs).padStart(2)}`;
    return [fmt(g.away_label, g.away_innings ?? [], g.away_runs), fmt(g.home_label, g.home_innings ?? [], g.home_runs)].join('\n');
  }
  return label ? `${label} (no game today)` : '(empty slot)';
}

// "[HOME] " before a slot's first line, and its second line lined up under it.
const tagged = (tag: string, text: string) => {
  const head = `[${tag}]`.padEnd(7);
  return text.split('\n').map((l, i) => (i ? ' '.repeat(head.length) : head) + l).join('\n');
};

function boxTableHtml(t: R, title: string) {
  if (!t.rows.length) return `<p style="margin:6px 0;font:13px Arial,Helvetica,sans-serif;color:#555"><b>${esc(title)}:</b> no rostered alumni in this table this week.</p>`;
  const th = t.columns.map((c: string, i: number) => `<th style="padding:3px 5px;text-align:${i < 2 ? 'left' : 'right'};border-bottom:1px solid #1d1d1b">${esc(c)}</th>`).join('');
  const tr = (r: string[], bold = false) => `<tr>${r.map((c, i) => `<td style="padding:3px 5px;text-align:${i < 2 ? 'left' : 'right'};${bold ? 'font-weight:bold;border-top:1px solid #1d1d1b;' : ''}">${esc(c)}</td>`).join('')}</tr>`;
  return `<div style="margin:8px 0 2px;font:bold 13px Arial,Helvetica,sans-serif">${esc(title)}</div>
<table style="border-collapse:collapse;width:100%;font:12px Arial,Helvetica,sans-serif">${th ? `<tr>${th}</tr>` : ''}${t.rows.map((r: string[]) => tr(r)).join('')}${tr(t.totals, true)}</table>`;
}

function boxTableText(t: R, title: string) {
  if (!t.rows.length) return `${title}: no rostered alumni in this table this week.`;
  const all = [t.columns, ...t.rows, t.totals] as string[][];
  const w = t.columns.map((_: string, i: number) => Math.max(...all.map((r) => String(r[i] ?? '').length)));
  const fmt = (r: string[]) => r.map((c, i) => (i < 2 ? String(c).padEnd(w[i]) : String(c).padStart(w[i]))).join('  ');
  return [title, fmt(t.columns), ...t.rows.map(fmt), fmt(t.totals)].join('\n');
}

function lineScoreHtml(b: R) {
  const ls = b.line_score;
  const cell = (v: string, bold = false) => `<td style="padding:3px 6px;text-align:center;${bold ? 'font-weight:bold;' : ''}">${esc(v)}</td>`;
  const head = `<tr><td></td>${ls.columns.map((c: string) => `<th style="padding:3px 6px;border-bottom:1px solid #1d1d1b">${esc(c)}</th>`).join('')}</tr>`;
  const row = (name: string, cells: string[]) => `<tr><td style="padding:3px 8px 3px 0;white-space:nowrap">${esc(name)}</td>${cells.map((c, i) => cell(c, i === cells.length - 1)).join('')}</tr>`;
  return `<table style="border-collapse:collapse;font:13px 'Courier New',monospace;margin:6px 0">${head}${row(b.away_name, ls.away)}${row(b.home_name, ls.home)}</table>`;
}

function lineScoreText(b: R) {
  const ls = b.line_score;
  const w = Math.max(b.away_name.length, b.home_name.length);
  const fmt = (name: string, cells: string[]) => `${name.padEnd(w)}  ${cells.map((c) => c.padStart(2)).join(' ')}`;
  return [`${''.padEnd(w)}  ${ls.columns.map((c: string) => c.padStart(2)).join(' ')}`, fmt(b.away_name, ls.away), fmt(b.home_name, ls.home)].join('\n');
}

// ---------- One Daily ----------

// " · Test Season 6" under the masthead of a test edition, so a tester knows
// which season it reports; nothing in 2027.
const seasonNote = (s: Season) => (s.season_key.startsWith('test') ? ` · ${s.label}` : '');

function renderDaily(ed: R, who: R, d: Awaited<ReturnType<typeof readDaily>>, s: Season) {
  const D = ed.period_start;
  const school = d.stories[0]?.school_name ?? s.school ?? who.home_school_name ?? `School ${who.home_hsid}`;
  const subject = `YAT?STATS Daily Digest | ${school} | ${shortDate(D)}`;
  const warnings: string[] = [];

  // The board: the home game in the home slot; slots 1-11 are the fan's
  // picks from the same season, each game once.
  const onBoard = new Set<string>();
  const key = (g: R) => `${g.season_key}/${g.region}/${g.game_id}`;
  const homeGame = d.homeGames[0] ?? null;
  if (homeGame) onBoard.add(key(homeGame));
  const slots: ({ game: R | null; label?: string } | null)[] = Array(11).fill(null);
  let next = 0;
  for (const p of d.picks) {
    if (next >= 11) break;
    if (p.game_id != null) {
      if (onBoard.has(key(p))) continue;
      onBoard.add(key(p));
      slots[next++] = { game: p };
    } else slots[next++] = { game: null, label: p.label };
  }
  const empty = slots.filter((s) => !s).length;
  if (!homeGame) warnings.push(`${school} has no game today in ${s.label} (its Round 1 series is over), so the home slot is blank.`);
  if (!d.picks.length) warnings.push('No scoreboard picks saved (user_scoreboard_schools is empty): the 11 pick slots are blank with the invitation.');
  if (empty && !PICK_PAGE) warnings.push("The pick page isn't built: the \"Pick your teams\" link has no address yet.");
  if (!d.stories.length) warnings.push('No game story for the home school today: the section is left out.');
  if (!who.home_school_name) warnings.push('newsletter_recipients has no home_school_name for this profile: the school name comes from the finished story or bracket row.');

  const favHtml = d.favorites === 0
    ? `<p>You haven't picked any favorites yet. <a href="${SITE}">Pick some</a>.</p>`
    : d.lines.length === 0
      ? '<p>None of your players were in action yesterday.</p>'
      : `<ul style="margin:0;padding-left:18px;line-height:1.55">${d.lines.map((l) => `<li>${esc(l.line)}</li>`).join('')}</ul>`;
  const favText = d.favorites === 0 ? "You haven't picked any favorites yet. Pick some: " + SITE
    : d.lines.length === 0 ? 'None of your players were in action yesterday.' : d.lines.map((l) => `- ${l.line}`).join('\n');

  const storyHtml = d.stories.map((s) => `<div style="margin:0 0 16px">
<div style="font-size:20px;font-weight:bold;letter-spacing:.02em">${esc(s.title)}</div>
<div style="font:12px Arial,Helvetica,sans-serif;color:#555;margin:2px 0 6px">${esc(s.school_name)} vs. ${esc(s.opponent_name)} · ${esc(s.series_note ?? '')}</div>
<p style="margin:0 0 6px;line-height:1.55">${esc(s.story)}</p>
${s.shout_outs.length ? `<div style="font:13px Arial,Helvetica,sans-serif"><b>Shout-outs:</b> ${s.shout_outs.map((o: R) => esc(o.line)).join('; ')}</div>` : ''}</div>`).join('');
  const storyText = d.stories.map((s) => [s.title, `${s.school_name} vs. ${s.opponent_name} · ${s.series_note ?? ''}`, s.story,
    ...(s.shout_outs.length ? [`Shout-outs: ${s.shout_outs.map((o: R) => o.line).join('; ')}`] : [])].join('\n')).join('\n\n');

  const body = [
    masthead('YAT?STATS Daily Digest', `${longDate(D)} · ${school}${seasonNote(s)}`),
    `<p style="margin:16px 0 0">Good morning, ${esc(who.first_name)}.</p>`,
    h2('Your players yesterday'), favHtml,
    d.stories.length ? h2(`${school} on the bracket`) + storyHtml : '',
    h2('Scoreboard'), scoreboardHtml(slots, homeGame, empty),
  ].join('\n');

  const text = [
    `YAT?STATS DAILY DIGEST`, `${longDate(D)} · ${school}${seasonNote(s)}`, '',
    `Good morning, ${who.first_name}.`, '',
    'YOUR PLAYERS YESTERDAY', favText, '',
    ...(d.stories.length ? [`${school.toUpperCase()} ON THE BRACKET`, storyText, ''] : []),
    'SCOREBOARD',
    `YAT?STATS ALUMNI BASEBALL  ${SPONSOR_TEXT}  BRACKET TOURNAMENT (2027)`,
    ...(empty ? [`PICK YOUR OWN FAVORITE 11 and we'll send them to you every day: ${PICK_PAGE ?? '(pick page address not set yet)'}`, ''] : []),
    tagged('HOME', homeGame ? slotText(homeGame) : '(no home game today)'),
    ...slots.map((s, i) => tagged(String(i + 1), s ? slotText(s.game, s.label)
      : `Add a team to your custom daily scoreboard: ${PICK_PAGE ? `${PICK_PAGE}?slot=${i + 1}` : '(pick page address not set yet)'}`)),
    `See the full scoreboard: ${SITE}`, '',
  ].join('\n');

  const counts = {
    favorites: d.favorites, favorite_lines: d.lines.length, stories: d.stories.length,
    scoreboard_filled: (homeGame ? 1 : 0) + slots.filter((s) => s?.game).length, scoreboard_slots: 12, picks: d.picks.length,
  };
  return { subject, body, text, counts, warnings,
    keys: { daily_stat_lines: d.lines.map((l) => [iso(l.stats_date), l.stat_line_id]), daily_game_stories: d.stories.map((s) => [iso(s.stats_date), s.hsid, s.region, s.game_id]) } };
}

// ---------- One Weekly ----------

function renderWeekly(ed: R, who: R, w: Awaited<ReturnType<typeof readWeekly>>, s: Season) {
  const home = Number(who.home_hsid);
  const nameFromBox = w.boxes[0] ? (w.boxes[0].home_hsid === home ? w.boxes[0].home_name : w.boxes[0].away_name) : null;
  const school = nameFromBox ?? s.school ?? who.home_school_name ?? `School ${who.home_hsid}`;
  const period = `${monthDay(ed.period_start)}-${monthDay(ed.period_end).replace(/^[A-Za-z]+ /, '')}, ${ed.period_end.slice(0, 4)}`;
  const subject = `YAT-A-BOY Weekly Tribune | ${school} | Week ${ed.week}, ${period}`;
  const warnings: string[] = [];
  if (!w.boxes.length) warnings.push('No box score for the home school this week: the section is left out.');
  if (!w.recap.length) warnings.push(`No final recap story for ${ed.period_end} (the Daily stories start Oct 26), so the optional recap is left out.`);
  if (!who.home_school_name) warnings.push('newsletter_recipients has no home_school_name for this profile: the school name comes from the box score row.');
  const dnp = w.roster.filter((r) => Number(r.games) === 0).length;

  const boxHtml = w.boxes.map((b) => `<div style="margin:0 0 18px">
<div style="font-size:18px;font-weight:bold">${esc(b.away_name)} at ${esc(b.home_name)}</div>
<div style="font:12px Arial,Helvetica,sans-serif;color:#555;margin:2px 0 4px">${esc(b.round_name)}, Game ${esc(b.game_no)} · ${esc(s.label)} · ${esc(b.decision)}</div>
${lineScoreHtml(b)}
${boxTableHtml(b.away_batting, `${b.away_name} batting`)}
${boxTableHtml(b.home_batting, `${b.home_name} batting`)}
${boxTableHtml(b.away_pitching, `${b.away_name} pitching`)}
${boxTableHtml(b.home_pitching, `${b.home_name} pitching`)}
${[...b.extra_base_hits.away, ...b.extra_base_hits.home].length ? `<div style="font:12px Arial,Helvetica,sans-serif;margin-top:6px"><b>Extra-base hits:</b> ${[...b.extra_base_hits.away, ...b.extra_base_hits.home].map(esc).join('; ')}</div>` : ''}</div>`).join('');
  const boxText = w.boxes.map((b) => [`${b.away_name} at ${b.home_name}`, `${b.round_name}, Game ${b.game_no} · ${s.label} · ${b.decision}`, '',
    lineScoreText(b), '', boxTableText(b.away_batting, `${b.away_name} batting`), '', boxTableText(b.home_batting, `${b.home_name} batting`), '',
    boxTableText(b.away_pitching, `${b.away_name} pitching`), '', boxTableText(b.home_pitching, `${b.home_name} pitching`),
    ...([...b.extra_base_hits.away, ...b.extra_base_hits.home].length ? ['', `Extra-base hits: ${[...b.extra_base_hits.away, ...b.extra_base_hits.home].join('; ')}`] : [])].join('\n')).join('\n\n');

  const leagueLine = (g: R) => `${g.away_school_name} ${g.away_runs}, ${g.home_school_name} ${g.home_runs}${g.decided_by === 'commissioner' ? " (Commissioner's decision)" : ''}`;
  const leagueHtml = w.league.map((l) => `<div style="font:bold 13px Arial,Helvetica,sans-serif;margin:8px 0 4px">${esc(s.label)}</div>
<ul style="margin:0;padding-left:18px;font:13px Arial,Helvetica,sans-serif;line-height:1.6">${l.games.map((g: R) => `<li>${esc(leagueLine(g))}</li>`).join('')}</ul>`).join('');
  const leagueText = w.league.map((l) => [s.label, ...l.games.map((g: R) => `- ${leagueLine(g)}`)].join('\n')).join('\n\n');

  const body = [
    masthead('YAT-A-BOY Weekly Tribune', `Week ${ed.week} · ${period} · ${school}${seasonNote(s)}`),
    `<p style="margin:16px 0 0">${esc(who.first_name)}, here's how ${esc(school)} and its alumni did this week.</p>`,
    w.boxes.length ? h2('The box score') + boxHtml : '',
    h2(`The full ${school} roster`),
    `<ul style="margin:0;padding-left:18px;line-height:1.55;font-size:14px">${w.roster.map((r) => `<li>${esc(r.line)}</li>`).join('')}</ul>`,
    w.league.length ? h2('Scores around the league') + leagueHtml : '',
    SPONSOR_HTML,
  ].join('\n');

  const text = [
    'YAT-A-BOY WEEKLY TRIBUNE', `Week ${ed.week} · ${period} · ${school}${seasonNote(s)}`, '',
    `${who.first_name}, here's how ${school} and its alumni did this week.`, '',
    ...(w.boxes.length ? ['THE BOX SCORE', boxText, ''] : []),
    `THE FULL ${school.toUpperCase()} ROSTER`, ...w.roster.map((r) => `- ${r.line}`), '',
    ...(w.league.length ? ['SCORES AROUND THE LEAGUE', leagueText, ''] : []),
    SPONSOR_TEXT, '',
  ].join('\n');

  const counts = { roster: w.roster.length, did_not_play: dnp, box_scores: w.boxes.length, league_final_scores: w.league.reduce((n, l) => n + l.games.length, 0), recap: w.recap.length };
  return { subject, body, text, counts, warnings,
    keys: { weekly_box_scores: w.boxes.map((b) => [b.season_key, b.region, b.game_id]), weekly_player_lines: w.roster.length } };
}

async function main() {
  const daily = arg('daily'), weekly = arg('weekly'), out = arg('out'), emails = (arg('emails') ?? '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
  if (!daily || !weekly || !out || !emails.length) throw new Error('Usage: --daily YYYY-MM-DD --weekly YYYY-MM-DD(Monday) --out <dir> --emails a,b [--seasons a=1,b=6]');
  // email -> the test bracket (season) that recipient follows
  const assigned = new Map((arg('seasons') ?? '').split(',').filter(Boolean).map((p) => {
    const [e, n] = p.split('=');
    if (!e || !/^\d+$/.test(n ?? '')) throw new Error(`--seasons: "${p}" isn't email=number`);
    return [e.trim().toLowerCase(), Number(n)] as [string, number];
  }));
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  try {
    const dEd = await ready(db, 'daily', daily);
    const wEd = await ready(db, 'weekly', weekly);
    mkdirSync(join(out, 'daily'), { recursive: true });
    mkdirSync(join(out, 'weekly'), { recursive: true });
    const report: R[] = [];
    for (const email of emails) {
      const who = (await db.query('SELECT firebase_uid, email, first_name, home_hsid, home_school_name, plan, is_superfan FROM newsletter_recipients WHERE lower(email) = $1', [email])).rows;
      if (who.length !== 1) { report.push({ email, error: `newsletter_recipients returned ${who.length} rows` }); continue; }
      const r = who[0];
      const dS = await seasonOf(db, dEd.season_key, r, assigned.get(email));
      const wS = await seasonOf(db, wEd.season_key, r, assigned.get(email));
      for (const [cadence, ed, s, made] of [
        ['daily', dEd, dS, renderDaily(dEd, r, await readDaily(db, daily, r, dS), dS)],
        ['weekly', wEd, wS, renderWeekly(wEd, r, await readWeekly(db, weekly, wEd, r, wS), wS)],
      ] as const) {
        const p: R = {
          recipient: { email: r.email, first_name: r.first_name, home_hsid: r.home_hsid, plan: r.plan },
          cadence: cadence === 'daily' ? 'Daily Digest' : 'YAT-A-BOY Weekly Tribune',
          period: ed.period_start === ed.period_end ? ed.period_start : `${ed.period_start} to ${ed.period_end}`,
          season_key: ed.season_key, season_label: s.label, region: s.region, week: ed.week,
          ready_row: `edition_ready (${ed.cadence}, ${ed.period_start}), ready_at ${new Date(ed.ready_at).toISOString()}, cutoff ${new Date(ed.cutoff_at).toISOString()}`,
          subject: made.subject, counts: made.counts, warnings: made.warnings, keys: made.keys,
          sponsor: 'sponsor-incomplete: no sponsor source approved for the newsletter; nothing printed in the slot',
        };
        p.incomplete_because = ['sponsor-incomplete'];
        p.complete = false;
        const base = join(out, cadence, fileName(r.email));
        p.html_path = `${base}.html`;
        p.text_path = `${base}.txt`;
        writeFileSync(p.html_path, PAGE(made.subject, previewPanel(p) + sheet(made.body)));
        writeFileSync(p.text_path, `Subject: ${made.subject}\n\n${made.text}`);
        report.push(p);
      }
    }
    writeFileSync(join(out, 'report.json'), JSON.stringify({ daily: dEd, weekly: wEd, previews: report }, null, 2));
    for (const p of report) console.log(p.error ? `${p.email}: ${p.error}` : `${p.cadence} ${p.recipient.email}: ${JSON.stringify(p.counts)}`);
  } finally {
    await db.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
