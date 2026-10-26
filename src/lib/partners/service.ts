import 'server-only';
import { randomUUID } from 'node:crypto';
import { query } from '@/lib/tribune/db';
import { PartnerAccessError, assertPublisherAccess, assertSponsorAccess, type PartnerAccess } from './access';
import { brandInput, creativeInput, membershipInput, noteInput, partnerId, placementInput, publicationInput, schoolId, type CreativeInput } from './validation';

type Row = Record<string, unknown>;
type Body = Record<string, unknown>;
const iso = (value: unknown) => value instanceof Date ? value.toISOString() : value ? String(value) : null;
const text = (value: unknown) => value == null ? '' : String(value);
const bool = (value: unknown) => value === true;
export const EMPTY_PUBLICATION = { revision: 0, masthead: null, officialRulesUrl: '', sweepstakesReminder: '', postalAddress: '' };
const PENDING_LOGO = 'https://yatstats.com/img/sponsor-logo-pending.svg';

export function brandRecord(row: Row) {
  return { id: text(row.id), name: text(row.name), logoUrl: text(row.logo_url), websiteUrl: text(row.website_url), isActive: bool(row.is_active) };
}
export function creativeRecord(row: Row) {
  return {
    id: text(row.id), sponsorId: text(row.sponsor_id), revision: Number(row.revision), status: text(row.status),
    headline: text(row.headline), body: text(row.body), imageUrl: text(row.image_url), imageAlt: text(row.image_alt),
    url: text(row.destination_url), cta: text(row.cta), acknowledgment: text(row.acknowledgment),
    startsAt: iso(row.starts_at), endsAt: iso(row.ends_at), evergreen: bool(row.evergreen),
    schoolIds: (row.school_ids || []) as string[], cadence: text(row.cadence), createdAt: iso(row.created_at),
    previousId: row.previous_id ? text(row.previous_id) : null,
  };
}
export function noteRecord(row: Row) {
  const meta = (row.tribune_metadata || {}) as Row;
  return {
    id: text(row.id), revision: Number(row.revision), title: text(meta.title) || 'Publisher’s Note', body: text(row.message_text),
    byline: text(meta.byline), imageUrl: text(row.image_url), ctaLabel: text(row.cta_label), ctaUrl: text(row.cta_url),
    startsAt: iso(row.starts_at), endsAt: iso(row.ends_at), schoolIds: (meta.schoolIds || (row.school_hsid ? [row.school_hsid] : [])) as string[],
    cadence: text(meta.cadence) || 'both', issueDate: text(meta.issueDate), status: text(row.status),
  };
}
export function publicationRecord(row?: Row) {
  if (!row) return { ...EMPTY_PUBLICATION };
  return {
    revision: Number(row.revision), masthead: row.masthead || null, officialRulesUrl: text(row.official_rules_url),
    sweepstakesReminder: text(row.sweepstakes_reminder), postalAddress: text(row.postal_address),
  };
}
function placementRecord(row: Row) {
  return {
    id: text(row.id), sponsorId: text(row.sponsor_id), hsid: text(row.hsid), schoolName: text(row.school_name),
    sponsorOrderId: row.sponsor_order_id ? text(row.sponsor_order_id) : null,
    status: text(row.status), priority: Number(row.priority), startsAt: iso(row.starts_at), endsAt: iso(row.ends_at), requiresApproval: bool(row.requires_approval),
  };
}

/** Keep a write and its audit row in one database statement/transaction. */
async function write(
  statement: string, params: unknown[], access: PartnerAccess, entity: string, action: string,
  prelude?: string,
): Promise<Row> {
  const n = params.length;
  const result = await query<Row>(`WITH ${prelude ? prelude + ',' : ''} saved AS (${statement}), logged AS (
    INSERT INTO tribune_private.partner_portal_audit(actor_uid,action,entity_type,entity_id,details)
    SELECT $${n + 1},$${n + 2},$${n + 3},id::text,'{}'::jsonb FROM saved
  ) SELECT * FROM saved`, [...params, access.uid, action, entity]);
  if (!result.rows[0]) throw new PartnerAccessError(409, 'This record changed. Refresh it before saving again.');
  return result.rows[0];
}
export const writePartnerRecord = write;
function revision(body: Body, current: Row): number {
  if (!Number.isInteger(body.revision) || body.revision !== Number(current.revision)) {
    throw new PartnerAccessError(409, 'This version changed. Refresh it before saving again.');
  }
  return body.revision as number;
}
function action(body: Body, permitted: string[]): string {
  const value = text(body.action) || 'save';
  if (!permitted.includes(value)) throw new PartnerAccessError(400, 'Choose a valid action.');
  return value;
}

