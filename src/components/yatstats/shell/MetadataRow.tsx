'use client';

interface MetadataRowProps {
  isPlayerProfile: boolean;
  isGallery: boolean;
}

export default function MetadataRow({ isPlayerProfile, isGallery }: MetadataRowProps) {
  if (isGallery) {
    return (
      <div className="yat-hero">
        <div className="yat-container yat-hero-grid">
          <div className="yat-hero-left">
            <div className="yat-tag-duo">
              <div className="yat-tag-swap">
                <span className="yat-tag-grey">FLIP FOR </span>
                <span className="yat-tag-bold">STATS!</span>
              </div>
              <div className="yat-tag-swap">
                <span className="yat-tag-grey">WHERE THEY </span>
                <span className="yat-tag-bold">YAT?</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (isPlayerProfile) {
    return (
      <div className="yat-profile-meta-row">
        <div className="yat-container yat-profile-meta-inner">
          <div className="yat-profile-meta-left">
            <div className="yat-profile-player-name">PLAYER NAME</div>
            <div className="yat-profile-player-sub">TEAM · STATUS · POSITION</div>
          </div>
          <div className="yat-profile-meta-right">
            <button id="btnFanFav" className="yat-icon-btn" aria-label="Favorite this player">
              <i className="ri-heart-add-line" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
