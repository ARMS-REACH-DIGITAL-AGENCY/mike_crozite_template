'use client';

import { useState } from 'react';

/** Rows 5 + 6: unified sticky clubhouse footer. No voice AI is wired yet. */
export default function ClubhouseFooter({ activeAlumni }: { activeAlumni: number | null }) {
  const [factIndex, setFactIndex] = useState(0);
  const facts = [
    'Every alumni flip card tells a story. Explore your school\'s next-level players.',
    'Know an alumnus we missed? Connect & Contribute to help complete the story.',
    'New to YAT?STATS? Take the guided tour and explore the platform.',
  ];
  const nav = [
    { label: 'FANS', icon: '♟', href: '/#fans' },
    { label: 'PLAYERS', icon: '♙', href: '/#players' },
    { label: 'COACHES', icon: '⚾', href: '/#coaches' },
    { label: 'PARTNERS', icon: '✦', href: '/#partners' },
    { label: 'TOUR / FAQ', icon: '?', href: '/#tour' },
  ];
  return (
    <div className="yat-clubhouse" aria-label="YaTi's Clubhouse and guided tour">
      <img className="yat-clubhouse-yati" src="https://yatstats-assets.s3.us-west-2.amazonaws.com/yatstats/YaTi.png" alt="YaTi, the YAT?STATS clubhouse manager" />
      <div className="yat-clubhouse-facts">
        <div className="yat-clubhouse-message">
          <strong>YaTi's CLUBHOUSE</strong>
          <span>{facts[factIndex]}</span>
          <div className="yat-clubhouse-fact-controls">
            <button type="button" onClick={() => setFactIndex((factIndex + facts.length - 1) % facts.length)} aria-label="Previous clubhouse fact">‹</button>
            <span aria-live="polite">{factIndex + 1} / {facts.length}</span>
            <button type="button" onClick={() => setFactIndex((factIndex + 1) % facts.length)} aria-label="Next clubhouse fact">›</button>
          </div>
        </div>
        <div className="yat-clubhouse-count"><strong>{activeAlumni ?? 0}</strong><span>ACTIVE<br/>ALUMNI</span></div>
      </div>
      <nav className="yat-clubhouse-nav" aria-label="Explore YAT?STATS">
        {nav.map((item) => <a key={item.label} href={item.href} aria-label={item.label}><span aria-hidden="true">{item.icon}</span><small>{item.label}</small></a>)}
      </nav>
    </div>
  );
}
