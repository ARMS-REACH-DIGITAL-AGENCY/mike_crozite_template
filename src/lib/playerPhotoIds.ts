import 'server-only';
import { query } from '@/lib/db';
import { playerPhotoId } from '@/lib/playerImage';

/**
 * YAT key step 6 (Pete, Nov 19 2026): photo files are named by the YAT ID.
 * Card number -> the id its photo files are named by, for a list of cards, in
 * one query (public.yat_id_for, the lookup the database uses everywhere).
 * A card with no YAT ID keeps its own number.
 */
export async function getPlayerPhotoIds(cardIds: string[]): Promise<Map<string, string>> {
  const ids = [...new Set(cardIds.map((id) => String(id || '').trim()).filter(Boolean))];
  const out = new Map<string, string>(ids.map((id) => [id, playerPhotoId(id, id)]));
  if (!ids.length) return out;
  const { rows } = await query<{ id: string; yatid: string | null }>(
    'SELECT x AS id, public.yat_id_for(x) AS yatid FROM unnest($1::text[]) x',
    [ids],
  );
  for (const row of rows) out.set(String(row.id), playerPhotoId(row.yatid, row.id));
  return out;
}
