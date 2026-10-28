import { z } from 'zod';

export const optionalText = (max: number) => z.string().trim().max(max).default('');
export const partnerId = z.string().regex(/^[1-9][0-9]{0,17}$/, 'Choose a valid record.');
export const schoolId = z.string().regex(/^[1-9][0-9]{0,17}$/, 'Choose a valid school.');
export const cadence = z.enum(['both', 'daily', 'weekly']).default('both');
export const httpsLink = z.string().trim().max(2048).refine((value) => {
  try {
    const u = new URL(value);
    return u.protocol === 'https:' && !u.username && !u.password && !/[\r\n]/.test(value);
  } catch { return false; }
}, 'Use a complete HTTPS link.');
export const optionalLink = z.union([z.literal(''), httpsLink]).default('');
const instant = z.string().refine((s) => {
  const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(?:Z|[+-](\d{2}):(\d{2}))$/.exec(s);
  if (!parts || !Number.isFinite(Date.parse(s))) return false;
  const [, year, month, day, hour, minute, second, offsetHour, offsetMinute] = parts;
  const date = new Date(`${year}-${month}-${day}T12:00:00Z`);
  return date.toISOString().slice(0, 10) === `${year}-${month}-${day}` && Number(hour) < 24 && Number(minute) < 60 && Number(second || 0) < 60 && Number(offsetHour || 0) <= 14 && Number(offsetMinute || 0) < 60;
}, 'Choose a valid date and time with a time zone.');
export const optionalInstant = z.union([instant, z.literal(''), z.null()]).optional().transform((v) => v || null);
export const schoolIds = z.array(schoolId).max(1000).default([]).transform((v) => [...new Set(v)]);
export const creativeInput = z.object({
  sponsorId: partnerId,
  headline: z.string().trim().min(1, 'Add a headline.').max(120),
  body: z.string().trim().min(1, 'Add your message.').max(1200),
  imageUrl: optionalLink,
  imageAlt: optionalText(240),
  url: httpsLink,
  cta: z.string().trim().min(1).max(50).default('Visit our sponsor'),
  acknowledgment: optionalText(500),
  startsAt: optionalInstant,
  endsAt: optionalInstant,
  evergreen: z.boolean().default(false),
  schoolIds,
  cadence,
}).superRefine((v, ctx) => {
  if (v.imageUrl && !v.imageAlt) ctx.addIssue({ code: 'custom', path: ['imageAlt'], message: 'Describe the image for readers who cannot see it.' });
  if (v.evergreen && v.endsAt) ctx.addIssue({ code: 'custom', path: ['endsAt'], message: 'A standing ad has no expiration. Turn off standing ad to schedule an offer.' });
  if (!v.evergreen && (!v.startsAt || !v.endsAt || Date.parse(v.endsAt) <= Date.parse(v.startsAt))) {
    ctx.addIssue({ code: 'custom', path: ['endsAt'], message: 'A scheduled offer needs an end time after its start time.' });
  }
});
export const noteInput = z.object({
  title: z.string().trim().min(1).max(120).default('Publisher’s Note'),
  body: z.string().trim().min(1, 'Write the note.').max(2400),
  byline: optionalText(120),
  imageUrl: optionalLink,
  ctaLabel: optionalText(60),
  ctaUrl: optionalLink,
  startsAt: optionalInstant,
  endsAt: optionalInstant,
  schoolIds,
  cadence,
  issueDate: z.union([z.literal(''), z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((s) => {
    const date = new Date(s + 'T12:00:00Z');
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === s;
  }, 'Choose a valid publication date.')]).default(''),
}).superRefine((v, ctx) => {
  if (v.startsAt && v.endsAt && Date.parse(v.endsAt) <= Date.parse(v.startsAt)) ctx.addIssue({ code: 'custom', path: ['endsAt'], message: 'End time must follow start time.' });
  if (!!v.ctaLabel !== !!v.ctaUrl) ctx.addIssue({ code: 'custom', path: ['ctaUrl'], message: 'Provide both a link and its button label, or leave both empty.' });
});
export const mastheadInput = z.object({
  imageUrl: httpsLink,
  alt: z.string().trim().min(1).max(240),
  includesTagline: z.boolean().default(false),
  assetId: z.string().uuid().optional(),
});
export const publicationInput = z.object({
  revision: z.number().int().min(0),
  masthead: mastheadInput.nullable().default(null),
  officialRulesUrl: optionalLink,
  sweepstakesReminder: optionalText(1200),
  postalAddress: optionalText(500),
});
export const brandInput = z.object({
  name: z.string().trim().min(1).max(160),
  logoUrl: optionalLink,
  websiteUrl: optionalLink,
  isActive: z.boolean().default(true),
});
export const placementInput = z.object({
  sponsorId: partnerId,
  hsid: schoolId,
  sponsorOrderId: z.union([partnerId, z.literal(''), z.null()]).optional().transform((v) => v || null),
  status: z.enum(['active', 'paused', 'cancelled']).default('paused'),
  priority: z.number().int().min(-1000).max(1000).default(0),
  startsAt: instant,
  endsAt: optionalInstant,
  requiresApproval: z.boolean().default(true),
}).superRefine((v, ctx) => {
  if (v.endsAt && Date.parse(v.endsAt) <= Date.parse(v.startsAt)) ctx.addIssue({ code: 'custom', path: ['endsAt'], message: 'End time must follow start time.' });
});
export const membershipInput = z.object({
  uid: z.string().trim().min(1).max(128).regex(/^[^\s\u0000-\u001f]+$/),
  sponsorId: z.union([partnerId, z.literal(''), z.null()]).optional().transform((v) => v || null),
  role: z.enum(['publisher', 'sponsor']),
  isActive: z.boolean(),
}).superRefine((v, ctx) => {
  if (v.role === 'sponsor' && !v.sponsorId) ctx.addIssue({ code: 'custom', path: ['sponsorId'], message: 'Choose the sponsor account.' });
  if (v.role === 'publisher' && v.sponsorId) ctx.addIssue({ code: 'custom', path: ['sponsorId'], message: 'Publisher access is not attached to one sponsor.' });
});
export type CreativeInput = z.infer<typeof creativeInput>;
export type NoteInput = z.infer<typeof noteInput>;
export type PublicationInput = z.infer<typeof publicationInput>;

export function validationFields(error: z.ZodError): Record<string, string> {
  return Object.fromEntries(error.issues.map((i) => [i.path.join('.') || 'form', i.message]));
}
