'use client';

// Row 3 of the Connect & Contribute Portal: one round icon button per
// option, in the same strip the headshots use on the other pages. The four
// Contribute options open the drawer on their tab; the two Connect options
// scroll to their section of the page (row 4). The icons are the ones that
// mark each option everywhere on the site (CONTRIBUTE_OPTIONS).

import { CONTRIBUTE_OPTIONS, openContribute } from '@/lib/contribute';

export default function ContributeRow3() {
  const go = (id: string) => {
    const option = CONTRIBUTE_OPTIONS.find((o) => o.id === id);
    if (!option) return;
    if (option.tab) return openContribute({ tab: option.tab });
    document.getElementById(option.section)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  return (
    <nav className="ycr3" aria-label="Connect and contribute">
      {CONTRIBUTE_OPTIONS.map((o, i) => (
        <button type="button" key={o.id} className={`ycr3-btn${o.tab ? '' : ' is-connect'}${i === 4 ? ' is-first-connect' : ''}`} onClick={() => go(o.id)}>
          <span className="ycr3-icon"><i className={o.icon} aria-hidden="true" /></span>
          <span className="ycr3-label">{o.label}</span>
        </button>
      ))}
      <style jsx global>{`
        .ycr3 { height: 84px; display: flex; align-items: center; justify-content: center; gap: clamp(6px, 2vw, 26px); overflow-x: auto; padding: 4px 16px; background: var(--header-bg, #111); scrollbar-width: none; }
        .ycr3::-webkit-scrollbar { display: none; }
        .ycr3-btn { flex: 0 0 auto; width: clamp(62px, 11vw, 96px); display: flex; flex-direction: column; align-items: center; gap: 4px; border: 0; background: none; color: inherit; cursor: pointer; padding: 0; }
        .ycr3-icon { display: grid; place-items: center; width: 50px; height: 50px; border-radius: 50%; border: 2px solid #FFD700; color: #FFD700; font-size: 24px; background: rgba(255,215,0,.06); transition: transform .15s, background .15s; }
        body.light-theme .ycr3-icon { border-color: #9a6f00; color: #9a6f00; }
        .ycr3-btn:hover .ycr3-icon, .ycr3-btn:focus-visible .ycr3-icon { background: #FFD700; color: #000; transform: translateY(-1px); }
        .ycr3-btn.is-connect .ycr3-icon { border-style: dashed; }
        .ycr3-btn.is-first-connect { margin-left: clamp(4px, 2vw, 22px); }
        .ycr3-label { font: 500 10px/1.05 Oswald, sans-serif; letter-spacing: .05em; text-transform: uppercase; text-align: center; max-width: 100%; }
        @media (max-width: 520px) {
          .ycr3 { justify-content: flex-start; }
          .ycr3-icon { width: 44px; height: 44px; font-size: 21px; }
          .ycr3-label { font-size: 9px; }
        }
      `}</style>
    </nav>
  );
}
