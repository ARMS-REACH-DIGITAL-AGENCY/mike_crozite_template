# YAT?STATS SEO + AEO Strategy (Nov 2026)

Written after reviewing Grok's audit against the codebase. Phases are in priority
order; each item names what changes and how we know it worked.

## What the code shows (vs. the Grok audit)

| Grok claim | Actual state |
|---|---|
| No robots.txt | **Wrong.** `public/robots.txt` exists and is served on every host. It allows search engines and blocks `/api/` plus ~25 AI and SEO crawlers, added after crawlers took the database down on Oct 11, 2026. |
| No sitemap.xml | **Correct.** `/sitemap.xml` fell through to the `[hsid]` route and returned a `noindex` 404. **Fixed in this branch.** |
| Little or no schema markup | **Correct.** There is no JSON-LD anywhere in `src/`. |
| School meta/OG are good | **Correct.** Hubs and player profiles set title, description, canonical, OG and Twitter images. |
| Main domain is thin | **Correct.** yatstats.com is a landing page with no crawlable school directory. |
| AEO grade C | **Worse than C.** The robots.txt blocks `OAI-SearchBot`, `ChatGPT-User` and `PerplexityBot`, so ChatGPT Search and Perplexity cannot read or cite us at all. |

## Phase 0: shipped today

- `https://sitemaps.yatstats.com/sitemap.xml` is a sitemap index with one child per live
  school (`school_success.microsite_url`): `/sitemaps/school/<hsid>.xml` lists
  the hub and its Active Alumni profile URLs on the school's own subdomain.
- `robots.txt` now has `Sitemap: https://sitemaps.yatstats.com/sitemap.xml`. Every
  subdomain serves that file, which is Google's documented cross-site sitemap
  method.
- **Crawl-load guard.** The sitemap only lists the Active Alumni players already
  shown in each gallery, not every all-time player. Both levels are cached for
  24h, so reading the sitemap costs one DB query per school per day. If the DB
  is down, the sitemap returns 503 instead of an empty list.

Verified on the branch's Vercel preview (Nov 8): the index lists 1,025
school sitemaps; Hamilton's (`/sitemaps/school/5004.xml`) lists the hub and
48 profiles, and a listed profile URL loads with a matching `og:url`.

**Before submitting to Search Console, check after the production deploy:**
`https://sitemaps.yatstats.com/sitemap.xml` renders the index; 2-3 school sitemaps
list real URLs; `robots.txt` on the root and on 2 school subdomains shows the
`Sitemap:` line.

## Phase 1: this week (setup only, no code)

1. **Google Search Console: Domain property for `yatstats.com`** (DNS TXT
   verification). One property covers every school subdomain. Submit
   `https://sitemaps.yatstats.com/sitemap.xml`.
2. **Bing Webmaster Tools.** Import the GSC property. Bing's index also feeds
   ChatGPT Search and Copilot.
3. **Baseline.** Record indexed pages, impressions and the top queries for
   Hamilton and Basha now so later phases can be measured.
4. **Watch DB load for 2 weeks** (Vercel function duration, Neon connections).
   Googlebot adapts its crawl rate to how fast pages respond. If profile pages
   slow down, cache them before adding more URLs.

### Checkpoint after 14 days (decides whether to start Phase 3)

| Signal (GSC / Bing / Vercel / Neon) | Moving | Stalled: fix first |
|---|---|---|
| Sitemap status | "Success", 0 errors | Fetch or parse errors |
| Submitted URLs indexed | 30%+ and rising | Under 10%: check "Crawled - not indexed" reasons |
| Impressions for school/player queries | Up on the Phase 1 baseline | Flat |
| Googlebot crawl stats | Avg response under 1s | Rising response time |
| Neon connections / Vercel function errors | No change from baseline | Timeouts: cache profiles first |

## Phase 2: AEO crawler policy (Pete's decision)

Record the decision and its reasoning as a dated entry in this doc and in
the `robots.txt` comment, the same way the Oct 2026 blocks were explained.
Change it with a reviewed PR, never as a side edit.

**Decision, Nov 8 2026 (Pete): step 1 approved.** OAI-SearchBot, ChatGPT-User,
PerplexityBot, Perplexity-User, Claude-SearchBot and Claude-User may read
school sites; player pages (`/*/player/`) and `/api/` stay blocked for them.
Training bots stay blocked. Reason: AI assistants already sent 3 users and 24
sessions in the 30 days before (GA4), with every search bot blocked; being
readable lets them cite YAT?STATS. Step 2 (player pages) after 2 weeks of flat
database load.

