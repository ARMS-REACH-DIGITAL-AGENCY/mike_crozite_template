# YAT?STATS Sponsorship System — v1 Product & Implementation Specification
Status: proposed implementation blueprint; **not** a deployed checkout, ad server, CRM automation, or payout configuration. Approved product decisions must precede real-money activation.
Scope: every school hub/player profile through shared templates, without hardcoded player, school, or advertiser campaigns.

## Existing assets to reuse
- Shared player-profile News / Connect / Stories inventory in `src/app/[hsid]/player/[playerId]/[slug]/page.tsx`.
- Active Alumni News sponsor tower in `src/components/yatstats/NewsGallery.tsx`.
- Existing five packages, but **no prices assigned**, in `src/components/yatstats/PartnerProgramPage.tsx`.
- Existing footer creative requirements in `docs/sponsor-banner-specifications.md`: 1800x132 desktop, 750x132 mobile, rendered 66 CSS pixels high. These existing specs are NOT changed by this document.
- ARMS/HighLevel agency CRM and automations. Keep advertiser contact records, outreach, nurture, renewal triggers and pipeline there.
- Stripe for checkout, subscription billing, connected accounts, transfers and reconciliation.
- Neon (campaign/inventory/audit data), S3 (creative assets), Vercel/Next.js (placement and serving).

## Standard ad contracts (v1)
| Placement type | Display contract | Asset recommendation | Behavior |
|:--|:--|:--|:--|
| Player profile News/Connect/Stories desktop tower | 300x600 CSS px | 600x1200 WebP/JPG/PNG | One creative; fixed size; image `object-fit:contain`; no nonuniform scaling |
| Schoolwide Alumni News desktop tower | 300x600 CSS px | 600x1200 WebP/JPG/PNG | Same contract |
| Player Stories in-feed / narrow layout | 300x250 proportions | 600x500 WebP/JPG/PNG | Slot centers within available width, scales down uniformly; never crop |
| Schoolwide Alumni News in-feed | 300x250 proportions | 600x500 | Same |
| School hub footer | 66 CSS px tall | See `sponsor-banner-specifications.md` | Existing independent 2-variant contract |

Sponsor delivery: **two** creatives for tower + in-feed, OR logo+headline+body+CTA automatically composed into two templates and proofed before publication. Keep text/logo/CTA >=5% from canvas edges, validate image dimensions, accept only owned/licensed rights, display with exact aspect ratio. For ads requiring <300px CSS width, scale uniformly or choose the smaller in-feed template; do not `object-fit:cover` completed artwork. CTA clickable wrapper URL is metadata, not embedded in image. Provide visual proof at desktop, tablet-with-docked-drawer, and phone breakpoints.

## Current package inventory: no pricing decisions have been approved yet
1. School Title Sponsor: splash / active+all-time+current card galleries / school Alumni News / eligible correspondence.
2. Active Player Profile Partner: three profile tabs (News, Connect, Stories).
3. Retired Player Profile Partner: similar inventory.
4. Fantasy Bracket Partner: available scoreboard-adjacent inventory only in eligible states.
5. All-Time Team Year Sponsor: year banner + Row-5 matched offer jointly.

Track exclusivity and finite inventory with school_id + product_type + optional player_id/team_year + placement_type + period. Reserve a position during checkout with expiry, preventing two buyers claiming the same exclusive unit.

## Sponsor self-service flow
1. School/referral deep-link carries `hsid`, optional `playerid`, inventory selection, attribution token and referring program.
2. Sponsor selects package, term, exclusive/shared inventory, sees price, sample traffic metrics and no unsupported reach guarantee.
3. Sponsor enters organization/contact, destination URL, logo/creative (or "design it for me" brand fields), and legal use/advertising consent.
4. Server validates safe uploads/URLs; creates **draft creatives** and renders visual proof at all supported slots. Sponsor explicitly approves versioned proof.
5. Stripe Checkout creates invoice/subscription (one-time only for products that require one-time billing), keyed to a persistent sponsorship order and idempotency key.
6. Verified payment webhook activates approved campaign after required identity/review/content checks. Never trust redirect-to-success alone; failed/unpaid subscriptions must not publish ads.
7. Campaign is selected from active, paid, approved inventory; fallback house ad advertises school golf tournaments, Alumni Game, fundraising or YAT?STATS.
8. Sync lifecycle to ARMS contact/opportunity and workflow: purchased, proof approved, active, performance digest, card failures, nearing renewal, renewed, cancelled.
9. Sponsor dashboard: date filters, viewable impressions, unique estimated reach (with caveat), clicks, CTR, referrals/leads, booked calls (if tracked), active slots, payments/receipts and renewal CTA.

