# Player Image Standardization — Audit Report

**Branch:** `copilot/standardize-player-image-behavior`  
**Base:** `main`

---

## Part 10 — Required Report Back (Answers to all 10 questions)

---

### 1. Why Dom Hamel's FRONT / LEFT_ANCHOR Image Did Not Load

**Root cause (confirmed from live S3): wrong file extension assumed by the code.**

S3 object confirmed present at: `players/then/225132.jpg`

The code (after an earlier revision) requested `players/then/{imageId}.png`.  
The actual stored object is `.jpg`. Every `.png` request was a guaranteed 404 → silhouette.

**Earlier revision history:**
- Pre-PR code requested `.jpg` for THEN images (correct for Dom)
- A previous revision changed it to `.png` based on an incorrect assumption that "S3 stores them as PNG"
- That `.png` assumption was wrong for at least Dom Hamel (225132) — confirmed from live S3

**Fix applied in this revision:**
- `getPlayerThenImageUrl(imageId)` now returns `.jpg` (matching the confirmed S3 reality)
- `YatInteractivity` now adds an **extension-flip fallback**: if the primary URL fails, it tries the
  alternate extension (`.jpg` ↔ `.png`) before showing the silhouette
- This makes the legacy THEN path robust to mixed-extension legacy objects without a server-side HEAD probe

**Exact URL requested for Dom Hamel (playerid 225132) after this fix:**
```
https://yatstats-assets.s3.us-west-2.amazonaws.com/players/then/225132.jpg
```
This matches the confirmed S3 key. The silhouette will no longer be shown for Dom (assuming
the `.jpg` object is still present at that key).

**What can be verified from code vs. what requires live S3 access:**

| Question | Status |
|---|---|
| Confirmed S3 key | `players/then/225132.jpg` ✅ provided by @yatstats |
| Requested URL after fix | `players/then/225132.jpg` ✅ matches |
| Was the object overwritten by a different asset? | ❌ Cannot query — requires S3 versioning or CloudTrail |
| Were there multiple uploads with name collision? | ❌ Cannot query — requires upload history |

---

### 2. Extension / Path Logic for Current Legacy THEN Images

| Path | Extension | Used for |
|------|-----------|---------|
| `players/then/{imageId}.jpg` | **JPG** (confirmed from live S3) | LEFT_ANCHOR / FRONT fallback |
| `players/now/{imageId}.jpg` | JPG | General/timeline images — NOT headshot, NOT anchor |

`getPlayerThenImageUrl(imageId)` → `players/then/{imageId}.jpg` (corrected from .png)  
`getPlayerNowImageUrl(imageId)` → `players/now/{imageId}.jpg` (retained for legacy/timeline use only)

**Extension-flip safety net (YatInteractivity):**
If the primary `.jpg` request fails (e.g. a player whose THEN asset was stored as `.png`),  
`YatInteractivity` automatically retries with the alternate extension before showing the silhouette.  
This protects against mixed-extension legacy objects without any server-side HEAD probing.

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
- If no designated RIGHT_ANCHOR row → uses the **HEADSHOT image as the default right bookend** (same asset, different slot context)
- If neither RIGHT_ANCHOR nor HEADSHOT exists → silhouette (`getNowSilhouetteUrl(isPitcher)`)
- **`players/now/{imageId}.jpg` is never used here**
- One asset may legitimately serve as both the active HEADSHOT and the default RIGHT_ANCHOR simultaneously

#### D. Back-Card Headshot (`PlayerCardBack`)
- Accepts `headshotUrl: string | null` prop
- If null → silhouette (`getNowSilhouetteUrl(isPitcher)`)
- **`players/now/{imageId}.jpg` is no longer auto-used as the headshot**
- Roster page batch-fetches HEADSHOT via `getBatchDesignatedPlayerImages(allRosterIds, 'HEADSHOT')` — passes to each `PlayerCard`
- Profile page fetches HEADSHOT via `getDesignatedPlayerImage(safePlayerId, 'HEADSHOT')` in the Promise.all

#### E. Timeline Inclusion
- `getPlayerPhotos(imageId)` queries: `show_on_pp_timeline = TRUE AND approval_status = 'APPROVED' AND image_role = 'TIMELINE'`
- Pre-migration rows (no columns yet): graceful degradation via nested try/catch returns all rows
- Each timeline frame uses `p.image_url || PLAYER_SILHOUETTE_URL`
- A single asset may have `image_role='HEADSHOT'` AND `show_on_pp_timeline=TRUE` simultaneously — it appears both in the right bookend and as a timeline frame. This is intentional.
- Assigning a NEW HEADSHOT does NOT remove the OLD HEADSHOT from the timeline unless `show_on_pp_timeline` is explicitly flipped. Timeline history is owned by metadata, not by role assignment.

---

### 4. RIGHT_ANCHOR / HEADSHOT Relationship

RIGHT_ANCHOR and HEADSHOT are distinct logical roles, but the same physical asset may serve both.

| Slot | Old behavior | New behavior |
|------|-------------|-------------|
| RIGHT_ANCHOR | `players/now/{id}.jpg` auto-used | explicit RIGHT_ANCHOR row → HEADSHOT fallback → silhouette |
| HEADSHOT | `players/now/{id}.jpg` auto-used | `headshotUrl` prop (from `player_photos WHERE image_role='HEADSHOT'`); null → silhouette |

Key rule: **asset identity ≠ slot identity**. One `player_photos` row with `image_role='HEADSHOT'` may have its `image_url` used in both the back-card and the career strip right bookend — this is correct behavior, not a collision.

Neither slot is filled by the legacy `players/now/{id}.jpg` path.

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
| `src/lib/playerImage.ts` | **Revised** — `getPlayerThenImageUrl` now returns `.jpg` (corrected from `.png`; `.jpg` confirmed from live S3 for Dom Hamel 225132); slot table and WIRED NOW comments updated; extension-flip documented |
| `src/components/yatstats/YatInteractivity.tsx` | **Revised** — `yat-bg` image loader now tries alternate extension (`.jpg`↔`.png`) before falling back to silhouette; protects against mixed-extension legacy THEN objects |
| `src/components/yatstats/PlayerCardFront.tsx` | Comment updated: `.png` → `.jpg` for legacy fallback path |
| `src/components/yatstats/PlayerCard.tsx` | Comment updated: `.png` → `.jpg` for legacy fallback path |
| `src/app/[hsid]/page.tsx` | Comment updated: `.png` → `.jpg` for legacy fallback path |
| `src/app/[hsid]/player/[playerId]/[slug]/page.tsx` | Comments updated: `.png` → `.jpg` for legacy THEN path; filmstrip comment block updated |
| `PLAYER_IMAGE_AUDIT.md` | Section 1 (Dom Hamel forensics) fully revised: confirmed S3 key `players/then/225132.jpg`, exact requested URL after fix, extension-flip mechanism documented |
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
