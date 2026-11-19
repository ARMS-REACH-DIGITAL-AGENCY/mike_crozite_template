# Daily Digest and Weekly Gazette: handoff, Nov 19 2026

From Claude to the newsletter team (ChatGPT), for Pete. Pete approves
everything. Nothing here turns sending on.

The contract is unchanged: `docs/newsletter-handoff-take-two.md` on branch
`ccr-0ad18095-umgndf`. **The newsletter reads finished rows and prints them.
It never computes.** Claude writes the rows; the newsletter picks recipients,
lays out the email, adds the sponsor and sends through HighLevel.

---

## 1. Why Pete has received no emails (checked on the live database, Nov 19)

1. **Sending is switched off, by design.** `alumni_newsletter_control`:
   `enabled = false`, `approved_layout_version = NULL`,
   `approved_by = NULL`, last changed Oct 26 2026. Nothing sends until Pete
   approves a layout.
2. **Only two editions have ever been written.** `edition_ready` holds:
   - Daily, stats day 2026-10-26 (66 stat lines, 48 game stories, 24 scores);
   - Weekly, test-2026 week 3, Oct 19-25 (1,330 player lines, 48 box scores,
     69 schools).

   Both were written by hand on Oct 27 with `scripts/newsletter-publish.ts`.
   That job was never scheduled (scheduling needs Pete's go).
3. **Fan data:** `user_scoreboard_schools` has 0 rows (no fan has picked
   scoreboard schools). `alumni_newsletter_preferences` has 7 rows.
4. **The sender is yours.** Claude cannot see whether your scheduled sender
   is set up or running. Please report in section 5.

## 2. Where the proofs stopped

- Nov 12: Week 4 Gazette images, first and second proof (`nl/gz4/`,
  `nl/gz4b/`).
- Nov 13: end-of-Round-1 Gazette images, 2026 simulation (`nl/gz3/`).
- After those proofs Pete gave the feedback in section 3, then work moved to
  an urgent site problem. Nothing has been proofed since.

## 3. Pete's feedback on the Gazette, and who fixes it

| # | Pete's feedback | Who | What it needs |
|---|---|---|---|
| 1 | Players have stats but no weekly real-team W-L | Claude (rows) | A finished W-L text for each player's real team that week, in `weekly_player_lines`. The newsletter never works out a W-L. |
| 2 | Players who played for more than one team are credited with W-L from a team that wasn't theirs | Claude (rows) | W-L follows the team of each game line. A player on two teams that week gets one line per team, each with its own team's W-L. |
| 3 | Scoreboards must be one column wide on phones | Newsletter (layout) | One column under ~600 px. No side-by-side scoreboards on a phone. |
| 4 | "We must NOT be announcing things to the public that were intended for our communication purposes only" | Both | Nothing internal ever prints: no test notes, no commissioner or pipeline notes, no warnings. Newsletter: send Pete the exact sentences that appeared, and their field (`decision`, `series_note`, `title`, `story`, `shout_outs`). Claude: strip them at the source and add a check. |
| 5 | School listings uniform, in two lines: **Seed, Team Name, Score** / **City, ST** | Claude (rows) + newsletter (layout) | The score rows have no separate seed or city/state today (`daily_game_scores`: `home_label`, `away_label`; `weekly_box_scores`: `home_name`, `away_name`). Claude adds finished `seed`, `name`, `city_st` per side; the newsletter prints them in the two-line form, the same everywhere. |
| 6 | "Doesn't look like baseball"; presentation matters for credibility | Newsletter (layout) | A recognizable scoreboard and box-score look. Send Pete 2-3 directions before building one fully. |

## 4. What changed since the proofs (YAT ID transition, Nov 18-19)

Every person now has one permanent YAT ID (`YAT` + 6 digits). Old player
numbers are only a reference to the source they came from.

- **Player rows:** `daily_stat_lines` and `weekly_player_lines` carry
  `yatid`. Use `yatid` to identify a player, not `playerid`.
- **Photos:** player photo files are named by the YAT ID
  (`players/<folder>/<YATID>...` in the `yatstats-assets` bucket). Build
  every photo address from `yatid`; addresses built from the old number can
  point at stale copies.
- **Profile links:** player profile addresses use the YAT ID; old addresses
  redirect permanently. Link with the YAT ID.
- **Favorites:** `newsletter_favorites` still returns only `firebase_uid` and
  `playerid`. Claude will add `yatid` to that view before launch. Until then,
  don't key anything new on `playerid`.
- **One person, one card:** a person who played for or coaches at two high
  schools has one card. His rows can appear under either school; never
  print him twice as two people.

## 5. Questions for the newsletter team (please answer in writing)

1. Is your sender built, and is it scheduled? Which job, at what time?
2. Which address sends (the pilot branch used `daily@yatstats.com`), and is
   its domain verified in HighLevel?
3. Does your sender read only `alumni_newsletter_control`,
   `edition_ready` and the publication tables? Confirm it never reads
   `stat_lines`, `player_game_logs`, `flip_card_front_stage` or
   `/api/bracket/live`.
4. Which exact internal sentences appeared in the Nov 12-13 proofs (item 4)?

## 6. Order to launch (Pete approves each step)

1. Claude: rows for items 1, 2 and 5; strip internal text (item 4); `yatid`
   in `newsletter_favorites`.
2. Newsletter: layout for items 3, 5 and 6; answers to section 5.
3. New proofs to Pete from current data: one Daily, one Weekly, phone and
   desktop.
4. Pete approves the layout. Only then is `alumni_newsletter_control`
   switched on, by Pete's explicit approval.
5. Claude schedules the daily and weekly publish job (Pete's go). The
   sender sends only when the edition's `edition_ready` row exists.
