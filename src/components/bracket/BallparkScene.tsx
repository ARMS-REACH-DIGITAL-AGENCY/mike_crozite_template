// The hero's backdrop, drawn in code (no photos to license or load), above
// the scoreboards rather than a whole ballpark. Dark theme: a night sky with
// a light tower blazing in the center. Light theme: a day sky with soft,
// wispy clouds.
// Both are always in the page; the theme picks which one shows (see .ybp-*
// in FantasyTimeline).

const W = 1600;
const H = 200;

// A light standard seen from the field: a lattice mast from the bottom edge
// up to a bank of lamps, with the glow it throws into the night.
function Tower({ x, top, w, h = H, ids = 'ybp' }: { x: number; top: number; w: number; h?: number; ids?: string }) {
  const rows = 4;
  const cols = Math.round(w / 8);
  const bankH = rows * 6 + 4;
  const mid = x + w / 2;
  return (
    <g>
      <ellipse cx={mid} cy={top + bankH / 2} rx={w * 2.4} ry={w * 1.3} fill={`url(#${ids}-glow)`} />
      <g stroke="#1b1f2b" strokeWidth="1.3" fill="none" opacity=".9">
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

// The night game's light towers alone, on black, for a phone-shaped strip:
// the school splash's stadium lights (SchoolSplash fades them out below).
export function BallparkLights({ className }: { className?: string }) {
  const w = 600;
  const h = 300;
  const towers = [{ x: 34, top: 44, w: 104 }, { x: 246, top: 26, w: 108 }, { x: 462, top: 44, w: 104 }];
  return (
    <svg className={className} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMin slice" aria-hidden="true">
      <defs><LightDefs ids="yslights" /></defs>
      {towers.map((t, i) => <Tower key={i} {...t} h={h} ids="yslights" />)}
    </svg>
  );
}

const BALLPARK_CSS = `
.ybp { position:absolute; inset:0; z-index:0; pointer-events:none; }
.ybp svg { display:block; }
.ybp-day { display:none; }
body.light-theme .ybp-day { display:inline; }
body.light-theme .ybp-night { display:none; }
.ybp-clouds { animation:ybp-drift 80s linear infinite alternate; }
@keyframes ybp-drift { from { transform:translateX(-30px); } to { transform:translateX(40px); } }
@media (prefers-reduced-motion: reduce) { .ybp-clouds { animation:none; } }
.yft-hero { position:relative; height:200px; min-height:200px; overflow:hidden; background:#050505; }
@media (max-width:760px) { .yft-hero { height:118px; min-height:118px; } }
`;

export default function BallparkScene() {
  // One tower, dead center (the viewBox center stays at the screen's center
  // at any width), its lamps up top, above the headline: the sides stay dark
  // for the story and the scoreboard (Pete, Oct 19 - the side towers blazed
  // right behind the words).
  const towers = [{ x: W / 2 - 70, top: 6, w: 140 }];
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
          <LightDefs ids="ybp" />
          <filter id="ybp-wisp" x="-30%" y="-200%" width="160%" height="500%">
            <feGaussianBlur stdDeviation="6 3" />
          </filter>
        </defs>

        {/* NIGHT: a dark sky and the light towers */}
        <g className="ybp-night">
          <rect width={W} height={H} fill="url(#ybp-night-sky)" />
          {towers.map((t, i) => <Tower key={i} {...t} />)}
        </g>

        {/* DAY: the sky and wispy clouds */}
        <g className="ybp-day">
          <rect width={W} height={H} fill="url(#ybp-day-sky)" />
          <g className="ybp-clouds">
            <Wisp x={180} y={58} w={170} />
            <Wisp x={560} y={34} w={120} o={0.65} />
            <Wisp x={880} y={74} w={210} o={0.75} />
            <Wisp x={1240} y={44} w={150} />
            <Wisp x={1520} y={86} w={130} o={0.7} />
            <Wisp x={380} y={120} w={140} o={0.55} />
            <Wisp x={1090} y={138} w={180} o={0.5} />
          </g>
        </g>
      </svg>
    </div>
  );
}