The October bot blocks prevented outages, but they also make us invisible to
answer engines. There are two kinds of AI bot:

- **Search and citation bots**, which fetch a page when a user asks a question
  and then link back to it: `OAI-SearchBot`, `ChatGPT-User`, `PerplexityBot`,
  `Claude-SearchBot`, `Claude-User`. Recommendation: **allow** these. They
  crawl far less than training bots and every answer they give includes a link.
- **Training and bulk bots**: `GPTBot`, `ClaudeBot`, `CCBot`, `Bytespider`,
  `meta-externalagent`, `Amazonbot`, plus the SEO scrapers. Recommendation:
  **keep blocked**.

Do this only after Phase 1 shows the DB holds under Googlebot. Also add a
Vercel Firewall rate-limit rule per user agent as a backstop. Google AI
Overviews use Googlebot, which is already allowed, so they need no change.

## Phase 3: structured data (2-3 weeks)

Add JSON-LD in `generateMetadata` and page components, using data the page
already loads (no new queries):

- **School hub:** `SportsTeam` (the high school team, `@id` = microsite URL)
  + `ItemList` of Active Alumni (`Person` items linking to profile URLs) +
  `BreadcrumbList`.
- **Player profile:** `ProfilePage` whose `mainEntity` is a `Person` with
  `name`, `image`, `alumniOf` (the high school), `memberOf`, a `SportsTeam`
  for the current team using the official level label (e.g. `NCAA-D1`,
  `TRIPLE-A`, never "AAA"), and `sameAs` (MLB, school roster, Instagram)
  where we already store it.
- **yatstats.com:** `Organization` + `WebSite` with a `SearchAction`.

Roll out in order: Hamilton first (validate with Google's Rich Results
Test), then the 20-30 hero schools with the most Active Alumni, then all
hubs once Search Console's Enhancements report shows no errors.

## Phase 4: content answer engines can quote (ongoing)

Answer engines quote plain sentences, so pages need visible text, not just
stat grids.

- **Hub summary paragraph, generated from data:** "<School> (<City>, <ST>)
  has <N> active alumni playing baseball in 2026: <n> in MLB, <n> in
  TRIPLE-A ..." (all counts read from the gallery data, never typed by hand) This directly answers "where are Hamilton baseball alumni now".
- **Player summary sentence:** "<Name>, Hamilton class of 2019, plays for
  <team> (<official level>). 2026: .287 AVG, 12 HR." Show updated dates.
- **Short FAQ block per hub**, marked up as `FAQPage` and built from data:
  "How many Hamilton alumni play pro baseball?", "Who is the highest-drafted
  ...?"
- **Every level label follows the official list** in `CLAUDE.md`.

## Phase 5: directory and internal links (Q1 2027)

- **yatstats.com becomes a directory:** crawlable state pages
  (`/az`, `/tx`, ...) listing live schools with alumni counts, and a "this
  week's milestones" feed. This lets authority flow from the root to the hubs.
- **Cross-school links:** profiles link to college/pro teammates on other
  hubs. These are server-rendered `<a href>` links, not click handlers.
- **Grow sitemap coverage** to all-time players one school at a time, only
  where page caching makes it safe.

## Phase 6: authority (ongoing)

- **School links:** ask athletic directors and booster clubs to link the hub
  from their baseball page. One link from each school's .org/.edu domain is
  worth more than any other tactic here.
- **Local media:** pitch a "where are they now" story per launch market, with
  the hub as the source.
- **Shareable cards:** player share links already carry OG cards. Add UTM
  tagging so GA4 attributes social traffic.
- **Brand entity:** a consistent name ("YAT?STATS") and `sameAs` links from the
  Organization schema to LinkedIn, YouTube and Facebook. Consider a
  Wikidata entry once there is press coverage.

## KPIs (review monthly in GSC/Bing)

- Indexed URLs vs. submitted (target: 80%+ of sitemap URLs within 60 days)
- Impressions and clicks for `[school] baseball alumni` and `[player name]`
  queries
- Rich result eligibility (Enhancements report)
- Referrals from chatgpt.com, perplexity.ai and copilot in GA4 (after Phase 2)
- DB health under crawl load: no repeat of Oct 11
