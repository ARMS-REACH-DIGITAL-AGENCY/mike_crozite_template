// src/components/yatstats/shell/MetadataRow.tsx
'use client';

import { useEffect, useState } from 'react';

type SchoolMeta = {
  activeAlumni: number | null;
  mlb: number | null;
  natRank: number | null;
  stateRank: string | null;
  allTime: number | null;
  draftedRatio: string | null;
  currentRosterSize?: number | null;
  collegeCommits?: number | null;
  overallRecord?: string | null;
  regionRecord?: string | null;
};

interface MetadataRowProps {
  isPlayerProfile: boolean;
  isGallery: boolean;
  schoolMeta: SchoolMeta;
}

function chipValue(value: string | number | null | undefined, prefix = '') {
  if (value == null || value === '') return '—';
  return `${prefix}${value}`;
}

function MetaChip({
  value,
  label,
  highlight = false,
}: {
  value: string | number | null | undefined;
  label: string;
  highlight?: boolean;
}) {
  return (
    <div className="yat-gs-chip yat-shell-meta-chip">
      <span className={`yat-gs-chip-val${highlight ? ' hi' : ''}`}>
        {value == null || value === '' ? '—' : String(value)}
      </span>
      <span className="yat-gs-chip-lbl">{label}</span>
    </div>
  );
}

function getCurrentSectionFromDom(): string {
  if (typeof document === 'undefined') return '';
  const visible = document.querySelector('.yat-section.visible');
  if (!visible?.id) return '';
  return visible.id.replace(/^sec-/, '');
}

function getCurrentSection(): string {
  if (typeof window === 'undefined') return '';
  const hash = window.location.hash || '';
  if (hash.startsWith('#sec-')) return hash.replace('#sec-', '');
  return getCurrentSectionFromDom();
}

export default function MetadataRow({
  isPlayerProfile,
  isGallery,
  schoolMeta,
}: MetadataRowProps) {
  const [activeSection, setActiveSection] = useState('');
  const pathname = typeof window !== 'undefined' ? window.location.pathname : '';

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const syncSection = () => {
      window.setTimeout(() => setActiveSection(getCurrentSection()), 0);
    };

    syncSection();
    window.addEventListener('hashchange', syncSection);
    window.addEventListener('popstate', syncSection);
    document.addEventListener('click', syncSection, true);

    return () => {
      window.removeEventListener('hashchange', syncSection);
      window.removeEventListener('popstate', syncSection);
      document.removeEventListener('click', syncSection, true);
    };
  }, []);

  if (isGallery || pathname.includes('/news')) {
    if (activeSection === 'current') {
      return (
        <div className="yat-shell-meta-wrap yat-shell-meta-wrap--current-team">
          <div
            className="yat-gs-stats yat-shell-meta-stats yat-shell-meta-stats--current-team"
            role="group"
            aria-label="Current team metadata"
          >
            <MetaChip value={chipValue(schoolMeta.currentRosterSize)} label="ROSTER SIZE" highlight />
            <MetaChip value={chipValue(schoolMeta.collegeCommits)} label="COLLEGE COMMITS" />
            <MetaChip value={chipValue(schoolMeta.overallRecord)} label="OVERALL RECORD" />
            <MetaChip value={chipValue(schoolMeta.regionRecord)} label="REGION RECORD" />
          </div>
        </div>
      );
    }

    return (
      <div className="yat-shell-meta-wrap">
        <div
          className="yat-gs-stats yat-shell-meta-stats"
          role="group"
          aria-label="School metadata"
        >
          <MetaChip value={schoolMeta.activeAlumni} label="ACTIVE" highlight />
          <MetaChip value={schoolMeta.mlb} label="MLB" />
          <MetaChip value={chipValue(schoolMeta.natRank, '#')} label="NAT'L" />
          <MetaChip value={schoolMeta.stateRank ? `#${schoolMeta.stateRank}` : '—'} label="STATE" />
          <MetaChip value={schoolMeta.allTime} label="ALL-TIME" />
          <MetaChip value={schoolMeta.draftedRatio} label="DRAFTED" />
        </div>
      </div>
    );
  }

  if (isPlayerProfile) {
    return <div className="yat-profile-meta-row" aria-hidden="true" />;
  }

  return null;
}
