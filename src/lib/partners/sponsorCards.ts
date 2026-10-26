import 'server-only';
import { query } from '@/lib/tribune/db';
import { assertPublisherAccess, assertSponsorAccess, PartnerAccessError, type PartnerAccess } from './access';
import { writePartnerRecord } from './service';
import { partnerId, placementInput, schoolId } from './validation';
import { sponsorCardInput, sponsorCardReadiness, type SponsorCardInput } from './sponsorCardValidation';
import { SPONSOR_CARD_LEVEL, SPONSOR_CARD_SHARE_DEFAULTS, SPONSOR_CARD_STATUSES, type SponsorCardPublic, type SponsorCardRecord } from './sponsorCardTypes';

type Row = Record<string, unknown>;
type Body = Record<string, unknown>;
const text = (value: unknown) => value == null ? '' : String(value);
const instant = (value: unknown) => value instanceof Date ? value.toISOString() : value ? String(value) : null;
const PAID_STATUSES = ['paid', 'active', 'completed', 'succeeded'];

function logoUrl(value: unknown, hsid?: string): string {
  const raw = text(value);
  if (/^\/img\/[A-Za-z0-9_./-]+$/.test(raw) && !raw.includes('..')) return new URL(raw, hsid ? `https://${hsid}.yatstats.com` : 'https://mike-crozite-template.vercel.app').href;
  try { const url = new URL(raw); return url.protocol === 'https:' && !url.username && !url.password ? url.href : ''; } catch { return ''; }
}

export function sponsorCardRecord(row: Row, hsid?: string): SponsorCardRecord {
  const input = sponsorCardInput.parse({ ...(row.content as Body), sponsorId: text(row.sponsor_id), schoolIds: row.school_ids || [], startsAt: instant(row.starts_at), endsAt: instant(row.ends_at) });
  return {
    ...input, id: text(row.id), sponsorName: text(row.sponsor_name), sponsorLogoUrl: logoUrl(row.sponsor_logo_url, hsid),
    revision: Number(row.revision), level: SPONSOR_CARD_LEVEL,
    status: text(row.status) as SponsorCardRecord['status'], previousId: row.previous_id ? text(row.previous_id) : null,
    createdAt: instant(row.created_at) || '', ...(hsid ? { hsid, schoolName: text(row.school_name) } : {}),
    ctaUrl: input.ctaUrl || (input.backTemplate === 'share_promotion' && input.ctaLabel && hsid ? `https://${hsid}.yatstats.com/` : ''),
  };
}

function publicRecord(row: Row, hsid: string): SponsorCardPublic {
  const { status: _status, previousId: _previousId, createdAt: _createdAt, startsAt: _startsAt, endsAt: _endsAt, ...card } = sponsorCardRecord(row, hsid);
  void _status; void _previousId; void _createdAt; void _startsAt; void _endsAt;
  return card;
}

function placementRecord(row: Row) {
  return {
    id: text(row.id), sponsorId: text(row.sponsor_id), hsid: text(row.hsid), schoolName: text(row.school_name),
    sponsorOrderId: row.sponsor_order_id ? text(row.sponsor_order_id) : null,
    status: text(row.status), priority: Number(row.priority), startsAt: instant(row.starts_at), endsAt: instant(row.ends_at), requiresApproval: row.requires_approval === true,
  };
}

export async function sponsorCardDashboard(access: PartnerAccess, selectedSponsorId: string | null) {
  const sponsorId = selectedSponsorId ? assertSponsorAccess(access, partnerId.parse(selectedSponsorId)) : null;
  const [cards, placements] = await Promise.all([
    query<Row>(`SELECT card.*,brand.name AS sponsor_name,brand.logo_url AS sponsor_logo_url
      FROM tribune_private.sponsor_flip_cards card JOIN public.sponsor_brands brand ON brand.id=card.sponsor_id
      WHERE card.sponsor_id=$1::bigint ORDER BY card.created_at DESC,card.id DESC LIMIT 100`, [sponsorId]),
    query<Row>(`SELECT placement.*,school.hsname AS school_name FROM tribune_private.school_sponsor_card_placements placement
      LEFT JOIN public.school_success school ON school.hsid::text=placement.hsid
      WHERE placement.sponsor_id=$1::bigint ORDER BY school.hsname,placement.id DESC LIMIT 1000`, [sponsorId]),
  ]);
  return { cards: cards.rows.map(row => sponsorCardRecord(row)), cardPlacements: placements.rows.map(placementRecord),
    cardDefaults: { sharePromotion: SPONSOR_CARD_SHARE_DEFAULTS, statusOptions: SPONSOR_CARD_STATUSES } };
}

