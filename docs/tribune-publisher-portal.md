# Tribune publisher and sponsor portal

The shared `/api/partners/*` service manages the Tribune masthead, Publisher’s Notes, reusable sponsor identities, school placements, dated advertisements, and title-sponsor flip cards. The corporate partner dashboard uses a same-origin rewrite to this service. Every school uses the same authorization, publication selection, and email renderer; there is no school-specific fork.

**Publishing content does not approve or send the newsletter.** The replacement sender uses only `tribune_private.alumni_newsletter_control`, remains disabled by default, and additionally requires a completed explicit cutover. The private pilot audience, recipient choices, and sending-domain checks remain independent.

This revision is prepared for isolated staging/test only. No production schema rollout, promotion, cutover import, delivery approval, or send is implied by implementation or test success. The earlier proposal to change existing shared ACLs/RLS is superseded by private storage. Historical public records are left in place; their existing exposure is not repaired or concealed by copying data.

## Database and environment setup

Create new objects in `tribune_private` in the same database as the canonical school/sponsor data. Existing public table definitions, rows, policies, triggers, role permissions, and schedules are unchanged. The only shared permission additions grant the dedicated new app role its explicit canonical reads and sponsor-brand create/update access. No private table has a foreign key into a public table, so this feature cannot impose new deletion restrictions on the existing systems.

Apply only on a fresh isolated branch until a production rollout is separately approved:

1. Existing prerequisites are canonical `sponsor_brands`, `sponsor_orders`, `school_splash_sponsorships`, `school_success`, and the already-held legacy newsletter control/preferences/ledger plus user profiles. Do not reapply or rewrite the legacy approval migration to install the new portal.
2. `20261023_tribune_private_delivery.sql` creates the disabled private approval, preferences, ledger, cutover marker, and an operator-only import function. It does not call that function.
3. `20261022_tribune_editions.sql` creates private/public immutable snapshots in the private schema, without a profile foreign key.
4. `20261022_tribune_publisher_portal.sql` creates private memberships, assets, order claims, Tribune placements, advertisements, publication settings, audit, and independent `publisher_notes`.
5. `20261023_partner_sponsor_cards.sql` creates the separate title-sponsor card placements/cards and their scoped grants.
6. `20261023_tribune_partner_privileges.sql` grants the dedicated app role access to the new private objects and canonical sources. Its revocations/RLS apply only inside `tribune_private`; it makes no change to legacy newsletter or site-message security.

Record and compare the shared schema/ACL/RLS fingerprint before and after applying the revised migrations on the fresh test branch. An old test branch where the superseded migration already changed public permissions cannot prove this isolation.

The 2026-10-23 verification used fresh branch `dev-tribune-isolation-cards-20261023`, copied from production. Applying these five migrations, and applying them a second time in the documented order, preserved all 251 shared object definitions and existing-role access rules. The shared fingerprint was `2dc865262fc484d7b1e86a026908b4d0` before and after; the only excluded ACL entries were the deliberately added dedicated-app grants listed above. Checked canonical sponsor/order/splash, legacy delivery/message/profile/preference row counts and the held legacy control also matched. Thirty real PostgreSQL service scenarios passed under the restricted app role, alongside privilege and owner-only cutover probes. Test fixtures were removed; private approval remained disabled, with no approved template, cutover import, or delivery attempt.

Create `yatstats_tribune_app` through SQL as a dedicated LOGIN role before the final migration. It must have no superuser, CREATE DATABASE, CREATE ROLE, REPLICATION, BYPASSRLS, or inherited role privileges, and must not own the tables. Generate its password privately. Neon’s API-created role defaults are unsuitable here because they can include elevated role membership. The private-privileges migration rejects an elevated or inherited application role.

Configure **`TRIBUNE_DATABASE_URL`** privately with this role’s complete connection string to the same database as the shared player data. Production and isolated preview environments must point at their respective branches. `src/lib/tribune/db.ts` requires the dedicated credential, verifies TLS, and has no fallback to `PLAYERS_DATABASE_URL`, `DATABASE_URL`, or ambient PostgreSQL settings. Public player/fan/favorite lookups continue using the existing data connection.

The portal also uses the existing Firebase project/browser configuration and existing S3 upload configuration. The Firebase verification project must match the browser project. Artwork uses `YATSTATS_AWS_ACCESS_KEY_ID` / `YATSTATS_AWS_SECRET_ACCESS_KEY`, with the existing AWS-name fallbacks, and the bucket/region settings in `storyAssets.ts`. Never put database credentials, access tokens, recipient lists, or account UID grants into source files.

## Bootstrap publisher access from a verified identity

