import 'server-only';
import { query } from '@/lib/tribune/db';
import { verifyFirebaseIdToken } from '@/lib/firebaseIdToken';

export type PartnerAccess = {
  uid: string;
  email: string;
  publisher: boolean;
  sponsorIds: string[];
};

export type PartnerMembership = {
  sponsor_id: string | number | null;
  role: string;
  is_active: boolean;
};

export class PartnerAccessError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'PartnerAccessError';
    this.status = status;
  }
}

/** Database IDs stay strings so bigint sponsor IDs never lose precision. */
export function normalizeSponsorId(value: unknown): string {
  const text = typeof value === 'string'
    ? value.trim()
    : typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : '';
  if (!/^[0-9]{1,19}$/.test(text)) {
    throw new PartnerAccessError(400, 'Choose a valid sponsor.');
  }
  const id = BigInt(text);
  if (id < BigInt(1) || id > BigInt('9223372036854775807')) {
    throw new PartnerAccessError(400, 'Choose a valid sponsor.');
  }
  return id.toString();
}

/** Explicit UID bootstrap only; email, profile labels, and cookies never grant access. */
export function parsePartnerPublisherUids(value: string | undefined): string[] {
  if (!value?.trim()) return [];
  const entries = value.split(',').map((entry) => entry.trim());
  if (entries.length > 25 || entries.some((entry) => !/^[A-Za-z0-9:_-]{1,128}$/.test(entry))) {
    throw new PartnerAccessError(503, 'Publisher access configuration needs attention.');
  }
  return [...new Set(entries)];
}

/** Pure permission resolution, also used by the server authorization tests. */
export function resolvePartnerAccess(
  identity: { uid: string; email?: string },
  memberships: readonly PartnerMembership[],
  publisherUids: readonly string[] = [],
): PartnerAccess {
  if (!identity.uid || identity.uid.length > 128) {
    throw new PartnerAccessError(401, 'Sign in again to continue.');
  }
  let publisher = publisherUids.includes(identity.uid);
  const sponsorIds = new Set<string>();
  for (const membership of memberships) {
    if (membership.is_active !== true) continue;
    if (membership.role === 'publisher' && membership.sponsor_id == null) {
      publisher = true;
    } else if (membership.role === 'sponsor' && membership.sponsor_id != null) {
      try {
        sponsorIds.add(normalizeSponsorId(membership.sponsor_id));
      } catch {
        // A malformed grant cannot add permissions.
      }
    }
  }
  if (!publisher && sponsorIds.size === 0) {
    throw new PartnerAccessError(403, 'This account has not been granted partner portal access.');
  }
  return { uid: identity.uid, email: identity.email || '', publisher, sponsorIds: [...sponsorIds] };
}

export function assertSponsorAccess(access: PartnerAccess, sponsorId: unknown): string {
  const id = normalizeSponsorId(sponsorId);
  if (!access.publisher && !access.sponsorIds.includes(id)) {
    throw new PartnerAccessError(403, 'This account cannot manage that sponsor.');
  }
  return id;
}

export function assertPublisherAccess(access: PartnerAccess): void {
  if (!access.publisher) {
    throw new PartnerAccessError(403, 'Publisher access is required.');
  }
}

/** Only a verified Firebase Bearer token can enter the partner portal. */
export async function requirePartnerAccess(request: Pick<Request, 'headers'>): Promise<PartnerAccess> {
  const authorization = request.headers.get('authorization') || '';
  const bearer = /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/i.exec(authorization);
  if (!bearer || authorization.length > 8192) {
    throw new PartnerAccessError(401, 'Sign in to open the partner portal.');
  }
  if (!(process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID)) {
    throw new PartnerAccessError(503, 'Partner sign-in is not configured yet.');
  }
  const identity = await verifyFirebaseIdToken(bearer[1]);
  if (!identity) throw new PartnerAccessError(401, 'Your sign-in has expired. Please sign in again.');

  const publisherUids = parsePartnerPublisherUids(process.env.PARTNER_PUBLISHER_UIDS);
  let memberships: PartnerMembership[];
  try {
    memberships = (await query<PartnerMembership>(
      `SELECT sponsor_id::text, role, is_active
         FROM public.partner_portal_memberships
        WHERE firebase_uid = $1 AND is_active = true`,
      [identity.uid],
    )).rows;
  } catch {
    // Missing schema or unavailable authorization storage is never a grant.
    throw new PartnerAccessError(503, 'Partner access is temporarily unavailable.');
  }
  return resolvePartnerAccess(identity, memberships, publisherUids);
}