async function existingCard(access: PartnerAccess, id: unknown): Promise<Row> {
  const row = (await query<Row>(`SELECT card.*,brand.name AS sponsor_name,brand.logo_url AS sponsor_logo_url,brand.is_active AS sponsor_is_active
    FROM tribune_private.sponsor_flip_cards card JOIN public.sponsor_brands brand ON brand.id=card.sponsor_id
    WHERE card.id=$1::bigint AND ($2::boolean OR card.sponsor_id=ANY($3::bigint[]))`, [partnerId.parse(id), access.publisher, access.sponsorIds])).rows[0];
  if (!row) throw new PartnerAccessError(404, 'Sponsor card not found.');
  return row;
}

function requireRevision(body: Body, row: Row): number {
  if (!Number.isInteger(body.revision) || body.revision !== Number(row.revision)) throw new PartnerAccessError(409, 'This card changed. Refresh it before saving again.');
  return body.revision as number;
}

async function checkArtwork(access: PartnerAccess, card: SponsorCardInput, previous?: SponsorCardRecord) {
  const requested = ([['frontImageUrl', 'card_front'], ['bannerImageUrl', 'card_banner'], ['fullImageUrl', 'card_full']] as const)
    .filter(([field]) => card[field] && card[field] !== previous?.[field]);
  if (!requested.length) return;
  assertSponsorAccess(access, card.sponsorId);
  const assets = (await query<{ url: string; kind: string }>(`SELECT url,kind FROM tribune_private.partner_portal_assets
    WHERE sponsor_id=$1::bigint AND url=ANY($2::text[])`, [card.sponsorId, requested.map(([field]) => card[field])])).rows;
  for (const [field, kind] of requested) if (!assets.some(asset => asset.url === card[field] && (asset.kind === kind || asset.kind === 'logo'))) {
    throw new PartnerAccessError(400, 'Upload each card image to the selected sponsor account before saving it.');
  }
}

async function cardEntitlements(card: SponsorCardInput) {
  const placements = (await query<{ hsid: string; requires_approval: boolean }>(`SELECT hsid,requires_approval
    FROM tribune_private.school_sponsor_card_placements WHERE sponsor_id=$1::bigint AND status<>'cancelled'
      AND (ends_at IS NULL OR ends_at>now()) AND (cardinality($2::text[])=0 OR hsid=ANY($2::text[]))`, [card.sponsorId, card.schoolIds])).rows;
  const schools = new Set(placements.map(placement => placement.hsid));
  if (card.schoolIds.some(id => !schools.has(id))) throw new PartnerAccessError(403, 'Choose only schools with an assigned title-sponsor card placement.');
  return { count: placements.length, reviewRequired: !placements.length || placements.some(placement => placement.requires_approval) };
}

