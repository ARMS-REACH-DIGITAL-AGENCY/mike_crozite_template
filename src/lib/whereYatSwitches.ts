import 'server-only';

// Where YAT Now outside deliveries are OFF unless explicitly switched on in
// production. Each switch can be limited to listed submission ids so the
// first live test sends exactly one approved record.
//
//   WHERE_YAT_CRM_SYNC_ENABLED=1          ARMS/HighLevel contact, tags, notes, task
//   WHERE_YAT_CRM_SYNC_ONLY_IDS=12        optional comma list of submission ids
//   WHERE_YAT_EMAILS_ENABLED=1            reviewer email/SMS and alumni receipts
//   WHERE_YAT_EMAILS_ONLY_IDS=12          optional comma list of submission ids
//
// When a switch is off the call is skipped and logged; the submission stays
// "not_sent", so turning the switch on later still delivers it.

const isOn = (value: string | undefined) => /^(1|true|on|yes)$/i.test((value || '').trim());

function allowed(enabledVar: string, onlyIdsVar: string, id: number): boolean {
  if (process.env.VERCEL_ENV !== 'production') return false;
  if (!isOn(process.env[enabledVar])) return false;
  const only = (process.env[onlyIdsVar] || '').split(',').map((v) => v.trim()).filter(Boolean);
  return only.length === 0 || only.includes(String(id));
}

export function whereYatCrmSyncAllowed(id: number): boolean {
  const ok = allowed('WHERE_YAT_CRM_SYNC_ENABLED', 'WHERE_YAT_CRM_SYNC_ONLY_IDS', id);
  if (!ok) console.info('[where-yat] CRM sync switched off; not sent', { id });
  return ok;
}

export function whereYatEmailsAllowed(id: number): boolean {
  const ok = allowed('WHERE_YAT_EMAILS_ENABLED', 'WHERE_YAT_EMAILS_ONLY_IDS', id);
  if (!ok) console.info('[where-yat] emails/SMS switched off; not sent', { id });
  return ok;
}

/** True when either delivery switch is on (the cron skips all queries otherwise). */
export function whereYatAnyDeliveryOn(): boolean {
  return process.env.VERCEL_ENV === 'production'
    && (isOn(process.env.WHERE_YAT_CRM_SYNC_ENABLED) || isOn(process.env.WHERE_YAT_EMAILS_ENABLED));
}
