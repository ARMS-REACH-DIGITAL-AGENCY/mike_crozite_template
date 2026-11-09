# Claude's open task list (Pete's requests)

This list is built from every message Pete sent in session
session_01JbCbTx7jQy3xZACZs449Uy (Nov 8-9, 2026). Claude updates it whenever
something is added, finished or blocked. Nothing gets dropped silently.

Last updated: 2026-11-09 14:10 UTC

## Pete asked for it, and it is NOT done

| # | Task | Asked | Status |
|---|------|-------|--------|
| 1 | Update the ~200 schools whose stored MLB count (`school_success.mlb`) is lower than their real MLB debuts. Back up first. | Nov 9 08:53 ("Yes" to step 2) | **Dropped by Claude. Not done.** |
| 2 | Find out why the Monday draft import didn't run on its own (last scheduled run Nov 2). | Claude promised Nov 9 13:55 | **Not done.** |
| 3 | 561 cards are ACTIVE with no team and no level. Pete's rule: an ACTIVE 2026 player always has a team from his stat line's Team ID. | Nov 9 06:31 | **Not done.** Found during this list check. |
| 4 | 3 FREE AGENT / RETIRED cards still show a team. | Nov 9 06:39 rule | **Not done.** Found during this list check. |
| 5 | Scan INDY rosters every day and catch released FREE AGENTS who sign there. | Nov 9 13:54 | **Not built.** Part 1 (read all players, not the top 500) is on branch `ccr-0323126e-3ihtzc`, commit 26478a53, with no PR yet. Part 2 needs a roster source: the iScore API test needs Pete's network approval. |
| 6 | Enrichment, step 3: retired vs. active from MLB's last-game date. | Nov 9 08:43 ("All of them") | Not started |
| 7 | Enrichment, step 4: bios (bats, throws, position, height, weight, draft info) and career stats into `flip_card_front_stage`. | Nov 9 06:23-06:25 | Not started |
| 8 | Enrichment, step 5: minor-league stats from 1988, and awards. First test what MLB actually has. | Nov 9 08:43 | Not started |

## In progress

| # | Task | Status |
|---|------|--------|
| 9 | Check that the post-#727 transaction sync worked: Senzel ACTIVE with Lexington Legends (INDY), Nittoli FREE AGENT · MLB with no team, Ryan Jensen FREE AGENT · TRIPLE-A with no team. | Run 42629897830 is running. Check scheduled for 15:15 UTC. |
| 10 | Nov 22: check whether letting AI search bots onto school sites strained the database. If not, propose opening player pages to them. Compare Google and AI visitors with the Nov 8 numbers. | Scheduled for Nov 22 16:00 UTC |

## Waiting on Pete

| # | Question |
|---|----------|
| 11 | Open a PR for the INDY 500-cap fix (#5)? |
| 12 | Approve network access so Claude can test whether the iScore API has INDY rosters? |
| 13 | The ~225 schools with major leaguers but no `school_success` row: add them? |
| 14 | 10 schools whose stored MLB count is higher than MLB's debuts (e.g., Taft 7 vs 0): what should they say? |
| 15 | Hamilton drafted count: stored 19 out of high school / 33 total vs. draft table 6 / 37. Who is Hamilton's 34th draft pick? |
| 16 | Player 194745: old team ID is the Houston Astros, but his card's previous team is the Sugar Land Space Cowboys. Which is right? |
| 17 | Hamilton sponsor sheet says 44 active alumni, the site says 47 (3 on the injured list). Change the sheet to 47? |
| 18 | Unmatched MLB IDs: 10 players with two INDY/INTERNATIONAL teams, Chris Clark (two different men), the unclear pairs Frazier, Gibbs, Hunter and Gregg, and 38 held common names. |
| 19 | Google Search Console: the `google-site-verification=` value, so Google can read the sitemap. |
| 20 | Possibly rotate the Neon database password: it was shown in this session. |

## Done (Nov 8-9)

- Sitemap, school titles and descriptions, AI search bots on school sites (#705, #704)
- MLB Roster Sync repaired (#709, #722)
- Duplicate cards merged (#723)
- MLB IDs: 4,004 → about 40,000 of 42,401 pro players linked
- Draft picks 13,373 → 48,303, with Draft Day stories kept
- 2026 MLB transactions 5,019 → 25,672
- MLB profiles for every linked player (`mlb_person_profile`), refreshed daily, +1 to a school on a new MLB debut (#727)
- FREE AGENT / RETIRED cards: no team, highest level; released then INDY/INTERNATIONAL = ACTIVE with that team (#727)
