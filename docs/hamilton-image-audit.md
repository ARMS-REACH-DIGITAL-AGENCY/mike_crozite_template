# Hamilton image flow audit (factual)

## Scope and evidence
- Import script inspected: `scripts/import_hamilton_mvp_images_to_s3.py`.
- Frontend image flow inspected:
  - `src/components/yatstats/PlayerCardFront.tsx`
  - `src/components/yatstats/PlayerCardBack.tsx`
  - `src/components/yatstats/YatInteractivity.tsx`
  - `src/app/[hsid]/player/[playerId]/[slug]/page.tsx`
  - `src/components/SafeImage.tsx`
- CSV inspected: `data/image-mapping.csv`.

## 1) Active S3 destination naming rules in importer
Active key rules are in `build_s3_key`:
- `assets/img/hs_players` => `players/then/{playerid}.png`
- `assets/img/now_players` => `players/now/{playerid}.jpg`
- fallback: if `display_role_1` contains `anchor_left` or `flip_front` => `players/then/{playerid}.png`; else `players/now/{playerid}.jpg`.

## 2) Frontend files determining each image slot
- Flip card front image: `src/components/yatstats/PlayerCardFront.tsx`
- Flip card back image: `src/components/yatstats/PlayerCardBack.tsx`
- Player profile left anchor image (HS bookend + sticky identity headshot):
  - `src/app/[hsid]/player/[playerId]/[slug]/page.tsx` (HS bookend + sticky identity `data-headshot`)
- Player profile right anchor image (current team bookend):
  - `src/app/[hsid]/player/[playerId]/[slug]/page.tsx`

## 3) Exact reason same image appears on both card sides
Two code paths cause this:
1. Front card uses `players/now/{id}.jpg` as primary and `players/then/{id}.jpg` as fallback.
2. Back card uses `players/then/{id}.jpg` as primary.

Therefore, when front primary (`now`) fails and `then.jpg` exists, both sides render `then.jpg`.
Additionally, importer outputs HS to `.png` while both card sides currently point HS to `.jpg`, causing HS misses and fallback behavior.

## 4) Whether importer is still using these keys
Yes. Importer currently maps to:
- `players/then/{playerid}.png`
- `players/now/{playerid}.jpg`

## 5) Required code changes to enforce strict mapping
Goal:
- front = HS only
- back = official mugshot/headshot only
- left anchor = HS only
- right anchor = mugshot/headshot only
- missing image = silhouette
- no cross-fallbacks

### A) `src/components/yatstats/PlayerCardFront.tsx`
Replace front source/fallback block so front is HS-only (`.png`) and no cross-fallback.

Current block to replace:
```tsx
const photoUrl = `https://yatstats-assets.s3.us-west-2.amazonaws.com/players/now/${pid}.jpg`;
const photoFallback = `https://yatstats-assets.s3.us-west-2.amazonaws.com/players/then/${pid}.jpg`;
...
data-fallback={photoFallback}
style={{ backgroundImage: `url('${photoUrl}'), url('${photoDefaultUrl}')` }}
```

Replacement:
```tsx
const photoUrl = `https://yatstats-assets.s3.us-west-2.amazonaws.com/players/then/${pid}.png`;
...
data-fallback=""
style={{ backgroundImage: `url('${photoUrl}')` }}
```

### B) `src/components/yatstats/PlayerCardBack.tsx`
Back must point to mugshot/headshot (`now`) and not HS.

Current:
```tsx
const photoFallback = `https://yatstats-assets.s3.us-west-2.amazonaws.com/players/then/${pid}.jpg`;
...
<SafeImage src={photoFallback} ... placeholderSrc={thenSilhouetteUrl} />
```

Replacement:
```tsx
const photoUrl = `https://yatstats-assets.s3.us-west-2.amazonaws.com/players/now/${pid}.jpg`;
const nowSilhouetteUrl = isPitcher ? `/img/now-pitcher-silhouette.png` : `/img/now-batter-silhouette.png`;
...
<SafeImage src={photoUrl} ... placeholderSrc={nowSilhouetteUrl} />
```

### C) `src/components/yatstats/YatInteractivity.tsx`
Remove cross-fallback logic for `.yat-bg` so front card does not switch to an opposite-era image.

Current behavior:
- on front load error, tries `data-fallback`
- then placeholder

Required replacement behavior:
- on load error, go directly to placeholder

Minimal replacement inside `.yat-bg` handler:
```js
img.onerror=function(){
  if(placeholder){
    el.style.backgroundImage="url('"+placeholder+"')";
    el.style.backgroundSize='contain';
    el.style.backgroundPosition='center bottom';
    el.style.backgroundColor='#1a1a1a';
  }
};
```

### D) `src/app/[hsid]/player/[playerId]/[slug]/page.tsx`
The left/right anchor bookend URLs are already mapped correctly:
- left = `playerThenImg` (`players/then/{id}.png`)
- right = `playerNowImg` (`players/now/{id}.jpg`)
No URL mapping change is required for those bookend constants.

If strict "missing image = silhouette" is required for sticky identity swap as well, remove crest fallback in the sticky image `onerror` path and use silhouette only when the HS image fails.

## 6) Why S3 import is failing (based on available local evidence)
Verified failures from this environment:
- Runtime dependency failure: script cannot start because `boto3` is missing.
- Network restriction prevents dependency install and remote repo clone in this environment.

Verified data-side mismatch in CSV:
- 18 rows have non-numeric `playerid` (`-`), which importer explicitly rejects as `missing numeric playerid`.
- `original_folder` values in local CSV are only the two expected folders, so no folder-path mismatch is present in this local CSV file.

Not verifiable from local repo alone (no completed import run/report available here):
- source filename mismatch against the remote `yatstats/hamilton-mvp` asset tree
- S3 `AccessDenied`
- live bucket path/permission issues during upload

## 7) Exact files to change
For strict no-cross-fallback policy and requested role mapping:
1. `src/components/yatstats/PlayerCardFront.tsx`
2. `src/components/yatstats/PlayerCardBack.tsx`
3. `src/components/yatstats/YatInteractivity.tsx`
4. (optional for sticky identity strictness) `src/app/[hsid]/player/[playerId]/[slug]/page.tsx`
