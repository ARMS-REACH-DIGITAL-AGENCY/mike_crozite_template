// The hero's backdrop: an old-school ballpark drawn in code (no photos to
// license or load). Dark theme: a night game - dusk sky, light towers
// blazing over the grandstand roof. Light theme: a day game - blue sky,
// fluffy clouds, packed bleachers over the ivy. Both are always in the page;
// the theme picks which one shows (see .ybp-* in FantasyTimeline).

const W = 1600;
const H = 200;

// A light tower: a truss on the roof line holding a bank of lamps.
function Tower({ x, top, w }: { x: number; top: number; w: number }) {
  const rows = 3;
  const cols = Math.round(w / 9);
  const bankH = rows * 7 + 4;
  const roof = 100;
  return (
    <g>
      {/* the glow it throws */}
      <ellipse cx={x + w / 2} cy={top + bankH / 2} rx={w * 2.2} ry={w * 1.1} fill="url(#ybp-glow)" />
      {/* light pouring down onto the park */}
      <path d={`M${x} ${top + bankH} L${x - w * 0.6} ${H} H${x + w * 1.6} L${x + w} ${top + bankH} Z`} fill="url(#ybp-beam)" />
      {/* the truss */}
      <g stroke="#2a2f3d" strokeWidth="1.4" fill="none">
        <path d={`M${x + 4} ${top + bankH} L${x + 2} ${roof} M${x + w - 4} ${top + bankH} L${x + w - 2} ${roof}`} />
        <path d={`M${x + 4} ${top + bankH} L${x + w - 2} ${roof - 10} M${x + w - 4} ${top + bankH} L${x + 2} ${roof - 10}`} opacity=".7" />
        <path d={`M${x} ${top + bankH} H${x + w}`} />
      </g>
      {/* the lamp bank */}
      <rect x={x - 2} y={top - 2} width={w + 4} height={bankH} rx="2" fill="#151925" />
      <g filter="url(#ybp-bloom)">
        {Array.from({ length: rows * cols }, (_, i) => (
          <circle key={i} cx={x + 4 + (i % cols) * ((w - 8) / Math.max(1, cols - 1))} cy={top + 3 + Math.floor(i / cols) * 7} r="2.4" fill="#fffdf2" />
        ))}
      </g>
    </g>
  );
}

// A cloud: overlapping puffs with a soft shaded base.
function Cloud({ x, y, s }: { x: number; y: number; s: number }) {
  const puffs: [number, number, number][] = [[0, 10, 22], [24, 0, 30], [56, 6, 26], [80, 14, 18], [40, 18, 24], [-18, 18, 16]];
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      {puffs.map(([cx, cy, r], i) => <circle key={`s${i}`} cx={cx} cy={cy + 6} r={r} fill="#c9dcef" />)}
      {puffs.map(([cx, cy, r], i) => <circle key={i} cx={cx} cy={cy} r={r} fill="#fff" />)}
    </g>
  );
}

