# YAT?STATS — Canonical Punch List (2026-10-10)
Status: Planning / implementation tracking. Owner: Pete. **Work only on preview branches; do not merge to Easter-NEWS without explicit approval.**
This document is a handoff for any agent. Verify live code before edits, avoid speculative fixes, and record commit/preview evidence for completed tasks.

## Immediate priorities / small fixes
- [ ] **Launch YAT?STATS homepage** (separate main site from school subdomain template as appropriate); verify live URL, then wire the four footer ticker icons to real destinations: FANS, PLAYERS, SCHOOLS, PARTNERS. Do not invent destinations; inspect existing homepage and routing first.
- [ ] Side nav labels and spacing: WHERE THEY, ACTIVE ALUMNI, HIGH SCHOOL TEAM, BRACKET TOURNEY, ABOUT US; CONNECT thin font.
- [ ] Rename NEXT-LEVEL ALL-TIME LIST to **ALL-TIME NEXT-LEVEL LIST** everywhere including header/nav.
- [ ] Shrink Alumni News 'FLIP FOR FULL RECAP' pill.
- [ ] Alumni News filtered banner: 'SHOWING NEWS FOR [PLAYER]' single compact line, SHOW ALL compact single-line pill, remove yellow selection outline.
- [ ] Selected headshot player names bold yellow scoreboard font.
- [ ] 2027 HIGH SCHOOL TEAM Row 3 logo click scroll: existing committed/uncommitted logos work; do NOT flip/open cards; scroll card to immediately below sticky Row 3 bottom, matching working Active Alumni gallery.
- [ ] Light theme: yellow-on-white text contrast fix sitewide (darker accessible shade).
- [ ] 2027 UNCOMMITTED icon: **already working; do not redesign**.

## Remaining site improvements
- [ ] Branded animated splash screen, compare hamilton.yatstats.com / hamilton_mvp prototype and supplied MLB/FOX/MiLB references; do not delay real loading.
- [ ] Sitewide favorite stars -> hearts, preserving behavior.
- [ ] Alumni News headshots missing on initial load until refresh: diagnose root cause.
- [ ] Alumni News card back: transparent player cutout bottom-left ahead of CTA to player profile.
- [ ] ALL-TIME NEXT-LEVEL LIST Row 3: class-of letterman-jacket icons filter by grad year. ALL-TIME icon defaults to full A-Z gallery; clicking it RESETs class filter, restores A-Z and OPENS existing right filter drawer with name search. No player-specific Row 3 headshots or click-to-scroll. Drawer stays closed on initial load. Row 5 exact: 'WHERE THEY YAT NOW? Flip to share a NEXT-LEVEL alum\'s whereabouts or discover how to claim an alumni profile page!'
- [ ] FAQ Row 3 selectors ABOUT, PLAYERS, STORIES, CONTRIBUTE, SUPER FANS, FANTASY, CONTACT with smooth section navigation.
- [ ] PARTNERSHIP Row 3 selectors WHAT?, WHY?, WHEN?, WHERE?, HOW?.
- [ ] Fantasy page: standalone World Series trophy graphic, no full background; ticker fade starts earlier; Row 5 message synchronized to 10-second hero rotations. Trophy copy: 'WIN A TRIP TO THE 2027 FALL CLASSIC! Register as a Fan or SuperFan Today!' CTA opens existing Account/Join drawer. **Do not activate tournament before Feb 1 2027**; test/bracket-1 through -6 are test branches only.

## Connect & Contribute — approved product direction
- [ ] **Public discovery; authenticated submission only**: unregistered/logged-out visitors may preview options, but only registered logged-in fans may upload, submit, or transact. Verify auth server-side and preserve context after sign-in.
- [ ] Do NOT build a duplicate three-page mini-site. Provide a simple Connect & Contribute directory; add discreet contextual entry points on real pages and a special non-player gallery contribution card alongside a future sponsorship card.
- [ ] Add a small YAT?STATS logo/watermark **top-left of each player flip card**, reminiscent of Topps manufacturer mark. Clicking it opens ONE reusable context-aware contribution drawer with unique player ID/school ID and fan account prefilled; must not flip card or trigger scrolling. 60K instances, one component. Keep current gallery/headshot interactions and card layout intact.
- [ ] Populate existing blank CONNECT Fun Zone tab on flip-card back: explain logo = contribute; link to contribution directory and paid engagement options (sponsorship, paid player messages/video-response opportunities).
- [ ] Use existing Global Search to select existing player/school; where launched from card/search result, preselect stable record ID and visibly confirm selection. Include 'Can't find player? Add missing alumnus' with duplicate review.
- [ ] Context-aware consolidated drawer with optional photo, graduation/varsity years, history, corrections, news; contributor identity, record ID, source and moderation/review tracked. Do not make users open five drawers. Prioritize missing HS headshots, missing players, missing school logos, then data corrections, then enrichment.
- [ ] Add school search result action 'ADD SCHOOL LOGO' near fallback crest, preselect school record. Preserve school logo fallback.
- [ ] One approved news tip may surface in Alumni News, player profile Fun Zone News, and flip-card Fun Zone News; fan submits once, platform distributes. Personal memories/stories belong to player Career Path Timeline, NOT Connect & Contribute.
- [ ] Investigate existing forms/uploads/payments/auth/drawers before implementation; reuse, don't duplicate.
- [ ] Printed collectible cards/QR-linked live stats/possible future AR are future product opportunities, NOT required for current sprint. Keep stable player identifiers and consider permissions/licensing. Print-inspired visual treatment is separate and must not disturb card layouts.

