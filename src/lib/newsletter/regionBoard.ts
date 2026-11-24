/**
 * The region scoreboard image (Pete, Nov 24 2026: "This is the scoreboard
 * design that needs to be used in the Digest. It's also used in the
 * Gazette"). The design is the Nov 13 2026 Gazette board, kept as
 * nl/gz3/55.png on branch ccr-0ad18095-umgndf: ASB medallion, REGION n |
 * YAT?STATS, BEST OF 3 SERIES, each school's series record, "(#seed) NAME",
 * innings 1-10 and R, a green rule between games, and the footer.
 *
 * This file only builds the page; scripts/newsletter-draw-boards.ts draws it
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