1. Have the intended publisher sign in to the configured Firebase project. Obtain that account’s **verified Firebase UID** through the authenticated account handoff or the Firebase administrator console. A profile label, email address, email domain, browser cookie, or client-supplied UID is not an authorization grant.
2. An operator can temporarily add this exact UID to private `PARTNER_PUBLISHER_UIDS`, or insert an explicit active publisher membership through the privileged operator connection. The environment bootstrap accepts at most 25 explicit UIDs; it does not bypass token verification or an unavailable authorization database.
3. Sign in as the authorized publisher, confirm dashboard access, and save the persistent publisher membership. Remove a temporary environment bootstrap after the durable grant is verified.
4. Grant each sponsor’s verified Firebase UID access to its specific sponsor ID. One user may have several explicit sponsor memberships. Sponsors cannot grant access, edit publication settings or notes, activate placements, or publish material requiring publisher approval.

The server verifies the Firebase Bearer token’s signature, issuer, audience, and expiry before loading memberships. Unknown, inactive, expired, or unavailable authorization fails closed. No existing test-account UID is treated as an administrator.

## Campaign workflow

Create or select a reusable sponsor brand. A new brand without an uploaded logo remains inactive with a neutral pending-logo image. Upload its logo, confirm its identity and destination, then activate it through the publisher account. A brand may sponsor multiple schools; its logo is stored once. These are canonical shared brand edits: name, logo, website, and active-state changes also affect existing splash placements using that brand. Tribune creative changes remain specific to the newsletter.

The publisher assigns explicit **Tribune placements** to schools, with status, priority, start/end timestamps, and whether publication requires review. Splash, footer, and player-profile sponsorships do not automatically become newsletter placements. A paid-order link is optional; when supplied, the service validates its school and paid state, and an atomic order claim prevents two brands from taking the same order. This portal does not charge a card or change payment status.

Sponsors save drafts and submit advertisements. A submission stays pending when its placements require review; only the publisher can mark that creative publisher-approved. A sponsor submission can publish automatically for placements explicitly configured without review. A newly assigned placement requiring review never serves a previously self-published creative unless a publisher has actually approved it.

Each creative contains its headline, copy, destination, CTA, image and alt text, acknowledgment, school scope, cadence, and publication window. Editing a published or archived creative creates a new version with a link to the previous one. The prior published version can remain eligible until its replacement is approved and reaches its start time. Stale draft revisions return a conflict instead of overwriting another editor’s work.

Upload PNG, JPEG, or WebP files up to 3 MB. The server decodes and normalizes still images, strips metadata, preserves aspect ratio/transparency, and rejects animation, SVG, mismatched file types, or excessive pixel dimensions. Each asset gets a new immutable object key and an ownership record. Sponsor artwork belongs to its sponsor; `card_front`, `card_banner`, and `card_full` are also sponsor-owned. Masthead and note artwork belongs to the publication.

### Which advertisement appears

`resolveTribunePublication` performs one database selection for the school, cadence, and publication timestamp. Both the brand and school placement must be active. The creative must be published, within its dates, applicable to the cadence and school, and publisher-approved if the selected placement requires review.

Eligible candidates are ordered by:

1. Higher placement priority.
2. A dated creative before an evergreen creative.
3. A school-scoped creative before an all-placement creative.
4. The newest creative start time and ID, then placement start time and ID.

Starts are inclusive; ends are exclusive. Empty creative school scope means all of that sponsor’s eligible Tribune placements, not every school in the database. Selection uses publication time, not the reporting period’s end date. A data or content error propagates instead of silently discarding a sponsor advertisement.

### Masthead and Publisher’s Note

Publication settings hold the optional masthead image, official rules URL, sweepstakes reminder, and postal address. The image replaces the visual title. The exact live tagline remains unless the saved image explicitly includes it. Image alt text is required, and the plain-text edition always retains the publication name and tagline. The fixed sports-column byline remains **YaTi | Ai Clubby & All Around Cool Dude**.

Publisher’s Notes use the separate `tribune_private.publisher_notes` table. They have their own title/signature, paragraphs, optional image/CTA, status, dates, cadence, school scope, and optional issue date. A school-specific eligible note takes precedence over a global one; ties use existing display order and ID. An issue date is the **America/Phoenix publication date**, so a Monday weekly edition reports the completed prior week while matching Monday’s note. Notes appear between the school/date header and the sports story in HTML and plain text. The existing public site-message storage and delivery channel remain independent.

### Title-sponsor flip cards

A title card needs its own explicit school placement in `tribune_private.school_sponsor_card_placements`. A newsletter placement or splash sponsorship alone does not grant a card slot. The publisher chooses the school, sponsor, status, dates, priority, optional paid order, and review requirement. An order is checked against the same permanent private claim used by newsletter placements, so detaching an order does not allow another brand to take it.

Sponsors edit their own front portrait, name, affiliation, status, alumni years, and card-back message. The level remains **SPONSOR** in browser validation, server validation, and the database. These cards never create player records or enter player statistics. Artwork must be an immutable upload owned by the selected sponsor, with the matching front/banner/full-back kind or its owned logo.

