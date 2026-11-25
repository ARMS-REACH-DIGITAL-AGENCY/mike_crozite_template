# YAT?STATS — 314 missing canonical flip cards (25 November 2026)

## Authoritative results

Production Neon project `round-recipe-12286668`, branch `br-polished-lab-a4i35u5j`:
**314/314 registered YAT IDs now have canonical flip cards. 0 of this cohort remain missing.**
The full unmerged-registry population-wide anti-join also returns **zero** missing canonical cards.

Isolated 2026 replay QA branch `br-falling-wind-a4ew8f1p`:
**314/314 of this precise production cohort** have corresponding cards, school links, and
player-school profiles, with **zero YAT ID, HSID, status, level, or current-team mismatches**
against production. The QA database is an older snapshot with 831 *other* registered
players lacking cards; those were not part of the original production 314-person audit.

| Measure | Original 314-person cohort |
|---|---:|
| Canonical YAT IDs / cards / school links / profiles | 314 each |
| 2026 season statistics | 255 |
| Historical seasons without 2026 stats | 17 |
| No confirmed seasons in audited TBC season views | 42 |
| Status ACTIVE | 253 |
| Status RETIRED | 6 |
| Status UNKNOWN | 55 |
| Distinct source high-school names | 258 (input baseline) |
| New source-backed canonical school entries | 245 |
| Player/school associations individually verified externally | 4 |
| Unresolved cards after repair | 0 |

The original 314-person record-level audit is committed as
[`docs/audits/missing-yat-cards-20261125-cohort.csv`](missing-yat-cards-20261125-cohort.csv).
It includes YAT ID, source TBC/MLB IDs, original high-school string, canonical HSID,
school URL, level/status, 2026/historical statistics flags, and provenance notes.

## Safety and identity controls

- Reused existing canonical HSIDs where identity was unambiguous. Two similarly
  named schools in different cities were **not** merged.
- Created canonical school entries only for previously absent source-school
  identities; source-only school/player associations remain `is_verified=false`
  until independent individual proof exists.
- Kept one card per canonical YAT ID; did not create new YAT persons or relink
  historical batting/pitching rows.
- 2026 college participation can establish ACTIVE; independent-league stats alone
  do not. Ambiguous, missing-stat, and stale-status cases remain UNKNOWN.
- Existing school IDs, team mappings, and 2025/2026/historical statistics
  were not overwritten. Existing frozen bracket results and seedings were not touched.
- The SQL files are idempotent on the repaired baseline, with guarded identity,
  HSID and source-school checks.

## Priority unblock — Kamden Edge

- YAT190598 / TBC 346621 / MLB 833403
- Boswell High School, Boswell, Oklahoma: canonical HSID **19603**;
  *not* HSID 1370 (Boswell, Fort Worth, Texas)
- Quad Cities River Bandits / team ID **14083** / HIGH-A on 7 April 2026
- Card, school, source link and profile inserted and verified in **both** databases.
- The other replay agent can resume its April 7 test; no frozen results were modified.

## Individually investigated exceptions

1. **Stephen Brown** — YAT075338 / TBC 167078. Historical **Charleston High School
   in Charleston, WV**, distinguished from Charleston Catholic, Capital, and
   Stonewall Jackson. Evidence: [original TBC school team](https://thebaseballcube.com/content/hs_team/19353/),
   [player obituary documenting Charleston High athletic career](https://snodgrassfuneral.com/stephen-steve-brown/),
   and [West Virginia state yearbook archive](https://archive.wvculture.org/history/archives/yearbooks.html).
   New HSID **19846**. Status RETIRED, historical rookie league (1977).
2. **Robby Butenschoen** — YAT125106 / TBC 248578. The local TBC raw import
   contains concatenated/corrupted CSV fields and remains *quarantined*, unchanged.
   The [live original TBC player profile](https://thebaseballcube.com/content/player/248578/)
   identifies **Clackamas High School**, Oregon: existing HSID **3920**.
   Position P / highest INDY / status **UNKNOWN**, not ACTIVE from independent
   league participation alone. Canonical school/profile/card were reconstructed
   without rewriting the raw evidence.
3. **Joshua Lennear** — YAT201655 / TBC 367703. Raw TBC labels
   `Downey Christian (Downey,CA)` but independent player-specific evidence
   confirms **Calvary Chapel in Downey, CA**:
   [2025 local athlete-of-the-year article](https://www.thedowneypatriot.com/articles/sarah-masterson-joshua-lennear-are-calvary-chapels-athletes-of-the-year)
   and [high-school baseball roster](https://www.maxpreps.com/ca/downey/calvary-chapel-grizzlies/baseball/roster/all-time/).
   New HSID **19847**; **not** Calvary Chapel Santa Ana HSID 10526.
   2026 team Los Angeles Harbor College (20339), CCCAA, ACTIVE.
   Corrected canonical association, preserved original discrepant raw TBC field.

## Source preservation and browser/API verification

All 314 cards, school links and school-profile associations were cross-checked
against Neon production and replay QA. The initial 2026/17 historical-only/42
without-statistics distribution was independently reproduced from the historical
and 2026 resolved batting/pitching views.

The production Vercel hostname returned HTTP 200 for these numeric-school
pages **and** individual player profiles: Kamden (19603), Stephen (19846),
Joshua (19847), and Robby (3920). Their school pages rendered YAT-flip-card
identities; their individual profiles rendered the matching player and statistics
tabs. `/api/players/search?q=<name>` returned the expected canonical YAT ID and
HSID for each of the four. For the new schools, that API currently falls back to
`https://yatstats.com/<HSID>` instead of their curated named domains; the
routing change in this review branch addresses that separate presentation gap.
The All-Time gallery lazy-loads; its complete browser interactions were not
independently exercised for all 314 players.

### Shared application changes (approval required)

- `src/lib/schoolDirectoryRouting.ts` recognizes stage-backed canonical
  `school_success` rows absent from `tbc_schools_raw` and returns their already
  recorded curated microsite URLs in global search.
- `src/lib/activeAlumni.ts` permits a real canonical YAT-to-TBC source mapping
  and a genuine 2026 season stat to establish season membership at a new school
  absent from the older TBC school export. It does *not* admit status-only,
  name-matched, or fabricated members.
- Relevant PostgreSQL and directory-routing regression tests were updated.
- These shared changes stay **unmerged** pending explicit review and approval.

## Reproduction sequence

1. `scripts/repair/missing-yat-flip-cards-20261125.sql`:
   290 unambiguous source-backed stage records and 233 new schools.
2. `scripts/repair/missing-yat-flip-cards-verified-schools-20261125.sql`:
   20 further records, independently checked schools and names, 9 new schools.
3. `scripts/repair/missing-yat-flip-cards-final-three-20261125.sql`:
   three exceptional player records, 2 new schools.
4. `scripts/repair/normalize-new-school-urls-20261125.sql`:
   canonical `school.state.yatstats.com` where unique, else
   `school-city.state.yatstats.com`.
5. Priority Kamden Edge was an individually verified SQL transaction in both
   databases before the population repair.
6. QA follow-on synced the exact **production HSID/YAT-ID values**, rather
   than allocating a second, inconsistent set of school IDs.

**Do not rerun the first allocation script to reconcile the 831 unrelated,
older QA-only records** without first building their own canonical production
source manifest. Doing so would assign different school IDs between branches.
