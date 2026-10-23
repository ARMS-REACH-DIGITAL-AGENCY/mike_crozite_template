# Tribune publisher and sponsor portal

The shared `/api/partners/*` service manages the Tribune masthead, Publisher’s Notes, reusable sponsor identities, school placements, and dated advertisements. The corporate partner dashboard uses a same-origin rewrite to this service. Every school uses the same authorization, publication selection, and email renderer; there is no school-specific fork.

**Publishing content does not approve or send the newsletter.** The existing `tribune-v1` delivery gate, private pilot audience, recipient choices, and sending-domain checks remain independent. The release audit confirmed `enabled=false` and no approved layout version. Neither the portal nor its migrations enables delivery.

Release preparation on October 23, 2026: the limited production role and private connection configuration are prepared. The new editions, portal, and privilege migrations have passed on the isolated branch but **have not been applied to production**. Automatic approval review rejected that production schema/ACL/RLS action pending explicit approval of its shared-table effects. The schema rollout remains a separate approval step; the delivery hold remains in place.

## Database and environment setup

Apply migrations as the database operator, in dependency order:

1. Existing prerequisites: `sponsor_orders`, `site_message_campaigns`, user profiles, the delivery ledger, and `20261021_school_splash_sponsorships.sql`.
2. `20261022_tribune_approval_preferences.sql` establishes the disabled approval gate and recipient preferences. Preserve existing preference rows and the held control value.
3. `20261022_tribune_editions.sql` creates private and public edition snapshots.
4. `20261022_tribune_publisher_portal.sql` creates the portal records and adds optional Tribune metadata to site messages. Its compatibility `ALTER` also adds `publisher_approved` to earlier isolated installs.
5. `20261023_tribune_partner_privileges.sql` removes inherited public-auth access, grants the dedicated application role, and protects Tribune notes with row security. Apply the new schema and privilege migrations in one operator transaction on a production rollout so newly created private tables are never left exposed by default grants.

Create `yatstats_tribune_app` through SQL as a dedicated LOGIN role before the final migration. It must have no superuser, CREATE DATABASE, CREATE ROLE, BYPASSRLS, or inherited role privileges, and must not own the tables. Generate its password privately. Neon’s API-created role defaults are unsuitable here because they can include elevated role membership. The hardening migration rejects an elevated or inherited application role.

Configure **`TRIBUNE_DATABASE_URL`** privately with this role’s complete connection string to the same database as the shared player data. Production and isolated preview environments must point at their respective branches. `src/lib/tribune/db.ts` requires the dedicated credential, verifies TLS, and has no fallback to `PLAYERS_DATABASE_URL`, `DATABASE_URL`, or ambient PostgreSQL settings. Public player/fan/favorite lookups continue using the existing data connection.

The portal also uses the existing Firebase project/browser configuration and existing S3 upload configuration. The Firebase verification project must match the browser project. Artwork uses `YATSTATS_AWS_ACCESS_KEY_ID` / `YATSTATS_AWS_SECRET_ACCESS_KEY`, with the existing AWS-name fallbacks, and the bucket/region settings in `storyAssets.ts`. Never put database credentials, access tokens, recipient lists, or account UID grants into source files.

## Bootstrap publisher access from a verified identity

1. Have the intended publisher sign in to the configured Firebase project. Obtain that account’s **verified Firebase UID** through the authenticated account handoff or the Firebase administrator console. A profile label, email address, email domain, browser cookie, or client-supplied UID is not an authorization grant.
2. An operator can temporarily add this exact UID to private `PARTNER_PUBLISHER_UIDS`, or insert an explicit active publisher membership through the privileged operator connection. The environment bootstrap accepts at most 25 explicit UIDs; it does not bypass token verification or an unavailable authorization database.
3. Sign in as the authorized publisher, confirm dashboard access, and save the persistent publisher membership. Remove a temporary environment bootstrap after the durable grant is verified.
4. Grant each sponsor’s verified Firebase UID access to its specific sponsor ID. One user may have several explicit sponsor memberships. Sponsors cannot grant access, edit publication settings or notes, activate placements, or publish material requiring publisher approval.

The server verifies the Firebase Bearer token’s signature, issuer, audience, and expiry before loading memberships. Unknown, inactive, expired, or unavailable authorization fails closed. No existing test-account UID is treated as an administrator.

## Campaign workflow

Create or select a reusable sponsor brand. A new brand without an uploaded logo remains inactive with a neutral pending-logo image. Upload its logo, confirm its identity and destination, then activate it through the publisher account. A brand may sponsor multiple schools; its logo is stored once.

The publisher assigns explicit **Tribune placements** to schools, with status, priority, start/end timestamps, and whether publication requires review. Splash, footer, and player-profile sponsorships do not automatically become newsletter placements. A paid-order link is optional; when supplied, the service validates its school and paid state, and an atomic order claim prevents two brands from taking the same order. This portal does not charge a card or change payment status.

