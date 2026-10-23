import 'server-only';
import { query } from '@/lib/tribune/db';
import { renderTribuneHtml, renderTribuneText, tribuneSubject } from '@/lib/tribune/render';
import { BATTING_COLUMNS, PITCHING_COLUMNS, TRIBUNE_LAYOUT_VERSION, type TribuneEdition, type TribunePublisherNote, type TribuneSponsor } from '@/lib/tribune/types';
import { PartnerAccessError, assertPublisherAccess, type PartnerAccess } from './access';
import { resolveTribunePublication } from './publication';
import { assertSchoolPreview, getCreative, getNote } from './service';
import { publicationInput, schoolId } from './validation';

/** The preview uses the production email renderer; no delivery or AI call occurs. */
export async function publicationPreview(access: PartnerAccess, body: Record<string, unknown>) {
  const hsid = schoolId.parse(body.hsid);
  await assertSchoolPreview(access, hsid);
  const cadence = body.cadence === 'weekly' ? 'weekly' : body.cadence === 'daily' ? 'daily' : null;
  if (!cadence) throw new PartnerAccessError(400, 'Choose a daily or weekly edition.');
  const school = (await query<{ hsname: string; hslocation: string | null }>('SELECT hsname,hslocation FROM public.school_success WHERE hsid::text=$1 LIMIT 1', [hsid])).rows[0];
  if (!school) throw new PartnerAccessError(404, 'School not found.');
  const now = new Date();
  const end = now.toISOString().slice(0, 10);
  const start = new Date(now.getTime() - (cadence === 'weekly' ? 6 : 0) * 86400000).toISOString().slice(0, 10);
  const resolved = await resolveTribunePublication({ hsid, cadence, periodStart: start, periodEnd: end, asOf: now });
  const warnings = ['Content preview only. Statistics are omitted here; delivered editions use the complete school roster and tournament data.'];
  let sponsor: TribuneSponsor | undefined = resolved.sponsor;
  if (body.creativeId) {
    const creative = await getCreative(access, String(body.creativeId));
    const placement = (await query(`SELECT 1 FROM tribune_private.school_tribune_sponsorships WHERE hsid=$1 AND sponsor_id=$2::bigint AND status<>'cancelled' LIMIT 1`, [hsid, creative.sponsorId])).rows[0];
    if (!placement || (creative.schoolIds.length && !creative.schoolIds.includes(hsid))) throw new PartnerAccessError(403, 'This advertisement does not target the selected school.');
    const brand = (await query<{ name: string; logo_url: string; is_active: boolean }>('SELECT name,logo_url,is_active FROM public.sponsor_brands WHERE id=$1::bigint', [creative.sponsorId])).rows[0];
    if (!brand) throw new PartnerAccessError(404, 'Sponsor not found.');
    sponsor = {
      id: creative.sponsorId, name: brand.name, headline: creative.headline, body: creative.body,
      url: creative.url, cta: creative.cta, imageUrl: creative.imageUrl || undefined, imageAlt: creative.imageAlt || undefined,
      logoUrl: new URL(brand.logo_url, `https://${hsid}.yatstats.com/`).toString(),
      acknowledgment: creative.acknowledgment || undefined, creativeId: creative.id, creativeVersion: creative.revision,
    };
    if (creative.status !== 'published') warnings.push('This advertisement is a draft or awaiting approval. Previewing it does not publish it.');
    if (!brand.is_active) warnings.push('This sponsor is paused. Activate it before its approved advertisement can appear.');
    if ((creative.startsAt && Date.parse(creative.startsAt) > now.getTime()) || (creative.endsAt && Date.parse(creative.endsAt) <= now.getTime())) warnings.push('This advertisement is outside its current publication window.');
  }
  let publisherNote: TribunePublisherNote | undefined = resolved.publisherNote;
  if (body.noteId) {
    const note = await getNote(access, String(body.noteId));
    if (note.schoolIds.length && !note.schoolIds.includes(hsid)) throw new PartnerAccessError(400, 'Choose a school targeted by this note.');
    publisherNote = {
      id: note.id, title: note.title, paragraphs: note.body.split(/\n\s*\n|\r?\n/).map((s) => s.trim()).filter(Boolean),
      byline: note.byline || undefined, imageUrl: note.imageUrl || undefined, ctaLabel: note.ctaLabel || undefined, ctaUrl: note.ctaUrl || undefined, revision: note.revision,
    };
    if (note.status !== 'published') warnings.push('This Publisher’s Note is a draft. Previewing it does not publish it.');
  }
  let settings = resolved;
  if (body.publication) {
    assertPublisherAccess(access);
    const draft = publicationInput.parse(body.publication);
    if (draft.masthead) {
      const asset = (await query('SELECT 1 FROM tribune_private.partner_portal_assets WHERE url=$1 AND kind=\'masthead\' AND sponsor_id IS NULL', [draft.masthead.imageUrl])).rows[0];
      if (!asset) throw new PartnerAccessError(400, 'Upload the masthead before previewing it.');
    }
    settings = { ...resolved, masthead: draft.masthead || undefined, officialRulesUrl: draft.officialRulesUrl || undefined,
      sweepstakesReminder: draft.sweepstakesReminder || undefined, postalAddress: draft.postalAddress || undefined };
    warnings.push('Publication settings shown here are a preview until saved.');
  }
  const hub = `https://${hsid}.yatstats.com/`;
  const edition: TribuneEdition = {
    layoutVersion: TRIBUNE_LAYOUT_VERSION, preview: true, dataStatus: 'unavailable', generatedAt: now.toISOString(),
    school: { id: hsid, name: school.hsname, location: school.hslocation || '' }, recipientTier: 'fan',
    period: { cadence, start, end, label: 'Publication content preview' },
    masthead: settings.masthead, publisherNote, sponsor, sweepstakesReminder: settings.sweepstakesReminder,
    story: { source: 'facts', headline: 'The next chapter starts here.', deck: 'A preview of your school’s Tribune.',
      paragraphs: ['Your published edition will tell the fantasy game’s story using your alumni’s verified stats. This preview shows how your masthead, Publisher’s Note and sponsor message fit into the newspaper.'] },
    homeRoster: { title: `${school.hsname} alumni`, playerCount: 0,
      batting: { kind: 'batting', rows: [], totals: BATTING_COLUMNS.map(() => '—') },
      pitching: { kind: 'pitching', rows: [], totals: PITCHING_COLUMNS.map(() => '—') },
      note: 'Roster statistics are omitted from this content preview.' },
    links: { hub, tournament: hub + '#sec-fantasy', share: hub + '#sec-fantasy', officialRules: settings.officialRulesUrl, sponsorInquiry: 'https://yatstats.com/partners/' },
    sender: settings.postalAddress ? { name: 'YAT?STATS', postalAddress: settings.postalAddress } : undefined,
  };
  if (!settings.officialRulesUrl) warnings.push('The official sweepstakes rules link still needs to be saved.');
  if (!settings.postalAddress) warnings.push('The sender’s postal address still needs to be saved.');
  return { html: renderTribuneHtml(edition), text: renderTribuneText(edition), subject: tribuneSubject(edition), warnings };
}