export default function BallparkScene() {
  const towers = [{ x: 130, top: 40, w: 130 }, { x: 610, top: 30, w: 170 }, { x: 1110, top: 34, w: 160 }, { x: 1460, top: 46, w: 110 }];
  const flags = [90, 330, 560, 860, 1010, 1300, 1420];
  const flagColors = ['#c8102e', '#f5f5f5', '#0e3386', '#c8102e', '#f5f5f5', '#0e3386', '#c8102e'];
  return (
    <div className="ybp" aria-hidden="true">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" width="100%" height="100%">
        <defs>
          <linearGradient id="ybp-night-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#05060f" />
            <stop offset=".35" stopColor="#140f33" />
            <stop offset=".62" stopColor="#3b1844" />
            <stop offset=".8" stopColor="#8a3a32" />
            <stop offset="1" stopColor="#c8642e" />
          </linearGradient>
          <linearGradient id="ybp-day-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#1f6fd1" />
            <stop offset=".6" stopColor="#5aa9ec" />
            <stop offset="1" stopColor="#bfe2fb" />
          </linearGradient>
          <linearGradient id="ybp-beam" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fff6d8" stopOpacity=".16" />
            <stop offset="1" stopColor="#fff6d8" stopOpacity="0" />
          </linearGradient>
          <radialGradient id="ybp-glow">
            <stop offset="0" stopColor="#fffbe8" stopOpacity=".8" />
            <stop offset=".35" stopColor="#ffe9a8" stopOpacity=".28" />
            <stop offset="1" stopColor="#ffe9a8" stopOpacity="0" />
          </radialGradient>
          <filter id="ybp-bloom" x="-20%" y="-50%" width="140%" height="200%">
            <feGaussianBlur stdDeviation="1.6" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <filter id="ybp-soft"><feGaussianBlur stdDeviation="1.2" /></filter>
          {/* fans in the seats: specks of colour */}
          <pattern id="ybp-crowd-night" width="14" height="9" patternUnits="userSpaceOnUse">
            <rect width="14" height="9" fill="#0b0d14" />
            <circle cx="3" cy="3" r="1.6" fill="#2c3550" /><circle cx="10" cy="5" r="1.6" fill="#3a2e3e" /><circle cx="6" cy="8" r="1.4" fill="#26324a" />
          </pattern>
          <pattern id="ybp-crowd-day" width="16" height="10" patternUnits="userSpaceOnUse">
            <rect width="16" height="10" fill="#7b8794" />
            <circle cx="3" cy="3" r="1.5" fill="#3a63a8" /><circle cx="9" cy="2.5" r="1.5" fill="#e4e8ee" /><circle cx="14" cy="4" r="1.5" fill="#b8455a" />
            <circle cx="6" cy="8" r="1.5" fill="#4f78c0" /><circle cx="12" cy="8.5" r="1.5" fill="#d9d3c6" />
          </pattern>
          <linearGradient id="ybp-haze" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#bfe2fb" stopOpacity=".55" />
            <stop offset="1" stopColor="#bfe2fb" stopOpacity="0" />
          </linearGradient>
          <pattern id="ybp-ivy" width="12" height="10" patternUnits="userSpaceOnUse">
            <rect width="12" height="10" fill="#2f6a2a" />
            <circle cx="3" cy="3" r="3" fill="#3f8436" /><circle cx="9" cy="6" r="3.2" fill="#25561f" /><circle cx="4" cy="9" r="2.6" fill="#4a9440" />
          </pattern>
        </defs>

        {/* NIGHT GAME */}
        <g className="ybp-night">
          <rect width={W} height={H} fill="url(#ybp-night-sky)" />
          {towers.map((t, i) => <Tower key={i} {...t} />)}
          {/* the grandstand roof and the upper deck under it */}
          <path d={`M0 112 L0 100 H${W} V112 Z`} fill="#06070c" />
          {flags.map((x, i) => (
            <g key={i}><path d={`M${x} 100 V80`} stroke="#3a3f4f" strokeWidth="1.2" /><path d={`M${x} 80 l14 4 l-14 4 Z`} fill={flagColors[i]} opacity=".75" /></g>
          ))}
          <rect y="112" width={W} height="32" fill="url(#ybp-crowd-night)" />
          {/* concourse lights under the upper deck */}
          <rect y="143" width={W} height="6" fill="#120c08" />
          {Array.from({ length: 40 }, (_, i) => <circle key={i} cx={20 + i * 40} cy="146" r="1.5" fill="#ffb347" opacity=".85" />)}
          <rect y="149" width={W} height={H - 149} fill="url(#ybp-crowd-night)" />
          {/* a field-level wash of light */}
          <rect y="160" width={W} height="40" fill="#ffe9a8" opacity=".05" />
        </g>

        {/* DAY GAME */}
        <g className="ybp-day">
          <rect width={W} height={H} fill="url(#ybp-day-sky)" />
          <g className="ybp-clouds">
            <Cloud x={70} y={34} s={1.1} /><Cloud x={420} y={18} s={0.8} /><Cloud x={780} y={42} s={1.25} />
            <Cloud x={1180} y={20} s={0.95} /><Cloud x={1480} y={46} s={0.85} />
          </g>
          {/* the bleachers climbing to the back row */}
          <path d={`M0 118 L0 104 H${W} V118 Z`} fill="#3d4652" />
          {flags.map((x, i) => (
            <g key={i}><path d={`M${x} 104 V84`} stroke="#5a6170" strokeWidth="1.2" /><path d={`M${x} 84 l14 4 l-14 4 Z`} fill={flagColors[i]} /></g>
          ))}
          <rect y="118" width={W} height="52" fill="url(#ybp-crowd-day)" />
          <rect y="118" width={W} height="30" fill="url(#ybp-haze)" />
          {/* the ivy wall */}
          <rect y="170" width={W} height={H - 170} fill="url(#ybp-ivy)" />
          <rect y="170" width={W} height="2" fill="#1d3f1a" opacity=".6" />
        </g>
      </svg>
    </div>
  );
}
