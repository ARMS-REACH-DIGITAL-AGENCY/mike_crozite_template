import 'server-only';
import { cache } from 'react';
import { getBatchDesignatedPlayerImages, query } from './db';
import { getMlbHeadshotUrl } from './playerImage';
import { storyAssetUrl } from './storyAssets';

export type PlayerHeadshot = {
  playerid: string;
  image_url: string;
  source: 'approved_photo' | 'verified_mlb';
};

/**
 * A designated, approved photo always wins. If none exists, an approved
 * explicitly current Connect & Contribute headshot is used. Historical
 * season-headshots remain on the career timeline. Otherwise an unambiguous
 * verified MLB identity supplies an official headshot candidate.
 */
export const getBatchPlayerHeadshots = cache(async function getBatchPlayerHeadshots(
  playerIds: string[],
): Promise<Map<string, PlayerHeadshot>> {
  const ids = [...new Set(playerIds.map(String).map((id) => id.trim()).filter(Boolean))];
  const result = new Map<string, PlayerHeadshot>();
  if (!ids.length) return result;

  const [designated, contributed, identities] = await Promise.all([
    getBatchDesignatedPlayerImages(ids, 'HEADSHOT'),
    query<{ playerid: string; description: string | null }>(
      `SELECT playerid::text AS playerid, description
         FROM media_upload
        WHERE playerid = ANY($1::text[])
          AND purpose = 'headshot'
          AND status = 'approved'
        ORDER BY playerid,
                 date_taken DESC NULLS LAST,
                 uploaded_at DESC,
                 id DESC`,
      [ids],
    ).catch((error) => {
      console.error('Approved contributed headshot lookup failed', { error });
      return { rows: [] as { playerid: string; description: string | null }[] };
    }),
    query<{ playerid: string; mlb_player_id: string }>(
      `SELECT playerid, MIN(source_player_id) AS mlb_player_id
         FROM player_source_map
        WHERE playerid = ANY($1::text[])
          AND source = 'mlb_api'
          AND match_method IS DISTINCT FROM 'rejected_bad_identity_match'
        GROUP BY playerid
       HAVING COUNT(DISTINCT source_player_id) = 1
          AND BOOL_OR(is_verified IS TRUE)
          AND MIN(source_player_id) ~ '^[0-9]+$'`,
      [ids],
    ).catch((error) => {
      console.error('Verified player headshot lookup failed', { error });
      return { rows: [] as { playerid: string; mlb_player_id: string }[] };
    }),
  ]);

  for (const row of identities.rows) {
    const image = getMlbHeadshotUrl(row.mlb_player_id);
    if (image) {
      result.set(String(row.playerid), {
        playerid: String(row.playerid),
        image_url: image,
        source: 'verified_mlb',
      });
    }
  }

  // Historical headshots are season-specific career-path assets, not the
  // official current headshot. Never promote a year-labelled upload solely
  // because it is the newest approved headshot in media_upload.
  const selectedCurrent = new Set<string>();
  for (const row of contributed.rows) {
    if (selectedCurrent.has(String(row.playerid))) continue;
    let parsed: { currentSeason?: boolean; published_assets?: string[] } = {};
    try { parsed = JSON.parse(row.description || '{}'); } catch {}
    if (parsed.currentSeason !== true) continue;
    const key = (parsed.published_assets || []).find(
      (value) => value === `players/now/${row.playerid}.jpg`,
    );
    const image = key ? storyAssetUrl(key) : null;
    if (image) {
      selectedCurrent.add(String(row.playerid));
      result.set(String(row.playerid), {
        playerid: String(row.playerid),
        image_url: image,
        source: 'approved_photo',
      });
    }
  }

  // Explicit HEADSHOT designation stays authoritative over every fallback.
  for (const [id, photo] of designated) {
    const image = String(photo?.image_url || '').trim();
    if (image) result.set(id, { playerid: id, image_url: image, source: 'approved_photo' });
  }

  return result;
});
