# YAT?STATS — A2P 10DLC Campaign Manual Setup

Status: preparation only. **No campaign has been resubmitted or approved.**
Updated October 21, 2026.

## Important: choose Manual Setup, not Chat Widget Setup

Our real permission mechanism is the shared JOIN drawer on school microsites, not a HighLevel chat widget.
The former 30909 rejection was a **Chat Widget Setup** verification failure.
Do not claim the generated widget is installed when it is not. Preserve the existing approved YAT?STATS brand.
If HighLevel cannot edit the rejected campaign's setup method, use its supported correction/new-campaign flow under the existing approved brand; do not delete the brand.

## URLs to submit (check they are public and live first)

- Brand website: **https://www.yatstats.com/** (matches the YAT?STATS ARMS location's website; verify the approved Brand Website entry before submission)
- Opt-in form URL: **https://hamilton.az.yatstats.com/?join=1**
- Privacy Policy: **https://yatstats.com/privacy-policy/**
- Terms & Conditions: **https://yatstats.com/terms-and-conditions/**

The `?join=1` parameter on the school **root URL** opens the actual reusable school JOIN drawer without a login and bypasses the first-visit splash. The school homepage internally resolves its own Home School ID. It does not create another form. Hamilton is one publicly verifiable example; the same shared template works for every school with one Home School per fan.

Take browser screenshots of the **real live deployed drawer** showing the phone field, both unchecked opt-in boxes, the STOP/HELP/frequency/data-rate disclosure, the policy links, and the submit button. If the form is not trivially verifiable in a private/incognito session, host the screenshots publicly and provide their URLs in the campaign's message-flow description.

## Campaign Use Case Description (adapt to HighLevel's exact required fields)

YAT?STATS operates a first-party online baseball alumni and hometown fan community. A fan registers through a YAT?STATS school hub and selects one Home School. YAT?STATS sends optional informational SMS about that fan's subscribed baseball player and community updates; subscribers who separately opt in may receive YAT?STATS promotional SMS about hometown community events, program-related fundraising or sponsors. School names identify content topics within the YAT?STATS-operated program; independent schools do not use this campaign to send their own separate branded texts. Messages are sent only to contacts with a documented applicable SMS opt-in, and global STOP opt-outs are honored.

Choose the use case appropriate to actual sending (Mixed if both promotional and informational content will be sent). Do not include sweepstakes or other prohibited content.

## How end-users opt in / Message Flow

Visitors select their Home School on a YAT?STATS school microsite. On https://hamilton.az.yatstats.com/?join=1 the public JOIN drawer opens automatically, showing the fan registration form. Visitors provide their name and email address; a mobile telephone number is optional. Below the phone field are two **separate, unchecked, optional** consent checkboxes: (1) receive non-marketing YAT?STATS text messages about their Home School baseball player and community alerts, and (2) receive YAT?STATS promotional text messages related to that community. The disclosures beside the choices say message frequency varies, message and data rates may apply, reply STOP to unsubscribe, reply HELP for assistance, and that consent is not required to register or purchase. Privacy: https://yatstats.com/privacy-policy/ ; Terms: https://yatstats.com/terms-and-conditions/ . The site records the selected opt-in category, phone, date/time, Home School, consent wording/version and source. Account creation alone does not authorize SMS.

After the campaign is approved and the phone number is A2P Verified, a welcome/confirmation message containing the brand, message frequency, rates, HELP and STOP must be sent after verified enrollment. **Do not state that the welcome workflow is live until it is configured and verified.**

## Sample messages — only use if these genuinely match the active program

Informational:
"YAT?STATS | Hamilton Baseball: A new alumni player update is available for your Home School community at https://hamilton.az.yatstats.com/5004 . Reply STOP to unsubscribe."

Promotional (requires separate promotional consent):
"YAT?STATS | Hamilton Baseball: See baseball community partnership and sponsorship opportunities at https://yatstats.com/partners/ . Reply STOP to unsubscribe."

HELP (where configured): 
"YAT?STATS fan alerts: For help email info@yatstats.com. Message frequency varies. Message and data rates may apply. Reply STOP to unsubscribe."

STOP acknowledgment (where configured):
"You have unsubscribed from YAT?STATS text messages and will receive no further texts. For help email info@yatstats.com."

## Launch gates

1. Confirm approved brand identity and Brand Website URL in HighLevel; no changes to approved brand.
2. Both policy URLs return real public HTML from the corporate site's production deployment. Source is corporate repo PR #4.
3. School-site PR #496 has been reviewed, merged to the actual production branch, and functionally tested on an anonymous private-browser session.
4. Proof of separate unchecked SMS consent and server-side event storage verified using **test-only** identities/numbers as appropriate.
5. ARMS phone sync and category-level consent targeting verified. Do not interpret a saved phone number as consent. Honor STOP globally.
6. Root website includes public information identifying YAT?STATS and describing its opt-in SMS program.
7. HighLevel campaign: Manual Setup, correct use case, real URLs, truthful flow description, matching samples. All required compliance checks pass.
8. Only after A2P approval, link and verify the sending number and enable the opted-in welcome/alert workflow.