## Campaign delivery & attribution
- `ad_slots`: stable slot ID, school scope, page/section, type, dimensions, eligibility, capacity and status.
- `sponsor_organizations`, `sponsor_contacts`, `campaigns`, `creative_assets`, `proof_approvals`, `orders`, `order_line_items`, `agreements`, `payout_obligations`, `payout_transfers`, `impression_aggregate_daily`, `clicks` / `conversion_attribution`.
- `campaigns`: `status`, `school_id`, `player_id?`, `slot_id`, `start_at`, `end_at`, `weight`, `stripe_subscription_id`, `approved_creative_version`.
- For shared (nonexclusive) inventory choose one eligible paid/approved creative per slot with weighted rotation; choose once per rendered page view, not every scroll/render. Avoid per-player hardcoding. Maintain session stability where appropriate.
- CDN/edge-cache active campaign candidate manifests briefly, make one batched slot request rather than N database reads. Store small impression events asynchronously (queue/batched ingestion); aggregate and deduplicate to protect Neon from bot-driven rapid traffic.
- Viewable impression standard for display: >=50% visible for >=1 continuous second; filter likely bots; separately report *served*, *viewable*, *clicks*. Do not sell raw page requests as human impressions.
- Track clicks through a safe server-side redirect with validated destination HTTPS allowlist/security controls and click IDs; never render user-supplied HTML/JS.
- Report source-school attribution and lead outcomes from ARMS on a per-campaign basis, without putting fan PII in advertiser analytics.

## Stripe Connect settlement
- School legal entity onboards through Stripe Connect-hosted onboarding; store `connected_account_id` and Stripe status, never bank information in ARMS/Neon.
- A 70% school / 30% YAT?STATS proposal requires a signed definition of *base amount* (gross vs net of processing fees), refunds, tax, chargebacks, reserves, payout cadence and reversals.
- Single school beneficiary: Stripe Connect destination charges or recurring destination/transfer data when supported by exact billing flow.
- Multiple beneficiaries (player+school+platform): Stripe Connect separate charges and transfers; requires explicit per-product contract and available-balance handling, refund and reversal reconciliation.
- For each transaction snapshot the **agreed terms effective at purchase** (beneficiary account IDs, percentages, currency, fees, contract version). Never recompute old transfers using a later rate table.
- Reconcile Stripe webhook event IDs idempotently, link charge/invoice/transfer/refund/dispute to one order, post compensating adjustments for refunds, and report pending/paid/failed obligations. Do not label a transfer "paid out to bank" before actual payout status.
- Athlete experiences: separate contract with athlete/guardian as required; division of payout controlled by signed eligibility/terms, not a global school setting. Include rights, fulfillment conditions, cancellation, sanctions and age/eligibility review.
- Validate tax/reporting/compliance (including potential 1099 obligations and school fund disposition) with qualified advisors. "Sponsorship advertising" is not automatically a deductible donation.

## Recommended rollout
1. **UI/sizing QA:** fix fixed tower and mobile/in-feed placeholders across two page types; test 320 / 390 / 768 / 1024 / 1280 / 1440 / 1920 widths, drawer open/closed, dark/light, actual player and schoolwide pages.
2. **Campaign MVP** (without self-service billing): school house creative + sponsor free-trial creative, admin-managed activation and measurable viewable impressions, clicks and test reporting. No demo numbers invented.
3. **Paid pilot**: one school, one title placement plus one player placement; sponsor proof + Stripe Connect in test mode, validate webhooks/renewals/refunds.
4. **Automation:** ARMS CRM sync, paid checkout, versioned approvals, school share, renewal workflow, sponsor portal.
5. **Scale:** multi-school inventory, weighted rotation, self-serve creative generator, local sponsor referrals, player Connect split payouts and school portals.

## Acceptance gates
- No content taller than 600px stretches the tower; no ad variant causes page overflow.
- Completed image stays completely visible without cropping at any screen size.
- Open account/favorites/contribute drawer never dims or intercepts the remaining Stories feed on docked-capable screens.
- Never deliver stale/unpaid/unapproved campaigns as paid sponsor inventory.
- A single view never generates repeated DB lookups or impression spam.
- Checkout duplicates/refunds/subscription changes cannot double-charge, double-serve, or double-pay.
- Every campaign and payout can be traced to its proof and signed terms.
