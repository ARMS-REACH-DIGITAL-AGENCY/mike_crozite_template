# Player Image Standardization — Audit Report

**Branch:** `copilot/standardize-player-image-behavior`  
**Base:** `main`

---

## Part 10 — Required Report Back (Answers to all 10 questions)

---

### 1. Why Dom Hamel's FRONT / LEFT_ANCHOR Image Did Not Load

**Root cause (code-confirmed): wrong file extension.**

The old `PlayerCardFront` code requested `players/then/{playerId}.jpg` for THEN-era images.
S3 stores those files as `.png` (confirmed by the import script: `hs_players → players/then/{playerid}.png`).
Every `.jpg` request was a guaranteed 404. When the request failed, the now-removed `photoFallback`
chain substituted the NOW image (`players/now/{id}.jpg`), hiding the failure completely.

**Fix applied in commit `c871797`:** `getPlayerThenImageUrl(imageId)` now returns `.png`.

**What can be verified from code vs. what requires live S3 access:**

| Question | Can verify from code | Requires live S3 |
|---|---|---|
| Was the request `.jpg`? | ✅ Yes — old code used `.jpg` | — |
| Is the S3 key `.png`? | ✅ Yes — import script confirms `.png` | — |
| Does Dom's key exist at `players/then/{domPlayerId}.png`? | ❌ Cannot query | ✅ Must verify in S3 console |
| Was the object overwritten by a different asset? | ❌ Cannot query | ✅ Must verify S3 versioning or event log |
| Were there multiple uploads with name collision? | ❌ Cannot query | ✅ Must check CloudTrail or upload history |

**Verified root cause:** extension mismatch (`.jpg` requested vs `.png` stored). This is the primary
and proven cause. Whether the S3 object itself was also overwritten or is missing entirely cannot be
determined from this codebase — that requires a live S3 `head_object` check against `players/then/{domPlayerId}.png`.

If the image still does not render after this fix, run:
```
aws s3 ls s3://yatstats-assets/players/then/{domPlayerId}
```
to confirm the object exists. If missing, re-upload using the import script.

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
- **Now metadata-driven.** Slot logic (as of this revision):
  1. Preferred: `player_photos WHERE image_role = 'YATSTATS_FRONT' AND approval_status = 'APPROVED'` — fetched via `getBatchDesignatedPlayerImages()` in the roster page, passed as `frontImageUrl` prop to `PlayerCard` → `PlayerCardFront`
  2. Fallback: legacy `players/then/{imageId}.png` (used when `frontImageUrl` is null)
  3. Final fallback: silhouette from `getThenSilhouetteUrl(isPitcher)` (handled by `data-placeholder` on the bg-image div)
- The `frontImageUrl` prop defaults to `null` — if no designated row exists in `player_photos`, the legacy path is used silently as before

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

| `src/components/yatstats/PlayerCardFront.tsx` | **NEW in this revision** — added `frontImageUrl?: string | null` prop; uses designated URL when provided, falls back to legacy `players/then/{imageId}.png` |
| `src/components/yatstats/PlayerCard.tsx` | **NEW in this revision** — added `frontImageUrl?: string | null` prop; passes to `PlayerCardFront` |
| `src/app/[hsid]/page.tsx` | **NEW in this revision** — imports `getBatchDesignatedPlayerImages`; batch-fetches YATSTATS_FRONT for all roster players in one query; passes `frontImageUrl` to each `PlayerCard` |
| `src/lib/db.ts` | **NEW in this revision** — added `getBatchDesignatedPlayerImages(imageIds, role)` for N-player batch lookup in one SQL query |
| `db/migrations/007_backfill_legacy_player_photos.sql` | **NEW in this revision** — backfill script: promotes pre-migration `player_photos` rows (image_role=NULL, approval_status='PENDING') to TIMELINE/APPROVED/show_on_pp_timeline=TRUE; includes DRY-RUN SELECT and admin workflow docs |
| `db/migrations/006_player_photos_image_roles.sql` | **Previous revision** — adds `image_role`, `image_source`, `approval_status`, `show_on_pp_timeline` columns; constraints; indexes |
| `src/lib/playerImage.ts` | Updated slot table docs; `getPlayerNowImageUrl` docstring now explicitly states it is NOT a designated HEADSHOT; silhouette JSDoc updated to match new role names; canonical naming roles updated to include `LEFT_ANCHOR` and `RIGHT_ANCHOR` |
| `src/lib/db.ts` (previous) | Added `getDesignatedPlayerImage(imageId, role)` function; `getPlayerPhotos` now filters `show_on_pp_timeline=true AND approval_status='APPROVED' AND image_role='TIMELINE'` with graceful two-level degradation |
| `src/components/yatstats/PlayerCardBack.tsx` | Added `headshotUrl: string | null` prop; removed auto-use of `getPlayerNowImageUrl`; null → silhouette only |
| `src/app/[hsid]/player/[playerId]/[slug]/page.tsx` | Imports `getDesignatedPlayerImage`, `getThenSilhouetteUrl`, `getNowSilhouetteUrl`; removed `getPlayerNowImageUrl` import; added designated slot queries for LEFT_ANCHOR + RIGHT_ANCHOR in Promise.all; `FilmSlot` type gains `role` field; RIGHT_ANCHOR uses silhouette (not `playerNowImg`) when not designated; strip CSS updated for `.career-slot.anchor` vs `.career-slot.timeline` |
| `scripts/import_hamilton_mvp_images_to_s3.py` | Added `s3_key_exists()`, `generate_unique_s3_key()`, `--overwrite` flag; `upload_file_to_s3()` returns `(uri, note)` tuple; collision detection with `_NN` suffix; summary shows collision count |
| `PLAYER_IMAGE_AUDIT.md` | This file — full Part 10 answers |

---

## Legacy Row Visibility After Migration 006 (Backfill Answer)

After migration 006 runs, ALL pre-existing `player_photos` rows have:
- `image_role = NULL`
- `approval_status = 'PENDING'` (default)
- `show_on_pp_timeline = FALSE` (default)

`getPlayerPhotos()` requires `show_on_pp_timeline = TRUE AND approval_status = 'APPROVED'` — so **every pre-migration row is invisible after 006 runs without a backfill step.**

**How many rows are affected:** All rows that existed before 006. To see the count:
```sql
SELECT COUNT(*) AS rows_invisible_after_006
FROM player_photos
WHERE image_role IS NULL AND approval_status = 'PENDING';
```

**Backfill file:** `db/migrations/007_backfill_legacy_player_photos.sql`

The script:
1. Starts a transaction
2. Updates all `image_role IS NULL, approval_status = 'PENDING'` rows to `TIMELINE / APPROVED / show_on_pp_timeline=TRUE`
3. Reports how many rows were affected
4. Requires explicit `COMMIT;` — does NOT auto-commit (DBA must review first)
5. Includes a DRY-RUN SELECT to inspect which rows are affected before committing

The script also documents the admin workflow for promoting rows to designated slots (YATSTATS_FRONT, HEADSHOT, etc.) after the backfill.

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