/** Shared identities are logical references; private records never constrain their deletion. */
export async function assertExistingSponsor(sponsorId: string): Promise<void> {
  if (!(await query('SELECT id FROM public.sponsor_brands WHERE id=$1::bigint', [sponsorId])).rows[0]) {
    throw new PartnerAccessError(404, 'That sponsor is no longer available.');
  }
}

export async function searchSchools(access: PartnerAccess, input: string) {
  const q = input.trim().slice(0, 100);
  if (q.length < 2 && !/^\d+$/.test(q)) return { schools: [] };
  const pattern = '%' + q.replace(/[\\%_]/g, '\\$&') + '%';
  const rows = (await query<Row>(`SELECT s.hsid::text,s.hsname,s.hslocation FROM public.school_success s
    WHERE (s.hsname ILIKE $1 ESCAPE '\\' OR s.hsid::text=$2)
      AND ($3::boolean
        OR EXISTS (SELECT 1 FROM tribune_private.school_tribune_sponsorships p WHERE p.hsid=s.hsid::text AND p.sponsor_id=ANY($4::bigint[]) AND p.status<>'cancelled')
        OR EXISTS (SELECT 1 FROM tribune_private.school_sponsor_card_placements p WHERE p.hsid=s.hsid::text AND p.sponsor_id=ANY($4::bigint[]) AND p.status<>'cancelled'))
    ORDER BY (s.hsid::text=$2) DESC,s.hsname,s.hsid LIMIT 30`, [pattern, q, access.publisher, access.sponsorIds])).rows;
  return { schools: rows.map((r) => ({ hsid: text(r.hsid), name: text(r.hsname), location: text(r.hslocation) })) };
}
export async function searchSponsors(access: PartnerAccess, input: string) {
  const pattern = '%' + input.trim().slice(0, 100).replace(/[\\%_]/g, '\\$&') + '%';
  const rows = (await query<Row>(`SELECT * FROM public.sponsor_brands
    WHERE name ILIKE $1 ESCAPE '\\' AND ($2::boolean OR id=ANY($3::bigint[])) ORDER BY name,id LIMIT 50`, [pattern, access.publisher, access.sponsorIds])).rows;
  return { sponsors: rows.map(brandRecord) };
}

