// The hero's backdrop, drawn in code (no photos to license or load), above
// the scoreboards rather than a whole ballpark. Dark theme: a night sky with
// the light towers blazing. Light theme: a day sky with soft, wispy clouds.
// Both are always in the page; the theme picks which one shows (see .ybp-*
// in FantasyTimeline).

const W = 1600;
const H = 200;

// A light standard seen from the field: a lattice mast from the bottom edge
// up to a bank of lamps, with the glow it throws into the night.
function Tower({ x, top, w }: { x: number; top: number; w: number }) {
  const rows = 4;
  const cols = Math.round(w / 8);
  const bankH = rows * 6 + 4;
  const mid = x + w / 2;
  return (
    <g>
      <ellipse cx={mid} cy={top + bankH / 2} rx={w * 2.4} ry={w * 1.3} fill="url(#ybp-glow)" />
      <g stroke="#1b1f2b" strokeWidth="1.3" fill="none" opacity=".9">
        <path d={`M${mid - 9} ${top + bankH} L${mid - 14} ${H} M${mid + 9} ${top + bankH} L${mid + 14} ${H}`} />
        {Array.from({ length: 8 }, (_, i) => {
          const y1 = top + bankH + (i * (H - top - bankH)) / 8;
          const y2 = top + bankH + ((i + 1) * (H - top - bankH)) / 8;
          const s1 = 9 + (5 * (y1 - top - bankH)) / (H - top - bankH);
          const s2 = 9 + (5 * (y2 - top - bankH)) / (H - top - bankH);
          return <path key={i} d={`M${mid - s1} ${y1} L${mid + s2} ${y2} M${mid + s1} ${y1} L${mid - s2} ${y2}`} opacity=".6" />;
        })}
      </g>
      <rect x={x - 3} y={top - 3} width={w + 6} height={bankH + 2} rx="2" fill="#0e1119" />
      <g filter="url(#ybp-bloom)">
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

export default function BallparkScene() {
  const towers = [{ x: 90, top: 46, w: 120 }, { x: 470, top: 30, w: 150 }, { x: 1030, top: 34, w: 150 }, { x: 1420, top: 50, w: 120 }];
  return (
    <div className="ybp" aria-hidden="true">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" width="100%" height="100%">
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
          <radialGradient id="ybp-glow">
            <stop offset="0" stopColor="#fffbe8" stopOpacity=".75" />
            <stop offset=".3" stopColor="#fff1c4" stopOpacity=".25" />
            <stop offset="1" stopColor="#fff1c4" stopOpacity="0" />
          </radialGradient>
          <filter id="ybp-bloom" x="-20%" y="-60%" width="140%" height="220%">
            <feGaussianBlur stdDeviation="1.6" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
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
