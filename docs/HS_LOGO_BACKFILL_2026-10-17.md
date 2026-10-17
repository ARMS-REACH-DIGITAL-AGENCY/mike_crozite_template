# High-school logo backfill — 2026-10-17

Status: preparation only. No S3 writes or production deployment have been made.

## Verified sources
- Neon project `round-recipe-12286668`, main branch `br-polished-lab-a4i35u5j`
- `player_hsids`: 124,460 player-school rows and 7,954 unique non-null HSIDs
- Every one of those 7,954 HSIDs exists in `tbc_schools_raw`.
- `tbc_schools_raw` has 17,248 school references; do not use all references as the site population.
- Historical `data/hsid_for_Claude.csv` has only 1,025 entries and is NOT a current source of truth.
- Earlier `feat/hs-logos-maxpreps` branch has a more rigorous MaxPreps school-sitemap matcher, staging, review HTML, and confidence scoring than current Easter-NEWS.
- `scripts/fix_hs_logo_ids.py` on that branch reports the historical CSV contained wrong IDs for 168 bracket schools. Never trust an old CSV HSID without a live DB join.

## Canonical export query
```sql
SELECT DISTINCT p.hsid,
       t.hsname AS school_name,
       t.nickname,
       t.cityname AS city,
       t.regionid AS state,
       t.hslocation
FROM public.player_hsids p
JOIN public.tbc_schools_raw t USING (hsid)
WHERE p.hsid IS NOT NULL
ORDER BY p.hsid;
```

## Safe resumption prerequisites
1. Export live target list (HSID, name, nickname, city, state) and verify 7,954 distinct HSIDs.
2. Inventory existing S3 `schools/{hsid}.png` and staged `schools-candidates/{hsid}.png`; verify misassigned-logo repair before treating the object existence as success.
3. Port the MaxPreps sitemap matching implementation onto a **fresh** branch of Easter-NEWS; do not merge the old diverged branch wholesale. Preserve existing verified logos.
4. Have fetch write report CSV + HTML review contact sheet and match provenance. Add checkpoints/retries and respect source site restrictions and reasonable request pacing.
5. Start with 10-20 missing HSIDs in dry-run, then stage. Visually validate name, city, state, mascot and transparency. Only approved high-confidence logos get published.
6. Continue in bounded resumable batches until the 7,954 target HSIDs are classified as existing, published, staged, unmatched, or failed.
7. Produce coverage totals and a review queue. Keep Easter-NEWS untouched until explicitly approved.

## Existing workflow locations
- `.github/workflows/fetch-hs-logos.yml` on Easter-NEWS is the legacy four-provider job.
- `feat/hs-logos-maxpreps/.github/workflows/fetch-hs-logos.yml` is the October job with mode=stage/publish and specific-ID repair.
- Source logos: `s3://yatstats-assets/schools/`
- Review staging: `s3://yatstats-assets/schools-candidates/`

No scraping has been dispatched by this preparation change.