/** Administrative reads are bounded and load one selected sponsor at a time. */
export async function dashboard(access: PartnerAccess, selected?: string | null) {
  const selectedId = selected ? assertSponsorAccess(access, partnerId.parse(selected)) : null;
  const brands = (await query<Row>(`SELECT * FROM public.sponsor_brands WHERE $1::boolean OR id=ANY($2::bigint[])
    ORDER BY (id=$3::bigint) DESC NULLS LAST,name,id LIMIT 51`, [access.publisher, access.sponsorIds, selectedId])).rows;
  const hasMoreSponsors = brands.length > 50;
  const sponsors = brands.slice(0, 50).map(brandRecord);
  const sponsorId = selectedId || sponsors[0]?.id || null;
  if (selectedId && !sponsors.some((s) => s.id === selectedId)) throw new PartnerAccessError(404, 'Sponsor not found.');
  const [placements, creatives, orders, notes, settings, memberships, splashPlacements] = await Promise.all([
    query<Row>(`SELECT p.*,s.hsname AS school_name FROM tribune_private.school_tribune_sponsorships p
      LEFT JOIN public.school_success s ON s.hsid::text=p.hsid WHERE p.sponsor_id=$1::bigint ORDER BY s.hsname,p.id DESC LIMIT 1000`, [sponsorId]),
    query<Row>(`SELECT * FROM tribune_private.tribune_sponsor_creatives WHERE sponsor_id=$1::bigint ORDER BY created_at DESC,id DESC LIMIT 100`, [sponsorId]),
    query<Row>(`SELECT o.id,o.hsid,o.sponsorship_type,o.status,o.created_at FROM public.sponsor_orders o
      WHERE EXISTS (SELECT 1 FROM tribune_private.school_tribune_sponsorships p WHERE p.sponsor_id=$1::bigint AND p.sponsor_order_id=o.id)
      OR EXISTS (SELECT 1 FROM public.school_splash_sponsorships p WHERE p.sponsor_id=$1::bigint AND p.sponsor_order_id=o.id)
      ORDER BY o.created_at DESC,o.id DESC LIMIT 50`, [sponsorId]),
    access.publisher ? query<Row>(`SELECT * FROM tribune_private.publisher_notes WHERE page_key='tribune' ORDER BY updated_at DESC,id DESC LIMIT 100`) : Promise.resolve({ rows: [] as Row[] }),
    access.publisher ? query<Row>('SELECT * FROM tribune_private.tribune_publication_settings WHERE id=true') : Promise.resolve({ rows: [] as Row[] }),
    access.publisher ? query<Row>(`SELECT id,firebase_uid,sponsor_id,role,is_active,revision FROM tribune_private.partner_portal_memberships
      WHERE role='publisher' OR sponsor_id=$1::bigint ORDER BY role,id LIMIT 200`, [sponsorId]) : Promise.resolve({ rows: [] as Row[] }),
    query<Row>(`SELECT p.*,s.hsname AS school_name FROM public.school_splash_sponsorships p
      LEFT JOIN public.school_success s ON s.hsid::text=p.hsid WHERE p.sponsor_id=$1::bigint ORDER BY s.hsname,p.id DESC LIMIT 1000`, [sponsorId]),
  ]);
  return {
    user: { uid: access.uid, email: access.email, publisher: access.publisher }, sponsors, selectedSponsorId: sponsorId, hasMoreSponsors,
    placements: placements.rows.map(placementRecord), splashPlacements: splashPlacements.rows.map(placementRecord), creatives: creatives.rows.map(creativeRecord), notes: notes.rows.map(noteRecord),
    publication: publicationRecord(settings.rows[0]),
    memberships: memberships.rows.map((r) => ({ id: text(r.id), revision: Number(r.revision), uid: text(r.firebase_uid), sponsorId: r.sponsor_id ? text(r.sponsor_id) : null, role: text(r.role), isActive: bool(r.is_active) })),
    orders: orders.rows.map((r) => ({ id: text(r.id), hsid: text(r.hsid), sponsorshipType: text(r.sponsorship_type), status: text(r.status), createdAt: iso(r.created_at) })),
  };
}

async function existingCreative(access: PartnerAccess, id: string): Promise<Row> {
  const row = (await query<Row>(`SELECT * FROM tribune_private.tribune_sponsor_creatives
    WHERE id=$1::bigint AND ($2::boolean OR sponsor_id=ANY($3::bigint[]))`, [partnerId.parse(id), access.publisher, access.sponsorIds])).rows[0];
  if (!row) throw new PartnerAccessError(404, 'Advertisement not found.');
  await assertExistingSponsor(text(row.sponsor_id));
  return row;
}
export async function getCreative(access: PartnerAccess, id: string) { return creativeRecord(await existingCreative(access, id)); }

