import type { ReadDatabase } from './finishedPublication';

export type NewsletterRecipientEntry = { email: string; homeHsids: number[] };
/** The live cron and the authenticated rehearsal directory enumerate exactly
 * the same mailboxes. An email gets one edition, even if several UIDs exist.
 * Invalid/missing schools remain in the directory so rendering can report them. */
export async function readNewsletterRecipientDirectory(db: ReadDatabase): Promise<NewsletterRecipientEntry[]> {
  const {rows}=await db.query("SELECT email,home_hsid FROM public.newsletter_recipients WHERE coalesce(email,'')<>'' ORDER BY email");
  return normalizeNewsletterRecipients(rows);
}

export function normalizeNewsletterRecipients(rows: Array<{email?: unknown;home_hsid?:unknown}>): NewsletterRecipientEntry[] {
  const entries=new Map<string, Set<number>>();
  for(const row of rows) {
    const email=String(row.email ?? '').trim().toLowerCase();
    if(!email) continue;
    const hsids=entries.get(email) || new Set<number>();
    const hsid=Number(row.home_hsid);
    if(Number.isSafeInteger(hsid)&&hsid>0) hsids.add(hsid);
    entries.set(email,hsids);
  }
  return [...entries].sort(([a],[b])=>a.localeCompare(b)).map(([email,hsids])=>({email,homeHsids:[...hsids].sort((a,b)=>a-b)}));
}