export async function saveSponsorCard(access: PartnerAccess, body: Body) {
  const action = text(body.action) || 'save';
  if (!['save', 'submit', 'publish', 'archive'].includes(action)) throw new PartnerAccessError(400, 'Choose a valid card action.');
  const current = body.id ? await existingCard(access, body.id) : null;
  const revision = current ? requireRevision(body, current) : 0;
  if (action === 'publish') assertPublisherAccess(access);
  if (action === 'archive') {
    if (!current) throw new PartnerAccessError(400, 'Choose a sponsor card.');
    if (current.status === 'published') assertPublisherAccess(access);
    const archived = await writePartnerRecord(`UPDATE tribune_private.sponsor_flip_cards
      SET status='archived',revision=revision+1,updated_at=now() WHERE id=$1::bigint AND revision=$2 RETURNING *`,
      [current.id, revision], access, 'sponsor_card', action);
    return { card: sponsorCardRecord({ ...current, ...archived }) };
  }
  const prior = current ? sponsorCardRecord(current) : undefined;
  const card = sponsorCardInput.parse({ ...(prior || {}), ...body });
  assertSponsorAccess(access, card.sponsorId);
  if (current && text(current.sponsor_id) !== card.sponsorId) throw new PartnerAccessError(400, 'A card cannot move to another sponsor.');
  const brand = (await query<Row>('SELECT name,logo_url FROM public.sponsor_brands WHERE id=$1::bigint', [card.sponsorId])).rows[0];
  if (!brand) throw new PartnerAccessError(404, 'Sponsor not found.');
  await checkArtwork(access, card, prior);
  const permission = await cardEntitlements(card);
  if (action !== 'save') {
    if (!permission.count) throw new PartnerAccessError(409, 'Assign a title-sponsor card placement before submitting or publishing this card.');
    const problems = sponsorCardReadiness(card);
    if (problems.length) throw new PartnerAccessError(400, problems.join(' '));
  }
  const status = action === 'publish' || (action === 'submit' && (access.publisher || !permission.reviewRequired)) ? 'published' : action === 'submit' ? 'pending' : 'draft';
  const { sponsorId, schoolIds, startsAt, endsAt, ...content } = card;
  const values = [sponsorId, JSON.stringify(content), schoolIds, startsAt, endsAt, status, status === 'published' && access.publisher, status === 'published' ? access.uid : null];
  let saved: Row;
  if (current && ['draft', 'pending'].includes(text(current.status))) {
    saved = await writePartnerRecord(`UPDATE tribune_private.sponsor_flip_cards SET content=$2::jsonb,school_ids=$3::text[],starts_at=$4::timestamptz,
      ends_at=$5::timestamptz,status=$6,publisher_approved=$7,approved_by=$8,approved_at=CASE WHEN $6='published' THEN now() ELSE NULL END,
      revision=revision+1,updated_at=now() WHERE sponsor_id=$1::bigint AND id=$9::bigint AND revision=$10 AND status IN ('draft','pending') RETURNING *`,
      [...values, current.id, revision], access, 'sponsor_card', action);
  } else {
    saved = await writePartnerRecord(`INSERT INTO tribune_private.sponsor_flip_cards(sponsor_id,content,school_ids,starts_at,ends_at,status,
      publisher_approved,approved_by,approved_at,created_by,previous_id)
      SELECT $1::bigint,$2::jsonb,$3::text[],$4::timestamptz,$5::timestamptz,$6,$7::boolean,$8,
        CASE WHEN $6='published' THEN now() ELSE NULL END,$9,$10::bigint
      WHERE $10::bigint IS NULL OR EXISTS (SELECT 1 FROM tribune_private.sponsor_flip_cards
        WHERE id=$10::bigint AND sponsor_id=$1::bigint AND revision=$11 AND status IN ('published','archived') FOR SHARE) RETURNING *`,
      [...values, access.uid, current?.id || null, revision], access, 'sponsor_card', action);
  }
  return { card: sponsorCardRecord({ ...saved, sponsor_name: brand.name, sponsor_logo_url: brand.logo_url }) };
}