async function ownedAsset(access: PartnerAccess, url: string, sponsorId: string | null, kinds: string[], previousUrl?: string) {
  if (!url || url === previousUrl) return;
  // Publishers may adopt a current brand logo, but new newsletter artwork must
  // still be a normalized, versioned upload belonging to the right account.
  const row = (await query<Row>(`SELECT id FROM tribune_private.partner_portal_assets
    WHERE url=$1 AND sponsor_id IS NOT DISTINCT FROM $2::bigint AND kind=ANY($3::text[]) LIMIT 1`, [url, sponsorId, kinds])).rows[0];
  if (!row) throw new PartnerAccessError(400, 'Upload this artwork to the selected account before saving it.');
  if (sponsorId) assertSponsorAccess(access, sponsorId); else assertPublisherAccess(access);
}
async function permittedSchools(access: PartnerAccess, content: CreativeInput) {
  const rows = (await query<Row>(`SELECT hsid,requires_approval FROM tribune_private.school_tribune_sponsorships
    WHERE sponsor_id=$1::bigint AND status<>'cancelled' AND (ends_at IS NULL OR ends_at>now())
      AND (cardinality($2::text[])=0 OR hsid=ANY($2::text[]))`, [content.sponsorId, content.schoolIds])).rows;
  const entitled = new Set(rows.map((r) => text(r.hsid)));
  if (content.schoolIds.some((id) => !entitled.has(id))) throw new PartnerAccessError(403, 'Choose only schools included in this sponsor’s Tribune placements.');
  return { count: rows.length, reviewRequired: rows.some((r) => r.requires_approval === true) || !rows.length };
}
export async function saveCreative(access: PartnerAccess, body: Body) {
  const requestedAction = action(body, ['save', 'submit', 'publish', 'archive']);
  const current = body.id ? await existingCreative(access, text(body.id)) : null;
  const currentRevision = current ? revision(body, current) : 0;
  if (requestedAction === 'publish') assertPublisherAccess(access);
  if (requestedAction === 'archive') {
    if (!current) throw new PartnerAccessError(400, 'Choose an advertisement.');
    if (current.status === 'published') assertPublisherAccess(access);
    const saved = await write(`UPDATE tribune_private.tribune_sponsor_creatives SET status='archived',revision=revision+1,updated_at=now()
      WHERE id=$1::bigint AND revision=$2 RETURNING *`, [current.id, currentRevision], access, 'creative', 'archive');
    return { creative: creativeRecord(saved) };
  }
  const content = creativeInput.parse({ ...(current ? creativeRecord(current) : {}), ...body });
  assertSponsorAccess(access, content.sponsorId);
  await assertExistingSponsor(content.sponsorId);
  if (current && text(current.sponsor_id) !== content.sponsorId) throw new PartnerAccessError(400, 'An advertisement cannot move to a different sponsor.');
  await ownedAsset(access, content.imageUrl, content.sponsorId, ['ad', 'logo'], text(current?.image_url));
  const permission = await permittedSchools(access, content);
  if (requestedAction !== 'save' && !permission.count) throw new PartnerAccessError(409, 'Assign a Tribune placement before submitting or publishing an advertisement.');
  const status = requestedAction === 'publish' || (requestedAction === 'submit' && (access.publisher || !permission.reviewRequired)) ? 'published' : requestedAction === 'submit' ? 'pending' : 'draft';
  const values: unknown[] = [content.sponsorId, content.headline, content.body, content.imageUrl || null, content.imageAlt,
    content.url, content.cta, content.acknowledgment, content.startsAt, content.endsAt, content.evergreen, content.schoolIds,
    content.cadence, status, status === 'published' ? access.uid : null];
  let saved: Row;
  if (current && !['published', 'archived'].includes(text(current.status))) {
    saved = await write(`UPDATE tribune_private.tribune_sponsor_creatives SET sponsor_id=$1::bigint,headline=$2,body=$3,image_url=$4,image_alt=$5,
      destination_url=$6,cta=$7,acknowledgment=$8,starts_at=$9::timestamptz,ends_at=$10::timestamptz,evergreen=$11,
      school_ids=$12::text[],cadence=$13,status=$14,approved_by=$15,approved_at=CASE WHEN $14='published' THEN now() ELSE NULL END,
      publisher_approved=$18,revision=revision+1,updated_at=now() WHERE id=$16::bigint AND revision=$17 AND status IN ('draft','pending') RETURNING *`,
    [...values, current.id, currentRevision, status === 'published' && access.publisher], access, 'creative', requestedAction);
  } else {
    saved = await write(`INSERT INTO tribune_private.tribune_sponsor_creatives(sponsor_id,headline,body,image_url,image_alt,destination_url,cta,acknowledgment,
      starts_at,ends_at,evergreen,school_ids,cadence,status,approved_by,approved_at,created_by,previous_id,publisher_approved)
      SELECT $1::bigint,$2,$3,$4,$5,$6,$7,$8,$9::timestamptz,$10::timestamptz,$11,$12::text[],$13,$14,$15,
        CASE WHEN $14='published' THEN now() ELSE NULL END,$16,$17::bigint,$18::boolean
      WHERE $17::bigint IS NULL OR EXISTS (SELECT 1 FROM tribune_private.tribune_sponsor_creatives WHERE id=$17::bigint AND revision=$19 AND status IN ('published','archived') FOR SHARE) RETURNING *`,
    [...values, access.uid, current?.id || null, status === 'published' && access.publisher, currentRevision], access, 'creative', requestedAction);
  }
  return { creative: creativeRecord(saved) };
}

