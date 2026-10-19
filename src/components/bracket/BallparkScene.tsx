// The Fantasy tab's backdrop, drawn in code (no photos to license or load):
// one picture behind rows 1, 2 and 3 together, the way the player profile's
// photo bleeds up behind the header (Pete, Oct 19). Dark theme: a night sky
// with the splash page's three light towers, placed the same way, their
// lamps up in rows 1-2 so row 3's story has no lights behind it; the side
// two are screened back. Light theme: a day sky with soft, wispy clouds.
// Both are always in the page; the theme picks which one shows (see .ybp-*
// below and in FantasyTimeline).

const W = 1600;
// Rows 1 + 2 + 3 on a desktop (36 + 56 + 200): the scene is drawn for the
// whole stack and anchored to its top, so the lamps stay in row 1.
const H = 292;

// A light standard seen from the field: a lattice mast from the bottom edge
// up to a bank of lamps, with the glow it throws into the night. fade: the
// mast fades into the dark on its way down.
function Tower({ x, top, w, h = H, ids = 'ybp', fade = false }: { x: number; top: number; w: number; h?: number; ids?: string; fade?: boolean }) {
  const rows = 4;
  const cols = Math.round(w / 8);
  const bankH = rows * 6 + 4;
  const mid = x + w / 2;
  return (
    <g>
      <ellipse cx={mid} cy={top + bankH / 2} rx={w * 2.4} ry={w * 1.3} fill={`url(#${ids}-glow)`} />
      {fade ? (
        <defs>
          <linearGradient id={`${ids}-mast-${x}`} gradientUnits="userSpaceOnUse" x1="0" y1={top + bankH} x2="0" y2={h}>
            <stop offset="0" stopColor="#1b1f2b" />
            <stop offset="1" stopColor="#1b1f2b" stopOpacity=".25" />
          </linearGradient>
        </defs>
      ) : null}
      <g stroke={fade ? `url(#${ids}-mast-${x})` : '#1b1f2b'} strokeWidth="1.3" fill="none" opacity=".9">
        <path d={`M${mid - 9} ${top + bankH} L${mid - 14} ${h} M${mid + 9} ${top + bankH} L${mid + 14} ${h}`} />
        {Array.from({ length: 8 }, (_, i) => {
          const y1 = top + bankH + (i * (h - top - bankH)) / 8;
          const y2 = top + bankH + ((i + 1) * (h - top - bankH)) / 8;
          const s1 = 9 + (5 * (y1 - top - bankH)) / (h - top - bankH);
          const s2 = 9 + (5 * (y2 - top - bankH)) / (h - top - bankH);
          return <path key={i} d={`M${mid - s1} ${y1} L${mid + s2} ${y2} M${mid + s1} ${y1} L${mid - s2} ${y2}`} opacity=".6" />;
        })}
      </g>
      <rect x={x - 3} y={top - 3} width={w + 6} height={bankH + 2} rx="2" fill="#0e1119" />
      <g filter={`url(#${ids}-bloom)`}>
        {Array.from({ length: rows * cols }, (_, i) => (
          <circle key={i} cx={x + 3 + (i % cols) * ((w - 6) / Math.max(1, cols - 1))} cy={top + 2 + Math.floor(i / cols) * 6} r="2.1" fill="#fffdf4" />
        ))}
      </g>
    </g>
  );
}

// A wisp of cloud: long, soft, blurred streaks.
function Wisp({ x, y, w, o = 0.8 }: { x: number; y: number; w: number; o?: number }) {
  return (
    <g filter="url(#ybp-wisp)" opacity={o}>
      <ellipse cx={x} cy={y} rx={w} ry={w * 0.09} fill="#fff" />
      <ellipse cx={x + w * 0.25} cy={y - w * 0.06} rx={w * 0.55} ry={w * 0.07} fill="#fff" />
      <ellipse cx={x - w * 0.3} cy={y + w * 0.05} rx={w * 0.5} ry={w * 0.06} fill="#f4f9ff" />
    </g>
  );
}

// The lamps' glow and bloom, under an id prefix so another copy of the
// towers (the school splash's) can't point at a hidden one.
function LightDefs({ ids }: { ids: string }) {
  return (
    <>
      <radialGradient id={`${ids}-glow`}>
        <stop offset="0" stopColor="#fffbe8" stopOpacity=".75" />
        <stop offset=".3" stopColor="#fff1c4" stopOpacity=".25" />
        <stop offset="1" stopColor="#fff1c4" stopOpacity="0" />
      </radialGradient>
      <filter id={`${ids}-bloom`} x="-20%" y="-60%" width="140%" height="220%">
        <feGaussianBlur stdDeviation="1.6" result="b" />
        <feMerge><feMergeNode in="b" /><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
      </filter>
    </>
  );
}

// The night game's three light towers on a phone-shaped strip, 600 x 300:
// left, center (the tallest) and right. The school splash and the Fantasy
// tab share them, so the towers someone sees on the splash are the ones
// over the bracket.
const LIGHTS_W = 600;
const LIGHTS_H = 300;
const LIGHT_TOWERS = [{ x: 34, top: 44, w: 104 }, { x: 246, top: 26, w: 108 }, { x: 462, top: 44, w: 104 }];

