// Published retired alumni memories tagged to a different player. Render the
// ORIGINAL entry, not a copied post, on the tagged player's retired timeline.
import {query} from '@/lib/db';
import WhereYatMemory from './WhereYatMemory';

type Photo={web:string;full:string;thumb:string};
type Row={
  id:number;playerid:string;hsid:string;story_key:string;display_name:string|null;
  favorite_hs_memory:string|null;favorite_post_hs_memory:string|null;
  family_life:string|null;story:string|null;business_message:string|null;
  business_public_opt_in:boolean;memory_photos_json:Record<string,Photo[]>|null;
  life_photos_json:Photo[]|null;photo_url:string|null;
};
const labels:Record<string,string>={
  favoriteHs:'BASEBALL MEMORY',favoriteAfter:'LIFE AFTER GRADUATION',
  family:'LIFE AND FAMILY',story:'LIFE AFTER BASEBALL',business:'BUSINESS SPOTLIGHT',
};
function content(row:Row):string{
  if(row.story_key==='favoriteHs')return row.favorite_hs_memory||'';
  if(row.story_key==='favoriteAfter')return row.favorite_post_hs_memory||'';
  if(row.story_key==='family')return row.family_life||'';
  if(row.story_key==='story')return row.story||'';
  return row.business_public_opt_in?row.business_message||'':'';
}
export default async function WhereYatTaggedMemories({playerId}:{playerId:string}){
  let rows:Row[]=[];
  try{
    const result=await query<Row>(
      "SELECT m.id,m.playerid,m.hsid,t.story_key,m.display_name,m.favorite_hs_memory,m.favorite_post_hs_memory,m.family_life,m.story,m.business_message,m.business_public_opt_in,m.memory_photos_json,m.life_photos_json,m.photo_url FROM alumni_where_yat_memory_tags t JOIN alumni_where_yat_now m ON m.id=t.submission_id WHERE t.playerid=$1 AND m.status='approved' AND m.playerid<>$1 AND (CASE t.story_key WHEN 'favoriteHs' THEN NULLIF(trim(m.favorite_hs_memory),'') WHEN 'favoriteAfter' THEN NULLIF(trim(m.favorite_post_hs_memory),'') WHEN 'family' THEN NULLIF(trim(m.family_life),'') WHEN 'story' THEN NULLIF(trim(m.story),'') WHEN 'business' THEN CASE WHEN m.business_public_opt_in THEN NULLIF(trim(m.business_message),'') END END) IS NOT NULL ORDER BY t.created_at DESC,m.id DESC LIMIT 100",
      [playerId]
    );
    rows=result.rows;
  }catch(error){console.error('[where-yat-tags] Could not read tagged memories',error)}
  if(!rows.length)return null;
  return <>
    <h3 style={{font:'700 14px/1.4 Oswald,Arial,sans-serif',margin:'14px 0 2px',padding:'8px 12px',borderTop:'1px solid var(--wyn-border)'}}>
      MEMORIES YOU'RE TAGGED IN
    </h3>
    {rows.map(row=>{
      const story=content(row);if(!story)return null;
      const images=row.memory_photos_json?.[row.story_key]
        ||(row.story_key==='family'?row.life_photos_json||[]
          :row.story_key==='story'&&row.photo_url?[{web:row.photo_url,full:row.photo_url,thumb:row.photo_url}]:[]);
      return <WhereYatMemory key={row.id+'-'+row.story_key}
        id={row.id} storyKey={row.story_key}
        label={(labels[row.story_key]||'MEMORY')+' — '+(row.display_name||'Alumnus')}
        alumnusName={row.display_name||'Alumnus'} initialText={story} initialPhotos={images}
        playerId={row.playerid} hsid={row.hsid}/>;
    })}
  </>;
}