export async function saveSponsorCardPlacement(access: PartnerAccess, body: Body) {
  assertPublisherAccess(access);
  const id = body.id ? partnerId.parse(body.id) : null;
  const placement = placementInput.parse(body);
  const [brand, school] = await Promise.all([
    query<Row>('SELECT id FROM public.sponsor_brands WHERE id=$1::bigint', [placement.sponsorId]),
    query<Row>('SELECT hsname FROM public.school_success WHERE hsid::text=$1 LIMIT 1', [placement.hsid]),
  ]);
  if (!brand.rows.length) throw new PartnerAccessError(404, 'Sponsor not found.');
  if (!school.rows.length) throw new PartnerAccessError(400, 'Choose a school from the program search.');
  if (placement.sponsorOrderId) {
    const order = (await query<Row>('SELECT id,hsid,status FROM public.sponsor_orders WHERE id=$1::bigint', [placement.sponsorOrderId])).rows[0];
    if (!order || (order.hsid && text(order.hsid) !== placement.hsid)) throw new PartnerAccessError(400, 'That order does not match this school.');
    if (placement.status === 'active' && !PAID_STATUSES.includes(text(order.status).toLowerCase())) throw new PartnerAccessError(409, 'This order has not been confirmed paid. Keep the card placement paused.');
    const other = (await query<Row>(`SELECT 1 FROM public.school_splash_sponsorships WHERE sponsor_order_id=$1::bigint AND sponsor_id<>$2::bigint
      UNION ALL SELECT 1 FROM tribune_private.school_tribune_sponsorships WHERE sponsor_order_id=$1::bigint AND sponsor_id<>$2::bigint
      UNION ALL SELECT 1 FROM tribune_private.school_sponsor_card_placements WHERE sponsor_order_id=$1::bigint AND sponsor_id<>$2::bigint LIMIT 1`, [placement.sponsorOrderId, placement.sponsorId])).rows[0];
    if (other) throw new PartnerAccessError(409, 'That order is assigned to another sponsor.');
  }
  const values: unknown[] = [placement.sponsorId, placement.hsid, placement.sponsorOrderId, placement.status, placement.priority, placement.startsAt, placement.endsAt, placement.requiresApproval];
  const claim = `claimed_order AS (
    INSERT INTO tribune_private.partner_sponsor_order_claims(order_id,sponsor_id,created_by)
    SELECT $3::bigint,$1::bigint,$10::text WHERE $3::bigint IS NOT NULL
      ${id ? 'AND EXISTS (SELECT 1 FROM tribune_private.school_sponsor_card_placements WHERE id=$9::bigint)' : ''}
    ON CONFLICT(order_id) DO UPDATE SET sponsor_id=EXCLUDED.sponsor_id
      WHERE partner_sponsor_order_claims.sponsor_id=EXCLUDED.sponsor_id RETURNING order_id
  )`;
  const claimed = '($3::bigint IS NULL OR EXISTS (SELECT 1 FROM claimed_order))';
  const saved = id ? await writePartnerRecord(`UPDATE tribune_private.school_sponsor_card_placements SET sponsor_id=$1::bigint,hsid=$2,sponsor_order_id=$3::bigint,
      status=$4,priority=$5,starts_at=$6::timestamptz,ends_at=$7::timestamptz,requires_approval=$8,updated_at=now()
      WHERE id=$9::bigint AND ${claimed} RETURNING *`, [...values, id], access, 'sponsor_card_placement', 'update', claim) :
    await writePartnerRecord(`INSERT INTO tribune_private.school_sponsor_card_placements(sponsor_id,hsid,sponsor_order_id,status,priority,starts_at,ends_at,requires_approval,created_by)
      SELECT $1::bigint,$2,$3::bigint,$4,$5,$6::timestamptz,$7::timestamptz,$8,$9 WHERE ${claimed} RETURNING *`, [...values, access.uid], access, 'sponsor_card_placement', 'create', claim);
  return { placement: placementRecord({ ...saved, school_name: school.rows[0].hsname }) };
}

