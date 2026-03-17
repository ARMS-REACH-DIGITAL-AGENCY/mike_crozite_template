# Player Image Standardization — Audit Report

**Branch:** `copilot/standardize-player-image-behavior`  
**Base:** `main`

---

## 1. Every File Changed

| File | What Changed |
|------|-------------|
| `src/lib/playerImage.ts` | **NEW** — single shared utility. Functions: `getPlayerThenImageUrl(imageId)`, `getPlayerNowImageUrl(imageId)`, `getThenSilhouetteUrl(isPitcher)`, `getNowSilhouetteUrl(isPitcher)`, `PLAYER_SILHOUETTE_URL`. Parameter name is `imageId` throughout. Full canonical naming spec documented (see section 4). |
| `src/components/yatstats/PlayerCardFront.tsx` | Imports shared utility. Renamed `pid` → `imageId`. Removed `photoFallback`, `photoDefaultUrl` props. Fixed THEN image extension `.jpg` → `.png`. Removed `data-fallback` attribute and alternate-image CSS layer. Silhouette-only fallback. |
| `src/components/yatstats/PlayerCardBack.tsx` | Imports shared utility. Renamed `pid` → `imageId`. Uses `getPlayerNowImageUrl(imageId)` and `getNowSilhouetteUrl`. Href link updated to use `imageId`. |
| `src/components/yatstats/PlayerCard.tsx` | Removed `photoDefaultUrl` prop from interface and component signature. |
| `src/components/yatstats/YatInteractivity.tsx` | Removed `data-fallback` JS branch from `.yat-bg` image-load handler. Handler now goes directly to silhouette (`data-placeholder`) on primary load failure. |
| `src/app/[hsid]/page.tsx` | Removed `photoDefaultUrl` variable, removed prop from both `PlayerCard` usages, removed now-unused `canonicalBase` variable. |
| `src/app/[hsid]/player/[playerId]/[slug]/page.tsx` | Imports `getPlayerThenImageUrl`, `getPlayerNowImageUrl`, `PLAYER_SILHOUETTE_URL` from shared utility. Updated inline comments to use `imageId` / canonical role labels. |

---

## 2. Every Alternate-Image Fallback Rule Removed

| Location | Removed Rule |
|----------|-------------|
| `PlayerCardFront` | `photoFallback` variable — NOW image (`players/now/{imageId}.jpg`) was the fallback when THEN failed. Violated rule: never substitute a different player image. |
| `PlayerCardFront` | `photoDefaultUrl` prop — school-wide default NOW image was the second CSS `background-image` layer, creating automatic alternate-image substitution. |
| `PlayerCardFront` | `data-fallback` HTML attribute — populated with the NOW image URL, driving the JS fallback chain in `YatInteractivity` to show a different (current-era) player image when the HS-era image was missing. |
| `PlayerCardFront` | Wrong `.jpg` extension for THEN image — S3 stores THEN images as `.png`; the `.jpg` request caused a guaranteed 404 which triggered the NOW image fallback chain above. |
| `PlayerCard` | `photoDefaultUrl` prop removed from interface — no longer accepted or forwarded. |
| `src/app/[hsid]/page.tsx` | `photoDefaultUrl` variable and prop — was computed and passed into every `PlayerCard`; obsolete after above removal. |
| `YatInteractivity.tsx` | `data-fallback` JS branch — the `if(fallback){...}` block that loaded a secondary image (`img2`) from an alternate player URL before reaching the silhouette placeholder. Handler now skips directly to `data-placeholder` on failure. |

---

## 3. Every Place Generic `id` Wording Was Replaced With `imageId` / `image_id`

| Location | Before | After |
|----------|--------|-------|
| `playerImage.ts` — `getPlayerThenImageUrl` param | `playerId: string` | `imageId: string` |
| `playerImage.ts` — `getPlayerNowImageUrl` param | `playerId: string` | `imageId: string` |
| `playerImage.ts` — header comments | `{id}` in S3 path descriptions | `{imageId}` |
| `PlayerCardFront.tsx` | `const pid = String(p.playerid \|\| "")` | `const imageId = String(p.playerid \|\| "")` |
| `PlayerCardBack.tsx` | `const pid = String(p.playerid \|\| "")` | `const imageId = String(p.playerid \|\| "")` |
| `PlayerCardBack.tsx` href | `player/${pid}/` | `player/${imageId}/` |
| `page.tsx` comment | `players/then/{playerId}.png` | `players/then/{imageId}.png` |
| `page.tsx` comment | `NOW image = .jpg, THEN image = .png` | `HEADSHOT role (NOW) = .jpg, YATSTATS role (THEN) = .png` |

---

## 4. Canonical Naming Convention — What Is and Is Not Wired Now

### Spec (documented in `src/lib/playerImage.ts`)

**Canonical designated images** (role-prefixed):  
`{role}_{hsid}_{imageId}[_{source}][_{level}][_{year}][_{month}][_{day}][_{seq}]`

Supported roles:
- `YATSTATS` — canonical front flip-card image (HS/THEN era)
- `HEADSHOT` — canonical back-card image (NOW/current era)

**General non-designated images** (no role prefix):  
`{hsid}_{imageId}[_{source}][_{level}][_{year}][_{month}][_{day}][_{seq}]`

### What is wired now (active in production)

| Function | S3 path |
|----------|---------|
| `getPlayerThenImageUrl(imageId)` | `players/then/{imageId}.png` |
| `getPlayerNowImageUrl(imageId)` | `players/now/{imageId}.jpg` |

### What is deferred (not yet wired)

The role-prefixed canonical filenames (`YATSTATS_5006_213884_PLAYER_HS_2017_month_day`,
`HEADSHOT_5006_213884_MLB_MLB_2024_month_day`, etc.) are the **target** naming format.

They are **not wired** in any current path-generation function because:
- S3 currently stores images under `players/then/` and `players/now/` with bare numeric IDs.
- The upstream upload pipeline does not yet produce canonical-named objects.

Stub functions `getYatStatsImageUrl` and `getHeadshotImageUrl` are sketched in comments inside
`playerImage.ts`. They will replace the legacy functions once the data source is updated.
No behavior change is produced by this PR regarding canonical naming.

---

## 5. Anything Still Deferred Because Upstream Data Is Not Yet Available

| Item | Status |
|------|--------|
| Role-prefixed S3 image filenames (`YATSTATS_*`, `HEADSHOT_*`) | **Deferred** — S3 upload pipeline does not yet produce these keys. Path generation in `getPlayerThenImageUrl` / `getPlayerNowImageUrl` remains on legacy `players/then/` and `players/now/` paths. |
| `source`, `level`, `year`, `month`, `day`, `seq` components of canonical name | **Deferred** — documented in spec but not constructible without a data source that exposes these per image. |
| `getYatStatsImageUrl` / `getHeadshotImageUrl` functions | **Stubbed in comments only** inside `playerImage.ts`; not exported or called anywhere. |

---

## Behavior After This PR

| Scenario | Before | After |
|----------|--------|-------|
| THEN image missing (front card) | Shows NOW image (wrong era, alternate substitution) | Shows THEN silhouette only |
| THEN image requested with wrong extension `.jpg` | Guaranteed 404 → triggered NOW image fallback | `.png` now requested — loads correctly; if missing → silhouette |
| NOW image missing (back card) | Shows silhouette ✓ | Shows silhouette ✓ (unchanged) |
| Career strip image missing | Shows silhouette ✓ | Shows silhouette ✓ (unchanged) |
| Unknown school request | Redirects to yatstats.com ✓ | Redirects to yatstats.com ✓ (unchanged) |
