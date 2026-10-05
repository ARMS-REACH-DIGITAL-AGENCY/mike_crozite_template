// Instagram posts for the Social tab, read through Meta's Business
// Discovery API: our own professional account (@yat_stats, linked to the
// YatStats Facebook Page) reads the public posts of any other Creator or
// Business account by username. Players never have to sign in. Personal
// accounts can't be read - Meta answers with an error, kept on the run's
// report, and the profile just shows the @handle link.
//
// Token: META_IG_ACCESS_TOKEN, a Business Manager system-user token with
// instagram_basic, instagram_manage_insights, pages_show_list and
// pages_read_engagement. META_IG_USER_ID is optional; without it the
// @yat_stats account id is looked up from the Page the token can see.
//
// Instagram's image links expire within days, so each post's picture is
// copied once to S3 (stories/instagram/<handle>/<post id>.webp - the
// stories/ folder is already publicly readable; a new top-level folder
// is not) and the
// profile only ever loads our copy.
import sharp from 'sharp';
import type { Pool } from 'pg';
import { putPublicAsset } from './stories';
import { storyAssetUrl } from './storyAssets';

const GRAPH = 'https://graph.facebook.com/v23.0';
export const POSTS_PER_ACCOUNT = 12;

type GraphMedia = {
  id: string;
  caption?: string;
  media_type?: 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM';
  media_url?: string;
  thumbnail_url?: string;
  permalink?: string;
  timestamp?: string;
  children?: { data?: { media_type?: string; media_url?: string; thumbnail_url?: string }[] };
};

export type SourceResult = {
  handle: string;
  ok: boolean;
  posts?: number;
  newImages?: number;
  error?: string;
};

async function graph<T>(path: string, params: Record<string, string>): Promise<T> {
  const token = process.env.META_IG_ACCESS_TOKEN;
  if (!token) throw new Error('META_IG_ACCESS_TOKEN is not set');
  const url = new URL(`${GRAPH}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set('access_token', token);
  const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(20000) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body?.error) {
    // Meta's message, never the URL (it carries the token).
    throw new Error(String(body?.error?.message || `Graph API ${res.status}`));
  }
  return body as T;
}

let ourAccountId: string | null = null;
async function ourInstagramAccountId(): Promise<string> {
  if (ourAccountId) return ourAccountId;
  if (process.env.META_IG_USER_ID) return (ourAccountId = process.env.META_IG_USER_ID);
  const pages = await graph<{ data?: { instagram_business_account?: { id: string; username?: string } }[] }>(
    'me/accounts',
    { fields: 'instagram_business_account{id,username}' }
  );
  const accounts = (pages.data || []).map((p) => p.instagram_business_account).filter(Boolean) as {
    id: string;
    username?: string;
  }[];
  const pick = accounts.find((a) => a.username?.toLowerCase() === 'yat_stats') || accounts[0];
  if (!pick) throw new Error('The token sees no Facebook Page with a linked Instagram professional account');
  return (ourAccountId = pick.id);
}

function pictureUrl(m: GraphMedia): string | null {
  if (m.media_type === 'VIDEO') return m.thumbnail_url || null;
  if (m.media_type === 'CAROUSEL_ALBUM') {
    const first = m.children?.data?.[0];
    return m.media_url || first?.media_url || first?.thumbnail_url || null;
  }
  return m.media_url || null;
}

function postKind(m: GraphMedia): string {
  if (m.media_type === 'VIDEO') return 'video';
  if (m.media_type === 'CAROUSEL_ALBUM') return 'carousel';
  return 'image';
}

async function copyPicture(handle: string, postId: string, src: string): Promise<string> {
  const res = await fetch(src, { cache: 'no-store', signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`image download ${res.status}`);
  const input = Buffer.from(await res.arrayBuffer());
  const webp = await sharp(input).rotate().resize({ width: 640, withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
  const key = `stories/instagram/${handle.toLowerCase()}/${postId}.webp`;
  await putPublicAsset(key, webp, 'image/webp');
  return storyAssetUrl(key) as string;
}

export async function syncInstagramSource(
  pool: Pool,
  source: { id: number | string; handle: string }
): Promise<SourceResult> {
  const handle = String(source.handle).replace(/^@/, '').trim();
  try {
    // Instagram usernames are letters, digits, '.' and '_' (max 30); anything
    // else would be spliced into the Graph field expression.
    if (!/^[A-Za-z0-9._]{1,30}$/.test(handle)) throw new Error('not a valid Instagram username');
    const me = await ourInstagramAccountId();
    const fields =
      `business_discovery.username(${handle}){id,username,` +
      `media.limit(${POSTS_PER_ACCOUNT}){id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,` +
      `children{media_type,media_url,thumbnail_url}}}`;
    const found = await graph<{ business_discovery?: { id: string; media?: { data?: GraphMedia[] } } }>(me, { fields });
    const account = found.business_discovery;
    if (!account) throw new Error('Business Discovery returned no account');
    const media = account.media?.data || [];

    const { rows: stored } = await pool.query<{ external_post_id: string; thumbnail_url: string | null }>(
      'SELECT external_post_id, thumbnail_url FROM social_posts WHERE social_source_id = $1',
      [source.id]
    );
    const storedPicture = new Map(stored.map((r) => [r.external_post_id, r.thumbnail_url]));

    let newImages = 0;
    for (const m of media) {
      let picture = storedPicture.get(m.id) || null;
      if (!picture) {
        const src = pictureUrl(m);
        if (src) {
          try {
            picture = await copyPicture(handle, m.id, src);
            newImages++;
          } catch (error) {
            console.error('instagram picture copy failed', { handle, post: m.id, error: String(error) });
          }
        }
      }
      await pool.query(
        `INSERT INTO social_posts
           (social_source_id, platform, external_post_id, media_type, caption, permalink,
            media_url, thumbnail_url, media_url_expires_at, published_at, raw_payload, ingested_at)
         VALUES ($1, 'instagram', $2, $3, $4, $5, NULL, $6, NULL, $7, $8::jsonb, now())
         ON CONFLICT (social_source_id, external_post_id) DO UPDATE SET
           media_type = EXCLUDED.media_type,
           caption = EXCLUDED.caption,
           permalink = EXCLUDED.permalink,
           thumbnail_url = COALESCE(EXCLUDED.thumbnail_url, social_posts.thumbnail_url),
           published_at = EXCLUDED.published_at,
           raw_payload = EXCLUDED.raw_payload`,
        [
          source.id,
          m.id,
          postKind(m),
          m.caption || null,
          m.permalink || null,
          picture,
          m.timestamp || null,
          // Instagram's own media links expire; keep only what doesn't.
          JSON.stringify({ id: m.id, media_type: m.media_type, permalink: m.permalink, timestamp: m.timestamp }),
        ]
      );
    }

    await pool.query(
      'UPDATE social_sources SET external_account_id = $2, last_polled_at = now(), updated_at = now() WHERE id = $1',
      [source.id, account.id]
    );
    return { handle, ok: true, posts: media.length, newImages };
  } catch (error) {
    await pool.query('UPDATE social_sources SET last_polled_at = now() WHERE id = $1', [source.id]).catch(() => {});
    return { handle, ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