## Footer details (verify before editing)
- [ ] Row 5 fades every 4–5s between 'WELCOME TO THE [SCHOOL NAME] ALUMNI COMMUNITY HUB ON YAT?STATS' and 'BROWSE AS A VISITOR OR REGISTER FOR FREE AND BECOME A FAN OF THE PROGRAM.' Left-aligned near YaTi, desktop one line/mobile two, no 1/4 pager.
- [ ] Ticker four icons: baseball field FANS, batter PLAYERS, flag SCHOOLS, handshake PARTNERS; scroll right-to-left slowly, gold Doto text/orange labels; touch pause auto-resume after 5s; fade avoids YaTi. Link icons only after verifying homepage destinations.

## Workflow
1. Inspect canonical files and live behavior first.
2. Make smallest changes in this preview branch, grouped into independently verifiable commits.
3. Verify with preview/browser/screenshots when available; mark checklist done only with evidence.
4. Never merge or deploy production without explicit Pete approval.

## Branch incident and guardrails (2026-10-10)
- **Incident:** The initial documentation branch `chore/oct10-punch-list-and-quick-fixes` was mistakenly created from `Easter-NEWS`, an older layout baseline. Quick-fix commits were then mistakenly made there. A preview from that branch showed regressed banner/footer elements. This was a branch-baseline error, not a deliberate revert.
- **Recovery:** The quick fixes were **reapplied independently**, not merged or cherry-picked, on `fix/oct10-quick-fixes-from-gallery-led`, based on `feature/gallery-led-icons-oct10`. The correct branch retains `src/components/yatstats/shell/ClubhouseFooter.tsx` and the ticker.
- **Verification:** GitHub compare `feature/gallery-led-icons-oct10...fix/oct10-quick-fixes-from-gallery-led` reports seven commits ahead, zero behind, modifying only this punch list and six intended code files. The wrong `chore` branch remains in GitHub; **DO NOT deploy or merge it**. It is obsolete and should be deleted when branch-deletion access is available.
- **Mandatory preflight for every agent:** Confirm the agreed base branch, compare against it, check the footer ticker and ad layout exist, and verify Vercel preview branch/commit before presenting a preview. Never silently switch to `Easter-NEWS` or another branch. Never claim visual QA until verified.
- **Current work branch:** `fix/oct10-quick-fixes-from-gallery-led`; **production branch:** `Easter-NEWS` (no merge authorized). No production deployment or merge was performed for these fixes.

## Footer comparison and Fantasy requirements (2026-10-10, screenshot review)
- **Gallery is visual reference:** The Active Alumni gallery uses `ClubhouseFooter` with a full-width ticker and YaTi/message/alumni metadata above. Fantasy currently uses a separate `BracketTicker` rendered by `SharedShell`, with a region scoreboard ticker, sponsor label and `/img/world-series-trophy-cta.jpg` raffle graphic. Do not confuse Row 5 metadata with Row 6 ticker.
- [ ] **Fantasy footer parity:** Make Fantasy's Row 5/Row 6 use the same full-width visual layout and responsiveness as the gallery. Preserve existing Fantasy score/region functionality where needed; do not replace it blindly with a generic marquee. No sponsor or raffle graphic may constrict the ticker width. Ensure visual parity on phone and desktop.
- [ ] **Trophy:** Remove the existing low-quality/boxed World Series image and use a genuine standalone transparent trophy artwork, with CTA opening existing Account/Join drawer. Verify suitable approved asset before implementation; do not invent one or claim it exists.
- [ ] **Message fitting contract:** The gallery Row 5 text currently wraps to three lines and clips on phone and wraps/clips on desktop. Limit text to one line desktop/two lines mobile, allow font-size/letter-spacing/count-area adjustments or increase available height, but never hide or truncate text. Define a maximum content length or responsive typography rule for future metadata messages. Test both rotating messages and long school names on multiple widths.
- [ ] **Fantasy rotating message:** Sync Fantasy Row 5 copy to its hero rotation every 10s, including the trophy CTA copy already recorded above.
- **2026-10-10 partial code change:** `ClubhouseFooter.tsx` responsive message font reduced in commit `b3d1b17`. Not visually verified. Fantasy parity/trophy are NOT implemented yet.

## Neon-backed shared message area implementation (2026-10-10)
- Neon project **Players** `round-recipe-12286668`: created `public.site_message_campaigns` with page key, optional school HSID, text, optional image/CTA, ordering, duration, publication status and date windows; delivery index added. Inserted initial published Active Alumni and Fantasy messages. **No destructive database changes.**
- Working GitHub branch `fix/oct10-quick-fixes-from-gallery-led`: created `src/app/api/site-messages/route.ts` (published-only reads), `src/components/yatstats/shell/PageMessageStrip.tsx` (one common Neon-driven Row 5), and updated `SharedShell.tsx` to place the common strip above page-specific full-width tickers. Detached old hardcoded message row from `ClubhouseFooter.tsx` and old sponsor/trophy row from `BracketTicker.tsx`.
- **IMPORTANT: This is a first implementation, not visually or build verified.** Do not merge to production until preview build passes and desktop/mobile Row 5/Row 6 layouts are checked. The prior hardcoded school-specific greeting was replaced by generic seeded copy; restore school-specific wording using message templating if desired. The real transparent World Series trophy asset, synchronized Fantasy hero, message editing/publishing UI, sponsorship inventory, and overflow validation are follow-up tasks.
- Architecture: one reusable layout, distinct per-page/per-school message campaigns, separate ticker types. Draft/staged messages are not shown; published and date-eligible records only. No admin editing API has been added.
