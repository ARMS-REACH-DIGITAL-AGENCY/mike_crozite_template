// src/components/yatstats/FunZonePanel.tsx
// Lightweight engagement panel used in two contexts:
//   1. Back of the player flip card — compact CTA nav to profile sections
//   2. Teaser panel on the player profile page — richer preview with photos, games, social
//
// Upload functionality lives in the player profile gallery/upload section only.
// FunZonePanel links to the gallery tab but does NOT contain upload UI.

interface RecentGame {
  date: string;
  opponent: string;
  result?: string; // "W" | "L" | "T"
  score?: string;  // e.g. "5-3"
}

interface FunZonePanelProps {
  playerId: string;
  slug: string;
  resolvedHsid: string;
  /** Up to 4 thumbnail image URLs from player_photos */
  photoThumbs?: string[];
  /** Total photo count (shown as overflow badge) */
  photoCount?: number;
  /** Recent game results for the schedule preview */
  recentGames?: RecentGame[];
  /** Social profile URLs */
  socialLinks?: { twitter?: string; instagram?: string };
  /** Rendering context. Defaults to &apos;card&apos;. */
  variant?: "card" | "teaser";
}

const FUNZONE_LINKS = [
  { label: "STATS",   icon: "ri-bar-chart-line",   hash: "stats"   },
  { label: "NEWS",    icon: "ri-newspaper-line",    hash: "news"    },
  { label: "SOCIAL",  icon: "ri-share-circle-line", hash: "social"  },
  { label: "MENTOR",  icon: "ri-handshake-line",    hash: "mentor"  },
  { label: "GALLERY", icon: "ri-image-line",        hash: "gallery" },
] as const;

export default function FunZonePanel({
  playerId,
  slug,
  resolvedHsid,
  photoThumbs,
  photoCount,
  recentGames,
  socialLinks,
  variant = "card",
}: FunZonePanelProps) {
  const base = `/${resolvedHsid}/player/${playerId}/${slug}`;
  const hasSocial = socialLinks && (socialLinks.twitter || socialLinks.instagram);
  const hasPhotos = photoThumbs && photoThumbs.length > 0;
  const hasGames = recentGames && recentGames.length > 0;

  return (
    <div className={`fzp fzp--${variant}`}>
      <div className="fzp-label">FUN ZONE</div>

      {/* Photo thumbnails strip */}
      {hasPhotos && (
        <div className="fzp-photos">
          {photoThumbs!.slice(0, 4).map((url, i) => (
            <a key={i} href={`${base}#tab-gallery`} className="fzp-photo-thumb" aria-label={`Photo ${i + 1}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt={`Player photo ${i + 1}`} className="fzp-photo-img" />
            </a>
          ))}
          {(photoCount ?? 0) > 4 && (
            <a href={`${base}#tab-gallery`} className="fzp-photo-more" aria-label="More photos">
              +{(photoCount ?? 0) - 4}
            </a>
          )}
        </div>
      )}

      {/* Recent game results — teaser variant only */}
      {hasGames && variant === "teaser" && (
        <div className="fzp-games">
          {recentGames!.slice(0, 2).map((g, i) => (
            <div key={i} className="fzp-game-row">
              <span className="fzp-game-date">{g.date}</span>
              <span className="fzp-game-opp">{g.opponent}</span>
              {g.result && (
                <span className={`fzp-game-result fzp-game-result--${g.result.toLowerCase()}`}>
                  {g.result}{g.score ? ` ${g.score}` : ""}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Social links */}
      {hasSocial && (
        <div className="fzp-social">
          {socialLinks!.twitter && (
            <a
              href={socialLinks!.twitter}
              target="_blank"
              rel="noopener noreferrer"
              className="fzp-social-link"
              aria-label="Twitter / X"
            >
              <i className="ri-twitter-x-line" />
            </a>
          )}
          {socialLinks!.instagram && (
            <a
              href={socialLinks!.instagram}
              target="_blank"
              rel="noopener noreferrer"
              className="fzp-social-link"
              aria-label="Instagram"
            >
              <i className="ri-instagram-line" />
            </a>
          )}
        </div>
      )}

      {/* Quick-access CTA navigation to player profile sections */}
      <nav className="fzp-nav" aria-label="Fun Zone sections">
        {FUNZONE_LINKS.map(({ label, icon, hash }) => (
          <a key={hash} href={`${base}#tab-${hash}`} className="fzp-nav-link">
            <i className={icon} />
            {label}
          </a>
        ))}
      </nav>
    </div>
  );
}
