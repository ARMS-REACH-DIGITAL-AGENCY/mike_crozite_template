// Permanent person identity for all future provider imports.
// The YAT Registry is authoritative. TBC/MLB/Presto/SIDEARM numbers never
// replace the YAT ID; they remain source-specific external references.
// Service-only: never leak youth identity linkage in public search results.
import 'server-only';
import { query } from '@/lib/db';

export type VerifiedPlayerSource =
  'tbc' | 'mlb' | 'presto_sports' | 'sidearm' | 'yat_card' | 'yat_legacy';

const SOURCES = new Set<VerifiedPlayerSource>([
  'tbc', 'mlb', 'presto_sports', 'sidearm', 'yat_card', 'yat_legacy',
]);

function checkedSource(value: VerifiedPlayerSource): VerifiedPlayerSource {
  if (!SOURCES.has(value)) throw new Error('Unsupported YAT player identity source');
  return value;
}

// Scoped provider IDs: roster-scoped SIDEARM/Presto IDs may repeat at different
// colleges. Importers must provide a unique institution namespace when their
// provider does not guarantee globally unique player identifiers.
export function externalPlayerKey(source: VerifiedPlayerSource, sourceId: string, institutionId?: string): string {
  checkedSource(source);
  const id = String(sourceId || '').trim();
  if (!id || id.length > 128) throw new Error('Invalid external player ID');
  if (source === 'presto_sports' || source === 'sidearm') {
    const organization = String(institutionId || '').trim();
    if (!organization || organization.length > 128) {
      throw new Error('Presto/SIDEARM player identity requires institution scope');
    }
    return organization + ':' + id;
  }
  return id;
}

// One indexed batch lookup per importer group, not a query for every player.
// A missing match remains UNRESOLVED; never guess from name alone.
export async function findYatIdsByProvider(
  source: VerifiedPlayerSource,
  sourceIds: string[],
): Promise<Map<string, string>> {
  checkedSource(source);
  const ids = [...new Set(sourceIds.map((s) => String(s).trim()).filter(Boolean))];
  if (ids.length > 2000) throw new Error('Resolve provider identities in batches of at most 2000');
  if (!ids.length) return new Map();
  const { rows } = await query<{ source_id: string; yatid: string }>(
    `SELECT source_id,yatid FROM public.yat_registry_ids
       WHERE source=$1 AND source_id=ANY($2::text[])`,
    [source, ids],
  );
  return new Map(rows.map((r) => [r.source_id, r.yatid]));
}

export async function findYatIdByProvider(
  source: VerifiedPlayerSource, sourceId: string, institutionId?: string,
): Promise<string | null> {
  const key = externalPlayerKey(source, sourceId, institutionId);
  return (await findYatIdsByProvider(source, [key])).get(key) || null;
}
