# SEO / AEO handoff (Nov 9, 2026)

Paste this into a new Claude Code session to continue the SEO work.
The full plan lives in `docs/seo-aeo-strategy-2026-11.md`. Read it and
`CLAUDE.md` first.

## The goal (Pete's words, Nov 8)

- Not "the list guy" and not a ranking site. YAT?STATS is **the place you go**
  for where a high school's baseball alumni went and what they did.
- **We tell the story of a player's journey**: little league, high school,
  college, the draft, the minors, the majors, plus the stories and photos
  along the way. Most sites have stats; only YAT?STATS shows the whole path.
- Every school page should plainly answer: "Over the years, this program has
  produced X major leaguers, Y drafted players, and Z are playing in college
  or pro ball today." Facts for all ~17,000 schools, not a ranking.
- Be complete and right: every school, every player, official level names,
  updated daily. Accuracy is the edge.

## Done and live

| What | Where |
|---|---|
| Sitemap index for all school sites (17,112 schools after retiring duplicate hsids) | `https://sitemaps.yatstats.com/sitemap.xml`, one child sitemap per school (hub + Active Alumni profiles); PR #704 |
| `robots.txt` points to the sitemap on every subdomain | PR #704 |
| Duplicate TBC schools (72 `^`/`^^` pairs) folded into one site each | PR #704 |
| School titles/descriptions rewritten for real searches, e.g. "Hamilton Baseball Alumni - Chandler, AZ \| YAT?STATS" / "Where Hamilton (Chandler, AZ) baseball alumni play now: 47 active in college and pro baseball..." | PR #705 |
| AI search bots (OAI-SearchBot, ChatGPT-User, PerplexityBot, Perplexity-User, Claude-SearchBot, Claude-User) may read **school sites**; player pages and `/api/` stay blocked to them; training bots stay blocked | PR #705, decision recorded in the strategy doc |
| Player pages tell the journey in search results: title "Cody Bellinger's Baseball Journey: Hamilton to New York Yankees \| YAT?STATS", description "...played high school baseball at Hamilton in Chandler, AZ. Now with New York Yankees (MLB)...", hidden structured data naming his high school and current team. "Now with" is left out for FREE AGENT / RETIRED / no verified team. No visible layout change. | commits b874ec97, 58881987 |
| GA4 connected through Windsor.ai. Baseline (last 30 days, Nov 8): 13 users from Google search, 3 from AI assistants | |

## Waiting on Pete

1. **Google Search Console:** add a Domain property for `yatstats.com`, send
   Claude the `google-site-verification=...` value (Claude adds the DNS TXT
   record on Vercel), click Verify, then submit
   `https://sitemaps.yatstats.com/sitemap.xml`. Then Bing Webmaster Tools:
   import from Google. Then link Search Console to GA4.
2. **Your own visits inflate GA4:** open any YAT?STATS page once with
   `?yat_internal=1` on each of your devices so GA stops counting them.
   Realistic Hamilton outside traffic was ~50 people, not 136.

## Scheduled

- **Nov 22, 2026:** a scheduled check in the original session compares database
  load (Vercel / Neon) for the two weeks since the AI bots were let in. If
  load is flat, propose step 2: open **player pages** to the AI search bots
  (remove the `/*/player/` line for them in `public/robots.txt`). It also
  compares Google and AI-assistant visitors to the Nov 8 baseline.

## Next, in order (from the strategy doc)

1. **Row 5 / school facts on every hub**: MLB alumni, drafted players, active
   alumni, as stored numbers (`school_success`), read on page load, no live
   math. The MLB count is now kept current daily (+1 on a new MLB debut). The
   drafted count is NOT ready: rebuild it from `mlb_draft_picks_all` (every
   MLB draft pick 1965-2026, all five phases, matched to our players) before
   showing it.
2. **Structured data (JSON-LD)**: school hub `SportsTeam` + `ItemList` of
   alumni + `BreadcrumbList`; player `ProfilePage` / `Person` with
   `alumniOf`; yatstats.com `Organization` + `WebSite`. Hamilton first,
   then the 20-30 hero schools, then all.
3. **Plain-sentence summaries answer engines can quote**: hub summary
   paragraph and a short data-built FAQ per hub ("How many Hamilton alumni
   play pro baseball?").
4. **yatstats.com as a directory**: state pages listing schools with alumni
   counts; cross-school teammate links.
5. **Authority**: links from each school's athletic / booster site, local
   media "where are they now" stories, UTM-tagged share cards, Organization
   `sameAs`.

## Related, outside SEO

- **Hamilton sponsor sheet** (draft, Nov 8): built from Windsor/GA4. Open
  question: show 47 active alumni (site, incl. 3 on injured lists) instead
  of 44. Idea: a monthly per-school sponsor sheet from Windsor.
- **Fall Classic Sweepstakes**: free entries come from approved high school
  photos of any player (max 3 per round); mail-in removed (PR #704). The
  Official Rules page is a draft for Pete's lawyer.
- **~1,324 schools have no `school_success` row** (mostly Canada and Puerto
  Rico): they are in the sitemap but have no stored numbers.

## Rules that apply (see `CLAUDE.md`)

Official level names only (MLB, TRIPLE-A, ... NCAA-D1, NJCAA ...); never
guess a team or level; explain every approval request in one plain sentence
first; one question at a time; the truth is there, find it.