export async function saveBrand(access: PartnerAccess, body: Body) {
  const id = body.id ? assertSponsorAccess(access, partnerId.parse(body.id)) : null;
  if (!id) assertPublisherAccess(access);
  const content = brandInput.parse(body);
  const current = id ? (await query<Row>('SELECT * FROM public.sponsor_brands WHERE id=$1::bigint', [id])).rows[0] : null;
  if (id && !current) throw new PartnerAccessError(404, 'Sponsor not found.');
  if (!access.publisher && content.isActive !== current?.is_active) throw new PartnerAccessError(403, 'Only the publisher can activate or pause a sponsor.');
  if (content.logoUrl && content.logoUrl !== text(current?.logo_url)) {
    if (!id) throw new PartnerAccessError(400, 'Create the sponsor account first, then upload its logo.');
    await ownedAsset(access, content.logoUrl, id, ['logo'], text(current?.logo_url));
  }
  const logo = content.logoUrl || text(current?.logo_url) || PENDING_LOGO;
  const active = logo === PENDING_LOGO ? false : content.isActive;
  const saved = id ? await write(`UPDATE public.sponsor_brands SET name=$2,logo_url=$3,website_url=$4,is_active=$5,updated_at=now() WHERE id=$1::bigint RETURNING *`,
    [id, content.name, logo, content.websiteUrl || null, active], access, 'brand', 'update') :
    await write(`INSERT INTO public.sponsor_brands(slug,name,logo_url,website_url,is_active) VALUES($1,$2,$3,$4,$5) RETURNING *`,
      [(content.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'partner') + '-' + randomUUID().slice(0, 8), content.name, logo, content.websiteUrl || null, active], access, 'brand', 'create');
  return { brand: brandRecord(saved) };
}

export async function savePlacement(access: PartnerAccess, body: Body) {
  assertPublisherAccess(access);
  const id = body.id ? partnerId.parse(body.id) : null;
  const content = placementInput.parse(body);
  await assertExistingSponsor(content.sponsorId);
  const school = (await query<Row>('SELECT hsname FROM public.school_success WHERE hsid::text=$1 LIMIT 1', [content.hsid])).rows[0];
  if (!school) throw new PartnerAccessError(400, 'Choose a school from the program search.');
  if (content.sponsorOrderId) {
    const order = (await query<Row>('SELECT id,hsid,status FROM public.sponsor_orders WHERE id=$1::bigint', [content.sponsorOrderId])).rows[0];
    if (!order || (order.hsid && text(order.hsid) !== content.hsid)) throw new PartnerAccessError(400, 'That order does not match this school.');
    if (content.status === 'active' && !['paid', 'active', 'completed', 'succeeded'].includes(text(order.status).toLowerCase())) {
      throw new PartnerAccessError(409, 'This order has not been confirmed paid. Keep the placement paused.');
    }
    const otherBrand = (await query<Row>(`SELECT 1 FROM tribune_private.school_tribune_sponsorships WHERE sponsor_order_id=$1::bigint AND sponsor_id<>$2::bigint
      UNION ALL SELECT 1 FROM public.school_splash_sponsorships WHERE sponsor_order_id=$1::bigint AND sponsor_id<>$2::bigint LIMIT 1`, [content.sponsorOrderId, content.sponsorId])).rows[0];
    if (otherBrand) throw new PartnerAccessError(409, 'That order is assigned to another sponsor.');
  }
  const values: unknown[] = [content.sponsorId, content.hsid, content.sponsorOrderId, content.status, content.priority, content.startsAt, content.endsAt, content.requiresApproval];
  const claim = `claimed_order AS (
    INSERT INTO tribune_private.partner_sponsor_order_claims(order_id,sponsor_id,created_by)
    SELECT $3::bigint,$1::bigint,$10::text WHERE $3::bigint IS NOT NULL
      ${id ? 'AND EXISTS (SELECT 1 FROM tribune_private.school_tribune_sponsorships WHERE id=$9::bigint)' : ''}
    ON CONFLICT(order_id) DO UPDATE SET sponsor_id=EXCLUDED.sponsor_id
      WHERE partner_sponsor_order_claims.sponsor_id=EXCLUDED.sponsor_id
    RETURNING order_id
  )`;
  const claimed = '($3::bigint IS NULL OR EXISTS (SELECT 1 FROM claimed_order))';
  const saved = id ? await write(`UPDATE tribune_private.school_tribune_sponsorships SET sponsor_id=$1::bigint,hsid=$2,sponsor_order_id=$3::bigint,status=$4,priority=$5,
    starts_at=$6::timestamptz,ends_at=$7::timestamptz,requires_approval=$8,updated_at=now() WHERE id=$9::bigint AND ${claimed} RETURNING *`, [...values, id], access, 'placement', 'update', claim) :
    await write(`INSERT INTO tribune_private.school_tribune_sponsorships(sponsor_id,hsid,sponsor_order_id,status,priority,starts_at,ends_at,requires_approval,created_by)
    SELECT $1::bigint,$2,$3::bigint,$4,$5,$6::timestamptz,$7::timestamptz,$8,$9 WHERE ${claimed} RETURNING *`, [...values, access.uid], access, 'placement', 'create', claim);
  return { placement: placementRecord({ ...saved, school_name: school.hsname }) };
}

