import 'server-only';
import { query } from '@/lib/tribune/db';
import { phoenixDate, validReportDate } from '@/lib/tribune/preferences';
import type { TribuneMasthead, TribunePublisherNote, TribuneSponsor } from '@/lib/tribune/types';

export type TribunePublicationInput = {
  hsid: string; cadence: 'daily' | 'weekly';
  periodStart: string; periodEnd: string; asOf: Date;
};
export type TribunePublication = {
  masthead?: TribuneMasthead; publisherNote?: TribunePublisherNote; sponsor?: TribuneSponsor;
  officialRulesUrl?: string; sweepstakesReminder?: string; postalAddress?: string;
};
export type TribuneSponsorBrandSource = {
  id: string | number; name: string; logo_url?: string | null;
};
export type TribuneCreativeSource = {
  id: string | number; revision: number; headline: string; body: string;
  image_url?: string | null; image_alt?: string | null; destination_url: string;
  cta: string; acknowledgment?: string | null;
};
type PublicationRow = {
  masthead: unknown; official_rules_url: string | null; sweepstakes_reminder: string | null; postal_address: string | null;
  sponsor_id: string | null; sponsor_name: string | null; sponsor_logo: string | null;
  creative_id: string | null; creative_revision: number | null;
  creative_headline: string | null; creative_body: string | null; creative_image: string | null; creative_alt: string | null;
  creative_destination: string | null; creative_cta: string | null; creative_acknowledgment: string | null;
  note_id: string | null; note_revision: number | null; note_text: string | null; note_metadata: unknown;
  note_image: string | null; note_cta_label: string | null; note_cta_url: string | null;
};

function text(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (typeof value !== 'string') throw new Error('Invalid saved publication text');
  return value.trim() || undefined;
}
function requiredText(value: unknown): string {
  const result = text(value);
  if (!result) throw new Error('Saved publication content is incomplete');
  return result;
}
function httpsUrl(value: unknown): string | undefined {
  const candidate = text(value);
  if (!candidate) return undefined;
  const parsed = new URL(candidate);
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) throw new Error('Saved publication URL must use HTTPS');
  return parsed.toString();
}
function record(value: unknown): Record<string, unknown> {
  if (value == null) return {};
  if (typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid saved publication metadata');
  return value as Record<string, unknown>;
}
function id(value: string | number): string {
  if (typeof value === 'number' && !Number.isSafeInteger(value)) throw new Error('Invalid saved publication identifier');
  return requiredText(String(value));
}
function revision(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) throw new Error('Invalid saved publication revision');
  return value;
}
function schoolId(value: string): string {
  if (!/^\d{1,12}$/.test(value)) throw new Error('Invalid publication school');
  return value;
}

/** Shared mapping for approved delivery content and explicitly labeled portal previews. */
export function mapCreativeToSponsor(input: {
  hsid: string; brand: TribuneSponsorBrandSource; creative: TribuneCreativeSource;
}): TribuneSponsor {
  const hsid = schoolId(input.hsid), { brand, creative } = input;
  const logo = text(brand.logo_url);
  const destination = httpsUrl(creative.destination_url);
  if (!destination) throw new Error('Saved sponsor destination is missing');
  return {
    id: id(brand.id), name: requiredText(brand.name), label: 'Paid advertisement',
    headline: requiredText(creative.headline), body: requiredText(creative.body),
    url: destination, cta: requiredText(creative.cta),
    logoUrl: httpsUrl(logo?.startsWith('/img/') ? new URL(logo, `https://${hsid}.yatstats.com/`).toString() : logo),
    imageUrl: httpsUrl(creative.image_url), imageAlt: text(creative.image_alt),
    acknowledgment: text(creative.acknowledgment),
    creativeId: id(creative.id), creativeVersion: revision(creative.revision),
  };
}

