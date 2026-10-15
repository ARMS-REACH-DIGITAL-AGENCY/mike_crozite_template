'use client';

// Four contribution actions in the signed-in account drawer. A tap opens the
// corresponding left-side contribution form immediately, without leaving the
// current school or player page for the Connect & Contribute portal.
import { CONTRIBUTE_OPTIONS, openContribute } from '@/lib/contribute';

const CONTRIBUTION_ACTIONS = CONTRIBUTE_OPTIONS.filter((option) => option.tab);

function closeAccountDrawer() {
  document.body.classList.remove('drawer-account-open');
  if (!document.body.className.match(/drawer-(left|right|sort|favorites|story|contribute)-open/)) document.body.classList.remove('drawer-open');
  const drawer = document.getElementById('drawerAccount');
  drawer?.classList.remove('open', 'is-open', 'active');
  drawer?.setAttribute('aria-hidden', 'true');
  document.getElementById('drawerMask')?.classList.remove('open', 'is-open', 'active');
}

export default function ContributeShortcuts() {
  return (
    <nav className="ycs" aria-label="Contribute">
      <div className="ycs-title">Contribute</div>
      {CONTRIBUTION_ACTIONS.map((option) => (
        <button
          key={option.id}
          type="button"
          className="ycs-item"
          onClick={() => {
            closeAccountDrawer();
            openContribute({ tab: option.tab });
          }}
        >
          <span className="ycs-icon"><i className={option.icon} aria-hidden="true" /></span>
          <span className="ycs-text"><b>{option.label}</b><small>{option.blurb}</small></span>
        </button>
      ))}
      <style jsx global>{`
        .ycs { display: flex; flex-direction: column; gap: 2px; margin: 0 0 18px; }
        .ycs-title { margin-bottom: 6px; color: var(--sb-ink-muted); font: 600 11px/1 var(--yat-font-ui); letter-spacing: .06em; text-transform: uppercase; }
        .ycs-item { display: flex; align-items: center; gap: 10px; width: 100%; border: 0; text-align: left; font: inherit; background: transparent; cursor: pointer; padding: 5px 4px; border-radius: 8px; color: inherit; text-decoration: none; }
        .ycs-item:hover, .ycs-item:focus-visible { background: var(--sb-green-soft); }
        .ycs-icon { flex: none; display: grid; place-items: center; width: 32px; height: 32px; border-radius: 6px; border: 1px solid var(--sb-rim); background: var(--sb-panel); color: #fff; font-size: 16px; }
        .ycs-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
        .ycs-text b { font: 700 17px/1.15 var(--yat-font-compact); letter-spacing: .005em; }
        .ycs-text small { font: 400 11.5px/1.3 var(--yat-font-ui); opacity: .7; }
      `}</style>
    </nav>
  );
}
