// src/components/yatstats/shell/MetadataRow.tsx
'use client';

type SchoolMeta = {
  activeAlumni: number | null;
  mlb: number | null;
  natRank: number | null;
  stateRank: string | null;
  allTime: number | null;
  draftedRatio: string | null;
};

interface MetadataRowProps {
  isPlayerProfile: boolean;
  isGallery: boolean;
  schoolMeta: SchoolMeta;
}

function chipValue(value: string | number | null, prefix = '') {
  if (value == null || value === '') return '—';
  return `${prefix}${value}`;
}

function MetaChip({
  value,
  label,
  highlight = false,
}: {
  value: string | number | null;
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

export default function MetadataRow({
  isPlayerProfile,
  isGallery,
  schoolMeta,
}: MetadataRowProps) {
  const pathname = typeof window !== 'undefined' ? window.location.pathname : '';
  if (isGallery || pathname.includes('/news')) {
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
