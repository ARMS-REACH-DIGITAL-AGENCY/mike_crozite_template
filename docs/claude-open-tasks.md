# Claude's open task list (Pete's requests)

This list is built from every message Pete sent in session
session_01JbCbTx7jQy3xZACZs449Uy (Nov 8-9, 2026). Claude updates it whenever
something is added, finished or blocked. Nothing gets dropped silently.

Last updated: 2026-11-09 18:30 UTC

## Pete asked for it, and it is NOT done

| # | Task | Asked | Status |
|---|------|-------|--------|
| 1 | Update the ~200 schools whose stored MLB count is too low. | Nov 9 08:53 | **DONE Nov 9 ~14:30.** 200 schools, +203 major leaguers. Backup: `school_success_mlb_backup_20261109`. |
| 2 | Why the Monday draft import didn't run on its own. | Nov 9 13:55 | **ANSWERED.** Not broken: GitHub starts it 6-10 hours after 10:40 UTC (ran 16:58-20:29 the last 4 Mondays). |
| 3 | 561 cards are ACTIVE with no team and no level. | Nov 9 06:31 | **Investigated.** 528 have no 2026 stat line at all (353 highest INDY). 32 have 2026 lines on 2+ teams, 1 on one team. Needs Pete's rule for the 528 (#24). |
| 4 | 3 FREE AGENT / RETIRED cards still show a team. | Nov 9 06:39 rule | **Not done.** Found during this list check. |
| 5 | Scan INDY rosters every day and catch released FREE AGENTS who sign there. | Nov 9 13:54 | **Not built.** Part 1 (read all players, not the top 500) is on branch `ccr-0323126e-3ihtzc`, commit 26478a53, with no PR yet. Part 2 needs a roster source: the iScore API test needs Pete's network approval. |
| 6 | Enrichment, step 3: retired vs. active from MLB's last-game date. | Nov 9 08:43 ("All of them") | Not started |
| 7 | Enrichment, step 4: bios (bats, throws, position, height, weight, draft info) and career stats into `flip_card_front_stage`. | Nov 9 06:23-06:25 | Not started |
| 25 | **DONE (table built):** `mlb_draft_picks_all` = every MLB draft pick 1965-2026 (69,747), matched to our players by verified MLB ID (40,000 picks) or name + high school + city (4,322 picks, 20/20 spot-check correct). Long Beach Poly: 32 of TBC's 43 drafted now found. Was: Long Beach Poly (hsid 637, teamid C637) drafted list: TBC page has 46 draft rows (43 drafted + 3 UDFA), stored 46. Our stat tables have draft_info for only 30 of LB Poly's 85 players: 15 drafted players never played pro, so they have no stat line and no draft_info. Pete: may need a table to cross-check. | Nov 9 17:23 | Waiting on Pete: source for the non-pro draftees (#26). |
| 27 | Ryan Jensen (1975, playerid 754, MLB 2001-2005) shows FREE AGENT from the 1997 Ryan Jensen's July 2026 release: 2 stale transactions saved under the wrong player from an old link. Ryan Walker (164576) has 5 the same way. | Nov 9 17:35 found | Waiting on Pete OK to delete the 7 rows (backed up) and fix card 754. |
| 28 | Draft table follow-ups: (a) MLB's `team_name` is today's franchise name (1996 Milton Bradley shows "Washington Nationals", not Expos): use the era name before showing it. (b) Make the pull a repo script/workflow that reruns after each July draft. (c) Compare all 9,597 schools' drafted counts (4,276 agree, 5,162 MLB lower, 159 MLB higher) and report. (d) Feed the new matches into Draft Day stories. | Nov 9 | Not started |
| 29 | Long Beach Poly's 8 still unmatched: Stephen Smith (MLB "Steve"), Sam Houston (MLB "Rowland"), Robert Wiswell (MLB: UCLA), Raymond Colin (MLB: Long Beach City College), James George (MLB: USC), Robert George (MLB says Poly HS, Arleta), Stanley Butler (MLB says "Long Beach HS"), Emanuel Andrews (looks like a duplicate TBC record of EJ Andrews: same 2018 PIT pick). | Nov 9 | For Pete, one at a time |
| 30 | Draft info for drafted players who never played pro (e.g. Stephen Smith 95990: 1968 June Secondary, rd 4, pick 80, DET, Long Beach CC) is NOT in our TBC feed: draft_info only rides on batting/pitching stat lines, the player file has no draft column, and Gary sends no separate draft file. MLB's draft API has only the regular June phase (no January / June Secondary phases). | Nov 9 | Reported to Pete |
| 8 | Enrichment, step 5: minor-league stats from 1988, and awards. First test what MLB actually has. | Nov 9 08:43 | Not started |

## In progress

| # | Task | Status |
|---|------|--------|
| 9 | DONE: post-#727 sync green. Senzel ACTIVE Lexington Legends INDY; Nittoli FREE AGENT, highest MLB; Ryan Jensen (1997) FREE AGENT, highest TRIPLE-A. Was: Check that the post-#727 transaction sync worked: Senzel ACTIVE with Lexington Legends (INDY), Nittoli FREE AGENT · MLB with no team, Ryan Jensen FREE AGENT · TRIPLE-A with no team. | Run 42629897830 is running. Check scheduled for 15:15 UTC. |
| 22 | FREE AGENT cards must read "HIGHEST LEVEL: {level}" exactly like RETIRED cards, with no team and no organization (Pete, Nov 9 14:30). | Fixed on branch, commit 71b5ce22. PR open, waiting for "merge it". |
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
| 19 | DONE Nov 11: Search Console verified for yatstats.com (all subdomains), sitemap submitted to Google and Bing. |
| 21 | A player Designated for Assignment keeps his team on the card until the next transaction. Show anything different while he waits? |
| 23 | Card back and profile page show the bare level for both RETIRED and FREE AGENT (only the card front says "HIGHEST LEVEL"). Add "HIGHEST LEVEL" there too? |
| 24 | ACTIVE cards with no 2026 stat line (528): what status should they have? |
| 26 | Draft info for drafted players who never played pro (15 at Long Beach Poly): get TBC's High School Alumni CSV / draft list from Gary, or another source? |
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
