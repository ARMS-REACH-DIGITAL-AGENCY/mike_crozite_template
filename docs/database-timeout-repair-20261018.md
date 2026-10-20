# Database timeout repair (preview only)

## Observed code paths
- Player search: `src/app/api/players/search/route.ts` uses leading-wildcard ILIKE on TBC and identity-reconciled staged players. This migration introduces candidate name indexes; **the planner may not push predicates through the identity reconciliation view**.
- School search: `src/app/api/schools/search/route.ts` calculates per-school counts and URL/HSID enrichment; protect the existing live keystroke search and result order.
- School pages: `src/app/[hsid]/layout.tsx` loads four datasets concurrently; `src/lib/db.ts` creates a PG pool max 3 per Vercel instance, connection timeout 15s, cache TTL 600s. Add pool queue instrumentation before changing pool size or connection URL.

## Validation before merge
1. Run migrations on Neon preview **one statement at a time**, without an encompassing transaction; confirm columns and extension first.
2. Compare player and school search returned IDs, order, exact URLs, and active-alumni totals against baseline for common queries and 1/2/3-character inputs. Run EXPLAIN without ANALYZE initially.
3. Verify staging Vercel environment uses a preview Neon branch and that search/index improvements reduce p95 and statement timeouts under normal functional traffic. Do not run load tests on production.
4. Confirm no cache-revalidation connection timeouts, and establish whether pool queue waits, cold starts, or cross-region network time is the actual driver before changing connection endpoints.
5. Separate production SQL migration approval from PR merge because Vercel deployment does not create these DB indexes.
