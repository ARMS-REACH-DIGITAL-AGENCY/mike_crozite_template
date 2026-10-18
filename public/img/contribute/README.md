# Connect & Contribute artwork drop folder

Upload these files **exactly** under `public/img/contribute/` on the preview branch `feature/real-pages-partner-placements-preview`. GitHub's Add file > Upload files supports dragging all files into this folder. Existing code reads paths `/img/contribute/<filename>` automatically.

## Actual placement examples (right panel)
Use standalone **full-resolution WebP** images (not a combined screenshot atlas). Crop browser controls, whitespace, and footer; maintain original aspect ratio. Export at ~1200–1600px wide where available. These are displayed with CSS `object-fit:contain` so text/cards are not distorted.

- `placement-high-school-photo.webp` — all-time/active Quick Flip gallery: photo present next to silhouette/missing photo.
- `placement-current-headshot.webp` — Row 3: cutout/current headshots next to an empty silhouette.
- `placement-current-action.webp` — actual flip-card back: one populated action photo, one silhouette.
- `placement-career-path.webp` — actual Career Path timeline hero showing bust/action shot and year marker.
- `placement-team-logo.webp` — live school header/crest and team logo placement.
- `placement-news-tip.webp` — live news tab's headline cards.
- `placement-player-data.webp` — live player statistics and identifiable data fields.

## Row 3 circular navigation artwork (top row)
Use individual transparent-background PNGs. Include your intended outer circle in each image if desired; the site already supplies a 60px circular ring for each. Keep artwork centered, consistent canvas sizes, and leave sufficient transparent headroom for any figure that breaks the top rim.

- `row3-players.png` — Players
- `row3-sponsor.png` — Sponsor
- `row3-alumni.png` — Alumni
- `row3-photos.png` — Photos
- `row3-update-data.png` — Update Data
- `row3-missing-alumni.png` — Missing Alumni
- `row3-news-tip.png` — News Tip

## Contribution options left-hand picture rail
Use one separate full-resolution asset per item. Each displays in its own compact thumbnail without sprite cropping. These names intentionally mirror the placement-example names.

- `rail-high-school-photo.webp`
- `rail-current-headshot.png` — transparent PNG recommended
- `rail-current-action.webp`
- `rail-career-path.webp`
- `rail-team-logo.png` — transparent PNG recommended
- `rail-news-tip.webp`
- `rail-player-data.webp`

## Wiring
- Placement image filenames: `src/components/yatstats/ContributeGuide.tsx` → `REAL_PAGE_IMAGES`.
- Left thumbnail filenames: same file → `CONTRIBUTION_THUMBS`.
- Row 3 circle filenames: `src/components/yatstats/shell/InteractionStrip.tsx` → `CONTRIBUTION_ROW3_IMAGES`.
- Original S3 fallback sources remain in `THUMB_IMAGES` and the Row 3 component, so replacing the file paths doesn't change upload forms or submission behavior.
- Any extra/retired contribution option will need its own file mapping if reintroduced.

**Production is not targeted.** Upload to the preview branch only.