/** One database snapshot selects the publication and the school’s approved ad. */
const PUBLICATION_SQL = `
  SELECT settings.masthead, settings.official_rules_url, settings.sweepstakes_reminder, settings.postal_address,
    sponsor.*, note.*
  FROM (SELECT true AS singleton) anchor
  LEFT JOIN tribune_private.tribune_publication_settings settings ON settings.id=anchor.singleton
  LEFT JOIN LATERAL (
    SELECT brand.id::text AS sponsor_id, brand.name AS sponsor_name, brand.logo_url AS sponsor_logo,
      creative.id::text AS creative_id, creative.revision AS creative_revision,
      creative.headline AS creative_headline, creative.body AS creative_body,
      creative.image_url AS creative_image, creative.image_alt AS creative_alt,
      creative.destination_url AS creative_destination, creative.cta AS creative_cta,
      creative.acknowledgment AS creative_acknowledgment
    FROM tribune_private.school_tribune_sponsorships placement
    JOIN public.sponsor_brands brand ON brand.id=placement.sponsor_id AND brand.is_active=true
    JOIN tribune_private.tribune_sponsor_creatives creative ON creative.sponsor_id=brand.id
    WHERE placement.hsid=$1 AND placement.status='active'
      AND placement.starts_at<=$2::timestamptz AND (placement.ends_at IS NULL OR placement.ends_at>$2::timestamptz)
      AND creative.status='published' AND creative.approved_by IS NOT NULL AND creative.approved_at IS NOT NULL
      AND (NOT placement.requires_approval OR creative.publisher_approved)
      AND (creative.starts_at IS NULL OR creative.starts_at<=$2::timestamptz)
      AND (creative.ends_at IS NULL OR creative.ends_at>$2::timestamptz)
      AND creative.cadence IN ('both',$3)
      AND (cardinality(creative.school_ids)=0 OR $1=ANY(creative.school_ids))
    ORDER BY placement.priority DESC, creative.evergreen ASC,
      (cardinality(creative.school_ids)>0) DESC, creative.starts_at DESC NULLS LAST, creative.id DESC,
      placement.starts_at DESC, placement.id DESC
    LIMIT 1
  ) sponsor ON true
  LEFT JOIN LATERAL (
    SELECT message.id::text AS note_id, message.revision AS note_revision,
      message.message_text AS note_text, message.tribune_metadata AS note_metadata,
      message.image_url AS note_image, message.cta_label AS note_cta_label, message.cta_url AS note_cta_url
    FROM tribune_private.publisher_notes message
    WHERE message.page_key='tribune' AND message.status='published'
      AND (message.school_hsid::text=$1 OR message.school_hsid IS NULL)
      AND (message.starts_at IS NULL OR message.starts_at<=$2::timestamptz)
      AND (message.ends_at IS NULL OR message.ends_at>$2::timestamptz)
      AND (message.tribune_metadata->'schoolIds' IS NULL OR message.tribune_metadata->'schoolIds'='[]'::jsonb
        OR (jsonb_typeof(message.tribune_metadata->'schoolIds')='array' AND (message.tribune_metadata->'schoolIds') ? $1))
      AND COALESCE(message.tribune_metadata->>'cadence','both') IN ('both',$3)
      AND (NULLIF(message.tribune_metadata->>'issueDate','') IS NULL OR message.tribune_metadata->>'issueDate'=$4)
    ORDER BY CASE WHEN message.school_hsid::text=$1 OR (message.tribune_metadata->'schoolIds') ? $1 THEN 0 ELSE 1 END,
      message.display_order, message.id
    LIMIT 1
  ) note ON true
`;

/**
 * Campaign windows are evaluated at publication time, with inclusive starts and
 * exclusive ends. The issueDate targets the Phoenix publication date, not the
 * completed statistical period; a Monday weekly edition still reports last week.
 * Read failures deliberately propagate so an ad cannot silently disappear.
 */
export async function resolveTribunePublication(input: TribunePublicationInput): Promise<TribunePublication> {
  schoolId(input.hsid);
  if (!['daily', 'weekly'].includes(input.cadence) || !validReportDate(input.periodStart) || !validReportDate(input.periodEnd)
      || input.periodStart > input.periodEnd || !Number.isFinite(input.asOf.getTime())) {
    throw new Error('Invalid publication period');
  }
  const result = await query<PublicationRow>(PUBLICATION_SQL, [input.hsid, input.asOf.toISOString(), input.cadence, phoenixDate(input.asOf)]);
  const row = result.rows[0];
  if (!row) throw new Error('Publication snapshot unavailable');
  const publication: TribunePublication = {
    officialRulesUrl: httpsUrl(row.official_rules_url),
    sweepstakesReminder: text(row.sweepstakes_reminder), postalAddress: text(row.postal_address),
  };
  if (row.masthead != null) {
    const masthead = record(row.masthead);
    const imageUrl = httpsUrl(masthead.imageUrl);
    if (!imageUrl || (masthead.includesTagline != null && typeof masthead.includesTagline !== 'boolean')) throw new Error('Saved masthead is incomplete');
    publication.masthead = {
      imageUrl, alt: requiredText(masthead.alt), includesTagline: masthead.includesTagline as boolean | undefined,
      assetId: text(masthead.assetId),
    };
  }
  if (row.sponsor_id != null) {
    publication.sponsor = mapCreativeToSponsor({
      hsid: input.hsid,
      brand: { id: row.sponsor_id, name: requiredText(row.sponsor_name), logo_url: row.sponsor_logo },
      creative: {
        id: requiredText(row.creative_id), revision: revision(row.creative_revision),
        headline: requiredText(row.creative_headline), body: requiredText(row.creative_body),
        image_url: row.creative_image, image_alt: row.creative_alt,
        destination_url: requiredText(row.creative_destination), cta: requiredText(row.creative_cta),
        acknowledgment: row.creative_acknowledgment,
      },
    });
  }
  if (row.note_id != null) {
    const metadata = record(row.note_metadata);
    publication.publisherNote = {
      id: row.note_id, title: text(metadata.title) || 'Publisher’s Note',
      paragraphs: requiredText(row.note_text).split(/\r?\n\s*\r?\n/).map(paragraph => paragraph.trim()).filter(Boolean),
      byline: text(metadata.byline), imageUrl: httpsUrl(row.note_image),
      ctaLabel: text(row.note_cta_label), ctaUrl: httpsUrl(row.note_cta_url), revision: revision(row.note_revision),
    };
  }
  return publication;
}