Sponsors save drafts and submit advertisements. A submission stays pending when its placements require review; only the publisher can mark that creative publisher-approved. A sponsor submission can publish automatically for placements explicitly configured without review. A newly assigned placement requiring review never serves a previously self-published creative unless a publisher has actually approved it.

Each creative contains its headline, copy, destination, CTA, image and alt text, acknowledgment, school scope, cadence, and publication window. Editing a published or archived creative creates a new version with a link to the previous one. The prior published version can remain eligible until its replacement is approved and reaches its start time. Stale draft revisions return a conflict instead of overwriting another editor’s work.

Upload PNG, JPEG, or WebP files up to 3 MB. The server decodes and normalizes still images, strips metadata, preserves aspect ratio/transparency, and rejects animation, SVG, mismatched file types, or excessive pixel dimensions. Each asset gets a new immutable object key and an ownership record. Sponsor artwork belongs to its sponsor; masthead and note artwork belongs to the publication.

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

Publisher’s Notes use `site_message_campaigns` with `page_key='tribune'`. They have their own title/signature, paragraphs, optional image/CTA, status, dates, cadence, school scope, and optional issue date. A school-specific eligible note takes precedence over a global one; ties use existing display order and ID. An issue date is the **America/Phoenix publication date**, so a Monday weekly edition reports the completed prior week while matching Monday’s note. Notes appear between the school/date header and the sports story in HTML and plain text. Generic site-message delivery excludes Tribune notes.

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
| `POST /api/partners/notes`, `/publication`, `/memberships` | Publisher-only content, settings, and explicit identity grants. |
| `POST /api/partners/upload` | Authorized multipart artwork normalization and versioned upload. |
| `POST /api/partners/preview` | HTML and plain-text content proof using the production renderer; no mail, AI, or database write. |

JSON requests are bounded to 32 KB. State changes and their audit rows execute together. Optimistic revisions protect creatives, notes, and publication settings. The content preview deliberately omits statistics and labels itself as a preview; real delivered editions still use the full roster and canonical tournament source.

## Privilege boundaries

The hardening migration revokes PUBLIC, anonymous, authenticated, and authenticator privileges on the portal tables, their identity sequences, private editions, control, preferences, and delivery ledger. RLS permits only the dedicated application role on these private tables. That role has SELECT-only approval access, append-only edition/audit access, and only the other operations used by the services. An operator remains responsible for approving delivery separately.

For the shared site-message table, RLS preserves preexisting access to non-Tribune rows and denies public-auth roles access to Tribune rows, including inserts and attempts to change another page’s row into a Tribune note. Existing RLS policies are preserved; a restrictive Tribune boundary cannot be bypassed by another permissive policy.

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
```

The default service integration test runs fixture work inside a transaction and rolls it back. The privilege test checks actual private-table/sequence permissions, legacy message reads/edits, blocked note reads/inserts/updates/deletes/page changes, trusted note writes, immutable saved editions, and inability to approve delivery. Its data probes roll themselves back. `node scripts/test-tribune-privileges.cjs --sql` emits three statements for a managed SQL tool: run metadata/untrusted checks as the isolated owner and the application check as `yatstats_tribune_app`. This permits the same proof when a local PostgreSQL connection is unavailable.

The optional service-test `--http` mode is also isolated-only and additionally requires `PARTNER_TEST_ALLOW_AUTOCOMMIT=isolated-test-fixtures-only`; it creates tracked temporary fixture rows and verifies cleanup. Do not point it at production. The resolver test’s optional `TRIBUNE_TEST_DATABASE_URL` or `--sql` path uses SELECT-only boundary fixtures.

For visual verification, use the dashboard’s content preview and inspect both HTML and plain text. For real-data issue preparation, use the authenticated pilot preview endpoint with **`"send": false`**, an already authorized private pilot recipient, a valid report date, and the desired `previewCadence`. Review the returned readiness problems and both rendered formats. Do not invoke the cron route for a no-send test.

Before and after deployment, an operator can verify the hold with this read-only query:

```sql
SELECT enabled, approved_layout_version,
  EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname='alumni_newsletter_approval_gate'
      AND tgrelid='public.alumni_daily_email_delivery'::regclass
      AND tgenabled<>'D'
  ) AS approval_trigger_enabled
FROM public.alumni_newsletter_control WHERE singleton=true;
```

Expected held state is `false`, `NULL`, and `true`. The production code must remain held until the separately authorized delivery approval. Completing a portal preview, saving a masthead, publishing an advertisement, or merging the code is not that approval.

## Rollback

Keep the newsletter control disabled. Revert the application deployment or dashboard API rewrite if necessary, and pause a problematic placement or archive its creative/note through the authorized portal. Saved editions continue to use their original snapshots.

Do not drop the additive tables, delete snapshots/audit records, restore broad public-auth grants, or remove the approval trigger as a rollback shortcut. Old code using the shared reader may lose access to the newly private records; that failure keeps mail held. Restore or correct the dedicated connection and redeploy the compatible service instead of exposing the private tables. Retain versioned artwork referenced by delivered editions. Rotate a compromised application credential privately without changing recipient enrollment or delivery approval.
