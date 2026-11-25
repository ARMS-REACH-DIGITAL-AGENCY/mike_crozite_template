/**
 * The region scoreboard image (Pete, Nov 24 2026: "This is the scoreboard
 * design that needs to be used in the Digest. It's also used in the
 * Gazette"). The design is the Nov 13 2026 Gazette board, kept as
 * nl/gz3/55.png on branch ccr-0ad18095-umgndf: ASB medallion, REGION n |
 * YAT?STATS, BEST OF 3 SERIES, each school's series record, "(#seed) NAME",
 * innings 1-10 and R, a green rule between games, and the footer.
 *
 * This file only builds the page; src/lib/newsletter/newsletterImages.ts (the 4 a.m. job; scripts/newsletter-draw-pictures.ts locally) draws it
 * once per school per edition (a 1200px-wide PNG, the reference's size) and
 * every fan's email points to that one picture.
 */

export type BoardSide = {
  seed: number | string | null;
  name: string;
  /** Series record entering or after this game, e.g. "1-0". */
  series: string;
  /** Innings 1-10; a blank string or null for an inning not played yet. */
  innings: Array<string | number | null>;
  runs: string | number | null;
};
/** framed: the fan's own school's game, between red rules (Pete, Nov 24 2026). */
export type BoardGame = { away: BoardSide; home: BoardSide; framed?: boolean };
export type RegionBoardInput = {
  /** "REGION 3" */
  label: string;
  games: BoardGame[];
  /** Medallion picture (a data: URL or file URL); none leaves the ring empty. */
  medallion?: string;
  /** @font-face rules for Oswald (the reference's face). */
  fontCss: string;
};

// Every size and position below is measured from the reference image.
const W = 1200;
const BODY = '#1f3d24', CELL = '#142b18', RULE = '#3f6b46', BAR = '#132a17', RED = '#d0021b';
const YELLOW = '#f3cf55', MUTED = '#cfe0d2', WHITE = '#ffffff';
const TOP = 324;           // first game block (after the header rule)
const BLOCK = 176;         // one game: 16 + 68 + 4 + 68 + 16 + 4 (rule)
const FOOT = 108;          // after the last rule: footer and bottom bar
const CELL_X = 532, CELL_RIGHT = 1182, COLS = 11, GAP = 6;
const CELL_W = (CELL_RIGHT - CELL_X - GAP * (COLS - 1)) / COLS;
const NAME_RIGHT = 513;
const ASC = 0.952;          // Oswald: baseline below the top of a line-height:1 box

function esc(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);
}

type TextOpts = { size: number; baseline: number; color: string; weight?: number; spacing?: number;
  left?: number; right?: number; center?: number; width?: number };
function text(body: string, o: TextOpts): string {
  const top = o.baseline - ASC * o.size;
  const pos = o.center != null
    ? `left:${o.center - (o.width ?? 400) / 2}px;width:${o.width ?? 400}px;text-align:center`
    : o.right != null ? `right:${W - o.right}px;text-align:right` : `left:${o.left ?? 0}px`;
  return `<div style="position:absolute;top:${top.toFixed(2)}px;${pos};font:${o.weight ?? 500} ${o.size}px/1 Oswald,sans-serif;`
    + `letter-spacing:${o.spacing ?? 0}px;color:${o.color};white-space:nowrap">${body}</div>`;
}

/**
 * The board's games (Pete, Nov 24 2026): the home school's game first, then its
 * region's 7 other games with the most runs, ties to the better (lower) seed,
 * then the bracket's game order. The Digest and the drawn picture share this.
 */
export function regionTopGames<R extends Record<string, unknown>>(rows: R[], home: R | null, region: number | null | undefined,
  bestSeed: (row: R) => number = () => Infinity, max = 7): R[] {
  const key = (row: R) => [row.season_key, row.region, row.game_id].join('/');
  const runs = (row: R) => Number(row.home_runs ?? 0) + Number(row.away_runs ?? 0);
  return rows
    .filter(row => (!home || key(row) !== key(home)) && (region == null || Number(row.region) === Number(region)))
    .sort((a, b) => runs(b) - runs(a) || bestSeed(a) - bestSeed(b) || String(a.game_id).localeCompare(String(b.game_id), undefined, { numeric: true }))
    .slice(0, max);
}

