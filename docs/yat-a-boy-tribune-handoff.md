# The YAT-A-BOY Tribune — layout review and delivery handoff

Status: **draft awaiting Pete's layout approval; delivery disabled**. Prepared October 22, 2026. Do not merge, promote, enable, or send this draft until the layout has been approved. This is one shared template and data path for every school, not a Hamilton-specific implementation.

## What this change provides

- A cream-paper sports-page email with the requested masthead, tagline, and YaTi byline.
- Identical tournament batting and pitching column order, complete canonical alumni rosters, real-club W-L, no-appearance rows, team totals, and two-way-player handling.
- The same scoring implementation used by the tournament, extracted into `src/lib/bracket/scoreLive.ts`; the email does not average rounded player OPS+/FIP- values or calculate a separate fantasy result.
- Visitor/home inning results, daily metrics, full-week comparisons, club winning percentage, and recorded extra innings. Daily production is explicitly distinguished from the fantasy game's week-to-date score.
- A separate SuperFan table for selected other-school players, excluded from the home school's scoring population.
- A sponsor advertisement and named acknowledgment, a public edition-sharing link, sweepstakes panel, browser edition, and complete readable plain-text edition.
- Signed recipient preferences for daily/weekly and HTML/plain text. Preference GETs never change a subscription; unsubscribe requires the confirmation POST.
- Immutable edition snapshots. Public copies remove personal follows, tier, and preference/unsubscribe links.
- A versioned release gate, subscription checks, and the existing unique recipient/date delivery claim. The audience remains the existing seven-person pilot; this change does not enroll the full fan base.

## Approval hold already applied

`migrations/20261022_tribune_approval_preferences.sql` has been applied to the production database. Production identifiers and recipient details are kept outside this public repository. The initial operational run seeded only the already authorized pilot; the checked-in migration intentionally does not publish or seed a recipient list.

Verified production state: `enabled = false`, `approved_layout_version = null`, `approved_at = null`. A simulated legacy claim returned zero rows and saved no delivery record. The old deployed sender requires a returned claim before contacting the mail provider, so the next scheduled pilot delivery is held even before this code is deployed. No email was sent during these checks.

The existing cron time is unchanged: 11:00 UTC, or 4:00 a.m. Arizona. Daily recipients receive the completed previous day; weekly recipients are due on Monday for the completed Monday–Sunday period. The new cron exits with `held_for_approval` while the gate is disabled. The old deployed cron may describe a suppressed claim as `previously_attempted`; that is a limitation of its older status wording, not a delivered message.

Both migrations were tested on an isolated temporary database branch with an expiry date. The archive migration (`20261022_tribune_editions.sql`) has **not** been applied to production. Neither migration enables delivery.

## Before enabling the approved layout

1. Record Pete's explicit approval of `tribune-v1` and resolve any requested design changes. If the approved version changes, update the version constant and the operator approval together.
2. Merge/deploy the approved code and apply the archive migration. Preserve unrelated current main-branch work.
3. Configure `TRIBUNE_OFFICIAL_RULES_URL` with the actual published, approved Official Rules. No published rules URL was found in the source; the draft does not invent eligibility, entry limits, deadlines, or prize inclusions. A missing rules URL holds delivery.
4. Configure `TRIBUNE_POSTAL_ADDRESS` with the sender's actual postal address. A missing address holds delivery.
5. Assign the confirmed school newsletter sponsor through the shared publisher portal: an active brand, an explicit active school Tribune placement, and an eligible published creative. The former static `TRIBUNE_NEWSLETTER_SPONSOR_ID` path has been replaced by the database-backed resolver. Existing splash sponsorship is not automatically a newsletter booking. Without an assigned campaign, the template reserves the ad space rather than falsely crediting a sponsor. See `docs/tribune-publisher-portal.md` for the private database connection, migration/permission prerequisites, campaign precedence, and immutable snapshots.
6. Ensure a signing secret is present (`TRIBUNE_PREFERENCES_SECRET`, falling back to the existing `CRON_SECRET`) and the existing sending-domain verification remains true. No secrets are included in the preview or repository.
7. Verify `TRIBUNE_PILOT_EMAILS` and the existing subscription preference records. The original authorized pilot has already been moved into a private Production environment variable; preview environments intentionally have no default audience. The code accepts no default audience and caps the pilot at seven addresses; it does not enroll recipients. Missing or invalid configuration holds both the admin sender and cron. Prepare a real-data preview through the authenticated pilot endpoint with `send:false`. Check readiness, links, recipient choices, current roster membership, sponsor, and rules. Keep all outgoing messages held until authorized. Browser rendering has been checked; actual Gmail/Outlook inbox rendering and provider MIME behavior still need an approved test delivery.
8. Only then use the operator database role to set the control record to `enabled=true`, `approved_layout_version='tribune-v1'`, and record `approved_at`/`approved_by`. This is an explicit post-approval action, not a migration default. The next applicable existing cron run will use the approved version. Do not manually replay earlier reporting dates or expand the pilot audience as part of approval.

