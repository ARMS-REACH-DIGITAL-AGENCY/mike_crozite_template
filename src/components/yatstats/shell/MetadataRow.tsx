
// src/components/yatstats/shell/MetadataRow.tsx
// Renders Row 4 of the shared shell.
// This component is a placeholder and will be built out later

interface MetadataRowProps {
  isPlayerProfile: boolean;
  isGallery: boolean;
}

export default function MetadataRow({ isPlayerProfile, isGallery }: MetadataRowProps) {
  // This component will conditionally render the Gallery Metadata Row or Profile Metadata Row.
  // For now, it's a placeholder.
  if (isGallery) {
      return (
        <div className="yat-meta-row-placeholder" style={{ padding: '16px', textAlign: 'center', borderBottom: '1px solid var(--line)' }}>
          <h2 style={{fontFamily: '"Bebas Neue"', fontSize: '24px', letterSpacing: '0.1em'}}>WHERE THEY YAT? FLIP FOR STATS!</h2>
        </div>
      );
  }
  
  if (isPlayerProfile) {
    return (
        <div className="yat-meta-row-placeholder" style={{ height: '80px', borderBottom: '1px solid var(--line)' }}>
            {/* Placeholder for Player Metadata Row */}
        </div>
    );
  }

  return null;
}