/**
 * The 7 schools closest to the home school (Pete, Nov 25 2026; stored in
 * school_nearest_schools from his sheet): each one's game that day, nearest
 * first. A game already on the board (the home game, or two neighbors playing
 * each other) is not shown twice, so the board can have fewer than 8 games.
 */
export function nearbyGames<R extends Record<string, unknown>>(rows: R[], home: R | null, nearby: number[]): R[] {
  const key = (row: R) => [row.season_key, row.region, row.game_id].join('/');
  const seen = new Set(home ? [key(home)] : []);
  const out: R[] = [];
  for (const hsid of nearby) {
    const game = rows.find(row => Number(row.home_hsid) === hsid || Number(row.away_hsid) === hsid);
    if (!game || seen.has(key(game))) continue;
    seen.add(key(game));
    out.push(game);
  }
  return out;
}

export function regionBoardHeight(games: number): number { return TOP + games * BLOCK + FOOT; }

export function regionBoardHtml(input: RegionBoardInput): string {
  const n = input.games.length;
  const H = regionBoardHeight(n);
  const cellLeft = (i: number) => CELL_X + i * (CELL_W + GAP);
  const parts: string[] = [];
  // Shapes: the medallion's bump, the marquee, the board and its bottom bar.
  parts.push(`<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="position:absolute;left:0;top:0">`
    + `<rect x="450" y="152" width="300" height="120" rx="20" fill="${BODY}"/>`
    + `<path d="M96 180H1104L1140 248H60Z" fill="${BODY}"/>`
    + `<path d="M0 254Q0 248 6 248H1194Q1200 248 1200 254V${H - 16}H0Z" fill="${BODY}"/>`
    + `<path d="M0 ${H - 16}H1200V${H - 12}Q1200 ${H} 1188 ${H}H12Q0 ${H} 0 ${H - 12}Z" fill="${BAR}"/>`
    + `<circle cx="600" cy="123" r="117" fill="${BODY}"/><circle cx="600" cy="123" r="111" fill="#ffffff"/>`
    + (input.medallion ? `<clipPath id="m"><circle cx="600" cy="123" r="104"/></clipPath><image href="${esc(input.medallion)}" x="479" y="2" width="242" height="242" clip-path="url(#m)"/>` : `<circle cx="600" cy="123" r="104" fill="#1c2b3f"/>`)
    + `<rect x="16" y="320" width="1168" height="4" fill="${RULE}"/>`
    + input.games.map((_, g) => `<rect x="16" y="${TOP + g * BLOCK + 172}" width="1168" height="4" fill="${RULE}"/>`).join('')
    + input.games.map((_, g) => [16, 88].map(dy => Array.from({ length: COLS }, (_, i) =>
      `<rect x="${cellLeft(i).toFixed(2)}" y="${TOP + g * BLOCK + dy}" width="${CELL_W.toFixed(2)}" height="68" fill="${CELL}"/>`).join('')).join('')).join('')
    // The home game's rules above and below it are red, 6px (the Nov 13 proof, nl/gz3/1.png).
    + input.games.map((game, g) => !game.framed ? '' : [g === 0 ? 320 : TOP + (g - 1) * BLOCK + 172, TOP + g * BLOCK + 172]
      .map(y => `<rect x="16" y="${y - 1}" width="1168" height="6" fill="${RED}"/>`).join('')).join('')
    + `</svg>`);
  // Marquee.
  parts.push(text(esc(input.label.toUpperCase()), { size: 41, baseline: 234, left: 141, color: WHITE, weight: 650, spacing: 3.3 }));
  parts.push(text('YAT?STATS', { size: 41, baseline: 234, right: 1059, color: WHITE, weight: 650, spacing: 3.3 }));
  // Header row.
  parts.push(text('BEST OF 3 SERIES', { size: 21, baseline: 308, left: 28, color: MUTED, weight: 650, spacing: 1.9 }));
  parts.push(text('INNING', { size: 32, baseline: 309, right: 511, color: YELLOW, weight: 600, spacing: 1.5 }));
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'R'].forEach((label, i) =>
    parts.push(text(label, { size: 32, baseline: 309, center: cellLeft(i) + CELL_W / 2 + 0.75, width: 80, color: YELLOW, weight: 600, spacing: 1.5 })));
  // Games: away on top, home below.
  input.games.forEach((game, g) => {
    (['away', 'home'] as const).forEach((sideKey, row) => {
      const side = game[sideKey];
      const top = TOP + g * BLOCK + 16 + row * 72;
      const base = top + 52;
      if (side.series) parts.push(text(`(${esc(side.series)})`, { size: 23, baseline: base - 6, left: 28, color: MUTED, weight: 600, spacing: 0.5 }));
      const seed = side.seed == null || side.seed === '' ? '' : `<span style="font-size:25px;letter-spacing:0.6px;font-weight:500;color:${YELLOW};vertical-align:11px;margin-right:10px">(#${esc(side.seed)})</span>`;
      parts.push(text(`${seed}${esc(side.name.toUpperCase())}`, { size: 37, baseline: base, right: NAME_RIGHT, color: WHITE, weight: 500, spacing: 0.5 }));
      for (let i = 0; i < 10; i++) {
        const v = side.innings[i];
        if (v == null || v === '') continue;
        parts.push(text(esc(v), { size: 37, baseline: base, center: cellLeft(i) + CELL_W / 2, width: CELL_W, color: WHITE, weight: 650 }));
      }
      if (side.runs != null && side.runs !== '') parts.push(text(esc(side.runs), { size: 37, baseline: base, center: cellLeft(10) + CELL_W / 2, width: CELL_W, color: YELLOW, weight: 650 }));
    });
  });
  parts.push(text('YAT?STATS ALUMNI BASEBALL · BRACKET TOURNAMENT', { size: 31, baseline: H - 49, center: 598, width: 1100, color: YELLOW, weight: 620, spacing: 3.18 }));
  return `<!doctype html><html><head><meta charset="utf-8"><style>${input.fontCss}html,body{margin:0;padding:0;background:transparent}</style></head>`
    + `<body><div id="board" style="position:relative;width:${W}px;height:${H}px;overflow:hidden">${parts.join('')}</div></body></html>`;
}

