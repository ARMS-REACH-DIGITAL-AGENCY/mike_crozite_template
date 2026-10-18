# Global Search regression and preview integration audit

Audit: October 17, 2026, evening in America/Phoenix (October 18 UTC).

## Finding

The metadata preview did not revert search. Its search implementation was inherited from the production version on which it was built. Production still had the same expensive URL-enrichment query and older search presentation when this investigation began. The separate search repair in [PR #431](https://github.com/ARMS-REACH-DIGITAL-AGENCY/mike_crozite_template/pull/431) had not been merged.

The school search API catches failures from `canonicalSchoolUrls` and preserves the successful school-result list. A result without a stored `microsite_url` then has no URL when enrichment fails. The client interprets that missing URL as `SCHOOL PAGE NOT AVAILABLE YET`. That message therefore can describe an unsuccessful URL lookup even when the school page exists.

The original URL query performs a correlated `EXISTS` against `player_hsids`. That view includes a normalized identity-to-school join. Repeating it for many result rows is expensive; the database role's statement timeout is eight seconds. PR #431 materializes the requested, integer-filtered linked school IDs once, while keeping the existing eligibility view, exclusions, name-collision checks, and curated URLs.

## Measured API behavior

The same read-only queries were sent to the original metadata preview, current production, and the search-repair preview. These are measurements from one comparison run, not a guarantee of every cold-start or user-device latency.

| Query | Metadata `24510e3` | Production `618b9ac` | Search repair |
|---|---:|---:|---:|
| Centennial | 8.15 s | 6.77 s | 0.93 s |
| Hamilton | 8.76 s | 8.70 s | 0.696 s |
| Arizona | 8.92 s | 8.76 s | 0.828 s |

Arizona still returns 204 schools and Hamilton 35. The search API source is identical across old production, the metadata preview, current production, and PR #431. The repair changes URL resolution and client presentation/request handling, without replacing the search matching, ordering, row coverage, or alumni-count query.

A second comparison found production Hamilton at 7.01 s and Arizona at 9.12 s, with the repair at 2.49 s and 1.18 s. Ordered non-URL result fields matched production exactly. Production Hamilton also recovered more URLs on the second run without a code change (24 missing instead of 32), while Arizona still had 170 missing. This demonstrates why the same deployed search can alternate between linked and unavailable results depending on whether URL enrichment finishes before the timeout.

In the Arizona comparison, missing URLs fell from 170 to 68. The remaining 68 were checked: 66 have master school IDs but no linked players or stage records in the inspected database; two legacy Scottsdale Christian directory entries have unresolved school IDs. Those rows are different from the eligible schools whose URLs were lost to a timeout.

## Version and merge evidence

| Version | Commit |
|---|---|
| Original metadata preview / PR #429 | `24510e3e0fb639205733b2bd393629a04f36c216` |
| Production when metadata preview was built | `57677c98775b5266f911e1a60385b8fa29cae0ac` |
| Production at the beginning of this search audit | `618b9ac14cb3bfe9ca95a5603c29a159f3aee6b8` |
| Search repair integrated from PR #431 | `bc9183fbea0468ab84b18c629f1827c73ec090ed` |
| Production after PR #431 merged during this audit | `5d9ec40c27252e4d88128d1d10237aa1aa81445f` |

Production advanced with PR #428 after the metadata preview was built. Directly promoting that older deployment would omit the newly released Story/timeline updates. During this audit, PR #431 was also merged into production as `5d9ec40c`. Its complete tree is identical to the already tested `bc9183f` search head. The prepared integration includes this newest production commit as a parent of PR #429 and builds a new preview. This audit does not modify the separate search branch or perform its production merge.

The following four files must remain identical to production `618b9ac`: `StoryDrawer.tsx`, `StoryPreview.tsx`, `ZoomableCareerTimeline.tsx`, and `careerTimelinePlacement.ts`. `src/app/api/schools/search/route.ts` must retain its production SHA-256, `3395107a9c1b4cf853a9ef2d3ea4c5d650448bd5dc39f0def07abbe12bf6e415`. These comparisons make preservation of the released behavior explicit.

## Client and navigation repair

PR #431 restores the official school URL below the name and the prominent alumni count at the right. It uses a 90 ms debounce, immediately invalidates and cancels superseded browser requests, rejects stale responses, retains completed rows while loading, distinguishes request errors from empty results, and briefly caches completed exact queries. Tournament eligibility still controls bracket links.

The integrated preview also keeps search navigation on the reviewed build: validated school IDs use local school/profile routes on Vercel preview hosts and localhost. The displayed school URL remains the official URL. On production school domains, the official destination behavior is unchanged. Unavailable school rows and view-only contribution/crest rows remain unlinked.

## Boundaries

The search API reads through the shared database query helper, which prefers `PLAYERS_DATABASE_URL`. The metadata preview's additional `DATABASE_URL` override is not the cause of this regression.

PR #425 separately covers 627 player-linked schools missing from the search directory entirely, together with broader hostname and identity-review work. For example, TNXL Academy `15563` has linked players but no `school_success` row, so both the existing and repaired API return no TNXL result. This integration preserves the approved search-result coverage; it does not silently incorporate the broader directory rollout. Centennial `3722` and the metadata control school `10274` are existing directory entries.

The combined preview remains connected to the isolated database copy used for the metadata repair. No production data writes or production promotion are part of this audit. Release review should use the newly built combined deployment, not the old metadata preview or a rolling alias.

## Integration checks completed before deployment

The production build and TypeScript pass. All eight actual-source client regression groups pass, including preview/production navigation, live typing, stale requests, cancellation, cache behavior, cleanup, and crest review. All 21 search API contract cases and the school routing/bracket suites pass. The five metadata regression scripts still pass. Byte comparisons confirm the Search API and all four released Story/timeline files retain their production contents. Browser verification of the new immutable deployment is recorded in PR #429 after the build becomes ready.
