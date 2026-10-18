'use client';

// Shared, ACTUAL gallery back-card hero. Both PlayerCardBack and the
// contribution proof render the same markup. Only the proof supplies a
// temporary, never-published uploaded image URL.
import SafeImage from '@/components/SafeImage';

const S3 = 'https://yatstats-assets.s3.us-west-2.amazonaws.com';

export default function PlayerCardBackHero({
  playerId, displayName, profileHref, teamName, orgConf, posLevelStatus, btHw,
  previewImageUrl,
}: {
  playerId: string;
  displayName: string;
  profileHref: string;
  teamName: string;
  orgConf: string;
  posLevelStatus: string;
  btHw: string;
  previewImageUrl?: string | null;
}) {
  const card = S3 + '/players/back-card/' + playerId + '.webp';
  const original = S3 + '/players/back/' + playerId + '.jpg';
  return (
    <a href={profileHref} className="yat-back-hero" aria-label={'View ' + displayName + "'s profile"}>
      <SafeImage
        src={previewImageUrl || card}
        fallbackSrc={original}
        alt={displayName}
        className="yat-back-img"
        placeholderSrc={S3 + '/assets/YatCrest.png'}
        loading={previewImageUrl ? 'eager' : 'lazy'}
      />
      <div className="yat-back-hero-fallback" aria-hidden="true" />
      <div className="yat-back-scrim" aria-hidden="true" />
      <div className="yat-back-meta">
        {displayName && <div className="ybm-name">{displayName}</div>}
        {teamName && <div className="ybm-team">{teamName}</div>}
        {orgConf && <div className="ybm-org">{orgConf}</div>}
        {posLevelStatus && <div className="ybm-pos">{posLevelStatus}</div>}
        {btHw && <div className="ybm-bthw">{btHw}</div>}
      </div>
    </a>
  );
}