The three back templates are a banner and written message, a community-sharing message with an optional school-hub destination, and a full card-back image. Each needs the appropriate accessible image descriptions and required copy before submission. Drafts requiring review remain private until a publisher approves them. A newly assigned review-required school cannot display a card that was self-published for another school.

Published edits create successor versions. The gallery selects one eligible published card per sponsor, within both the placement and card dates; starts are inclusive and ends exclusive. The brand and placement must be active, a linked order must still be confirmed paid, and review-required placements require actual publisher approval. A future or expired card version can fall back to an eligible standing version. A paused, expired, cancelled, inactive, or unpaid placement supplies no public card. Preview reads the saved draft without publishing or sending anything.

## Immutable editions and both reading formats

The builder resolves publication content once and saves its selected masthead, note revision, creative ID/version, image URLs, sponsor acknowledgment, rules/reminder, and postal address with the edition. The advertisement and recap acknowledgment use the same saved sponsor. Subsequent campaign edits do not change a delivered issue.

The HTML and plain-text renderers read that same snapshot. Old snapshots without the new optional fields still render. The app role can insert and read saved editions, but cannot update or delete them. Public editions remove the recipient’s other-school follows, tier, and signed preference/unsubscribe links; the private copy keeps them. The raw private snapshot table is unavailable to public authentication roles.

## Shared API contract

All non-config requests require a verified Firebase Bearer token and return private/no-store responses. The corporate site proxies these routes on its own origin; the backend does not depend on a particular dashboard hostname.

| Route | Purpose |
| --- | --- |
| `GET /api/partners/config` | Public Firebase browser configuration and sign-in availability. |
| `GET /api/partners/dashboard` | Authorized publisher/sponsor dashboard, optionally selecting a sponsor. |
| `GET /api/partners/schools` and `/sponsors` | Bounded, authorized searches. |
| `POST /api/partners/brands`, `/creatives`, `/placements` | Scoped brand, advertisement, and publisher placement changes. |
| `POST /api/partners/cards`, `/card-placements` | Scoped title-sponsor card versions and publisher-only card assignments. |
| `POST /api/partners/notes`, `/publication`, `/memberships` | Publisher-only content, settings, and explicit identity grants. |
| `POST /api/partners/upload` | Authorized multipart artwork normalization and versioned upload. |
| `POST /api/partners/preview` | HTML and plain-text content proof using the production renderer; no mail, AI, or database write. |
| `POST /api/partners/card-preview` | Authorized proof of a saved card with publication warnings; no write or send. |

JSON requests are bounded to 32 KB. State changes and their audit rows execute together. Optimistic revisions protect creatives, notes, publication settings, and membership edits. Editing a membership requires its exact `id` and `revision`, updates that row, and never silently creates a second grant. Creating a duplicate grant returns a conflict. The acting publisher cannot reassign or disable their own active publisher membership. The content preview deliberately omits statistics and labels itself as a preview; real delivered editions still use the full roster and canonical tournament source.

## Privilege boundaries

The hardening migration revokes PUBLIC, anonymous, authenticated, and authenticator privileges on the portal tables, their identity sequences, private editions, control, preferences, and delivery ledger. RLS permits only the dedicated application role on these private tables. That role has SELECT-only approval access, append-only edition/audit access, and only the other operations used by the services. An operator remains responsible for approving delivery separately.

The shared site-message table retains its exact existing definitions, permissions, policies, and rows. Tribune notes are stored only in the new private table, so an older site-message client cannot modify the new publication through a shared message record. This isolation does not retroactively restrict access to historical shared content.

**Existing commerce authorization is a separate boundary.** This release deliberately preserves the legacy grants on sponsor brands, sponsor orders, and splash placements to avoid changing existing payment and placement jobs. The new app role receives only the required reads and brand writes. Those legacy direct-write grants require their own migration audit; this release does not claim to secure every older commerce path.

## Verification without sending email

Run the following from the backend repository. These commands load no live email provider:

```bash
node scripts/test-partner-access-assets.cjs
node scripts/test-tribune-publication-render.cjs
node scripts/test-tribune-publication-resolver.cjs
node scripts/test-tribune-delivery.cjs
node scripts/test-tribune-story-archive.cjs
node node_modules/typescript/bin/tsc --noEmit --pretty false --incremental false
node node_modules/eslint/bin/eslint.js src/lib/partners src/app/api/partners src/lib/tribune scripts/test-tribune-publication-render.cjs scripts/test-tribune-publication-resolver.cjs scripts/test-tribune-privileges.cjs
git diff --check
```

For real PostgreSQL checks, privately set `PARTNER_TEST_DATABASE_URL` to an isolated branch owner connection. It has no fallback to the production connection. Only that isolated owner needs SET permission on `yatstats_tribune_app` for the service-role test; the application role itself must still have no inherited memberships.

