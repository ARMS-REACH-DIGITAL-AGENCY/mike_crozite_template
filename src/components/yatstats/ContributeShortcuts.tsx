'use client';

// Four contribution actions in the signed-in account drawer. A tap opens the
// corresponding left-side contribution form immediately, without leaving the
// current school or player page for the Connect & Contribute portal.
import { CONTRIBUTE_OPTIONS, openContribute } from '@/lib/contribute';
import ContributeActionIcon from './ContributeActionIcon';

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
          <span className="ycs-icon"><ContributeActionIcon id={option.id} /></span>
          <span className="ycs-text"><b>{option.label}</b><small>{option.blurb}</small></span>
        </button>
      ))}
      <style jsx global>{`
        #drawerAccount .ycs { display:flex; flex-direction:column; gap:4px; margin:0 0 18px; }
        #drawerAccount .ycs-title { margin:0 0 7px; color:var(--muted); font:700 11px/1.2 var(--yat-font-compact); letter-spacing:.1em; text-transform:uppercase; }
        #drawerAccount .ycs-item { display:grid; grid-template-columns:52px minmax(0,1fr) 16px; align-items:center; gap:12px; width:100%; min-height:75px; padding:10px 9px; background:transparent; border:0; border-radius:7px; text-align:left; color:var(--fg); cursor:pointer; }
        #drawerAccount .ycs-item::after { content:'›'; font:500 20px/1 var(--yat-font-ui); color:var(--muted); }
        #drawerAccount .ycs-item:hover,#drawerAccount .ycs-item:focus-visible { background:var(--line); }
        #drawerAccount .ycs-item:focus-visible { outline:2px solid var(--fg); outline-offset:-2px; }
        #drawerAccount .ycs-icon { display:grid; place-items:center; width:50px; height:50px; border-radius:50%; border:1px solid var(--line); background:var(--card-bg); color:var(--fg); }
        #drawerAccount .ycs-icon svg { display:block; width:27px; height:27px; }
        #drawerAccount .ycs-text { display:flex; min-width:0; flex-direction:column; gap:5px; }
        #drawerAccount .ycs-text b { font:800 14px/1.17 var(--yat-font-ui); letter-spacing:-.02em; }
        #drawerAccount .ycs-text small { color:var(--muted); opacity:1; font:400 12px/1.35 var(--yat-font-ui); }
        @media(max-width:420px) { #drawerAccount .ycs-item { grid-template-columns:45px minmax(0,1fr) 12px; gap:9px; min-height:70px; padding:9px 4px; } #drawerAccount .ycs-icon { width:44px; height:44px; } #drawerAccount .ycs-icon svg { width:24px; height:24px; } }
`}</style>
    </nav>
  );
}