## Design proofs

Run `node scripts/preview-tribune.cjs` to generate weekly SuperFan and daily Fan `.html`, `.txt`, and `.json` proofs under `review/`. These outputs are local review artifacts, not delivery data and not production imports.

The fixture contains the 43-player public Hamilton roster read October 22, 2026. All performance numbers, the sample 2027 fantasy game, and the three other-school follow examples are explicitly illustrative. The sponsor is a labeled sample placement. The real current feed is not represented by these made-up numbers.

The proof exercises 32 batting rows and 13 pitching rows for 43 distinct players, including two-way players and players with no appearance. The three fictional other-school follows appear only in the weekly SuperFan proof. The daily proof shows only that day's production while preserving the week-to-date fantasy score.

The HTML proof is approximately 91 KB for the weekly example and 80 KB for the daily example before real signed links. Full rosters and preferences can increase email size. The browser and plain-text links provide the complete edition when an email client clips a long message; do not remove alumni rows to achieve a byte target. Wide tables retain every column and scroll in supported mobile clients; older email clients may instead need the browser edition.

## Source limitations to address before full-season rollout

The existing production tournament source publishes Round 1 seed pairings and scores games already present. It does not currently publish later-round progression, leaderboard games, or postseason pairings. The email must not invent those opponents or game IDs. An in-season reporting period with a missing/unavailable matchup is blocked from delivery; preseason upcoming editions are legitimate. The 2027 season dates come from `TOURNAMENT_2027`.

The original browser loader asks for the entire field while the live endpoint caps a request at 64 schools. Tribune batches the required regional field in groups of 64. For a matchup where neither side plays that day, the scorer's fallback “whole bracket's last game” clock can therefore differ by source scope. No current preseason score is affected, but the complete browser-field loading scope should be reconciled before the live 2027 tournament launch. Do not describe this email redesign as implementing the missing tournament progression.

The live endpoint previously included statuses outside the canonical alumni roster. This change uses the exact same `isRosterStatus` predicate as `/api/players/[hsid]`, retaining high-school exclusion. A mismatch between email roster and scoring population also blocks delivery.

## Verification

```bash
node node_modules/typescript/bin/tsc --noEmit
node scripts/test-tribune-delivery.cjs
node scripts/test-tribune-story-archive.cjs
git show HEAD:src/components/bracket/liveSeason.ts > /tmp/tribune-original-liveSeason.ts
TRIBUNE_BASELINE_FILE=/tmp/tribune-original-liveSeason.ts node scripts/verify-tribune-tournament.mjs
node scripts/preview-tribune.cjs
git diff --check
```

For scorer parity after this draft is committed, use the pre-change base ref (currently `2e9c81203a61f752fe11739ca7b61ded410a8e7f`) in place of `HEAD` when extracting the original file. Offline delivery tests mock all outbound work; they send no email. Database tests used an isolated branch, with production limited to the approval hold and its suppressed-claim verification. Visual checks cover desktop and 390 px mobile layout, the complete table structure, and loaded image assets.

The original `Outlook Document(22).PDF` did not attach successfully in the conversation. The redesign used the five available image references and the source code, not that missing PDF.