/** One school-level query: approved title cards never enter player/stat tables. */
export async function getPublicSponsorCards(hsid: string, asOf = new Date()): Promise<SponsorCardPublic[]> {
  schoolId.parse(hsid);
  const rows = (await query<Row>(`SELECT * FROM (
    SELECT DISTINCT ON (placement.sponsor_id) card.*,brand.name AS sponsor_name,brand.logo_url AS sponsor_logo_url,
      school.hsname AS school_name,placement.priority AS placement_priority
    FROM tribune_private.school_sponsor_card_placements placement
    JOIN public.sponsor_brands brand ON brand.id=placement.sponsor_id AND brand.is_active=true
    JOIN public.school_success school ON school.hsid::text=placement.hsid
    JOIN tribune_private.sponsor_flip_cards card ON card.sponsor_id=placement.sponsor_id AND card.status='published' AND card.level='SPONSOR'
    LEFT JOIN public.sponsor_orders paid_order ON paid_order.id=placement.sponsor_order_id
    WHERE placement.hsid=$1 AND placement.status='active' AND placement.starts_at<=$2::timestamptz
      AND (placement.ends_at IS NULL OR placement.ends_at>$2::timestamptz)
      AND (placement.sponsor_order_id IS NULL OR (lower(paid_order.status)=ANY($3::text[]) AND (paid_order.hsid IS NULL OR paid_order.hsid::text=$1)))
      AND (NOT placement.requires_approval OR card.publisher_approved)
      AND (card.starts_at IS NULL OR card.starts_at<=$2::timestamptz) AND (card.ends_at IS NULL OR card.ends_at>$2::timestamptz)
      AND (cardinality(card.school_ids)=0 OR $1=ANY(card.school_ids))
    ORDER BY placement.sponsor_id,placement.priority DESC,(cardinality(card.school_ids)>0) DESC,
      card.starts_at DESC NULLS LAST,card.id DESC,placement.starts_at DESC,placement.id DESC
  ) selected ORDER BY placement_priority DESC,id DESC LIMIT 100`, [hsid, asOf.toISOString(), PAID_STATUSES])).rows;
  const cards: SponsorCardPublic[] = [];
  for (const row of rows) {
    try { cards.push(publicRecord(row, hsid)); }
    catch { console.error('[sponsor-cards] invalid published card omitted', { id: text(row.id) }); }
  }
  return cards;
}

export async function sponsorCardPreview(access: PartnerAccess, body: Body) {
  const hsid = schoolId.parse(body.hsid);
  const row = await existingCard(access, body.cardId);
  const placement = (await query<Row>(`SELECT * FROM tribune_private.school_sponsor_card_placements WHERE sponsor_id=$1::bigint AND hsid=$2
    AND status<>'cancelled' ORDER BY priority DESC,id DESC LIMIT 1`, [row.sponsor_id, hsid])).rows[0];
  if (!access.publisher && !placement) throw new PartnerAccessError(403, 'Choose a school assigned to this title sponsor.');
  const school = (await query<Row>('SELECT hsname FROM public.school_success WHERE hsid::text=$1 LIMIT 1', [hsid])).rows[0];
  if (!school) throw new PartnerAccessError(400, 'Choose a school from the program search.');
  const card = publicRecord({ ...row, school_name: school.hsname }, hsid);
  const warnings = sponsorCardReadiness(sponsorCardInput.parse({ ...(row.content as Body), sponsorId: text(row.sponsor_id) }));
  if (row.status !== 'published') warnings.push('This is a draft or review proof. Previewing does not publish the card.');
  if (row.sponsor_is_active !== true) warnings.push('The sponsor brand is inactive.');
  if (!placement || placement.status !== 'active') warnings.push('This school has no active title-sponsor card placement.');
  const now = Date.now();
  if ((placement?.starts_at && Date.parse(instant(placement.starts_at)!) > now) || (placement?.ends_at && Date.parse(instant(placement.ends_at)!) <= now)) warnings.push('The title-card placement is outside its publication dates.');
  if ((row.starts_at && Date.parse(instant(row.starts_at)!) > now) || (row.ends_at && Date.parse(instant(row.ends_at)!) <= now)) warnings.push('This card version is outside its publication dates.');
  if (Array.isArray(row.school_ids) && row.school_ids.length && !row.school_ids.includes(hsid)) warnings.push('This card version does not target the selected school.');
  if (placement?.requires_approval && row.publisher_approved !== true) warnings.push('This placement requires publisher approval.');
  return { card, warnings };
}