// Explicit splash-only entitlements. Tribune advertising and title-card access
// never imply a splash placement. Only a verified publisher can activate one.
export async function saveSplashPlacement(access: PartnerAccess, body: Body) {
  assertPublisherAccess(access);
  const id = body.id ? partnerId.parse(body.id) : null;
  const content = placementInput.parse({ ...body, requiresApproval: false });
  const brand = (await query<Row>('SELECT id,is_active,logo_url FROM public.sponsor_brands WHERE id=$1::bigint', [content.sponsorId])).rows[0];
  if (!brand) throw new PartnerAccessError(404, 'Choose an existing Partner organization.');
  if (content.status === 'active' && (!bool(brand.is_active) || !text(brand.logo_url) || text(brand.logo_url) === PENDING_LOGO)) {
    throw new PartnerAccessError(409, 'Upload a real logo and activate the Partner brand before enabling its splash placement.');
  }
  const school = (await query<Row>('SELECT hsname FROM public.school_success WHERE hsid::text=$1 LIMIT 1', [content.hsid])).rows[0];
  if (!school) throw new PartnerAccessError(400, 'Choose a school from the program search.');
  const current = id ? (await query<Row>('SELECT id,sponsor_id FROM public.school_splash_sponsorships WHERE id=$1::bigint', [id])).rows[0] : null;
  if (id && !current) throw new PartnerAccessError(404, 'That splash assignment no longer exists.');
  if (current && text(current.sponsor_id) !== content.sponsorId) throw new PartnerAccessError(409, 'An existing splash assignment cannot change Partner brands.');
  const duplicate = (await query<Row>(`SELECT id FROM public.school_splash_sponsorships
    WHERE sponsor_id=$1::bigint AND hsid=$2 AND status<>'cancelled' AND id<>COALESCE($3::bigint,0) LIMIT 1`,
    [content.sponsorId, content.hsid, id])).rows[0];
  if (duplicate && content.status !== 'cancelled') throw new PartnerAccessError(409, 'This Partner already has a splash assignment for the selected school. Edit that assignment instead.');
  if (content.sponsorOrderId) {
    const order = (await query<Row>('SELECT id,hsid,status FROM public.sponsor_orders WHERE id=$1::bigint', [content.sponsorOrderId])).rows[0];
    if (!order || (order.hsid && text(order.hsid) !== content.hsid)) throw new PartnerAccessError(400, 'That order does not match this school.');
    if (content.status === 'active' && !['paid','active','completed','succeeded'].includes(text(order.status).toLowerCase()))
      throw new PartnerAccessError(409, 'This order is not confirmed paid. Keep the splash assignment paused.');
    const conflict = (await query<Row>(`
      SELECT 1 FROM tribune_private.partner_sponsor_order_claims WHERE order_id=$1::bigint AND sponsor_id<>$2::bigint
      UNION ALL SELECT 1 FROM public.school_splash_sponsorships WHERE sponsor_order_id=$1::bigint AND sponsor_id<>$2::bigint
      UNION ALL SELECT 1 FROM tribune_private.school_tribune_sponsorships WHERE sponsor_order_id=$1::bigint AND sponsor_id<>$2::bigint
      LIMIT 1`, [content.sponsorOrderId, content.sponsorId])).rows[0];
    if (conflict) throw new PartnerAccessError(409, 'That sponsorship order is already assigned to another Partner.');
  }
  const values: unknown[] = [content.sponsorId, content.hsid, content.sponsorOrderId, content.status,
    content.priority, content.startsAt, content.endsAt];
  // write() appends the authorized actor UID, which the atomic claim also uses.
  const actorParam = id ? '$9' : '$8';
  const claim = `claimed_order AS (
    INSERT INTO tribune_private.partner_sponsor_order_claims(order_id,sponsor_id,created_by)
    SELECT $3::bigint,$1::bigint,${actorParam} WHERE $3::bigint IS NOT NULL
    ON CONFLICT(order_id) DO UPDATE SET sponsor_id=EXCLUDED.sponsor_id
      WHERE partner_sponsor_order_claims.sponsor_id=EXCLUDED.sponsor_id
    RETURNING order_id
  )`;
  const claimed = '($3::bigint IS NULL OR EXISTS(SELECT 1 FROM claimed_order))';
  const saved = id
    ? await write(`UPDATE public.school_splash_sponsorships
        SET hsid=$2,sponsor_order_id=$3::bigint,status=$4,priority=$5,
            starts_at=$6::timestamptz,ends_at=$7::timestamptz,source='publisher-desk',updated_at=now()
        WHERE id=$8::bigint AND sponsor_id=$1::bigint AND ${claimed} RETURNING *`,
        [...values, id], access, 'splash_placement', 'update', claim)
    : await write(`INSERT INTO public.school_splash_sponsorships
        (sponsor_id,hsid,sponsor_order_id,status,priority,starts_at,ends_at,source)
        SELECT $1::bigint,$2,$3::bigint,$4,$5,$6::timestamptz,$7::timestamptz,'publisher-desk'
        WHERE ${claimed} RETURNING *`,
        values, access, 'splash_placement', 'create', claim);
  return { splashPlacement: placementRecord({ ...saved, school_name: school.hsname }) };
}

