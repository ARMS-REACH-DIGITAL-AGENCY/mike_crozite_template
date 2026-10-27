import type { Metadata } from 'next';
import { query } from '@/lib/db';
import { newsDisplayHeadline, parseNewsVideo } from '@/lib/newsVideo';
import { fetchInstagramPostPreview } from '@/lib/instagramPostPreview';

type Context = { params: Promise<{ uuid: string }> };
async function story(uuid: string) {
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(uuid)) return null;
  try {
    // Same headline rule as the News cards (contributor title over a stale derivative).
    const { rows } = await query<{ title:string; hsid:string; uuid:string; url:string; display_image_url:string|null; image_url:string|null; snippet:string|null; player_name:string|null; discovery_source:string|null; gallery_front_json:{ headline?: string|null }|null }>(
      `SELECT na.title, na.hsid, na.uuid, na.url, na.display_image_url, na.image_url, na.snippet, na.player_name, na.discovery_source, nd.gallery_front_json
         FROM news_articles na
         LEFT JOIN news_article_derivatives nd ON nd.news_article_uuid = na.uuid
          AND nd.generation_status IN ('staged','published') AND nd.approval_status IN ('approved','published')
        WHERE na.uuid=$1 AND na.verification_status='VERIFIED' LIMIT 1`, [uuid]
    );
    return rows[0] || null;
  } catch { return null; }
}
export async function generateMetadata({params}:Context):Promise<Metadata> {
  const {uuid}=await params;
  const item=await story(uuid);
  if (!item) return { title:'Story not found | YAT?STATS',robots:{index:false} };
  const video=parseNewsVideo(item.url);
  // Like the News cards: a video story's own picture first (for Instagram,
  // our copy of the post's picture).
  const instagramPicture=video?.provider==='Instagram'
    ? await fetchInstagramPostPreview(item.url).then(p=>p?.thumbnail_url||null).catch(()=>null) : null;
  const image=instagramPicture || video?.thumbnailUrl || item.display_image_url || item.image_url || undefined;
  const title=newsDisplayHeadline(item) || 'Alumni News | YAT?STATS';
  const description=(item.snippet || `Alumni news featuring ${item.player_name || 'YAT?STATS'}`).slice(0,250);
  return {title,description,openGraph:{type:'article',title,description,images:image?[{url:image}]:[]},twitter:{card:'summary_large_image',title,description,images:image?[image]:[]}};
}
export default async function NewsShareLanding({params}:Context) {
  const {uuid}=await params, item=await story(uuid);
  const href=item ? `/${encodeURIComponent(item.hsid)}?news=1&story=${encodeURIComponent(uuid)}#sec-news` : '/';
  return <main style={{background:'#101010',color:'#fff',minHeight:'100vh',padding:'3rem',fontFamily:'Arial,sans-serif'}}>
    <h1>{item ? newsDisplayHeadline(item) : 'News story not found'}</h1>
    <p>{item ? 'Opening this Alumni News story on YAT?STATS…' : 'This story is unavailable.'}</p>
    <a href={href} style={{color:'#ffb21c'}}>Open on YAT?STATS</a>
    {item ? <script dangerouslySetInnerHTML={{__html:`window.location.replace(${JSON.stringify(href)})`}}/> : null}
  </main>;
}
