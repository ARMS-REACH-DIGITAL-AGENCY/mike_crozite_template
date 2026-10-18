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
 * A designated, approved photo always wins. If none exists, an unambiguous
 * verified MLB identity supplies an official headshot candidate. This reads
 * existing evidence; it neither creates an identity link nor writes a photo.
 */
export const getBatchPlayerHeadshots = cache(async function getBatchPlayerHeadshots(
  playerIds: string[],
): Promise<Map<string, PlayerHeadshot>> {
  const ids = [...new Set(playerIds.map(String).map((id) => id.trim()).filter(Boolean))];
  const result = new Map<string, PlayerHeadshot>();
  if (!ids.length) return result;

  const [designated, identities, contributed] = await Promise.all([
    getBatchDesignatedPlayerImages(ids, 'HEADSHOT'),
    query<{ playerid: string; description: string | null; date_taken: string | null; uploaded_at: string }>(
      `SELECT DISTINCT ON (playerid)
              playerid::text AS playerid, description, date_taken::text, uploaded_at::text
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
      return { rows: [] };
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
          AND MIN(source_player_id) ~ '^[0-9]+

  for (const row of identities.rows) {
    const image = getMlbHeadshotUrl(row.mlb_player_id);
    if (image) result.set(String(row.playerid), {
      playerid: String(row.playerid), image_url: image, source: 'verified_mlb',
    });
  }
  // A Connect & Contribute headshot is already an approved designation by
  // intent, even when the player is retired and therefore had no
  // "currentSeason" flag. Use its published season-headshot asset for
  // search/gallery cards instead of falling all the way to a silhouette.
  for (const row of contributed.rows) {
    let parsed: { published_assets?: string[] } = {};
    try { parsed = JSON.parse(row.description || '{}'); } catch {}
    const key = (parsed.published_assets || []).find((value) =>
      typeof value === 'string' && value.startsWith('players/season-headshots/')
    );
    if (!key) continue;
    result.set(String(row.playerid), {
      playerid: String(row.playerid),
      image_url: storyAssetUrl(key),
      source: 'approved_photo',
    });
  }
  for (const [id, photo] of designated) {
    const image = String(photo?.image_url || '').trim();
    if (image) result.set(id, { playerid: id, image_url: image, source: 'approved_photo' });
  }
  return result;
});
`,
      [ids],
    ).catch((error) => {
      console.error('Verified player headshot lookup failed', { error });
      return { rows: [] };
    }),
  ]);

  for (const row of identities.rows) {
    const image = getMlbHeadshotUrl(row.mlb_player_id);
    if (image) result.set(String(row.playerid), {
      playerid: String(row.playerid), image_url: image, source: 'verified_mlb',
    });
  }
  for (const [id, photo] of designated) {
    const image = String(photo?.image_url || '').trim();
    if (image) result.set(id, { playerid: id, image_url: image, source: 'approved_photo' });
  }
  return result;
});
