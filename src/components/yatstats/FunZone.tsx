// src/components/yatstats/FunZone.tsx
// Stats and special sections currently rendered on the card back

interface FunZoneProps {
  playerId: string;
  slug: string;
  resolvedHsid: string;
}

const FUN_ZONE_TABS = [
  { label: "STATS",   hash: "stats"   },
  { label: "NEWS",    hash: "news"    },
  { label: "SOCIAL",  hash: "social"  },
  { label: "MENTOR",  hash: "mentor"  },
  { label: "GALLERY", hash: "gallery" },
] as const;

export default function FunZone({ playerId, slug, resolvedHsid }: FunZoneProps) {
  const base = `/${resolvedHsid}/player/${playerId}/${slug}`;
  return (
    <div className="yat-fun-zone">
      <div className="yat-fun-label">FUN ZONE</div>
      <nav className="yat-fun-nav" aria-label="Fun Zone">
        {FUN_ZONE_TABS.map(({ label, hash }) => (
          <a
            key={hash}
            href={`${base}#tab-${hash}`}
            className="yat-fun-nav-link"
          >
            {label}
          </a>
        ))}
      </nav>
    </div>
  );
}
