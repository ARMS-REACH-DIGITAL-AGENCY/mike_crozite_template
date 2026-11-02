# Release Wave 2 - Where YAT Now (#621)

Branch `release/wave2-where-yat-now-20261101`, built from `Easter-NEWS`
`3ad500b` + #621 at its frozen commit `b8d3e5f6`.

## What is in it

- #621 as Pete approved it: retired players get the **YAT?** tab where active
  players get the 7-Day Snapshot (flip card and profile), the side-drawer
  questionnaire that builds the flip-card back live, proof, review queue,
  reactions, sharing, the ARMS sync job, and the house-ad placeholders.
- Merge conflicts: `package.json` build line and `vercel.json` crons - both
  sides kept.
- Bracket: production's `SchoolBracket.tsx` and `BracketTicker.tsx` kept
  (#621's font change would have changed every Fantasy game card).
- **Delivery switches, all OFF by default** (`src/lib/whereYatSwitches.ts`):
  - `WHERE_YAT_CRM_SYNC_ENABLED` (+ optional `WHERE_YAT_CRM_SYNC_ONLY_IDS`):
    ARMS contact, tags, notes, review task.
  - `WHERE_YAT_EMAILS_ENABLED` (+ optional `WHERE_YAT_EMAILS_ONLY_IDS`):
    reviewer email/SMS to alumni@yatstats.com and the alum's receipt email.
  - Off = skipped and logged; the record stays `not_sent`, so it is delivered
    when switched on. The 10-minute cron does no queries while both are off.
- **Double-submit guard:** the same account sending the same answers and
  files within 15 minutes gets the first receipt back instead of a second
  record (#6 and #7 on Nov 1 were identical apart from re-uploaded files).
  A real edit goes through. Any failure releases the guard.
- `scripts/verify-where-yat-safety.cjs` added to the build.
- `CLAUDE.md`: Pete's ID rule (YAT = players only, C + hsid = high school team).

Checked on this branch: all 21 build checks pass, `tsc` clean, `next build`
succeeds.

## Preview isolation

Previews of this branch use the Neon copy `release-preview-isolated-20261101`
(not production), and HighLevel keys/locations/webhooks, remove.bg and Meta
are blanked. Test uploads land in new S3 folders
(`alumni-where-yat-now/pending/...`, `stories/...`) that the cutout workers
never scan; nothing in production is overwritten.

## Pete's click-through on the preview

1. Open a retired alum on the All-Time list (Hamilton and Marcos de Niza):
   flip card back shows the **YAT?** CTA; active players show 7-Day Snapshot.
2. Profile: the **YAT?** tab opens the prompts.
3. Side drawer: answer, add photos, watch the flip-card back build live.
4. Proof, then submit: receipt with a submission number.
5. Click submit twice / resubmit the same answers: same receipt number, no
   second record.
6. Reload: answers and photos still there.
7. Reviewer queue: the submission is there; approve it; the flip card back
   switches from the CTA to the alum's summary.
8. Fantasy bracket game cards look exactly as on yatstats.com today.

## Going live (only with Pete's OK)

1. Neon snapshot of production.
2. Merge to `Easter-NEWS`; confirm the deployed commit; check runtime errors.
3. Switches stay off. Pete picks one real submission; set
   `WHERE_YAT_CRM_SYNC_ENABLED=1` and `WHERE_YAT_CRM_SYNC_ONLY_IDS=<id>`
   (and the same for emails); check the contact, notes and task in ARMS;
   then remove the ID limit.
4. Records #4, #6, #7 (production test submissions; #6/#7 are the double
   submit) are not sent unless Pete names one.