```bash
PARTNER_TEST_SERVICE_ROLE=yatstats_tribune_app node scripts/test-partner-content.cjs
node scripts/test-tribune-privileges.cjs
node scripts/test-tribune-cutover.cjs
```

The service integration test exercises the actual publication and card services, including ownership, review, immutable successors, stale revisions, order claims, dates, preview behavior, and membership replacement. Its default mode runs fixture work inside a transaction and rolls it back. The privilege test checks actual private-table/sequence permissions, unchanged legacy message reads/edits, private denial, restricted app writes, immutable saved editions, and inability to approve delivery or invoke the importer. Its data probes roll themselves back. `node scripts/test-tribune-privileges.cjs --sql` emits three statements for a managed SQL tool: run metadata/untrusted checks as the isolated owner and the application check as `yatstats_tribune_app`.

The cutover test runs only on a fresh held isolated branch. It creates synthetic profile/consent/history fixtures within a rollback block and tests canonical identity matching, explicit pilot limits, preserving unsubscribes and missing consent, conservative history import, changed-list rejection, repeat no-op, duplicate prevention, and a gate that remains disabled. `node scripts/test-tribune-cutover.cjs --sql` emits the same owner-only rollback probe for a managed SQL tool. This permits the same proof when a local PostgreSQL connection is unavailable.

The optional service-test `--http` mode is also isolated-only and additionally requires `PARTNER_TEST_ALLOW_AUTOCOMMIT=isolated-test-fixtures-only`; it creates tracked temporary fixture rows and verifies cleanup. Do not point it at production. The resolver test’s optional `TRIBUNE_TEST_DATABASE_URL` or `--sql` path uses SELECT-only boundary fixtures.

For visual verification, use the dashboard’s content preview and inspect both HTML and plain text. For real-data issue preparation, use the authenticated pilot preview endpoint with **`"send": false`**, an already authorized private pilot recipient, a valid report date, and the desired `previewCadence`. Review the returned readiness problems and both rendered formats. Do not invoke the cron route for a no-send test.

Before and after deployment, an operator can verify the hold with this read-only query:

```sql
SELECT enabled, approved_layout_version, cutover_complete_at,
  EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname='alumni_newsletter_approval_gate'
      AND tgrelid='tribune_private.alumni_daily_email_delivery'::regclass
      AND tgenabled<>'D'
  ) AS approval_trigger_enabled
FROM tribune_private.alumni_newsletter_control WHERE singleton=true;
```

Expected fresh held state is `false`, `NULL`, `NULL`, and an enabled private approval trigger. The production code must remain held until the separately authorized delivery approval. Completing a portal preview, saving a masthead, publishing an advertisement, or merging the code is not that approval.

## Held one-time delivery cutover

The private control begins with `enabled=false`, no approved layout, and no cutover completion. Application credentials can read control/cutover records, but cannot approve delivery, mark the cutover complete, or execute the importer. The scheduled and manual sender paths use only private control, preferences, snapshots, and ledger; there is no fallback to public authority.

A future authorized operator cutover must occur while the old sender is held and all old preference/sender requests are drained. Route new preference writes to private storage before the final copy; otherwise an in-flight legacy unsubscribe could be missed. Supply an explicitly verified private JSON array of at most seven `{firebase_uid,email}` pairs matching both the canonical profiles and the configured pilot audience to `tribune_private.import_legacy_pilot(jsonb, true)`, using the private-table owner. Do not store the real list in source or pass it through public endpoints.

The importer validates exact normalized identities, stabilizes the source with read locks, and copies only existing consent records and matching prior delivery attempts. It never infers a subscription from an account. `ON CONFLICT DO NOTHING` preserves newer private preferences, including an unsubscribe, and preserves prior private delivery claims. All historical attempt statuses remain claims; failed or in-flight attempts do not become automatic retries. A repeated identical import is a no-op, and a different identity list is rejected after completion.

Import completion does not approve a layout or enable mail. The replacement stays disabled until a separate explicit operator approval. Keep the old sender held through the entire transition: two independent ledgers cannot prevent each other from sending. Old saved email links retain the same route/signature contract, with future preference writes going to the private store. Historical public rows remain unchanged and retain their prior access characteristics.

## Rollback

Keep the private newsletter control disabled. Revert the application deployment or dashboard API rewrite if necessary, and pause a problematic placement or archive its creative/note through the authorized portal. Saved editions continue to use their original snapshots.

Do not enable the legacy sender as part of a rollback, copy private preferences back over legacy rows, drop private audit/snapshot records, or weaken private permissions to restore an incompatible deployment. Correct the private connection or redeploy compatible code. Retain versioned artwork referenced by saved editions. Credential rotation must not change recipient enrollment or delivery approval.