export async function getNote(access: PartnerAccess, id: string) {
  assertPublisherAccess(access);
  const row = (await query<Row>(`SELECT * FROM tribune_private.publisher_notes WHERE id=$1::bigint AND page_key='tribune'`, [partnerId.parse(id)])).rows[0];
  if (!row) throw new PartnerAccessError(404, 'Publisher’s Note not found.');
  return noteRecord(row);
}
export async function saveNote(access: PartnerAccess, body: Body) {
  assertPublisherAccess(access);
  const requestedAction = action(body, ['save', 'publish', 'archive']);
  const id = body.id ? partnerId.parse(body.id) : null;
  const current = id ? (await query<Row>(`SELECT * FROM tribune_private.publisher_notes WHERE id=$1::bigint AND page_key='tribune'`, [id])).rows[0] : null;
  if (id && !current) throw new PartnerAccessError(404, 'Publisher’s Note not found.');
  const currentRevision = current ? revision(body, current) : 0;
  if (requestedAction === 'archive') {
    if (!current) throw new PartnerAccessError(400, 'Choose a note.');
    const row = await write(`UPDATE tribune_private.publisher_notes SET status='archived',revision=revision+1,updated_at=now()
      WHERE id=$1::bigint AND page_key='tribune' AND revision=$2 RETURNING *`, [id, currentRevision], access, 'note', 'archive');
    return { note: noteRecord(row) };
  }
  const content = noteInput.parse({ ...(current ? noteRecord(current) : {}), ...body });
  await ownedAsset(access, content.imageUrl, null, ['notice'], text(current?.image_url));
  if (content.schoolIds.length) {
    const found = (await query<Row>('SELECT hsid::text FROM public.school_success WHERE hsid::text=ANY($1::text[])', [content.schoolIds])).rows;
    if (new Set(found.map((r) => text(r.hsid))).size !== content.schoolIds.length) throw new PartnerAccessError(400, 'Choose schools from the program search.');
  }
  const meta = { title: content.title, byline: content.byline, schoolIds: content.schoolIds, cadence: content.cadence, issueDate: content.issueDate };
  const values: unknown[] = [content.body, content.imageUrl || null, content.ctaLabel || null, content.ctaUrl || null,
    content.startsAt, content.endsAt, JSON.stringify(meta), requestedAction === 'publish' ? 'published' : 'draft', content.schoolIds.length === 1 ? content.schoolIds[0] : null];
  const row = id ? await write(`UPDATE tribune_private.publisher_notes SET message_text=$1,image_url=$2,cta_label=$3,cta_url=$4,starts_at=$5::timestamptz,
    ends_at=$6::timestamptz,tribune_metadata=$7::jsonb,status=$8,school_hsid=$9,revision=revision+1,updated_at=now()
    WHERE id=$10::bigint AND page_key='tribune' AND revision=$11 RETURNING *`, [...values, id, currentRevision], access, 'note', requestedAction) :
    await write(`INSERT INTO tribune_private.publisher_notes(message_text,image_url,cta_label,cta_url,starts_at,ends_at,tribune_metadata,status,school_hsid,page_key)
    VALUES($1,$2,$3,$4,$5::timestamptz,$6::timestamptz,$7::jsonb,$8,$9,'tribune') RETURNING *`, values, access, 'note', requestedAction);
  return { note: noteRecord(row) };
}

