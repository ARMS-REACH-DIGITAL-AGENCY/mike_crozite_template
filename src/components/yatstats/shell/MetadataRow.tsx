// src/components/yatstats/shell/MetadataRow.tsx
'use client';

type SchoolMeta = {
  activeAlumni: number | null;
  mlb: number | null;
  natRank: number | null;
  stateRank: number | null;
  allTime: number | null;
  draftedRatio: string | null;
};

interface MetadataRowProps {
  isPlayerProfile: boolean;
  isGallery: boolean;
  schoolMeta: SchoolMeta;
}

function formatValue(value: string | number | null, prefix = '') {
  if (value == null || value === '') return '—';
  return `${prefix}${value}`;
}

function MetaCell({
  value,
  label,
  highlight = false,
}: {
  value: string | number | null;
  label: string;
  highlight?: boolean;
}) {
  return (
    <div className="yat-school-meta-cell">
      <span className={`yat-school-meta-value${highlight ? ' is-highlight' : ''}`}>
        {value == null || value === '' ? '—' : String(value)}
      </span>
      <span className="yat-school-meta-label">{label}</span>
    </div>
  );
}

export default function MetadataRow({
  isPlayerProfile,
  isGallery,
  schoolMeta,
}: MetadataRowProps) {
  if (isGallery) {
    return (
      <div className="yat-school-meta-bar" role="group" aria-label="School metadata">
        <MetaCell value={schoolMeta.activeAlumni} label="ACTIVE" highlight />
        <MetaCell value={schoolMeta.mlb} label="MLB" />
        <MetaCell value={formatValue(schoolMeta.natRank, '#')} label="NAT'L" />
        <MetaCell value={formatValue(schoolMeta.stateRank, '#')} label="STATE" />
        <MetaCell value={schoolMeta.allTime} label="ALL-TIME" />
        <MetaCell value={schoolMeta.draftedRatio} label="DRAFTED" />
      </div>
    );
  }

  if (isPlayerProfile) {
    return <div className="yat-profile-meta-row" aria-hidden="true" />;
  }

  return null;
}
