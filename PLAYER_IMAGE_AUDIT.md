# Player Image Standardization — Audit Report

**Branch:** `copilot/standardize-player-image-behavior`  
**Base:** `main`

---

## Part 10 — Required Report Back (Answers to all 10 questions)

---

### 1. Why Dom Hamel's FRONT / LEFT_ANCHOR Image Did Not Load

**Root cause: wrong file extension.**

The old `PlayerCardFront` code requested `players/then/{playerId}.jpg` for THEN-era images.
S3 stores those files as `.png` (confirmed by the import script: `hs_players → players/then/{playerid}.png`).
Every `.jpg` request was a guaranteed 404. When the request failed, the now-removed `photoFallback`
chain substituted the NOW image (`players/now/{id}.jpg`), hiding the failure completely.

**Fix applied in commit `c871797`:** `getPlayerThenImageUrl(imageId)` now returns `.png`.
Dom's `players/then/{imageId}.png` object should now load correctly.

If it still does not load, the S3 object itself may be missing or the `imageId` value used at runtime
may differ from the filename. That would be a data/upload issue, not a code issue.

---

### 2. Extension / Path Logic for Current Legacy THEN Images

| Path | Extension | Used for |
|------|-----------|---------|
| `players/then/{imageId}.png` | **PNG** (not .jpg) | LEFT_ANCHOR / FRONT fallback |
| `players/now/{imageId}.jpg` | JPG | General/timeline images — NOT headshot, NOT anchor |

`getPlayerThenImageUrl(imageId)` → `players/then/{imageId}.png` (fixed)  
`getPlayerNowImageUrl(imageId)` → `players/now/{imageId}.jpg` (retained for legacy/timeline use only)

---

### 3. What Logic Now Determines Each Slot

#### A. Front Flip Image (`PlayerCardFront`)
- Still uses `getPlayerThenImageUrl(imageId)` → `players/then/{imageId}.png`
- This is the legacy-wired path; it IS the de-facto front image for all current players
- When `player_photos` rows with `image_role = 'YATSTATS_FRONT'` exist, that lookup
  would be wired here (deferred — no per-player lookup in grid-view currently)
- Fallback: silhouette from `getThenSilhouetteUrl(isPitcher)`

#### B. LEFT_ANCHOR (career strip left bookend)
- Queries `player_photos WHERE image_role = 'LEFT_ANCHOR' AND approval_status = 'APPROVED'` via `getDesignatedPlayerImage(imageId, 'LEFT_ANCHOR')`
- If no designated row → falls back to legacy `players/then/{imageId}.png`
- Final fallback (if legacy also fails): silhouette via SafeImage `placeholderSrc`

#### C. RIGHT_ANCHOR (career strip right bookend)
- Queries `player_photos WHERE image_role = 'RIGHT_ANCHOR' AND approval_status = 'APPROVED'` via `getDesignatedPlayerImage(imageId, 'RIGHT_ANCHOR')`
- If no designated row → silhouette (`getNowSilhouetteUrl(isPitcher)`)
- **`players/now/{imageId}.jpg` is no longer used as the right anchor**

#### D. Back-Card Headshot (`PlayerCardBack`)
- Accepts `headshotUrl: string | null` prop
- If null → silhouette (`getNowSilhouetteUrl(isPitcher)`)
- **`players/now/{imageId}.jpg` is no longer auto-used as the headshot**
- `PlayerCard` defaults `headshotUrl={null}` — all grid cards show silhouette until designated HEADSHOTs are assigned in `player_photos`
- On the individual player profile page, `getDesignatedPlayerImage(imageId, 'HEADSHOT')` will drive a future wiring point

#### E. Timeline Inclusion
- `getPlayerPhotos(imageId)` queries: `show_on_pp_timeline = TRUE AND approval_status = 'APPROVED' AND image_role = 'TIMELINE'`
- Pre-migration rows (no columns yet): graceful degradation via nested try/catch returns all rows
- Each timeline frame uses `p.image_url || PLAYER_SILHOUETTE_URL`

---

### 4. RIGHT_ANCHOR and HEADSHOT Are Now Fully Separated

| Slot | Old behavior | New behavior |
|------|-------------|-------------|
| RIGHT_ANCHOR | `players/now/{id}.jpg` auto-used | designated `player_photos` row only; silhouette if missing |
| HEADSHOT | `players/now/{id}.jpg` auto-used | `headshotUrl` prop must be explicitly passed; null → silhouette |

They are separate concepts: RIGHT_ANCHOR is a career strip visual bookend; HEADSHOT is the
back-card portrait. Neither is filled by the legacy NOW path any more.

---

### 5. CSS / Rendering Changes to the Player Profile Strip

The career strip now has two distinct slot types with different CSS treatment:

| Class | Width | `object-fit` | Border |
|-------|-------|-------------|--------|
| `.career-slot.anchor` | `clamp(72px, 10vw, 110px)` | `cover` (portrait crop) | 2px gold-tinted (`rgba(255,209,102,.35)`) |
| `.career-slot.timeline` | `clamp(60px, 8vw, 90px)` | `contain` (full image, no crop) | 1px neutral (`var(--line)`) |

- Anchor slots are wider and use `cover` to give a intentional portrait-fill look
- Last anchor (RIGHT) has its gold border on the left side instead of right
- Timeline frames are narrower and use `contain` so full image aspect ratios are respected
- No padded bands from mismatched aspect ratios

---

### 6. DB Migration Changes

**File:** `db/migrations/006_player_photos_image_roles.sql`

Creates `player_photos` if it doesn't exist (idempotent `CREATE TABLE IF NOT EXISTS`), then adds:

| Column | Type | Default | Purpose |
|--------|------|---------|---------|
| `image_role` | `TEXT NULL` | — | Display slot: `YATSTATS_FRONT \| LEFT_ANCHOR \| RIGHT_ANCHOR \| HEADSHOT \| TIMELINE` |
| `image_source` | `TEXT NULL` | — | Supplier: `FAN \| PLAYER \| MLB \| LICENSED \| STAFF \| SCHOOL \| BOOSTER \| IMPORT` |
| `approval_status` | `TEXT NOT NULL` | `'PENDING'` | Display gate: `PENDING \| APPROVED \| REJECTED` |
| `show_on_pp_timeline` | `BOOLEAN NOT NULL` | `FALSE` | Opt-in flag for TIMELINE middle frames |

Also adds three CHECK constraints (on `image_role`, `image_source`, `approval_status`) and two partial indexes for the two runtime query patterns.

---

### 7. S3 Collision Behavior

**File:** `scripts/import_hamilton_mvp_images_to_s3.py`

Before: `s3.upload_file()` was called directly — silently overwrote any existing object.

After:
1. `generate_unique_s3_key()` calls `head_object` to check if the key exists before upload
2. If the key is free → upload to original key (no change)
3. If the key exists → append `_01`, `_02`, … `_99` suffix until a free slot is found
4. Collision is printed as a warning and recorded in the `note` field of the audit CSV
5. Summary output now includes a `collisions` count when renames occurred
6. `--overwrite` flag added for explicit canonical-image replacement workflows

---

### 8. Uploads Are Additive by Default

Yes. Additive-by-default is the new default behavior.

- No silent overwrite ever occurs without `--overwrite`
- Uploading a new image with the same base name generates a new object (`_01`, `_02`, etc.)
- Changing which image fills a slot (FRONT, HEADSHOT, etc.) is a metadata update to `player_photos.image_role`, not a file rename or silent overwrite

---

### 9. Canonical Role-Prefixed Naming Status

**Partially documented, not yet wired in production path generation.**

| State | Details |
|-------|---------|
| **Documented** | Full spec in `src/lib/playerImage.ts` — role-prefixed format, designated vs general, all supported roles |
| **NOT wired** | No runtime function constructs or resolves `YATSTATS_FRONT_*`, `HEADSHOT_*`, etc. filenames |
| **Blocked by** | S3 upload pipeline does not yet produce role-prefixed object keys |

When `player_photos` rows with `image_role = 'LEFT_ANCHOR'`, `'RIGHT_ANCHOR'`, `'HEADSHOT'` are populated,
`getDesignatedPlayerImage()` will return them and the legacy path fallbacks will be bypassed automatically.
No code change is needed at that point — only data.

---

### 10. Every File Changed

| File | Change |
|------|--------|
| `db/migrations/006_player_photos_image_roles.sql` | **NEW** — adds `image_role`, `image_source`, `approval_status`, `show_on_pp_timeline` columns; constraints; indexes |
| `src/lib/playerImage.ts` | Updated slot table docs; `getPlayerNowImageUrl` docstring now explicitly states it is NOT a designated HEADSHOT; silhouette JSDoc updated to match new role names; canonical naming roles updated to include `LEFT_ANCHOR` and `RIGHT_ANCHOR` |
| `src/lib/db.ts` | Added `getDesignatedPlayerImage(imageId, role)` function; `getPlayerPhotos` now filters `show_on_pp_timeline=true AND approval_status='APPROVED' AND image_role='TIMELINE'` with graceful two-level degradation |
| `src/components/yatstats/PlayerCardBack.tsx` | Added `headshotUrl: string | null` prop; removed auto-use of `getPlayerNowImageUrl`; null → silhouette only |
| `src/components/yatstats/PlayerCard.tsx` | Added `headshotUrl?: string | null` prop (default null); threads through to `PlayerCardBack` |
| `src/app/[hsid]/player/[playerId]/[slug]/page.tsx` | Imports `getDesignatedPlayerImage`, `getThenSilhouetteUrl`, `getNowSilhouetteUrl`; removed `getPlayerNowImageUrl` import; added designated slot queries for LEFT_ANCHOR + RIGHT_ANCHOR in Promise.all; `FilmSlot` type gains `role` field; RIGHT_ANCHOR uses silhouette (not `playerNowImg`) when not designated; strip CSS updated for `.career-slot.anchor` vs `.career-slot.timeline` |
| `scripts/import_hamilton_mvp_images_to_s3.py` | Added `s3_key_exists()`, `generate_unique_s3_key()`, `--overwrite` flag; `upload_file_to_s3()` returns `(uri, note)` tuple; collision detection with `_NN` suffix; summary shows collision count |
| `PLAYER_IMAGE_AUDIT.md` | This file — full Part 10 answers |

---

## Alternate-Image Fallback Rules Removed (cumulative from all commits)

| Location | Removed Rule |
|----------|-------------|
| `PlayerCardFront` | `photoFallback` variable — NOW image was used when THEN failed |
| `PlayerCardFront` | `photoDefaultUrl` prop — school-wide default was CSS background layer |
| `PlayerCardFront` | `data-fallback` attribute — drove JS to load alternate player image |
| `PlayerCardFront` | `.jpg` extension for THEN — caused guaranteed 404 |
| `PlayerCardBack` | Auto-use of `getPlayerNowImageUrl` as headshot — legacy path, not designated |
| `PlayerCard` | `photoDefaultUrl` prop forwarding |
| `[hsid]/page.tsx` | `photoDefaultUrl` variable and prop |
| `YatInteractivity` | `data-fallback` JS branch — loaded alternate player image on primary fail |
| Career strip | `playerNowImg` as RIGHT_ANCHOR — replaced by designated lookup + silhouette fallback |