export async function savePublication(access: PartnerAccess, body: Body) {
  assertPublisherAccess(access);
  const content = publicationInput.parse(body);
  if (content.masthead) await ownedAsset(access, content.masthead.imageUrl, null, ['masthead']);
  const values: unknown[] = [content.masthead ? JSON.stringify(content.masthead) : null, content.officialRulesUrl || null,
    content.sweepstakesReminder || null, content.postalAddress || null, access.uid];
  const saved = content.revision === 0 ? await write(`INSERT INTO tribune_private.tribune_publication_settings(id,masthead,official_rules_url,sweepstakes_reminder,postal_address,updated_by)
    VALUES(true,$1::jsonb,$2,$3,$4,$5) ON CONFLICT(id) DO NOTHING RETURNING *`, values, access, 'publication', 'create') :
    await write(`UPDATE tribune_private.tribune_publication_settings SET masthead=$1::jsonb,official_rules_url=$2,sweepstakes_reminder=$3,postal_address=$4,
      updated_by=$5,updated_at=now(),revision=revision+1 WHERE id=true AND revision=$6 RETURNING *`, [...values, content.revision], access, 'publication', 'save');
  return { publication: publicationRecord(saved) };
}

export async function saveMembership(access: PartnerAccess, body: Body) {
  assertPublisherAccess(access);
  const id = body.id == null || body.id === '' ? null : partnerId.parse(body.id);
  const content = membershipInput.parse(body);
  const current = id ? (await query<Row>('SELECT * FROM tribune_private.partner_portal_memberships WHERE id=$1::bigint', [id])).rows[0] : null;
  if (id && !current) throw new PartnerAccessError(404, 'That access grant is no longer available.');
  const currentRevision = current ? revision(body, current) : 0;
  if (!current && body.revision != null && body.revision !== 0) throw new PartnerAccessError(400, 'Choose the existing grant before editing it.');
  if (content.sponsorId) await assertExistingSponsor(content.sponsorId);
  if ((content.uid === access.uid && content.role === 'publisher' && !content.isActive) ||
      (current?.firebase_uid === access.uid && current.role === 'publisher' && current.is_active === true &&
       (content.uid !== access.uid || content.role !== 'publisher' || !content.isActive))) {
    throw new PartnerAccessError(409, 'Another publisher must remove your publisher access.');
  }
  const values = [content.uid, content.sponsorId, content.role, content.isActive];
  const saved = id ? await write(`UPDATE tribune_private.partner_portal_memberships
    SET firebase_uid=$1,sponsor_id=$2::bigint,role=$3,is_active=$4,revision=revision+1,updated_at=now()
    WHERE id=$5::bigint AND revision=$6 RETURNING *`, [...values, id, currentRevision], access, 'membership', 'update') :
    await write(`INSERT INTO tribune_private.partner_portal_memberships(firebase_uid,sponsor_id,role,is_active,created_by)
      VALUES($1,$2::bigint,$3,$4,$5) ON CONFLICT DO NOTHING RETURNING *`, [...values, access.uid], access, 'membership', 'create');
  return { membership: { id: text(saved.id), revision: Number(saved.revision), uid: text(saved.firebase_uid), sponsorId: saved.sponsor_id ? text(saved.sponsor_id) : null, role: text(saved.role), isActive: bool(saved.is_active) } };
}

export async function assertSchoolPreview(access: PartnerAccess, hsid: string) {
  schoolId.parse(hsid);
  if (access.publisher) return;
  const row = (await query<Row>(`SELECT 1 FROM tribune_private.school_tribune_sponsorships
    WHERE hsid=$1 AND sponsor_id=ANY($2::bigint[]) AND status<>'cancelled' LIMIT 1`, [hsid, access.sponsorIds])).rows[0];
  if (!row) throw new PartnerAccessError(403, 'Choose a school included in your sponsorship.');
}