/**
 * Bracket Madness (Pete, Nov 25 2026): the Gazette's region boards, two regions
 * on ONE Wrigley-style board: the ASB medallion at the top centre like the clock,
 * one region's games down the left and the other's down the right. Same colours,
 * face and rules as the single-region board above.
 */
export type DoubleBoardSide = { label: string; games: BoardGame[] };
export type DoubleBoardInput = { left: DoubleBoardSide; right: DoubleBoardSide; medallion?: string; fontCss: string };

const D_TOP = 322;         // first game block (after the header rule at 318)
const D_ROW = 36, D_BLOCK = 10 + D_ROW + 4 + D_ROW + 10 + 3;
const D_CELL = 24, D_GAP = 3, D_NAME = 268, D_CELLS = 276, D_HALF = [16, 608] as const;

export function doubleBoardHeight(games: number): number { return D_TOP + games * D_BLOCK + FOOT; }

export function doubleRegionBoardHtml(input: DoubleBoardInput): string {
  const n = Math.max(input.left.games.length, input.right.games.length, 1);
  const H = doubleBoardHeight(n);
  const cell = (x0: number, i: number) => x0 + D_CELLS + i * (D_CELL + D_GAP);
  const parts: string[] = [];
  const shapes: string[] = [
    `<rect x="450" y="152" width="300" height="120" rx="20" fill="${BODY}"/>`,
    `<path d="M96 180H1104L1140 248H60Z" fill="${BODY}"/>`,
    `<path d="M0 254Q0 248 6 248H1194Q1200 248 1200 254V${H - 16}H0Z" fill="${BODY}"/>`,
    `<path d="M0 ${H - 16}H1200V${H - 12}Q1200 ${H} 1188 ${H}H12Q0 ${H} 0 ${H - 12}Z" fill="${BAR}"/>`,
    `<circle cx="600" cy="123" r="117" fill="${BODY}"/><circle cx="600" cy="123" r="111" fill="#ffffff"/>`,
    input.medallion ? `<clipPath id="m"><circle cx="600" cy="123" r="104"/></clipPath><image href="${esc(input.medallion)}" x="479" y="2" width="242" height="242" clip-path="url(#m)"/>` : `<circle cx="600" cy="123" r="104" fill="#1c2b3f"/>`,
    // The centre post between the two regions, like the scoreboard's middle column.
    `<rect x="598" y="290" width="4" height="${H - FOOT - 290}" fill="${RULE}"/>`,
  ];
  for (const [side, x0] of [[input.left, D_HALF[0]], [input.right, D_HALF[1]]] as const) {
    shapes.push(`<rect x="${x0}" y="316" width="576" height="3" fill="${RULE}"/>`);
    side.games.forEach((game, g) => {
      const y = D_TOP + g * D_BLOCK;
      shapes.push(`<rect x="${x0}" y="${y + D_BLOCK - 3}" width="576" height="3" fill="${game.framed ? RED : RULE}"/>`);
      if (game.framed) shapes.push(`<rect x="${x0}" y="${y - 4}" width="576" height="4" fill="${RED}"/>`);
      for (const dy of [10, 10 + D_ROW + 4]) for (let i = 0; i < 11; i++) shapes.push(`<rect x="${cell(x0, i)}" y="${y + dy}" width="${D_CELL}" height="${D_ROW}" fill="${CELL}"/>`);
    });
    // Header: BEST OF 3 and the inning numbers over the cells.
    parts.push(text('BEST OF 3', { size: 15, baseline: 306, left: x0 + 8, color: MUTED, weight: 650, spacing: 1.4 }));
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'R'].forEach((label, i) =>
      parts.push(text(label, { size: 19, baseline: 307, center: cell(x0, i) + D_CELL / 2, width: 40, color: YELLOW, weight: 600 })));
    side.games.forEach((game, g) => {
      (['away', 'home'] as const).forEach((key, row) => {
        const s = game[key];
        const base = D_TOP + g * D_BLOCK + 10 + row * (D_ROW + 4) + 27;
        if (s.series) parts.push(text(`(${esc(s.series)})`, { size: 14, baseline: base - 3, left: x0 + 8, color: MUTED, weight: 600 }));
        const seed = s.seed == null || s.seed === '' ? '' : `<span style="font-size:14px;font-weight:500;color:${YELLOW};vertical-align:7px;margin-right:6px">(#${esc(s.seed)})</span>`;
        parts.push(`<div class="nm" style="position:absolute;top:${(base - ASC * 22).toFixed(2)}px;right:${W - (x0 + D_NAME)}px;max-width:212px;text-align:right;font:500 22px/1 Oswald,sans-serif;letter-spacing:.3px;color:${WHITE};white-space:nowrap">${seed}${esc(s.name.toUpperCase())}</div>`);
        for (let i = 0; i < 10; i++) { const v = s.innings[i]; if (v != null && v !== '') parts.push(text(esc(v), { size: 21, baseline: base, center: cell(x0, i) + D_CELL / 2, width: D_CELL, color: WHITE, weight: 650 })); }
        if (s.runs != null && s.runs !== '') parts.push(text(esc(s.runs), { size: 21, baseline: base, center: cell(x0, 10) + D_CELL / 2, width: D_CELL, color: YELLOW, weight: 650 }));
      });
    });
  }
  parts.unshift(`<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="position:absolute;left:0;top:0">${shapes.join('')}</svg>`);
  parts.push(text(esc(input.left.label.toUpperCase()), { size: 41, baseline: 234, left: 141, color: WHITE, weight: 650, spacing: 3.3 }));
  parts.push(text(esc(input.right.label.toUpperCase()), { size: 41, baseline: 234, right: 1059, color: WHITE, weight: 650, spacing: 3.3 }));
  parts.push(text('YAT?STATS ALUMNI BASEBALL · BRACKET TOURNAMENT', { size: 31, baseline: H - 49, center: 598, width: 1100, color: YELLOW, weight: 620, spacing: 3.18 }));
  // A long school name shrinks until it fits its 212px space.
  const fit = `<script>for(const e of document.querySelectorAll('.nm')){let s=22;while(e.scrollWidth>212&&s>13){s-=1;e.style.fontSize=s+'px';}}</script>`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>${input.fontCss}html,body{margin:0;padding:0;background:transparent}</style></head>`
    + `<body><div id="board" style="position:relative;width:${W}px;height:${H}px;overflow:hidden">${parts.join('')}</div>${fit}</body></html>`;
}

/**
 * A region's Bracket Madness games (Pete, Nov 25 2026: "start with local or any
 * upsets"): the home school's own game first when it is in this region, then
 * the upsets (the higher seed number won), biggest first, then the series with
 * the best seeds, up to 8.
 */
export function bracketMadnessGames<R extends Record<string, unknown>>(rows: R[], home: number | null, max = 8): R[] {
  const seeds = (r: R) => [Number(r.home_seed), Number(r.away_seed)];
  const winnerSeed = (r: R) => (Number(r.winner_hsid) === Number(r.home_hsid) ? Number(r.home_seed) : Number(r.away_seed));
  const loserSeed = (r: R) => (Number(r.winner_hsid) === Number(r.home_hsid) ? Number(r.away_seed) : Number(r.home_seed));
  const upset = (r: R) => (r.winner_hsid != null && winnerSeed(r) > loserSeed(r) ? winnerSeed(r) - loserSeed(r) : 0);
  const own = home == null ? [] : rows.filter(r => Number(r.home_hsid) === home || Number(r.away_hsid) === home);
  const rest = rows.filter(r => !own.includes(r)).sort((a, b) => upset(b) - upset(a) || Math.min(...seeds(a)) - Math.min(...seeds(b)) || Number(a.game_id) - Number(b.game_id));
  return [...own, ...rest].slice(0, max);
}

/**
 * The Gazette's Total Runs Leaderboard (the Week 4 TEST 2 proof, Pete, Nov 2026):
 * two regions on one board under the medallion, "TOTAL RUNS | LEADERBOARD" on
 * the marquee, each region's top 10 by season runs with place, seed, school and
 * runs; the fan's home school between red rules; a line for the rest; the
 * Round 10 note across the bottom.
 */
export type LeaderRow = { place: number; seed: number | string | null; name: string; runs: number; framed?: boolean };
export type LeaderSide = { label: string; rows: LeaderRow[]; summary: string };
export type LeaderboardInput = { left: LeaderSide; right: LeaderSide; note: string; medallion?: string; fontCss: string };

const L_TOP = 306, L_ROW = 58, L_FOOT = 150;

export function runsLeaderboardHtml(input: LeaderboardInput): string {
  const n = Math.max(input.left.rows.length, input.right.rows.length, 1);
  const H = L_TOP + n * L_ROW + L_FOOT;
  const shapes: string[] = [
    `<rect x="450" y="152" width="300" height="120" rx="20" fill="${BODY}"/>`,
    `<path d="M96 180H1104L1140 248H60Z" fill="${BODY}"/>`,
    `<path d="M0 254Q0 248 6 248H1194Q1200 248 1200 254V${H - 16}H0Z" fill="${BODY}"/>`,
    `<path d="M0 ${H - 16}H1200V${H - 12}Q1200 ${H} 1188 ${H}H12Q0 ${H} 0 ${H - 12}Z" fill="${BAR}"/>`,
    `<circle cx="600" cy="123" r="117" fill="${BODY}"/><circle cx="600" cy="123" r="111" fill="#ffffff"/>`,
    input.medallion ? `<clipPath id="m"><circle cx="600" cy="123" r="104"/></clipPath><image href="${esc(input.medallion)}" x="479" y="2" width="242" height="242" clip-path="url(#m)"/>` : `<circle cx="600" cy="123" r="104" fill="#1c2b3f"/>`,
    `<rect x="598" y="268" width="4" height="${L_TOP + n * L_ROW + 70 - 268}" fill="${RULE}"/>`,
  ];
  const parts: string[] = [];
  for (const [side, x0] of [[input.left, 24], [input.right, 616]] as const) {
    parts.push(text(esc(side.label.toUpperCase()), { size: 24, baseline: 292, left: x0 + 8, color: YELLOW, weight: 600, spacing: 1.5 }));
    parts.push(text('RUNS', { size: 24, baseline: 292, center: x0 + 516, width: 100, color: YELLOW, weight: 600, spacing: 1.5 }));
    shapes.push(`<rect x="${x0}" y="300" width="560" height="3" fill="${RULE}"/>`);
    side.rows.forEach((row, i) => {
      const y = L_TOP + i * L_ROW;
      shapes.push(`<rect x="${x0 + 476}" y="${y + 6}" width="80" height="${L_ROW - 12}" fill="${CELL}"/>`);
      shapes.push(`<rect x="${x0}" y="${y + L_ROW - 2}" width="560" height="2" fill="${row.framed ? RED : RULE}"/>`);
      if (row.framed) shapes.push(`<rect x="${x0}" y="${y - 3}" width="560" height="5" fill="${RED}"/>`, `<rect x="${x0}" y="${y + L_ROW - 3}" width="560" height="5" fill="${RED}"/>`);
      const base = y + 40;
      parts.push(text(`(${row.place})`, { size: 16, baseline: base - 2, left: x0 + 8, color: MUTED, weight: 600 }));
      const seed = row.seed == null || row.seed === '' ? '' : `<span style="font-size:16px;font-weight:500;color:${YELLOW};vertical-align:9px;margin-right:7px">(#${esc(row.seed)})</span>`;
      parts.push(`<div class="nm" style="position:absolute;top:${(base - ASC * 26).toFixed(2)}px;right:${W - (x0 + 462)}px;max-width:390px;text-align:right;font:500 26px/1 Oswald,sans-serif;letter-spacing:.4px;color:${WHITE};white-space:nowrap">${seed}${esc(row.name.toUpperCase())}</div>`);
      parts.push(text(String(row.runs), { size: 27, baseline: base, center: x0 + 516, width: 80, color: YELLOW, weight: 650 }));
    });
    const sy = L_TOP + n * L_ROW + 30;
    parts.push(`<div style="position:absolute;top:${sy - 14}px;left:${x0 + 8}px;width:540px;font:400 17px/1.3 Arial,Helvetica,sans-serif;color:${WHITE}">${esc(side.summary)}</div>`);
  }
  parts.unshift(`<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="position:absolute;left:0;top:0">${shapes.join('')}</svg>`);
  parts.push(text('TOTAL RUNS', { size: 41, baseline: 234, left: 141, color: WHITE, weight: 650, spacing: 3.3 }));
  parts.push(text('LEADERBOARD', { size: 41, baseline: 234, right: 1059, color: WHITE, weight: 650, spacing: 3.3 }));
  parts.push(`<div style="position:absolute;top:${H - 82}px;left:100px;width:1000px;text-align:center;font:400 18px/1.35 Arial,Helvetica,sans-serif;color:${YELLOW}">${esc(input.note)}</div>`);
  return `<!doctype html><html><head><meta charset="utf-8"><style>${input.fontCss}html,body{margin:0;padding:0;background:transparent}</style></head>`
    + `<body><div id="board" style="position:relative;width:${W}px;height:${H}px;overflow:hidden">${parts.join('')}</div></body></html>`;
}

