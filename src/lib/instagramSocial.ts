import { query } from "@/lib/db";

type DbSocialPost = {
  id: string | number;
  external_post_id: string | null;
  media_type: string | null;
  caption: string | null;
  permalink: string | null;
  thumbnail_url: string | null;
  published_at: Date | string | null;
  handle: string | null;
  owner_type: string | null;
};

type InstagramNode = {
  id?: string;
  shortcode?: string;
  display_url?: string;
  thumbnail_src?: string;
  is_video?: boolean;
  product_type?: string;
  taken_at_timestamp?: number;
  edge_media_to_caption?: { edges?: Array<{ node?: { text?: string } }> };
  edge_sidecar_to_children?: { edges?: Array<{ node?: InstagramNode }> };
};

export type SocialFeedPost = DbSocialPost & {
  image_url: string | null;
  resolved_permalink: string | null;
};

function normalizeCaption(value: unknown) {
  return String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
}

function captionFor(node: InstagramNode) {
  return node.edge_media_to_caption?.edges?.[0]?.node?.text || "";
}

function visualFor(node: InstagramNode) {
  const firstChild = node.edge_sidecar_to_children?.edges?.[0]?.node;
  return firstChild?.display_url || firstChild?.thumbnail_src || node.display_url || node.thumbnail_src || null;
}

function permalinkFor(node: InstagramNode) {
  if (!node.shortcode) return null;
  const kind = node.product_type === "clips" ? "reel" : "p";
  return `https://www.instagram.com/${kind}/${node.shortcode}/`;
}

function usableDbPermalink(value: string | null) {
  if (!value) return false;
  try {
    const url = new URL(value);
    if (!/(^|\.)instagram\.com$/i.test(url.hostname)) return false;
    const parts = url.pathname.split("/").filter(Boolean);
    const code = parts[1] || "";
    return (parts[0] === "p" || parts[0] === "reel") && code.length >= 5 && !/^\d+$/.test(code);
  } catch {
    return false;
  }
}

async function fetchInstagramNodes(handle: string): Promise<InstagramNode[]> {
  const clean = handle.replace(/^@/, "").trim();
  if (!clean) return [];

  try {
    const res = await fetch(
      `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(clean)}`,
      {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36",
          "x-ig-app-id": "936619743392459",
          Accept: "*/*",
          Referer: `https://www.instagram.com/${encodeURIComponent(clean)}/`,
        },
        next: { revalidate: 300 },
      }
    );

    if (!res.ok) {
      console.warn("[social] Instagram public feed request failed", clean, res.status);
      return [];
    }

    const json = await res.json();
    return json?.data?.user?.edge_owner_to_timeline_media?.edges?.map((edge: any) => edge?.node).filter(Boolean) || [];
  } catch (error) {
    console.warn("[social] Instagram public feed request error", clean, error);
    return [];
  }
}

function bestMatch(post: DbSocialPost, nodes: InstagramNode[]) {
  const externalId = String(post.external_post_id || "");
  let match = nodes.find((node) => String(node.id || "") === externalId);
  if (match) return match;

  const wantedCaption = normalizeCaption(post.caption);
  if (wantedCaption) {
    match = nodes.find((node) => {
      const candidate = normalizeCaption(captionFor(node));
      return candidate && (candidate === wantedCaption || candidate.startsWith(wantedCaption.slice(0, 70)) || wantedCaption.startsWith(candidate.slice(0, 70)));
    });
    if (match) return match;
  }

  const targetTime = post.published_at ? new Date(post.published_at).getTime() : NaN;
  if (Number.isFinite(targetTime)) {
    match = nodes
      .map((node) => ({ node, delta: Math.abs(((node.taken_at_timestamp || 0) * 1000) - targetTime) }))
      .filter(({ delta }) => delta <= 36 * 60 * 60 * 1000)
      .sort((a, b) => a.delta - b.delta)[0]?.node;
  }

  return match || null;
}

export async function getSocialFeedPosts(hsid: string, playerid: string | null, limit = 10): Promise<SocialFeedPost[]> {
  const safeLimit = Math.min(Math.max(limit || 10, 1), 100);
  const result = await query<DbSocialPost>(
    `SELECT p.id, p.external_post_id, p.media_type, p.caption, p.permalink,
            p.thumbnail_url, p.published_at, s.handle, s.owner_type
       FROM public.social_posts p
       JOIN public.social_sources s ON s.id = p.social_source_id
      WHERE s.platform = 'instagram' AND s.status = 'active'
        AND (s.hsid = $1 OR ($2::text IS NOT NULL AND s.playerid = $2))
      ORDER BY p.published_at DESC
      LIMIT $3`,
    [hsid, playerid || null, safeLimit]
  );

  const posts = result.rows;
  const handles = [...new Set(posts.map((post) => String(post.handle || "").replace(/^@/, "").trim()).filter(Boolean))];
  const feeds = new Map<string, InstagramNode[]>();

  await Promise.all(
    handles.map(async (handle) => {
      feeds.set(handle.toLowerCase(), await fetchInstagramNodes(handle));
    })
  );

  return posts.map((post) => {
    const handle = String(post.handle || "").replace(/^@/, "").trim();
    const match = bestMatch(post, feeds.get(handle.toLowerCase()) || []);
    return {
      ...post,
      image_url: match ? visualFor(match) : post.thumbnail_url || null,
      resolved_permalink: match ? permalinkFor(match) : usableDbPermalink(post.permalink) ? post.permalink : null,
    };
  });
}
