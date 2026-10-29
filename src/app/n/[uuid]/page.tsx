import type { Metadata } from 'next';
import { query } from '@/lib/db';
import { parseNewsVideo } from '@/lib/newsVideo';
import { resolveSchoolNewsOrigins, schoolNewsStoryUrl } from '@/lib/schoolNewsLinks';

type Context = { params: Promise<{ uuid: string }> };
async function story(uuid: string) {
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(uuid)) return null;
  try {
    const { rows } = await query<{ title:string; hsid:string; uuid:string; url:string; display_image_url:string|null; image_url:string|null; snippet:string|null; player_name:string|null }>(
      "SELECT title, hsid, uuid, url, display_image_url, image_url, snippet, player_name FROM news_articles WHERE uuid=$1 AND verification_status='VERIFIED' LIMIT 1", [uuid]
    );
    return rows[0] || null;
  } catch { return null; }
}
export async function generateMetadata({params}:Context):Promise<Metadata> {
  const {uuid}=await params;
  const item=await story(uuid);
  if (!item) return { title:'Story not found | YAT?STATS',robots:{index:false} };
  const video=parseNewsVideo(item.url);
  const image=video?.thumbnailUrl || item.display_image_url || item.image_url || undefined;
  const title=item.title || 'Alumni News | YAT?STATS';
  const description=(item.snippet || `Alumni news featuring ${item.player_name || 'YAT?STATS'}`).slice(0,250);
  return {title,description,openGraph:{type:'article',title,description,images:image?[{url:image}]:[]},twitter:{card:'summary_large_image',title,description,images:image?[image]:[]}};
}
export default async function NewsShareLanding({params}:Context) {
  const {uuid}=await params, item=await story(uuid);
  const schoolUrls = item
    ? await resolveSchoolNewsOrigins([item.hsid], (sql, params = []) => query(sql, params))
    : new Map<string, string>();
  const href = item ? schoolNewsStoryUrl(schoolUrls.get(item.hsid), uuid) : null;
  return <main style={{background:'#101010',color:'#fff',minHeight:'100vh',padding:'3rem',fontFamily:'Arial,sans-serif'}}>
    <h1>{item?.title || 'News story not found'}</h1>
    <p>{item ? 'Opening this Alumni News story on YAT?STATS…' : 'This story is unavailable.'}</p>
    {href ? <a href={href} style={{color:'#ffb21c'}}>Open the school's News story</a> : null}
    {href ? <script dangerouslySetInnerHTML={{__html:`window.location.replace(${JSON.stringify(href)})`}}/> : null}
  </main>;
}