export type RunStand = { hsid: number; region: number; seed: number; rf: number; ra: number; w: number };
/**
 * A region's leaderboard rows, the site's order (src/components/bracket/gallery.tsx
 * rankRegion: most runs, then run differential, wins, seed). Places are shared by
 * equal runs, as the proof prints them. The top 10, plus the home school's own row
 * when it is lower; then a line for the rest ("1 team with 22 runs; 4 teams tied
 * with 21 runs; 113 more teams").
 */
export function regionLeaders(stands: RunStand[], region: number, home: number | null, show = 10): { rows: (RunStand & { place: number })[]; summary: string } {
  const ranked = stands.filter(s => s.region === region)
    .sort((x, y) => y.rf - x.rf || (y.rf - y.ra) - (x.rf - x.ra) || y.w - x.w || x.seed - y.seed);
  const placed = ranked.map((s, i) => ({ ...s, place: 0, i }));
  placed.forEach((s, i) => { s.place = i > 0 && s.rf === placed[i - 1].rf ? placed[i - 1].place : i + 1; });
  const top = placed.slice(0, show);
  const homeRow = home == null ? undefined : placed.slice(show).find(s => s.hsid === home);
  const rest = placed.slice(show).filter(s => s !== homeRow);
  const groups: string[] = [];
  let k = 0;
  while (groups.length < 2 && k < rest.length) {
    const runs = rest[k].rf, count = rest.filter(s => s.rf === runs).length;
    groups.push(count === 1 ? `1 team with ${runs} runs` : `${count} teams tied with ${runs} runs`);
    k += count;
  }
  if (rest.length > k) groups.push(`${rest.length - k} more teams`);
  return { rows: [...top, ...(homeRow ? [homeRow] : [])].map(({ i, ...s }) => s), summary: groups.join('; ') };
}
