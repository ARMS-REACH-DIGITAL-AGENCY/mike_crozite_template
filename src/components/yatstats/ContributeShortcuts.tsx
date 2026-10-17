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
        /* Same circular line-icon vocabulary as Connect & Contribute. */
        #drawerAccount .ycs{display:flex;flex-direction:column;gap:4px;margin:8px 0 20px;}
        #drawerAccount .ycs-title{margin:0 0 7px;color:var(--muted);font:700 12px/1.15 var(--yat-font-compact,"Barlow Condensed",sans-serif);letter-spacing:.09em;text-transform:uppercase;}
        #drawerAccount .ycs-item{display:flex;align-items:center;gap:14px;width:100%;min-height:72px;padding:9px 10px;border:0;border-radius:10px;text-align:left;background:transparent;color:var(--ink);cursor:pointer;text-decoration:none;transition:background-color .15s;}
        #drawerAccount .ycs-item:hover,#drawerAccount .ycs-item:focus-visible{background:var(--line);outline-offset:-2px;}
        #drawerAccount .ycs-icon{flex:0 0 52px;width:52px;height:52px;display:grid;place-items:center;border:1px solid var(--line);border-radius:50%;background:var(--bg);color:var(--ink);font-size:25px;box-shadow:none;}
        #drawerAccount .ycs-icon i{display:block;font-size:25px;line-height:1;}
        #drawerAccount .ycs-text{display:flex;flex-direction:column;gap:4px;min-width:0;}
        #drawerAccount .ycs-text b{font:800 14px/1.15 var(--yat-font-ui,Archivo,Arial,sans-serif);letter-spacing:-.025em;}
        #drawerAccount .ycs-text small{font:400 12px/1.35 var(--yat-font-ui,Archivo,Arial,sans-serif);color:var(--muted);opacity:1;}
        @media(max-width:779px){
          #drawerAccount .ycs-item{min-height:69px;gap:12px;padding:7px 8px;}
          #drawerAccount .ycs-icon{flex-basis:46px;width:46px;height:46px;font-size:23px;}
          #drawerAccount .ycs-icon i{font-size:23px;}
        }
      `}</style>
    </nav>
  );
}
