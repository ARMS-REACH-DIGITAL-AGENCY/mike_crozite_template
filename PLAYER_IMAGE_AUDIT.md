# Player Image Standardization — Audit Report

**Branch:** `copilot/standardize-player-image-behavior`  
**Base:** `main`  
**Date:** 2026-03-17

---

## Summary

Standardized all player image consumers to use a single shared utility with silhouette-only
fallback. Eliminated every instance of alternate-player-image substitution (never show a
different player's image as a fallback). Unknown-school redirect behavior is unchanged.

---

## Files Changed

| File | Change |
|------|--------|
| `src/lib/playerImage.ts` | **NEW** — shared utility: `getPlayerThenImageUrl`, `getPlayerNowImageUrl`, `getThenSilhouetteUrl`, `getNowSilhouetteUrl`, `PLAYER_SILHOUETTE_URL` |
| `src/components/yatstats/PlayerCardFront.tsx` | Use shared utility; fix `.jpg`→`.png` for THEN image; remove `photoFallback`/`photoDefaultUrl` props; remove `data-fallback` attribute; silhouette-only fallback |
| `src/components/yatstats/PlayerCardBack.tsx` | Use shared utility for NOW image and silhouette URL |
| `src/components/yatstats/PlayerCard.tsx` | Remove `photoDefaultUrl` prop (no longer needed) |
| `src/components/yatstats/YatInteractivity.tsx` | Remove dead `data-fallback` branch from `.yat-bg` image-load handler |
| `src/app/[hsid]/page.tsx` | Remove `photoDefaultUrl` variable; remove prop from both `PlayerCard` usages; remove now-unused `canonicalBase` variable |
| `src/app/[hsid]/player/[playerId]/[slug]/page.tsx` | Use shared utility for `playerThenImg`, `playerNowImg`, `SILHOUETTE_URL` |

---

## Old Fallback Rules Removed

| Location | Removed Rule |
|----------|-------------|
| `PlayerCardFront.tsx` | `photoFallback` — NOW image (`players/now/{id}.jpg`) was used as a fallback when the THEN image failed. This violated rule: "never substitute a different player image." |
| `PlayerCardFront.tsx` | `photoDefaultUrl` prop — a school-wide default NOW-player image was the second CSS background-image, creating an automatic alternate-image substitution. |
| `PlayerCardFront.tsx` | `data-fallback` attribute — populated with the NOW image URL, driving the JS fallback chain in YatInteractivity to show a different (now-era) player image when the then-era image was missing. |
| `PlayerCardFront.tsx` | Wrong extension `.jpg` for THEN image — S3 stores THEN images as `.png`; using `.jpg` caused guaranteed 404s, which then triggered the incorrect NOW-image fallback. |
| `PlayerCard.tsx` | `photoDefaultUrl` prop — removed since `PlayerCardFront` no longer accepts it. |
| `src/app/[hsid]/page.tsx` | `photoDefaultUrl` variable and prop — computed and passed to `PlayerCard`; obsolete after above removal. |
| `YatInteractivity.tsx` | `data-fallback` branch — JS code that loaded a second (alternate player) image when the primary `.yat-bg` image failed. Now skips directly to the placeholder/silhouette. |

---

## Behavior After Change

| Scenario | Before | After |
|----------|--------|-------|
| THEN image missing (front card) | Shows NOW image for same player | Shows THEN silhouette |
| THEN image missing (front card, wrong ext) | `.jpg` caused 404 → fell back to NOW image | `.png` loads correctly; if missing → silhouette |
| NOW image missing (back card) | Shows silhouette ✓ | Shows silhouette ✓ (unchanged) |
| Career strip image missing | Shows silhouette ✓ | Shows silhouette ✓ (unchanged) |
| Unknown school | Redirects to yatstats.com ✓ | Redirects to yatstats.com ✓ (unchanged) |

---

## Extension Note

The utility does **not** hardcode a permanent global assumption:
- `getPlayerThenImageUrl` returns `.png` (current S3 convention)
- `getPlayerNowImageUrl` returns `.jpg` (current S3 convention)
- These are the only two functions that need updating if S3 conventions change.

The canonical future naming format (`{schoolId}_{playerId}_{year}_{type}`) is documented in
`src/lib/playerImage.ts` comments but **not yet implemented** — no behavior change until the
data source also changes.