// The towers alone, on black: the school splash's stadium lights
// (SchoolSplash fades them out below).
export function BallparkLights({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox={`0 0 ${LIGHTS_W} ${LIGHTS_H}`} preserveAspectRatio="xMidYMin slice" aria-hidden="true">
      <defs><LightDefs ids="yslights" /></defs>
      {LIGHT_TOWERS.map((t, i) => <Tower key={i} {...t} h={LIGHTS_H} ids="yslights" />)}
    </svg>
  );
}

// The scene is fixed to the top of the window and as tall as rows 1-3 (2px
// over for row 2's borders), painted behind row 3's content (z-index -1 in
// row 3's stacking context, as the profile's photo is); rows 1 and 2 go see-
// through over it (FantasyTimeline). The towers are the splash's strip,
// placed as on the splash (centered, up to 760px wide, cropped at the
// bottom); the side two are screened back. The shade darkens both sides
// from top to bottom - the icons, school name and story on the left, the
// logo and the series on the right - and leaves the center open.
const BALLPARK_CSS = `
.ybp { position:fixed; z-index:-1; top:0; left:0; right:0; height:calc(var(--row1-h, 36px) + var(--row2-h, 54px) + 202px); overflow:hidden; pointer-events:none; background:#020308; }
.ybp svg { display:block; }
.ybp-shade { position:absolute; inset:0; background:linear-gradient(90deg,rgba(2,3,8,.82) 0%,rgba(2,3,8,.74) 32%,rgba(2,3,8,.4) 50%,rgba(2,3,8,.3) 62%,rgba(2,3,8,.6) 80%,rgba(2,3,8,.72) 100%); }
.ybp-day { display:none; }
body.light-theme .ybp-day { display:inline; }
body.light-theme .ybp-night { display:none; }
body.light-theme .ybp { background:#1d64c4; }
body.light-theme .ybp-shade { background:linear-gradient(90deg,rgba(6,28,58,.82) 0%,rgba(6,28,58,.74) 32%,rgba(6,28,58,.45) 50%,rgba(6,28,58,.35) 62%,rgba(6,28,58,.62) 80%,rgba(6,28,58,.72) 100%); }
body.light-theme .ybp-lights { display:none; }
.ybp-lights { position:absolute; top:0; left:50%; width:min(100%,760px); height:100%; transform:translateX(-50%); overflow:visible; }
.ybp-side { opacity:.45; }
.ybp-clouds { animation:ybp-drift 80s linear infinite alternate; }
@keyframes ybp-drift { from { transform:translateX(-30px); } to { transform:translateX(40px); } }
@media (prefers-reduced-motion: reduce) { .ybp-clouds { animation:none; } }
.yft-hero { position:relative; height:200px; min-height:200px; overflow:hidden; background:transparent; }
@media (max-width:760px) { .yft-hero { height:118px; min-height:118px; } .ybp { height:calc(var(--row1-h, 36px) + var(--row2-h, 54px) + 120px); } }
`;

export default function BallparkScene() {
  return (
    <div className="ybp" aria-hidden="true">
      {/* The scene's own rules ship with it, so the first frame is already
          right - before the hero's data (and its stylesheet) arrive, the
          day sky used to flash over the night game in the dark theme. */}
      <style>{BALLPARK_CSS}</style>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMin slice" width="100%" height="100%">
        <defs>
          <linearGradient id="ybp-night-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#020308" />
            <stop offset=".6" stopColor="#070a18" />
            <stop offset="1" stopColor="#111633" />
          </linearGradient>
          <linearGradient id="ybp-day-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#1d64c4" />
            <stop offset=".55" stopColor="#4c9ae6" />
            <stop offset="1" stopColor="#a9d4f6" />
          </linearGradient>
          <filter id="ybp-wisp" x="-30%" y="-200%" width="160%" height="500%">
            <feGaussianBlur stdDeviation="6 3" />
          </filter>
        </defs>

        {/* NIGHT: a dark sky (the towers are their own strip, below) */}
        <g className="ybp-night">
          <rect width={W} height={H} fill="url(#ybp-night-sky)" />
        </g>

        {/* DAY: the sky and wispy clouds, from row 1 down */}
        <g className="ybp-day">
          <rect width={W} height={H} fill="url(#ybp-day-sky)" />
          <g className="ybp-clouds">
            <Wisp x={180} y={40} w={170} />
            <Wisp x={560} y={22} w={120} o={0.65} />
            <Wisp x={880} y={64} w={210} o={0.75} />
            <Wisp x={1240} y={30} w={150} />
            <Wisp x={1520} y={84} w={130} o={0.7} />
            <Wisp x={380} y={128} w={140} o={0.55} />
            <Wisp x={1090} y={150} w={180} o={0.5} />
            <Wisp x={700} y={206} w={190} o={0.45} />
            <Wisp x={1380} y={232} w={150} o={0.4} />
            <Wisp x={150} y={250} w={160} o={0.4} />
          </g>
        </g>
      </svg>
      {/* NIGHT: the splash's three towers, the side two screened back and
          drawn first, so the center one is on top. */}
      <svg className="ybp-lights" viewBox={`0 0 ${LIGHTS_W} ${LIGHTS_H}`} preserveAspectRatio="xMidYMin slice">
        <defs><LightDefs ids="ybpl" /></defs>
        {[0, 2, 1].map((i) => (
          <g key={i} className={i === 1 ? undefined : 'ybp-side'}><Tower {...LIGHT_TOWERS[i]} h={LIGHTS_H} ids="ybpl" fade /></g>
        ))}
      </svg>
      <div className="ybp-shade" />
    </div>
  );
}
