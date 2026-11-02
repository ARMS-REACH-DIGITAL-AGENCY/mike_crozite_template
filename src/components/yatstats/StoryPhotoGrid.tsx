'use client';

// The Stories tab's photo layout, shared by baseball stories and retired
// alumni memories. Do not implement a separate one-photo carousel cover for
// Where YAT?: the full 1/2/3/4-photo grid is part of the Stories experience.
export type StoryGridPhoto = {
  web: string | null;
  full: string | null;
  logo?: boolean;
};

export default function StoryPhotoGrid({
  photos,
  onOpen,
}: {
  photos: StoryGridPhoto[];
  onOpen: (index: number) => void;
}) {
  const shown = photos.slice(0, 4);
  if (!shown.length) return null;
  return (
    <>
      <div className={`ysf-photos ysf-photos-${shown.length}${shown[0]?.logo ? ' ysf-photos-logo' : ''}`}>
        {shown.map((photo, index) => (
          <button
            type="button"
            key={index}
            className="ysf-photos-item"
            onClick={() => onOpen(index)}
            aria-label={`Open photo ${index + 1} of ${shown.length}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={(shown.length === 1 ? photo.full || photo.web : photo.web || photo.full) || ''}
              alt=""
              loading="lazy"
              decoding="async"
            />
          </button>
        ))}
      </div>
      <style jsx global>{`
        .ysf-photos {display:grid;gap:2px;margin-top:4px;background:var(--ysf-card-border,rgba(128,128,128,.25));}
        .ysf-photos-item {min-width:0;height:var(--ysf-story-photo-h,min(420px,56.25cqw));display:grid;place-items:center;padding:0;border:0;background:#101010;cursor:zoom-in;overflow:hidden;}
        .ysf-photos-item img {display:block;width:100%;height:100%;min-width:0;min-height:0;max-width:100%;object-fit:contain;object-position:center;}
        .ysf-photos-1 .ysf-photos-item {width:100%;min-height:0;}
        .ysf-photos-1 .ysf-photos-item img {width:100%;height:100%;object-fit:contain;margin:auto;}
        .ysf-photos-logo .ysf-photos-item {background:#f4f1ea;padding:28px 0;}
        .ysf-photos-logo .ysf-photos-item img {max-height:200px;}
        .ysf-photos-2 {grid-template-columns:1fr 1fr;}
        .ysf-photos-2 .ysf-photos-item {width:100%;}
        .ysf-photos-3 {grid-template-columns:repeat(2,minmax(0,1fr));}
        .ysf-photos-3 .ysf-photos-item {width:100%;}
        .ysf-photos-3 .ysf-photos-item:first-child {grid-column:1/-1;}
        .ysf-photos-4 {grid-template-columns:1fr 1fr;}
        .ysf-photos-4 .ysf-photos-item {width:100%;}
      `}</style>
    </>
  );
}
