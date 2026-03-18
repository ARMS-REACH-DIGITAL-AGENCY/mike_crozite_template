// src/components/yatstats/profile/PlayerMetadataBand.tsx
// Compact metadata band below the filmstrip, above tabs.
// Left: class year / team / status-level
// Right: B/T / college / draft

interface PlayerMetadataBandProps {
  gradClass: string;
  ctxTeam: string;
  ctxSecondary: string;
  ctxLevel: string;
  pos: string;
  statusLabel: string;
  bt: string;
  ht: string;
  wt: string;
  mostRecentCollege: string;
  draftMetaLine: string;
}

export default function PlayerMetadataBand({
  gradClass,
  ctxTeam,
  ctxSecondary,
  ctxLevel,
  pos,
  statusLabel,
  bt,
  ht,
  wt,
  mostRecentCollege,
  draftMetaLine,
}: PlayerMetadataBandProps) {
  const leftParts = [ctxTeam, ctxSecondary, pos !== '--' ? pos : null].filter(Boolean);
  const rightParts = [
    bt !== '-/-' ? `B/T: ${bt}` : null,
    ht !== '--' ? ht : null,
    wt !== '--' ? `${wt} LB` : null,
  ].filter(Boolean);

  return (
    <div className="player-meta-band">
      <div className="pmb-left">
        {gradClass !== '--' && (
          <div className="pmb-line"><strong>Class of {gradClass}</strong></div>
        )}
        <div className="pmb-line">
          {leftParts.map((part, i) => (
            <span key={i}>{part}{i < leftParts.length - 1 ? <span className="sep">|</span> : null}</span>
          ))}
        </div>
        <div className="pmb-line dim">{statusLabel}{ctxLevel ? ` — ${ctxLevel}` : ''}</div>
      </div>
      <div className="pmb-right">
        <div className="pmb-line dim">{rightParts.join(' | ')}</div>
        {mostRecentCollege && <div className="pmb-line">{mostRecentCollege}</div>}
        {draftMetaLine && <div className="pmb-line dim">{draftMetaLine}</div>}
      </div>
    </div>
  );
}
