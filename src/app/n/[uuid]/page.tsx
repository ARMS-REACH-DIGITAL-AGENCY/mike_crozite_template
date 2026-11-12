// Shareable News link with crawler-readable image/headline. Every school uses
// the same route. Human visitors move to the REAL school's News section.
import type { Metadata } from 'next';
import { query } from '@/lib/db';
import { parseNewsVideo, publicNewsHeadline } from '@/lib/newsVideo';
import { isNewsArticleId } from '@/lib/newsShare';
import { resolveSchoolNewsOrigins, schoolNewsStoryUrl } from '@/lib/schoolNewsLinks';

type Context = { params: Promise<{ uuid: string }> };
type NewsLink = {
  id: number;
  title: string;
  hsid: string;
  uuid: string;
  url: string;
  snippet: string | null;
  player_name: string | null;
};

async function story(reference: string): Promise<NewsLink | null> {
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(reference)) return null;
  try {
    // All new Share actions use the short, unique numeric news_articles.id.
    // Existing full-UUID links remain valid, including historic links.
    const byId = isNewsArticleId(reference);
    const condition = byId ? 'id=$1' : 'uuid=$1';
    const { rows } = await query<NewsLink>(
      'SELECT id,title,hsid,uuid,url,snippet,player_name FROM news_articles WHERE '+
      condition+" AND verification_status='VERIFIED' LIMIT 1",
      [byId ? Number(reference) : reference],
    );
    return rows[0] || null;
  } catch { return null; }
}

export async function generateMetadata({params}: Context): Promise<Metadata> {
  const { uuid: reference } = await params;
  const item = await story(reference);
  if (!item) return { title:'News story unavailable | YAT?STATS', robots:{index:false} };
  const canonical = 'https://yatstats.com/n/' + reference;
  const image = 'https://yatstats.com/api/og/news?hsid='+
    encodeURIComponent(item.hsid)+'&story='+encodeURIComponent(item.uuid);
  const title = publicNewsHeadline(item.title,item.url) || 'Alumni News';
  const action = parseNewsVideo(item.url) ? 'Watch' : 'Read';
  const teaser = String(item.snippet || 'Follow high school baseball alumni, their news and their journeys.')
    .replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
  const description = (action+' this alumni story on YAT?STATS. '+teaser).slice(0,200);
  return {
    title, description, alternates:{canonical},
    openGraph:{
      type:'article',siteName:'YAT?STATS',url:canonical,title,description,
      images:[{url:image,width:1200,height:630,type:'image/png',alt:'YAT?STATS Alumni News story'}]
    },
    twitter:{card:'summary_large_image',title,description,images:[image]},
  };
}
export default async function NewsShareLanding({params}: Context) {
  const {uuid: reference}=await params;
  const item=await story(reference);
  const schoolUrls=item
    ? await resolveSchoolNewsOrigins([item.hsid],(sql,values=[])=>query(sql,values))
    : new Map<string,string>();
  // The deep link ALWAYS needs the actual UUID, never the numeric short ID.
  const href=item?schoolNewsStoryUrl(schoolUrls.get(item.hsid),item.uuid):null;
  return <main style={{background:'#101010',color:'#fff',minHeight:'100vh',padding:'3rem',fontFamily:'Arial,sans-serif'}}>
    <h1>{item?.title || 'News story unavailable'}</h1>
    <p>{item ? 'Opening this Alumni News story on YAT?STATS…' : 'This story is unavailable.'}</p>
    {href ? <a href={href} style={{color:'#ffb21c'}}>WATCH OR READ THIS STORY</a> : null}
    {href ? <script dangerouslySetInnerHTML={{__html:'window.location.replace('+JSON.stringify(href)+')'}}/> : null}
  </main>;
}
