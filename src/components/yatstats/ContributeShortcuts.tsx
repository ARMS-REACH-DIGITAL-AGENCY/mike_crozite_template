'use client';

// The Connect & Contribute options in the signed-in account drawer: the
// first thing a fan sees after joining or logging in. The same icons as
// row 3 of the portal, each with one line on what it is. A tap goes to that
// section of the Connect & Contribute page (just scrolls there when the fan
// is already on it), where its button opens the drawer.

import { useContext } from 'react';
import { SchoolContext } from '@/context/SchoolContext';
import { CONTRIBUTE_OPTIONS, contributeSectionHref, scrollToContributeSection } from '@/lib/contribute';

function closeAccountDrawer() {
  document.body.classList.remove('drawer-account-open');
  if (!document.body.className.match(/drawer-(left|right|sort|favorites|story|contribute)-open/)) document.body.classList.remove('drawer-open');
  const drawer = document.getElementById('drawerAccount');
  drawer?.classList.remove('open', 'is-open', 'active');
  drawer?.setAttribute('aria-hidden', 'true');
  document.getElementById('drawerMask')?.classList.remove('open', 'is-open', 'active');
}

export default function ContributeShortcuts() {
  const school = useContext(SchoolContext);
  const hsid = String(school?.hsid || '');

  return (
    <nav className="ycs" aria-label="Connect and contribute">
      <div className="ycs-title">Connect &amp; Contribute</div>
      {CONTRIBUTE_OPTIONS.map((option) => (
        <a
          key={option.id}
          className="ycs-item"
          href={hsid ? contributeSectionHref(hsid, option.section) : `#${option.section}`}
          onClick={(event) => {
            if (!/\/connect-contribute\/?$/.test(window.location.pathname)) return;
            event.preventDefault();
            closeAccountDrawer();
            scrollToContributeSection(option.section);
          }}
        >
          <span className="ycs-icon"><i className={option.icon} aria-hidden="true" /></span>
          <span className="ycs-text"><b>{option.label}</b><small>{option.blurb}</small></span>
        </a>
      ))}
      <style jsx global>{`
        .ycs { display: flex; flex-direction: column; gap: 2px; margin: 0 0 18px; }
        .ycs-title { margin-bottom: 6px; color: var(--sb-text); font: 500 13px/1 Oswald, sans-serif; letter-spacing: .1em; text-transform: uppercase; }
        .ycs-item { display: flex; align-items: center; gap: 12px; padding: 7px 4px; border-radius: 8px; color: inherit; text-decoration: none; }
        .ycs-item:hover, .ycs-item:focus-visible { background: var(--sb-green-soft); }
        .ycs-icon { flex: none; display: grid; place-items: center; width: 42px; height: 42px; border-radius: 50%; border: 1px solid var(--sb-gold); background: var(--sb-panel); color: var(--sb-cream); font-size: 20px; }
        .ycs-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
        .ycs-text b { font: 500 15px/1.1 Oswald, sans-serif; letter-spacing: .04em; text-transform: uppercase; }
        .ycs-text small { font-size: 12px; line-height: 1.3; opacity: .75; }
      `}</style>
    </nav>
  );
}
