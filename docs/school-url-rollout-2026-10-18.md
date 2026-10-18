# School URL and Global Search review

## Review material

The editable review workbook is [YATSTATS school URL review](https://docs.google.com/spreadsheets/d/1yxnIkenpN_5oHS2HhwazXkoCHc7DIzozOZJQy10TlZQ/edit).

This branch is based on production commit `098503de55dc0ee766ffba489bb58e9075b904a4`. It completes the earlier URL work in PR #421. Production has not been merged from this branch. The associated pull request supplies the exact deployment preview URL and live checks.

## Scope and evidence

The database snapshot contains 7,954 distinct, non-null `player_hsids.hsid` values. All have a master school record. This is the requested universe. Of these, 7,208 have a numeric HSID in `school_success`; 746 do not. Among the 746, 119 match an existing unassigned directory identity and 627 require an additional search row. Search retains the existing rows and adds those 627 without duplicating the 119.

The linked-player universe is distinct from current gallery availability: 17 of the 746 have no flip-card stage records. Their current gallery counts remain zero. The change does not invent active players or tournament eligibility.

The actual canonical helper was checked against all 7,954 school candidates and 34,969 reserved hostname claims from the database. It produced 7,954 unique, valid official addresses. All 7,954 named and all 7,954 numeric addresses round-tripped to their expected HSID in that snapshot check. This is a complete mapping and ownership check; individual live HTTP checks are separately recorded in the workbook.

## Address policy

- Preserve a valid, uniquely owned existing official address.
- Use `school.state.yatstats.com` where the name is unambiguous.
- When the name is shared, use Pete's requested `school.state.city.yatstats.com` format, such as `mount-carmel.ca.san-diego.yatstats.com`.
- Where the master records share the school name, state, and city, propose `school-HSID.state.city.yatstats.com` pending identity review. There are 125 such cases: 122 in the 746-school review and three in the other 7,208.
- Keep the numeric `HSID.yatstats.com` route tied to its actual HSID. Incorrect historical staging URL metadata must not override that identity.

The result preserves 1,011 valid stored official addresses and proposes 411 city-qualified addresses. The five multiply claimed old named addresses fail closed instead of selecting an arbitrary school. Three malformed stored addresses are normalized.

## Production release prerequisites

The proposed hostnames are not equivalent to provisioned HTTPS domains. The current project has the US state wildcards and DC, but it lacks 16 regional wildcards required by 484 programs. City-qualified addresses also need coverage at their additional DNS label: `*.state.yatstats.com` does not cover `school.state.city.yatstats.com`.

The companion `school-url-domain-plan-2026-10-18.json` records the exact 16 regional and 300 city-parent entries needed for the proposed map. Domain setup and the 125 unresolved identities remain explicit review items. A branch-only demonstration alias, if later created, must be recorded in the pull request; it is not evidence that the whole domain plan is provisioned.

Before promoting this branch, resolve the workbook decisions, apply the accepted domain plan, verify TLS and correct school rendering on the new host patterns, and confirm the final production search response links to those addresses. Existing production aliases must retain their assignments during preview review.

## Preview behavior

The High School tab opens `/HSID` on the same Vercel preview build so the review is not sent into the older production deployment. Production High School results continue to use each program's official URL. The unchanged Players tab still follows its existing production links.

Useful High School searches include TNXL Academy (15563), P27 Sports Academy (16515), Basic Academy (559), DeLand (2496), Mount Carmel in San Diego (452), and the two Centennial schools in California (1309 and 1310). Hamilton (5004) provides an established-school comparison.

The read-only `/api/school-host-resolve` endpoint accepts an `x-yat-school-host` header and returns the resolved HSID. This can validate a proposed name against the exact preview build before DNS is connected.

## Validation

The change passes TypeScript and the directory-routing, 98-case canonical-host, search-contract, bracket-navigation, and metadata/navigation suites. Six additional query fixtures executed in PostgreSQL preserve expected ordering and active counts, including exclusion handling, state queries, city filters, newly included schools, and existing unassigned directory identities.

The shared eligibility CTE has exact set equality with the current `player_hsids` view and avoids the correlated view expansion responsible for observed search URL-enrichment timeouts. A verified numeric school remains available if optional canonical URL enrichment fails; a hostname lookup exception cannot discard an already resolved numeric identity.
